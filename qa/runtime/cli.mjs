import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Gate, git, json, save, acquireLock, choosePort, available, ownedProcess, readiness, writeResult, redact } from './core.mjs';
import { loadEnvironment, systemEnvironment } from './environment.mjs';
import { validateHandoff } from './handoff.mjs';
import { restoreTsconfig } from './build-files.mjs';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const dir = path.join(toolRoot, '.qa', 'runs', runId);
await mkdir(dir, { recursive: true });
const result = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), ownerPid: process.pid, worktree: process.cwd(), system: 'unknown', status: 'RUNNING', gate: null, ports: {}, processes: [], testsInvoked: [], migration: 'NOT_RUN', api: 'NOT_RUN', browser: 'NOT_RUN', errors: [], cleanup: { status: 'PENDING', processes: [] } };
const abort = new AbortController();
const signalHandler = signal => { result.gate = `INTERRUPTED:${signal}`; abort.abort(new Gate('FAIL_RUNTIME', result.gate)); };
process.once('SIGINT', signalHandler.bind(null, 'SIGINT'));
process.once('SIGTERM', signalHandler.bind(null, 'SIGTERM'));
const processes = [];
let release, buildDir, tsconfigOriginal, envValues = {}, timeout, auditEnv, backendStarted = false, fixtureCleanup;
const start = (name, command, args, cwd, env) => {
  result.testsInvoked.push(name);
  const owned = ownedProcess(command, args, { name, cwd, env, logFile: path.join(dir, `${name}.log`), secrets: Object.values(envValues), onStart: info => result.processes.push(info) });
  processes.push(owned); return owned;
};
const run = async (name, command, args, cwd, env, ms = 300000) => {
  abort.signal.throwIfAborted();
  const owned = start(name, command, args, cwd, env);
  await owned.wait(ms, abort.signal); return owned;
};
try {
  if (process.platform !== 'win32') throw new Gate('BLOCKED_CONTEXT', 'V1_PLATFORM_REQUIRES_WINDOWS:process-tree cleanup is validated on Windows only');
  const { values: options, positionals } = parseArgs({ allowPositionals: true, options: {
    mode: { type: 'string', default: 'focused' }, system: { type: 'string' }, worktree: { type: 'string' }, revision: { type: 'string' }, handoff: { type: 'string' },
    'backend-port': { type: 'string' }, 'frontend-port': { type: 'string' }, 'env-source': { type: 'string' }, 'allow-dirty': { type: 'boolean', default: false }, timeout: { type: 'string', default: '900000' }
  } });
  result.mode = options.mode;
  if (!['focused', 'integration'].includes(result.mode)) throw new Gate('BLOCKED_CONTEXT', 'UNKNOWN_MODE');
  const limit = Number(options.timeout);
  if (!Number.isInteger(limit) || limit < 1000 || limit > 3600000) throw new Gate('BLOCKED_CONTEXT', 'INVALID_TIMEOUT');
  timeout = setTimeout(() => abort.abort(new Gate('FAIL_RUNTIME', 'QA_RUN_TIMEOUT')), limit);
  result.system = options.system ?? positionals[0] ?? 'money';
  if (!/^[a-z][a-z0-9-]*$/.test(result.system)) throw new Gate('BLOCKED_CONTEXT', 'INVALID_SYSTEM');
  result.worktree = path.resolve(options.worktree ?? toolRoot);
  const target = result.worktree;
  result.revision = git(target, 'rev-parse', 'HEAD');
  result.toolRevision = git(toolRoot, 'rev-parse', 'HEAD');
  result.dirty = Boolean(git(target, 'status', '--porcelain', '--untracked-files=normal'));
  if (options.revision && git(target, 'rev-parse', `${options.revision}^{commit}`) !== result.revision) throw new Gate('BLOCKED_CONTEXT', 'TARGET_REVISION_MISMATCH:no checkout or stale runtime reuse');
  if (result.dirty && !(options['allow-dirty'] && result.mode === 'focused')) throw new Gate('BLOCKED_CONTEXT', 'DIRTY_TARGET:commit worker artifacts first');
  let adapter;
  try { adapter = (await import(pathToFileURL(path.join(toolRoot, 'qa/suites', result.system, 'adapter.mjs')))).default; }
  catch { throw new Gate('BLOCKED_CONTEXT', 'SYSTEM_ADAPTER_NOT_FOUND'); }
  if (options.handoff) {
    const handoff = await json(path.resolve(options.handoff));
    adapter = adapter.tracks?.[handoff.track] ?? adapter;
    validateHandoff(handoff, { system: result.system, revision: result.revision, target, scenarios: adapter.scenarios, setup: adapter.setup });
    result.handoff = { track: handoff.track, commitSha: handoff.commitSha, baseDevSha: handoff.baseDevSha };
  }
  result.scenarios = adapter.scenarios;
  result.backgroundValidation = adapter.backgroundValidation;
  const common = path.resolve(target, git(target, 'rev-parse', '--git-common-dir'));
  result.lockFile = path.join(common, 'pos-central-qa.lock');
  release = await acquireLock(result.lockFile, { runId, pid: process.pid, worktree: target, revision: result.revision, system: result.system, startedAt: result.startedAt });
  await run('refresh-dev', 'git', ['fetch', 'origin', 'dev'], target, systemEnvironment(), 60000);
  result.baseDevRevision = git(target, 'rev-parse', 'origin/dev');
  if (result.mode === 'integration') {
    try { git(target, 'merge-base', '--is-ancestor', 'origin/dev', result.revision); }
    catch { throw new Gate('BLOCKED_CONTEXT', 'LATEST_DEV_NOT_IN_TARGET:integrate latest dev before final QA'); }
  }
  const migrations = path.join(target, 'backend/src/main/resources/db/migration');
  const names = (await readdir(migrations)).filter(n => /^V.*\.sql$/.test(n));
  const versions = names.map(n => n.split('__')[0]);
  if (new Set(versions).size !== versions.length) throw new Gate('BLOCKED_CONTEXT', 'FLYWAY_LOCAL_VERSION_COLLISION');
  result.migrationFiles = names;
  result.activeMigrationChanges = git(target, 'diff', '--name-only', 'origin/dev', '--', 'backend/src/main/resources/db/migration').split('\n').filter(Boolean);
  result.otherWorktreeMigrations = [];
  for (const match of git(target, 'worktree', 'list', '--porcelain').matchAll(/^worktree (.+)$/gm)) {
    const worktree = path.resolve(match[1]);
    if (worktree === target) continue;
    const files = await readdir(path.join(worktree, 'backend/src/main/resources/db/migration')).catch(() => []);
    const extra = files.filter(n => /^V.*\.sql$/.test(n) && !names.includes(n));
    if (extra.length) result.otherWorktreeMigrations.push({ worktree, files: extra });
  }
  const loaded = await loadEnvironment(target, options['env-source']);
  envValues = loaded.values; result.environment = { sources: loaded.sources, variables: loaded.facts, profile: 'dev' };
  result.ports.backend = await choosePort(options['backend-port'], 18080, 18109);
  result.ports.frontend = await choosePort(options['frontend-port'], 13000, 13029);
  if (result.ports.backend === result.ports.frontend) throw new Gate('BLOCKED_CONTEXT', 'PORTS_MUST_DIFFER');
  const apiURL = `http://127.0.0.1:${result.ports.backend}`;
  const baseURL = `http://127.0.0.1:${result.ports.frontend}`;
  const frontend = path.join(target, 'frontend');
  const backend = path.join(target, 'backend');
  const nextCLI = path.join(frontend, 'node_modules/next/dist/bin/next');
  try { await access(nextCLI); } catch { throw new Gate('BLOCKED_CONTEXT', 'FRONTEND_DEPENDENCIES_MISSING:run npm ci in target frontend'); }
  const safeEnv = systemEnvironment();
  const javaEnv = { ...safeEnv, ...envValues, QA_TOOL_ROOT: toolRoot, QA_MIGRATIONS: migrations, QA_MODE: result.mode, QA_RUN_DIR: dir, QA_RUN_ID: runId };
  auditEnv = javaEnv;
  const gradle = ['--no-daemon', '--console=plain', '-I', path.join(toolRoot, 'qa/runtime/gradle.init.gradle'), 'bootJar', 'qaDatabaseAudit'];
  const build = start('backend-build-audit', process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/c', 'gradlew.bat', ...gradle] : ['./gradlew', ...gradle], backend, javaEnv);
  try {
    await build.wait(300000, abort.signal);
    result.futureAppliedVersions = [...build.output.matchAll(/QA_FUTURE_VERSION=(\S+)/g)].map(m => m[1]);
    result.migration = result.futureAppliedVersions.length ? 'VALIDATED_FOCUSED_WITH_FUTURE_APPLIED_VERSIONS' : 'VALIDATED_READ_ONLY_NO_PENDING';
    result.dbCapacityEstimate = Number(build.output.match(/QA_DB_CAPACITY_ESTIMATE=(\d+)/)?.[1]) || null;
  }
  catch (e) {
    result.migration = 'FAILED';
    if (/QA_DB_CAPACITY_INSUFFICIENT|too many clients|remaining connection slots/i.test(build.output)) throw new Gate('BLOCKED_RESOURCE', 'DEV_DB_CAPACITY_INSUFFICIENT');
    if (/org\.flywaydb\.core\.api\.exception|FlywayValidateException|QA_(PENDING|FUTURE)_MIGRATIONS/i.test(build.output)) throw new Gate('BLOCKED_CONTEXT', 'FLYWAY_RECONCILIATION_REQUIRED:see backend-build-audit.log; no migrate or repair performed');
    throw e;
  }
  result.dbPool = { maximum: 2, minimumIdle: 0 };
  let backendEnv = javaEnv;
  if (adapter.prepare) {
    const classpath = await readFile(path.join(dir, 'audit-classpath.txt'), 'utf8');
    const context = { run, runId, dir, target, toolRoot, javaEnv, classpath };
    // Register ownership before setup so partial setup is cleaned on every exit.
    fixtureCleanup = () => adapter.cleanup({ ...context, run: async (name, command, args, cwd, env, ms) => {
      const owned = start(name, command, args, cwd, env);
      try { await owned.wait(ms); } finally { await owned.stop(); }
    } });
    backendEnv = { ...javaEnv, ...await adapter.prepare(context) };
    result.fixtures = adapter.setup.fixtures;
  }
  const jar = (await readdir(path.join(backend, 'build/libs'))).filter(n => n.endsWith('.jar') && !n.endsWith('-plain.jar'));
  if (jar.length !== 1) throw new Gate('BLOCKED_CONTEXT', 'AMBIGUOUS_BACKEND_JAR');
  if (!await available(result.ports.backend)) throw new Gate('BLOCKED_RESOURCE', 'BACKEND_PORT_RACED:external process preserved');
  const ownedBackend = start('backend', 'java', ['-jar', path.join(backend, 'build/libs', jar[0]),
    '--spring.profiles.active=dev', `--server.port=${result.ports.backend}`, '--server.address=127.0.0.1', '--spring.datasource.hikari.maximum-pool-size=2', '--spring.datasource.hikari.minimum-idle=0',
    `--spring.datasource.hikari.pool-name=qa-${runId}`, `--spring.datasource.hikari.data-source-properties.ApplicationName=qa-${runId}`,
    // Audit already validated Flyway. Disable startup migration to prevent an audit/start race mutating shared DEV.
    '--spring.flyway.enabled=false', `--app.dev-allowed-origins=${baseURL}`, `--app.money.processing-enabled=${adapter.processingEnabled === true}`, '--app.absence-backfill-cron=-', ...(adapter.backendArgs ?? [])], backend, backendEnv);
  backendStarted = true;
  await readiness(apiURL + adapter.readyPath, ownedBackend, 90000, abort.signal);
  await save(path.join(dir, 'state.json'), result);
  const apiResults = [];
  for (const endpoint of adapter.apiChecks) {
    abort.signal.throwIfAborted(); ownedBackend.check();
    const response = await fetch(apiURL + endpoint, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    apiResults.push({ endpoint, status: response.status, json: body !== null });
    if (!response.ok || body === null) throw new Gate('FAIL_PRODUCT', `API_CHECK:${endpoint}:${response.status}`);
  }
  result.api = 'PASS'; result.apiChecks = apiResults;
  buildDir = path.join(frontend, `.next-qa-${runId}`);
  const browserEnv = { ...safeEnv, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_ENV: 'dev', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_API_BASE_URL: apiURL, NEXT_DIST_DIR: path.basename(buildDir),
    QA_RUN_ID: runId, QA_RUN_DIR: dir, QA_TARGET: target, QA_SYSTEM: result.system, QA_TRACK: result.handoff?.track ?? '', QA_BASE_URL: baseURL, QA_API_URL: apiURL, QA_FRONTEND_PORT: String(result.ports.frontend), QA_PARENT_PID: String(process.pid) };
  tsconfigOriginal = await readFile(path.join(frontend, 'tsconfig.json'), 'utf8');
  await run('frontend-build', process.execPath, [nextCLI, 'build'], frontend, browserEnv);
  await restoreTsconfig(path.join(frontend, 'tsconfig.json'), tsconfigOriginal, path.basename(buildDir));
  ownedBackend.check();
  if (!await available(result.ports.frontend)) throw new Gate('BLOCKED_RESOURCE', 'FRONTEND_PORT_RACED:external process preserved');
  const browser = start('playwright', process.execPath, [path.join(toolRoot, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(toolRoot, 'qa/playwright/config.mjs')], toolRoot, browserEnv);
  try { await browser.wait(Math.min(adapter.browserTimeout ?? 150000,900000)+30000, abort.signal); }
  catch (e) {
    const report = await json(path.join(dir, 'browser.json')).catch(() => null);
    result.browser = report?.status ?? 'FAIL_RUNTIME';
    result.browserReport = report;
    if (report?.tests?.some(t => t.status === 'failed' || t.status === 'timedOut')) throw new Gate('FAIL_PRODUCT', 'BROWSER_SCENARIO_FAILED');
    throw e;
  }
  result.browserReport = await json(path.join(dir, 'browser.json'));
  if (result.browserReport.status !== 'passed' || !result.browserReport.tests.length) throw new Gate('FAIL_RUNTIME', 'BROWSER_NO_PASS_EVIDENCE');
  for (const scenario of adapter.scenarios) {
    if (!result.browserReport.tests.some(test => test.title === scenario && test.status === 'passed')) throw new Gate('BLOCKED_CONTEXT', `BROWSER_SCENARIO_EVIDENCE_MISSING:${scenario}`);
  }
  result.browser = 'PASS'; ownedBackend.check();
  if (git(target, 'rev-parse', 'HEAD') !== result.revision) throw new Gate('BLOCKED_CONTEXT', 'TARGET_CHANGED_DURING_QA');
  result.status = 'PASS';
} catch (e) {
  result.status = e.status ?? 'FAIL_RUNTIME';
  result.gate = e instanceof Gate ? e.message : `INFRASTRUCTURE_ERROR:${e.code ?? e.name}:${redact(e.message, Object.values(envValues))}`;
  if (result.status === 'BLOCKED_POLICY') result.gate = `MANAGED QA RUNTIME POLICY BLOCK:${result.gate}`;
  result.errors.push(result.gate);
} finally {
  clearTimeout(timeout);
  const cleanupErrors = [];
  for (const owned of processes.toReversed()) {
    try { result.cleanup.processes.push(await owned.stop()); }
    catch (e) { cleanupErrors.push(e.message); }
  }
  if (fixtureCleanup && !cleanupErrors.length) {
    try { await fixtureCleanup(); result.cleanup.fixtures = 'OWNED_SCHEMA_REMOVED'; }
    catch { cleanupErrors.push('OWNED_FIXTURE_CLEANUP_FAILED'); }
  }
  if (backendStarted && !cleanupErrors.length) {
    try {
      const classpath = await readFile(path.join(dir, 'audit-classpath.txt'), 'utf8');
      const verify = start('db-cleanup-check', 'java', ['-cp', classpath, 'DatabaseAudit', 'connections'], result.worktree, auditEnv);
      try { await verify.wait(45000); result.cleanup.dbConnections = 'VERIFIED_ZERO'; }
      finally { result.cleanup.processes.push(await verify.stop()); }
    } catch { cleanupErrors.push('DB_CONNECTION_CLEANUP_NOT_VERIFIED'); }
  }
  result.frontendOwnership = await json(path.join(dir, 'frontend-owner.json')).catch(() => null);
  for (const [name, port] of Object.entries(result.ports)) {
    // Probe is evidence only; never kill whatever owns this port.
    result.cleanup[`${name}PortFree`] = await available(port);
    if ((name === 'backend' && backendStarted || name === 'frontend' && result.frontendOwnership) && !result.cleanup[`${name}PortFree`]) cleanupErrors.push(`${name}:PORT_NOT_RELEASED:external owner preserved`);
  }
  result.runtimeErrors = processes.flatMap(p => p.name === 'backend' ? p.output.split('\n').filter(line => /\bERROR\b/.test(line)) : []);
  if (result.status === 'PASS' && result.runtimeErrors.length) { result.status = 'FAIL_RUNTIME'; result.gate = 'BACKEND_RUNTIME_ERRORS'; }
  if (buildDir) {
    try {
      if (tsconfigOriginal) await restoreTsconfig(path.join(result.worktree, 'frontend/tsconfig.json'), tsconfigOriginal, path.basename(buildDir));
      if (path.dirname(buildDir) !== path.join(result.worktree, 'frontend') || path.basename(buildDir) !== `.next-qa-${runId}`) throw new Error('BUILD_OWNERSHIP_MISMATCH');
      await rm(buildDir, { recursive: true, force: true });
    } catch { cleanupErrors.push('OWNED_FRONTEND_BUILD_CLEANUP_FAILED'); }
  }
  if (release && !cleanupErrors.length) { try { await release(); } catch (e) { cleanupErrors.push(e.message); } }
  result.cleanup.status = cleanupErrors.length ? 'FAILED' : 'PASS';
  result.cleanup.errors = cleanupErrors;
  result.cleanup.database = fixtureCleanup ? 'Only the run-owned isolated MONEY schema was created; see fixtures cleanup result. Shared history/data untouched.' : 'No schema/fixture created; owned backend exit closes its pool (no unrelated DB sessions terminated)';
  if (cleanupErrors.length) { result.previousStatus = result.status; result.status = 'FAIL_RUNTIME'; result.gate = 'CLEANUP_FAILED'; }
  result.finishedAt = new Date().toISOString();
  await writeResult(dir, result);
  await save(path.join(dir, 'state.json'), result);
  console.log(`${result.status}: ${result.gate ?? 'all requested QA checks passed'}`);
  console.log(`QA result: ${path.join(dir, 'result.json')}`);
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

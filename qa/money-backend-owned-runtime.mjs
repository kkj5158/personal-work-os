import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { available, git, ownedProcess, save } from './runtime/core.mjs';

// This runner never loads DEV credentials. An optional first argument is the source-launch classpath file.
const root = await fs.realpath(process.cwd());
const runDir = process.env.QA_RUN_DIR && path.resolve(process.env.QA_RUN_DIR);
if (process.platform !== 'win32' || !runDir || path.dirname(runDir) !== path.join(root, '.qa', 'runs')) throw Error('MANAGED_WINDOWS_QA_RUN_DIRECTORY_REQUIRED');
if (await fs.realpath(runDir) !== runDir || await fs.realpath(path.dirname(runDir)) !== path.join(root, '.qa', 'runs')) throw Error('QA_RUN_DIRECTORY_REDIRECT_REJECTED');
const runId = process.env.QA_RUN_ID;
if (!runId || path.basename(runDir) !== runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('QA_RUN_ID_DIRECTORY_MISMATCH');
const classpathFile = path.resolve(process.argv[2] ?? path.join(runDir, 'audit-classpath.txt'));
const classpath = (await fs.readFile(classpathFile, 'utf8')).trim();
if (!classpath) throw Error('SOURCE_LAUNCH_CLASSPATH_REQUIRED');
const postgres = 'C:/Program Files/PostgreSQL/18/bin', port = 55442;
const data = path.join(runDir, 'owned-backend-pg'), marker = path.join(runDir, 'owned-backend-owner.json');
const token = randomUUID(), owner = randomUUID(), username = 'money_backend_synthetic';
const schema = 'qa_money_web_' + createHash('sha256').update(runId + token).digest('hex').slice(0, 20);
const filters = ['com.kafka.backend.money.*', '*ProdCurrentUserProviderTest', '*ProdSecurityConfigJwtDecoderTest', '*SecurityProfileIsolationTest'];
if (!await available(port)) throw Error('OWNED_BACKEND_PORT_OCCUPIED:preserve other process');
await fs.writeFile(marker, JSON.stringify({ pid: process.pid, token, runId, data, port }), { flag: 'wx' });
// Keep the runtime's system-only allowlist without importing its DEV credential/file loader.
const safeSystemEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME|LANG|LC_ALL)$/i.test(key)));
const baseEnv = { ...safeSystemEnv, QA_RUN_ID: runId, QA_RUN_DIR: runDir };
const baseUrl = `jdbc:postgresql://127.0.0.1:${port}/postgres`;
const env = { ...baseEnv, DEV_DB_URL: baseUrl, DEV_DB_USERNAME: username, DEV_DB_PASSWORD: 'synthetic-loopback-only', APP_DEV_USER_ID: owner };
const testEnv = { ...env, DEV_DB_URL: `${baseUrl}?currentSchema=${schema},public` };
const tasks = [], evidence = {
  database: 'OWNED_LOOPBACK_SYNTHETIC', runId, worktree: root, revision: git(root, 'rev-parse', 'HEAD'),
  dirty: Boolean(git(root, 'status', '--porcelain')), port, schema, syntheticOwner: owner, maxConnections: 10,
  filters, classpathSha256: createHash('sha256').update(classpath).digest('hex'),
  financialAssertions: 'UNCHANGED_SOURCE_TESTS', sharedDatabase: 'NEVER_CONNECTED', flyway: 'NO_REPAIR_CLEAN_OR_SHARED_MIGRATION',
  startedAt: new Date().toISOString(), result: 'NOT_RUN', cleanup: { status: 'PENDING' },
};
const abort = new AbortController();
const interrupt = signal => abort.abort(Error('OWNED_BACKEND_INTERRUPTED:' + signal));
process.once('SIGINT', interrupt.bind(null, 'SIGINT'));
process.once('SIGTERM', interrupt.bind(null, 'SIGTERM'));
function start(name, command, args, cwd = root, childEnv = env) {
  const task = ownedProcess(command, args, { name, cwd, env: childEnv, logFile: path.join(runDir, name + '.log') });
  tasks.push(task); return task;
}
async function identity() {
  const current = JSON.parse(await fs.readFile(marker, 'utf8'));
  if (current.pid !== process.pid || current.token !== token || current.data !== data || path.dirname(data) !== runDir) throw Error('OWNED_BACKEND_IDENTITY_MISMATCH');
}
let server, schemaCreated = false, failure, dataCreated = false;
try {
  await identity(); await fs.mkdir(data, { recursive: false }); dataCreated = true;
  await fs.mkdir(path.join(runDir, 'backend-test-results'), { recursive: false });
  await start('backend-initdb', path.join(postgres, 'initdb.exe'), ['-D', data, '-U', username, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']).wait(60000, abort.signal);
  if (!await available(port)) throw Error('OWNED_BACKEND_PORT_RACED:preserve other process');
  server = start('backend-postgres', path.join(postgres, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port), '-c', 'max_connections=10']);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    abort.signal.throwIfAborted();
    server.check();
    if (!await available(port) && server.output.includes('ready to accept connections')) { ready = true; break; }
    await delay(250);
  }
  if (!ready) throw Error('OWNED_BACKEND_READINESS_TIMEOUT');
  const bootstrap = path.join(runDir, 'owned-backend-bootstrap.sql');
  await fs.writeFile(bootstrap, `CREATE ROLE anon NOLOGIN;\nCREATE ROLE authenticated NOLOGIN;\nCREATE SCHEMA auth;\nCREATE TABLE auth.users(id uuid PRIMARY KEY);\nINSERT INTO auth.users(id) VALUES ('${owner}');\n`);
  await start('backend-auth-bootstrap', path.join(postgres, 'psql.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', bootstrap]).wait(30000, abort.signal);
  const fixture = path.join(root, 'qa/suites/money/WebFixture.java'), backend = path.join(root, 'backend');
  await start('backend-owned-schema-create', 'java', ['-cp', classpath, fixture, 'create', schema], backend).wait(60000, abort.signal);
  schemaCreated = true;
  // Reports and test execution are run-owned; cached or previous XML cannot claim current coverage.
  const init = path.join(runDir, 'owned-backend-tests.init.gradle');
  await fs.writeFile(init, `allprojects { afterEvaluate { tasks.withType(Test).configureEach {\n maxParallelForks = 1\n reports.junitXml.outputLocation = file(System.getenv('QA_RUN_DIR') + '/backend-test-results')\n reports.html.outputLocation = file(System.getenv('QA_RUN_DIR') + '/backend-test-report')\n outputs.upToDateWhen { false }\n } } }\n`);
  evidence.result = 'RUNNING'; await save(path.join(runDir, 'owned-backend-runtime.json'), evidence);
  await start('money-backend-full-owned-regression', 'cmd.exe', ['/d', '/c', 'gradlew.bat', 'test', '--no-daemon', '--console=plain', '--rerun-tasks', '-I', init, ...filters.flatMap(filter => ['--tests', filter])], backend, testEnv).wait(2400000, abort.signal);
  evidence.result = 'PASS';
} catch (error) {
  failure = error; evidence.result = 'FAIL'; evidence.error = error.message;
} finally {
  const errors = [];
  // Stop only our live handles before schema/server cleanup, including a timed-out Gradle process tree.
  for (const task of tasks.toReversed()) if (task !== server) try { await task.stop(); } catch (error) { errors.push(error.message); }
  if (schemaCreated && server && !server.exited && !errors.length) try {
    await identity();
    await start('backend-owned-schema-drop', 'java', ['-cp', classpath, path.join(root, 'qa/suites/money/WebFixture.java'), 'drop', schema], path.join(root, 'backend')).wait(60000);
  } catch (error) { errors.push(error.message); }
  if (server && !server.exited && server.child.exitCode === null) try {
    await identity();
    if (await fs.realpath(data) !== data) throw Error('PG_DATA_REDIRECT_REJECTED');
    const lines = (await fs.readFile(path.join(data, 'postmaster.pid'), 'utf8')).split(/\r?\n/);
    if (Number(lines[0]) !== server.child.pid || path.resolve(lines[1]) !== data || Number(lines[3]) !== port) throw Error('LIVE_PG_DATA_OWNERSHIP_MISMATCH');
    // A full fixture run can leave thousands of catalog files to fsync on Windows.
    // Retain normal PostgreSQL durability and allow its owned checkpoint to finish.
    await start('backend-postgres-stop', path.join(postgres, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', '-t', '300', 'stop']).wait(315000);
  } catch (error) { errors.push(error.message); }
  for (const task of tasks.toReversed()) try { await task.stop(); } catch (error) { errors.push(error.message); }
  const portReleased = await available(port);
  if (server && !portReleased) errors.push('OWNED_BACKEND_PORT_NOT_RELEASED:external owner preserved');
  let dataRemoved = !dataCreated;
  if (dataCreated && !errors.length) try {
    await identity(); if (await fs.realpath(data) !== data) throw Error('PG_DATA_REDIRECT_REJECTED');
    await fs.rm(data, { recursive: true, force: false }); dataRemoved = true;
  } catch (error) { errors.push(error.message); }
  const xmlDir = path.join(runDir, 'backend-test-results');
  evidence.xml = [];
  for (const file of await fs.readdir(xmlDir).catch(() => [])) if (file.endsWith('.xml')) {
    const xml = await fs.readFile(path.join(xmlDir, file), 'utf8');
    const attributes = xml.match(/<testsuite\b([^>]*)>/)?.[1] ?? '';
    const count = key => Number(attributes.match(new RegExp(`\\b${key}="([0-9]+)"`))?.[1] ?? 0);
    evidence.xml.push({ file, sha256: createHash('sha256').update(xml).digest('hex'), tests: count('tests'), failures: count('failures'), errors: count('errors'), skipped: count('skipped') });
  }
  if (evidence.result === 'PASS' && (!evidence.xml.length || evidence.xml.some(row => row.failures || row.errors))) {
    evidence.result = 'FAIL'; failure ??= Error('CURRENT_BACKEND_XML_PASS_EVIDENCE_MISSING'); evidence.error = failure.message;
  }
  if (git(root, 'rev-parse', 'HEAD') !== evidence.revision) { evidence.result = 'FAIL'; failure ??= Error('TARGET_CHANGED_DURING_OWNED_QA'); evidence.error = failure.message; }
  evidence.processes = tasks.map(task => ({ name: task.name, pid: task.child.pid, exited: task.exited }));
  evidence.cleanup = { status: errors.length ? 'FAILED' : 'PASS', portReleased, dataRemoved, errors };
  evidence.finishedAt = new Date().toISOString();
  await save(path.join(runDir, 'owned-backend-runtime.json'), evidence);
  if (!errors.length) { await identity(); await fs.unlink(marker); }
  if (errors.length) failure = Error('OWNED_BACKEND_CLEANUP_FAILED:' + errors.join(';'));
}
console.log(`Owned backend regression: ${evidence.result}; cleanup ${evidence.cleanup.status}`);
console.log(`Evidence: ${path.join(runDir, 'owned-backend-runtime.json')}`);
if (failure) throw failure;

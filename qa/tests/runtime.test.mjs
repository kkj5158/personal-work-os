import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { available, choosePort, ownedProcess, readiness, acquireLock, save, json, writeResult, redact } from '../runtime/core.mjs';
import { loadEnvironment, systemEnvironment } from '../runtime/environment.mjs';
import { validateHandoff } from '../runtime/handoff.mjs';
import { FixtureScope } from '../helpers/api.mjs';
import { restoreTsconfig } from '../runtime/build-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'qa/tests/fixture-server.mjs');
async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pos-qa-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function server(dir, port, extra = {}) {
  return ownedProcess(process.execPath, [fixture], { name: 'fixture', cwd: root, env: { ...systemEnvironment(), FIXTURE_PORT: String(port), ...extra }, logFile: path.join(dir, 'server.log') });
}

test('occupied port rejected and external owner preserved; automatic range advances', async t => {
  const dir = await setup(t), port = await choosePort(undefined, 19200, 19220);
  const external = server(dir, port); t.after(() => external.stop());
  await readiness(`http://127.0.0.1:${port}`, external, 5000);
  await assert.rejects(choosePort(port), /PORT_OCCUPIED/);
  assert.notEqual(await choosePort(undefined, port, port + 4), port);
  assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200);
  await external.stop();
});
test('backend startup failure is detected before timeout and diagnostics persist', async t => {
  const dir = await setup(t), owner = server(dir, 19230, { FIXTURE_FAIL: '1' });
  t.after(() => owner.stop());
  await assert.rejects(readiness('http://127.0.0.1:19230', owner, 5000), /exited/);
  await owner.done;
  assert.match(await readFile(path.join(dir, 'server.log'), 'utf8'), /fixture startup failed/);
});
test('readiness timeout and abort both clean owned child', async t => {
  const dir = await setup(t);
  for (const interrupt of [false, true]) {
    const owner = ownedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { name: 'waiting', cwd: root, env: systemEnvironment(), logFile: path.join(dir, 'wait.log') });
    const abort = new AbortController();
    if (interrupt) abort.abort(new Error('Ctrl+C'));
    await assert.rejects(readiness('http://127.0.0.1:19231', owner, 300, abort.signal), interrupt ? /Ctrl\+C/ : /READINESS_TIMEOUT/);
    await owner.stop(); assert.equal(owner.exited, true);
  }
});
test('owned Windows process tree cleanup preserves unrelated runtime', { skip: process.platform !== 'win32' }, async t => {
  const dir = await setup(t), port = await choosePort(undefined, 19240, 19249);
  const childFile = path.join(dir, 'child.pid');
  const owner = server(dir, port, { FIXTURE_CHILD_FILE: childFile }); t.after(() => owner.stop());
  await readiness(`http://127.0.0.1:${port}`, owner, 5000);
  const pid = Number(await readFile(childFile, 'utf8'));
  process.kill(pid, 0);
  await owner.stop();
  assert.throws(() => process.kill(pid, 0));
  assert.equal(await available(port), true);
});
test('lock refuses live/stale ownership and cannot release another owner', async t => {
  const dir = await setup(t), file = path.join(dir, 'lock.json');
  const release = await acquireLock(file, { runId: 'a', pid: process.pid });
  await assert.rejects(acquireLock(file, { runId: 'b', pid: process.pid }), /QA_LOCK_OCCUPIED/);
  await save(file, { runId: 'b', pid: process.pid });
  await assert.rejects(release(), /LOCK_OWNERSHIP_CHANGED/);
  assert.equal((await json(file)).runId, 'b');
});
test('environment loads only canonical DEV keys, decodes XML, never passes backend secrets to browser', async t => {
  const dir = await setup(t), file = path.join(dir, 'workspace.xml');
  await writeFile(file, '<project><component><configuration name="BackendApplication"><envs><env name="DEV_DB_URL" value="jdbc:postgresql://example/db"/><env name="DEV_DB_USERNAME" value="user"/><env name="DEV_DB_PASSWORD" value="a&amp;b"/><env name="APP_DEV_USER_ID" value="id"/><env name="PROD_DB_PASSWORD" value="forbidden"/></envs></configuration></component></project>');
  const loaded = await loadEnvironment(dir, file, {});
  assert.equal(loaded.values.DEV_DB_PASSWORD, 'a&b');
  assert.equal(loaded.values.PROD_DB_PASSWORD, undefined);
  assert.equal(systemEnvironment(loaded.values).DEV_DB_PASSWORD, undefined);
  await writeFile(path.join(dir, '.env'), 'DEV_DB_URL=jdbc:postgresql://example/db\n');
  await assert.rejects(loadEnvironment(dir, path.join(dir, '.env'), {}), /ENVIRONMENT SOURCE INACCESSIBLE/);
});
test('secret redaction works across split child output chunks', async t => {
  const dir = await setup(t), log = path.join(dir, 'redacted.log');
  const owner = ownedProcess(process.execPath, ['-e', "process.stdout.write('sec');setTimeout(()=>process.stdout.write('ret-value\\n'),20)"], { name: 'redaction', cwd: root, env: systemEnvironment(), secrets: ['secret-value'], logFile: log });
  await owner.wait(5000);
  assert.equal((await readFile(log, 'utf8')).trim(), '[REDACTED]');
  assert.equal(redact('password=abc'), 'password=[REDACTED]');
});
test('stale worker revision is blocked rather than tested against current tree', () => {
  const handoff = Object.fromEntries(['system', 'track', 'featureBranch', 'commitSha', 'baseDevSha', 'changedScope', 'migrations', 'apiChanges', 'testsPassed', 'runtimeRequirements', 'fixtures', 'browserScenarios', 'knownRisks', 'cleanupRequirements'].map(k => [k, []]));
  Object.assign(handoff, { schemaVersion: 1, system: 'money', track: 'test', featureBranch: 'test', baseDevSha: 'base', commitSha: 'stale' });
  assert.throws(() => validateHandoff(handoff, { system: 'money', revision: 'current', target: root, scenarios: [] }), /REVISION_MISMATCH/);
});
test('owned fixture cleanup attempts all callbacks and reports failure', async () => {
  const scope = new FixtureScope(), calls = [];
  scope.own(async () => calls.push('first'));
  scope.own(async () => { calls.push('second'); throw new Error('cleanup'); });
  await assert.rejects(scope.close(), /CLEANUP_FAILED/);
  assert.deepEqual(calls, ['second', 'first']);
});
test('FAIL/BLOCKED artifacts preserve exact gates and cleanup independently', async t => {
  const dir = await setup(t);
  await writeResult(dir, { runId: 'test', system: 'money', status: 'BLOCKED_RESOURCE', gate: 'PORT_OCCUPIED', ports: {}, cleanup: { status: 'PASS' } });
  assert.equal((await json(path.join(dir, 'result.json'))).status, 'BLOCKED_RESOURCE');
  assert.match(await readFile(path.join(dir, 'result.md'), 'utf8'), /PORT_OCCUPIED/);
});

for (const mode of ['pass', 'failure', 'console', 'pageerror', 'frontend-failure', 'occupied']) {
  test(`real Playwright managed lifecycle: ${mode}`, async t => {
    const dir = await setup(t), port = await choosePort(undefined, 19300, 19349);
    let external;
    if (mode === 'occupied') { external = server(dir, port); t.after(() => external.stop()); await readiness(`http://127.0.0.1:${port}`, external, 5000); }
    const owner = ownedProcess(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'qa/tests/fixtures/config.mjs'], {
      name: 'playwright', cwd: root, logFile: path.join(dir, 'runner.log'),
      env: { ...systemEnvironment(), QA_RUN_DIR: dir, FIXTURE_PORT: String(port), FIXTURE_BROWSER: mode, ...(mode === 'frontend-failure' ? { FIXTURE_FAIL: '1' } : {}) }
    });
    t.after(() => owner.stop());
    if (mode === 'pass') await owner.wait(30000); else await assert.rejects(owner.wait(30000));
    const report = await json(path.join(dir, 'browser.json'));
    assert.equal(report.status, mode === 'pass' ? 'passed' : 'failed');
    if (['failure', 'console', 'pageerror'].includes(mode)) {
      assert.equal(report.tests[0].status, 'failed');
      assert.ok(report.tests[0].attachments.some(a => a.name === 'screenshot'));
      assert.ok(report.tests[0].attachments.some(a => a.name === 'trace'));
      if (mode !== 'failure') assert.match(JSON.stringify(report.tests[0].errors), /injected/);
    }
    assert.equal(await available(port), mode !== 'occupied');
    if (external) { assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200); await external.stop(); }
  });
}

test('restore only owned Next build tsconfig changes, preserve concurrent edits', async t => {
  const dir = await setup(t), file = path.join(dir, 'tsconfig.json');
  const original = '{"include":["**/*.ts"]}\n';
  await writeFile(file, '{"include":["**/*.ts",".next-qa-test/types/**/*.ts"]}');
  await restoreTsconfig(file, original, '.next-qa-test');
  assert.equal(await readFile(file, 'utf8'), original);
  await writeFile(file, '{"include":["someone-elses.ts"]}');
  await assert.rejects(restoreTsconfig(file, original, '.next-qa-test'), /CHANGED_EXTERNALLY/);
});

test('Ctrl+C signal handler stops owned runtime, releases lock and writes interrupted artifact', async t => {
  const dir = await setup(t), port = await choosePort(undefined, 19400, 19420);
  const driver = fork(path.join(root, 'qa/tests/signal-driver.mjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...systemEnvironment(), SIGNAL_DIR: dir, FIXTURE_PORT: String(port) } });
  t.after(() => { if (driver.exitCode === null) driver.kill(); });
  await once(driver, 'message');
  const closed = once(driver, 'exit');
  if (process.platform === 'win32') driver.send('ctrl-c'); else driver.kill('SIGINT');
  const [code] = await closed;
  assert.equal(code, 0);
  assert.equal(await available(port), true);
  assert.equal((await json(path.join(dir, 'result.json'))).gate, 'INTERRUPTED:SIGINT');
  await assert.rejects(readFile(path.join(dir, 'lock')), { code: 'ENOENT' });
});

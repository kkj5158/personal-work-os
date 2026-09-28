import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LAUNCH_IGNORE_DEFAULT_ARGS, launchOptions, launchTeamKafkaBrowser, parseChromeProcesses, profileState, resolveChrome, resolveProfile } from '../helpers/team-kafka-browser.mjs';

// No test launches Chrome: filesystem and process lists are faked.
async function fakeLocalAppData(t, { profile = true, valid = true, chrome = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'tk-browser-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (profile) { const dir = path.join(root, 'Chrome-TEAM-KAFKA'); await mkdir(path.join(dir, valid ? 'Default' : 'x'), { recursive: true }); if (valid) await writeFile(path.join(dir, 'Local State'), '{}'); }
  if (chrome) { const bin = path.join(root, 'Google', 'Chrome', 'Application'); await mkdir(bin, { recursive: true }); await writeFile(path.join(bin, 'chrome.exe'), ''); }
  return root;
}

test('profile resolves only to %LOCALAPPDATA%\\Chrome-TEAM-KAFKA and fails clearly otherwise', async t => {
  const root = await fakeLocalAppData(t);
  assert.equal(resolveProfile({ LOCALAPPDATA: root }), path.join(root, 'Chrome-TEAM-KAFKA'));
  assert.throws(() => resolveProfile({}), /TEAM_KAFKA_PROFILE_MISSING/);
  const missing = await fakeLocalAppData(t, { profile: false }), invalid = await fakeLocalAppData(t, { valid: false });
  assert.throws(() => resolveProfile({ LOCALAPPDATA: missing }), /TEAM_KAFKA_PROFILE_MISSING/);
  assert.throws(() => resolveProfile({ LOCALAPPDATA: invalid }), /TEAM_KAFKA_PROFILE_INVALID/);
});

test('Chrome stable executable only; missing Chrome is an error, never a fallback', async t => {
  const root = await fakeLocalAppData(t);
  assert.equal(resolveChrome({ LOCALAPPDATA: root }), path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  const noChrome = await fakeLocalAppData(t, { chrome: false });
  assert.throws(() => resolveChrome({ LOCALAPPDATA: noChrome }), /CHROME_STABLE_NOT_FOUND/);
});

test('process classification separates TEAM KAFKA from personal Chrome by user-data-dir', async t => {
  const root = await fakeLocalAppData(t), dir = path.join(root, 'Chrome-TEAM-KAFKA');
  const rows = [
    { ProcessId: 1, CommandLine: '"chrome.exe" --flag' },                                                       // personal (default dir)
    { ProcessId: 2, CommandLine: `"chrome.exe" --user-data-dir="${dir}" --silent-debugger-extension-api` },    // TEAM KAFKA (shortcut)
    { ProcessId: 3, CommandLine: `"chrome.exe" --type=renderer --user-data-dir="${dir}"` },                    // child, ignored
  ];
  const processes = parseChromeProcesses(rows);
  assert.deepEqual(processes.map(p => p.pid), [1, 2]);
  assert.deepEqual(profileState(dir, processes, true), { inUse: true, teamKafkaPids: [2], otherChrome: 1, staleLock: false });
  assert.deepEqual(profileState(dir, processes.slice(0, 1), true), { inUse: false, teamKafkaPids: [], otherChrome: 1, staleLock: true });
});

test('launch options: explicit executable, persistent profile extensions kept enabled, no channel', () => {
  const options = launchOptions({ executablePath: 'C:/chrome.exe' });
  assert.equal(options.executablePath, 'C:/chrome.exe');
  assert.equal('channel' in options, false);
  assert.deepEqual(options.ignoreDefaultArgs, LAUNCH_IGNORE_DEFAULT_ARGS);
  assert.ok(LAUNCH_IGNORE_DEFAULT_ARGS.includes('--disable-extensions'));
});

test('launch refuses (before starting Chrome) when TEAM KAFKA is open or other Chrome runs without opt-in', async t => {
  const root = await fakeLocalAppData(t), dir = path.join(root, 'Chrome-TEAM-KAFKA');
  const env = { LOCALAPPDATA: root };
  await assert.rejects(launchTeamKafkaBrowser({ env, list: () => [{ pid: 9, userDataDir: dir }] }), /TEAM_KAFKA_PROFILE_IN_USE/);
  await assert.rejects(launchTeamKafkaBrowser({ env, list: () => [{ pid: 7, userDataDir: null }] }), /OTHER_CHROME_RUNNING/);
});

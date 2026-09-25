import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../runtime/core.mjs';
import { validateHandoff } from '../runtime/handoff.mjs';
import adapter, { schemaFor } from '../suites/money/bridge-adapter.mjs';
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function handoff() {
  const commit = git(target, 'rev-parse', 'HEAD');
  return { schemaVersion: 1, system: 'money', track: 'money-batch4', featureBranch: 'codex/money-sys-batch4', commitSha: commit, baseDevSha: commit,
    changedScope: [], migrations: [], apiChanges: [], testsPassed: [], knownRisks: [], browserScenarios: [...adapter.scenarios],
    ...structuredClone(adapter.setup) };
}
function validate(h) { validateHandoff(h, { system: 'money', revision: h.commitSha, target, scenarios: adapter.scenarios, setup: adapter.setup }); }
test('Bridge handoff permits only adapter-declared fixture/runtime/cleanup contracts', () => {
  validate(handoff());
  for (const key of ['fixtures', 'runtimeRequirements', 'cleanupRequirements']) {
    const h = handoff(); h[key].push('arbitrary command'); assert.throws(() => validate(h), /SETUP_REQUIRES_ADAPTER/);
  }
  const h = handoff(); h.browserScenarios.push('unimplemented'); assert.throws(() => validate(h), /SCENARIO_NOT_IMPLEMENTED/);
});
test('Bridge schemas are deterministic per run and isolated; pilot cannot certify Bridge scope', () => {
  assert.match(schemaFor('run-a'), /^qa_money_bridge_[a-f0-9]{20}$/);
  assert.equal(schemaFor('run-a'), schemaFor('run-a'));
  assert.notEqual(schemaFor('run-a'), schemaFor('run-b'));
  const h = handoff(); assert.throws(() => validateHandoff(h, { system: 'money', revision: h.commitSha, target, scenarios: ['money.routes'] }), /SCENARIO_NOT_IMPLEMENTED/);
  assert.equal(adapter.sensitive, true); assert.equal(adapter.processingEnabled, true);
  assert.equal(adapter.scenarios.filter(s => s.startsWith('money.bridge.')).length, 15);
});

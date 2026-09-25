import { Gate, git } from './core.mjs';

export function validateHandoff(handoff, { system, revision, target, scenarios }) {
  if (handoff.schemaVersion !== 1) throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_SCHEMA_VERSION_MUST_BE_1');
  for (const key of ['system', 'track', 'featureBranch', 'commitSha', 'baseDevSha', 'changedScope', 'migrations', 'apiChanges', 'testsPassed', 'runtimeRequirements', 'fixtures', 'browserScenarios', 'knownRisks', 'cleanupRequirements']) {
    if (!(key in handoff)) throw new Gate('BLOCKED_CONTEXT', `HANDOFF_MISSING:${key}`);
  }
  for (const key of ['changedScope', 'migrations', 'apiChanges', 'testsPassed', 'runtimeRequirements', 'fixtures', 'browserScenarios', 'knownRisks', 'cleanupRequirements']) {
    if (!Array.isArray(handoff[key])) throw new Gate('BLOCKED_CONTEXT', `HANDOFF_ARRAY_REQUIRED:${key}`);
  }
  for (const key of ['system', 'track', 'featureBranch', 'commitSha', 'baseDevSha']) {
    if (typeof handoff[key] !== 'string' || !handoff[key].trim()) throw new Gate('BLOCKED_CONTEXT', `HANDOFF_STRING_REQUIRED:${key}`);
  }
  if (handoff.system !== system || handoff.commitSha !== revision) throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_TARGET_REVISION_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(handoff.baseDevSha)) throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_BASE_SHA_REQUIRED');
  try { git(target, 'merge-base', '--is-ancestor', handoff.baseDevSha, revision); }
  catch { throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_BASE_NOT_ANCESTOR'); }
  if (!handoff.browserScenarios.length || handoff.browserScenarios.some(s => !scenarios.includes(s))) throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_SCENARIO_NOT_IMPLEMENTED:extend suite/adapter before QA');
  // Arbitrary setup commands from JSON are never executed.
  if (handoff.fixtures.length || handoff.cleanupRequirements.length || handoff.runtimeRequirements.some(r => r !== 'authorized-dev')) throw new Gate('BLOCKED_CONTEXT', 'HANDOFF_SETUP_REQUIRES_ADAPTER:review fixtures/runtime/cleanup requirements');
}

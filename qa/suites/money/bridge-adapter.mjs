import path from 'node:path';
import { createHash } from 'node:crypto';

export const schemaFor = runId => 'qa_money_bridge_' + createHash('sha256').update(runId).digest('hex').slice(0, 20);
async function schemaTask(ctx, action) {
  const source = path.join(ctx.toolRoot, 'qa/suites/money/BridgeFixture.java');
  await ctx.run('bridge-schema-' + action, 'java', ['-cp', ctx.classpath, source, action, schemaFor(ctx.runId)],
    path.join(ctx.target, 'backend'), ctx.javaEnv, 60000);
}
export default {
  system: 'money', readyPath: '/api/money/accounts', route: '/money/settings',
  sensitive: true, testMatch: ['**/smoke.spec.mjs', '**/bridge.spec.mjs'], processingEnabled: true,
  scenarios: ['money.routes', 'money.filters-reload', 'money.account-dialog',
    'money.bridge.area', 'money.bridge.create-code', 'money.bridge.code-lifecycle',
    'money.bridge.exchange', 'money.bridge.devices', 'money.bridge.identity-binding',
    'money.bridge.idempotency', 'money.bridge.revoke', 'money.bridge.rotation',
    'money.bridge.invalid-auth', 'money.bridge.owner-isolation', 'money.bridge.web-auth',
    'money.bridge.nearby-routes', 'money.bridge.canonical-ingest', 'money.bridge.scheduler'],
  apiChecks: ['/api/money/accounts', '/api/money/bridge/devices', '/api/money/connection-status'],
  backgroundValidation: 'Enabled only against a run-owned isolated MONEY schema; synthetic source must reach REVIEW_REQUIRED with no ledger entry.',
  setup: {
    runtimeRequirements: ['authorized-dev', 'isolated-money-scheduler'],
    fixtures: ['isolated-money-bridge-schema'], cleanupRequirements: ['drop-run-owned-money-schema']
  },
  async prepare(ctx) {
    await schemaTask(ctx, 'create');
    const url = new URL(ctx.javaEnv.DEV_DB_URL.replace(/^jdbc:/, ''));
    url.searchParams.set('currentSchema', schemaFor(ctx.runId) + ',public');
    const env = { ...ctx.javaEnv, DEV_DB_URL: 'jdbc:' + url.href };
    // Actual production security chain and owner-isolation tests accompany the
    // DEV runtime: the DEV profile alone cannot certify Supabase JWT behavior.
    await ctx.run('bridge-security-tests', 'cmd.exe', ['/d', '/c', 'gradlew.bat', '--no-daemon', '--console=plain',
      'test', '--rerun', '--tests', '*MoneyBridgeSecurityTest', '--tests', '*MoneyBridgePostgresTest',
      '--tests', '*ProdCurrentUserProviderTest', '--tests', '*ProdSecurityConfigJwtDecoderTest', '--tests', '*SecurityProfileIsolationTest'],
      path.join(ctx.target, 'backend'), env, 300000);
    return { DEV_DB_URL: env.DEV_DB_URL };
  },
  async cleanup(ctx) { await schemaTask(ctx, 'drop'); }
};

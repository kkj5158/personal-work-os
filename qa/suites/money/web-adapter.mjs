import path from 'node:path';
import {createHash} from 'node:crypto';
import bridge from './bridge-adapter.mjs';
const schemaFor=id=>'qa_money_web_'+createHash('sha256').update(id).digest('hex').slice(0,20);
async function schemaTask(ctx,action){await ctx.run('web-schema-'+action,'java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/money/WebFixture.java'),action,schemaFor(ctx.runId)],path.join(ctx.target,'backend'),ctx.javaEnv,60000);}
export default {
 ...bridge, tracks:undefined,route:'/money',testMatch:['**/bridge.spec.mjs','**/web.spec.mjs'],browserTimeout:600000,
 scenarios:[...bridge.scenarios.filter(s=>s.startsWith('money.bridge.')),
  'money.web.seed','money.web.routes','money.web.periods','money.web.overview-semantics',
  'money.web.transaction-panel','money.web.dirty-guards','money.web.bookkeeping-inheritance',
  'money.web.accounts','money.web.loans','money.web.rules','money.web.review',
  'money.web.immediate-posting','money.web.performance'],
 apiChecks:['/api/money/accounts','/api/money/loans','/api/money/bookkeeping?from=2026-09-01&to=2026-09-30','/api/money/overview?from=2026-09-01&to=2026-09-30'],
 setup:{runtimeRequirements:['authorized-dev','isolated-money-scheduler'],fixtures:['isolated-money-web-schema'],cleanupRequirements:['drop-run-owned-money-schema']},
 backgroundValidation:'Synthetic complete pair must post immediately once; incomplete/ambiguous sources remain conservative. Shared and PROD financial data are never fixtures.',
 async prepare(ctx){await schemaTask(ctx,'create');const url=new URL(ctx.javaEnv.DEV_DB_URL.replace(/^jdbc:/,''));url.searchParams.set('currentSchema',schemaFor(ctx.runId)+',public');return {DEV_DB_URL:'jdbc:'+url.href};},
 async cleanup(ctx){await schemaTask(ctx,'drop');}
};

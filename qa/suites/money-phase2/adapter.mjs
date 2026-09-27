import web from '../money/web-adapter.mjs';
import path from 'node:path';
export default {
 ...web,system:'money-phase2',testMatch:'**/core.spec.mjs',browserTimeout:900000,
 scenarios:[...web.scenarios.filter(s=>s.startsWith('money.bridge.')),
  'money.phase2.seed','money.phase2.overview','money.phase2.flow','money.phase2.ledger',
  'money.phase2.balances','money.phase2.loans','money.phase2.pagination','money.phase2.compatibility'],
 async prepare(ctx){
  const env=await web.prepare(ctx);
  await ctx.run('financial-security-regression','cmd.exe',['/d','/c','gradlew.bat','--no-daemon','--console=plain','test','--rerun',
   '--tests','*MoneyBridgeSecurityTest','--tests','*MoneyBridgePostgresTest','--tests','*ProdCurrentUserProviderTest',
   '--tests','*ProdSecurityConfigJwtDecoderTest','--tests','*SecurityProfileIsolationTest'],path.join(ctx.target,'backend'),{...ctx.javaEnv,...env},300000);
  return env;
 }
};

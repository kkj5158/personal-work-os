import path from 'node:path';
import fs from 'node:fs/promises';
import web from '../money/web-adapter.mjs';
export default {
 ...web,system:'money-integrated',sensitive:false,processingEnabled:true,
 testMatch:['**/integrated.spec.mjs','**/category.spec.mjs','**/remediation.spec.mjs'],browserTimeout:1100000,
 scenarios:[...Array.from({length:14},(_,i)=>'money.integrated.cross-'+String(i+1).padStart(2,'0')),
 'money.revision.category.manage-icons','money.revision.category.filter','money.revision.category.edit','money.revision.category.narrow',
 'money.remediation.read-first','money.remediation.provenance','money.remediation.reconciliation-groups','money.remediation.dependent-failure'],
 apiChecks:['/api/money/accounts','/api/money/overview/preferences','/api/money/overview/current-stock','/api/money/ai/workspace','/api/money/ai/classification/history','/api/money/ai/merchant-links'],
 async prepare(ctx){
  const changed=await web.prepare(ctx);
  const focused=process.env.MONEY_INTEGRATED_FOCUSED_TEST;
  if(ctx.javaEnv.QA_MODE==='focused'&&focused){
   if(!/^com\.kafka\.backend\.money\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)?$/.test(focused))throw Error('EXPLICIT_MONEY_FOCUSED_TEST_REQUIRED');
   try{await ctx.run('money-integrated-targeted-regression','cmd.exe',['/d','/c','gradlew.bat','test','--no-daemon','--console=plain','--tests',focused],path.join(ctx.target,'backend'),{...ctx.javaEnv,...changed},300000);}
   finally{const source=path.join(ctx.target,'backend/build/test-results/test'),destination=path.join(ctx.dir,'backend-test-results');await fs.mkdir(destination,{recursive:true});for(const file of await fs.readdir(source).catch(()=>[]))if(file.endsWith('.xml'))await fs.copyFile(path.join(source,file),path.join(destination,file));}
  }
  if(ctx.javaEnv.QA_MODE==='integration'||process.env.MONEY_INTEGRATED_SMOKE!=='1'){
   try{await ctx.run('money-integrated-full-regression','cmd.exe',['/d','/c','gradlew.bat','test','--no-daemon','--console=plain','--tests','com.kafka.backend.money.*','--tests','*ProdCurrentUserProviderTest','--tests','*ProdSecurityConfigJwtDecoderTest','--tests','*SecurityProfileIsolationTest'],path.join(ctx.target,'backend'),{...ctx.javaEnv,...changed},2400000);}
   finally{const source=path.join(ctx.target,'backend/build/test-results/test'),destination=path.join(ctx.dir,'backend-test-results');await fs.mkdir(destination,{recursive:true});for(const file of await fs.readdir(source).catch(()=>[]))if(file.endsWith('.xml'))await fs.copyFile(path.join(source,file),path.join(destination,file));}
  }
  if(ctx.javaEnv.QA_MODE==='integration'){
   await ctx.run('money-transfer-39-owned',process.execPath,['qa/money-transfer-owned-runtime.mjs'],ctx.target,ctx.javaEnv,450000);
   const tests=(await fs.readdir(path.join(ctx.target,'frontend/lib/money'))).filter(name=>name.endsWith('.test.ts')).sort().map(name=>'lib/money/'+name);await ctx.run('money-frontend-domain-tests','cmd.exe',['/d','/c','node_modules\\.bin\\tsx.cmd','--test',...tests],path.join(ctx.target,'frontend'),ctx.javaEnv,60000);
  }
  if(ctx.javaEnv.QA_MODE==='integration')await ctx.run('money-frontend-lint','cmd.exe',['/d','/c','node_modules\\.bin\\eslint.cmd','app/money','lib/money'],path.join(ctx.target,'frontend'),ctx.javaEnv,60000);
  return changed;
 },
};

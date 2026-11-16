// Owner-authorized API-only release. No infrastructure, Web source, variables or schema changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {acquireLock} from '../runtime/core.mjs';
const scope=process.argv[2];
if(!['dev','prod','status-dev','status-prod'].includes(scope))throw Error('Explicit scope required');
const target=scope.endsWith('prod')?'prod':'dev';
const root=process.cwd(),evidence='D:/DEV_Space/pos-log-android-artifacts-20261117';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const env=target==='dev'?'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c':'c2c20488-311f-4b9e-9ec9-d79508123176';
const service=target==='dev'?'eba7d263-7dc3-448a-a6b8-c2994721b597':'e46b58f4-e829-430f-a4c4-b27e24d46f19';
const url=target==='dev'?'https://workflow-api-development-development.up.railway.app':'https://personal-work-os-prod-production.up.railway.app';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const cli=(...args)=>execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...args],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:120000});
const list=()=>{const raw=JSON.parse(cli('deployment','list','--project',project,'--environment',env,'--service',service,'--limit','5','--json'));return Array.isArray(raw)?raw:raw.deployments;};
const clean=d=>({id:d.id,status:d.status,createdAt:d.createdAt,commit:d.meta?.commitHash??d.meta?.gitCommit??d.commitHash??null,branch:d.meta?.branch??null,metaKeys:Object.keys(d.meta??{})});
const report={scope:target,at:new Date().toISOString(),backendDelta:'52aa176c',migration:'NONE',webDeployment:false,checks:[]};
let release;
try{
 if(!scope.startsWith('status-')){
  const common=git('rev-parse','--path-format=absolute','--git-common-dir');
  release=await acquireLock(path.join(common,'pos-central-qa.lock'),{runId:'log-android-'+randomUUID(),pid:process.pid,worktree:root,system:'pos-log-android-api-release',startedAt:new Date().toISOString()});
  if(git('diff','--name-only','--diff-filter=U'))throw Error('UNRESOLVED_CONFLICT');
  git('fetch','origin');
  if(target==='dev'){
   if(git('branch','--show-current')!=='feat/pos/log-android-v1-20261117')throw Error('FEATURE_BRANCH_FENCE');
   git('merge','origin/dev','--no-edit');
   for(const file of ['backend/src/main/java/com/kafka/backend/log/LogController.java','backend/src/main/java/com/kafka/backend/log/LogService.java','backend/src/test/java/com/kafka/backend/log/LogPostgresTest.java'])if(git('rev-parse','HEAD:'+file)!==git('rev-parse','52aa176c:'+file))throw Error('TESTED_LOG_SOURCE_CHANGED');
  }else{
   if(!git('branch','--show-current').startsWith('release/pos-log-android-api-'))throw Error('PROD_BRANCH_FENCE');
   // This checkout must already contain the reviewed cherry-pick on the latest production base.
   const changed=git('diff','--name-only','origin/prod','HEAD').split(/\r?\n/);
   if(changed.length!==3||changed.some(p=>!p.startsWith('backend/src/')||!p.includes('/log/')))throw Error('NARROW_PROD_DELTA_FENCE');
  }
  report.commit=git('rev-parse','HEAD');report.before=list().map(clean);
  git('push','origin',`HEAD:${target}`);console.log('API_BRANCH_PUSHED_'+target+'_'+report.commit);
  const deadline=Date.now()+18*60*1000;
  while(Date.now()<deadline){
   const deployments=list().map(clean);report.deployments=deployments;
   const current=deployments.find(d=>d.commit===report.commit);
   console.log('API_DEPLOYMENT_'+target+'_'+(current?.status??'WAITING_FOR_SOURCE'));
   await fs.writeFile(path.join(evidence,`${target}-api-release.json`),JSON.stringify(report,null,2));
   if(current?.status==='SUCCESS'){report.status='PASS';break;}
   if(current&&['FAILED','CRASHED','REMOVED'].includes(current.status))throw Error('DEPLOYMENT_FAILED');
   await new Promise(r=>setTimeout(r,15000));
  }
  if(report.status!=='PASS')throw Error('DEPLOYMENT_TIMEOUT');
 }else{report.deployments=list().map(clean);report.status='OBSERVED';}
 const health=await fetch(url+'/actuator/health',{signal:AbortSignal.timeout(30000)});report.health={status:health.status,body:await health.json()};
 if(!health.ok||report.health.body.status!=='UP')throw Error('HEALTH_FAILED');
 report.finishedAt=new Date().toISOString();
 await fs.writeFile(path.join(evidence,`${target}-api-${scope.startsWith('status-')?'status':'release'}.json`),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.reason=/^[A-Z_]+$/.test(e.message)?e.message:'RELEASE_OPERATION_FAILED';await fs.writeFile(path.join(evidence,`${target}-api-release-failure.json`),JSON.stringify(report,null,2));console.error(JSON.stringify({status:'FAIL',scope:target,reason:report.reason}));process.exitCode=1;}
finally{if(release)await release();}

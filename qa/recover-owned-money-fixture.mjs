import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadEnvironment,systemEnvironment} from './runtime/environment.mjs';
import {ownedProcess,available,git} from './runtime/core.mjs';
const id=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{8}$/.test(id??''))throw Error('Exact owned run ID required');
const root=process.cwd(),dir=path.join(root,'.qa/runs',id),result=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));
if(result.runId!==id||path.resolve(result.worktree)!==root||!result.cleanup.errors.includes('OWNED_FIXTURE_CLEANUP_FAILED'))throw Error('Recovery ownership rejected');
try{process.kill(result.ownerPid,0);throw Error('Original owner still live; preserve lock');}catch(e){if(e.code!=='ESRCH')throw e;}
for(const port of Object.values(result.ports))if(!await available(port))throw Error('Original port occupied; preserve resources');
const {values}=await loadEnvironment(root);const env={...systemEnvironment(),...values,QA_RUN_ID:id};const cp=await fs.readFile(path.join(dir,'audit-classpath.txt'),'utf8');
const schema='qa_money_web_'+createHash('sha256').update(id).digest('hex').slice(0,20);
const task=async(name,args)=>{const p=ownedProcess('java',args,{name,cwd:path.join(root,'backend'),env,logFile:path.join(dir,name+'.log'),secrets:Object.values(values)});try{await p.wait(60000);}finally{await p.stop();}};
await task('fixture-cleanup-recovery',['-cp',cp,path.join(root,'qa/suites/money/WebFixture.java'),'drop',schema]);
await task('db-cleanup-recovery',['-cp',cp,'DatabaseAudit','connections']);
const lock=path.resolve(root,git(root,'rev-parse','--git-common-dir'),'pos-central-qa.lock'),owner=JSON.parse(await fs.readFile(lock,'utf8'));
if(owner.runId!==id||owner.pid!==result.ownerPid)throw Error('Lock belongs to another run');
await fs.unlink(lock);await fs.writeFile(path.join(dir,'cleanup-recovery.json'),JSON.stringify({at:new Date().toISOString(),runId:id,ownedSchema:schema,status:'PASS',portsFree:true,dbSessions:'VERIFIED_ZERO',originalResultPreserved:true},null,2));console.log('OWNED_FIXTURE_CLEANUP_RECOVERY=PASS');

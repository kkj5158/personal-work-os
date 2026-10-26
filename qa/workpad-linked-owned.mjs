import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ownedProcess,choosePort,available,readiness,git,save} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';

// An owned loopback cluster, real migrations, and retained child handles. No
// shared DEV/PROD credentials, data, browser profiles, or browser launch.
const root=process.cwd(),run='workpad-linked-'+Date.now(),dir=path.join(root,'.qa/runs',run),data=path.join(dir,'postgres');
const pg='C:/Program Files/PostgreSQL/18/bin',owner=randomUUID();
const dbPort=await choosePort(undefined,55443,55449),apiPort=await choosePort(undefined,18030,18039),webPort=await choosePort(undefined,13030,13039);
const apiURL=`http://127.0.0.1:${apiPort}`,webURL=`http://127.0.0.1:${webPort}`;
const env={...systemEnvironment(),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${dbPort}/postgres`,DEV_DB_USERNAME:'workpad_synthetic',DEV_DB_PASSWORD:'owned-loopback-fixture',APP_DEV_USER_ID:owner};
await fs.mkdir(dir,{recursive:true});
const report={run,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),database:'OWNED_LOOPBACK_SYNTHETIC',sharedDEV:'NEVER_CONNECTED',checks:[],cleanup:'PENDING',apiURL,webURL};
const tasks=[];
function start(name,exe,args,cwd=root,childEnv=env){const task=ownedProcess(exe,args,{name,cwd,env:childEnv,logFile:path.join(dir,name+'.log')});tasks.push(task);return task;}
async function api(route,method='GET',body){const response=await fetch(apiURL+route,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error(method+' '+route+':'+response.status);return response.json();}
let server,backendReady=false,webReady=false;
try{
  await start('initdb',pg+'/initdb.exe',['-D',data,'-U',env.DEV_DB_USERNAME,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
  server=start('postgres',pg+'/postgres.exe',['-D',data,'-h','127.0.0.1','-p',String(dbPort),'-c','max_connections=20']);
  for(let i=0;i<120;i++){server.check();if(server.output.includes('ready to accept connections'))break;await new Promise(resolve=>setTimeout(resolve,250));}
  const sql=path.join(dir,'bootstrap.sql');await fs.writeFile(sql,`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${owner}'); CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;`);
  await start('bootstrap',pg+'/psql.exe',['-h','127.0.0.1','-p',String(dbPort),'-U',env.DEV_DB_USERNAME,'-d','postgres','-v','ON_ERROR_STOP=1','-f',sql]).wait(30000);
  await start('backend-tests','cmd.exe',['/d','/c','gradlew.bat','--no-daemon','--console=plain','test','--tests','com.kafka.backend.workflow.WorklogNotesServiceTest','--tests','com.kafka.backend.workflow.WorkflowServiceTest','--tests','com.kafka.backend.workflow.WorkpadMetadataTest','bootJar'],path.join(root,'backend')).wait(300000);
  report.checks.push({name:'backend-tests',status:'PASS'});
  if(!await available(apiPort)||!await available(webPort))throw Error('OWNED_APP_PORT_RACED');
  const backend=start('backend','java',['-jar','backend/build/libs/backend-0.0.1-SNAPSHOT.jar','--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${apiPort}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0',`--app.dev-allowed-origins=${webURL}`,'--app.money.processing-enabled=false','--money.ai.classification-provider-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--money.ai.classification-worker-enabled=false','--app.absence-backfill-cron=-']);
  await readiness(apiURL+'/api/workflow/preferences',backend,180000);backendReady=true;
  const publicEnv={...systemEnvironment(),NEXT_PUBLIC_API_BASE_URL:apiURL,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_TELEMETRY_DISABLED:'1'};
  await start('frontend-build',process.execPath,['node_modules/next/dist/bin/next','build'],path.join(root,'frontend'),publicEnv).wait(600000);
  if(!await available(webPort))throw Error('OWNED_WEB_PORT_RACED: existing service preserved');
  const web=start('frontend',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(webPort)],path.join(root,'frontend'),publicEnv);
  await readiness(webURL+'/workflow/today',web,60000);webReady=true;
  const note=await api('/api/workflow/notes','POST',{title:'워크패드 QA '+run,content:'# 기존 제목\n\n- 기존 항목\n  - [x] 기존 하위 체크\n\n**굵게** 및 `code` 보존',version:0});
  const block=(content,type='TEXT',parentId=null)=>({id:randomUUID(),parentId,order:0,type,content,checked:false,workTaskId:null,sourceBlockId:null,sourceDate:null,metadata:{}});
  const mention=block(`Discuss [[${note.title}]]`);mention.metadata={wikiLinks:[{name:note.title,ordinal:0,noteId:note.id}]};
  const child=block('링크드 노트 편집기 개선','BULLET',mention.id),grandchild=block('체크리스트 동작 점검','CHECKLIST',child.id);grandchild.checked=true;
  const child2=block('백링크 히스토리 보완','BULLET',mention.id),sibling=block('UNRELATED SIBLING'),second=block(`Second [[${note.title}]]`);second.metadata=structuredClone(mention.metadata);
  const earlier=block(`Earlier [[${note.title}]]`);earlier.metadata=structuredClone(mention.metadata);
  const dates=['2098-10-25','2098-10-24'];
  await api('/api/workflow/days/'+dates[0],'PUT',{revision:0,blocks:[mention,child,grandchild,child2,sibling,second].map((row,order)=>({...row,order}))});
  await api('/api/workflow/days/'+dates[1],'PUT',{revision:0,blocks:[earlier]});
  report.fixture={note,dates,mention,child,grandchild,child2,sibling,second,earlier};
  report.status='READY_FOR_TEAM_BROWSER';await save(path.join(dir,'runtime.json'),report);console.log(JSON.stringify({status:report.status,webURL,apiURL,evidence:dir,fixture:report.fixture}));
  const deadline=Date.now()+45*60*1000;
  while(Date.now()<deadline){backend.check();web.check();const result=await fs.readFile(path.join(dir,'browser-result.json'),'utf8').then(JSON.parse).catch(()=>null);if(result){report.checks.push({name:'real-api-browser',...result});if(result.status!=='PASS')throw Error('BROWSER_CHECK_FAILED');if(git(root,'rev-parse','HEAD')!==report.revision||!!git(root,'status','--porcelain')!==report.dirty)throw Error('QA_REVISION_CHANGED');report.status='PASS';break;}await new Promise(resolve=>setTimeout(resolve,1000));}
  if(report.status!=='PASS')throw Error('BROWSER_VALIDATION_TIMEOUT');
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{
  const errors=[];for(const task of tasks.toReversed())if(task!==server)try{await task.stop();}catch(error){errors.push(error.message);}
  if(server&&!server.exited)try{const lines=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(lines[0])!==server.child.pid||path.resolve(lines[1])!==data||path.dirname(data)!==dir)throw Error('PG_OWNERSHIP_MISMATCH');await start('postgres-stop',pg+'/pg_ctl.exe',['-D',data,'-m','fast','-w','-t','60','stop']).wait(75000);}catch(error){errors.push(error.message);}
  if(server)try{await server.stop();}catch(error){errors.push(error.message);}
  report.portsReleased=(await Promise.all([dbPort,...(backendReady?[apiPort]:[]),...(webReady?[webPort]:[])].map(available))).every(Boolean);if(!report.portsReleased)errors.push('OWNED_PORT_NOT_RELEASED');
  // Validate the absolute target belongs to this exact run before removal.
  if(!errors.length&&path.dirname(data)===dir&&path.dirname(dir)===path.join(root,'.qa/runs'))await fs.rm(data,{recursive:true,force:true});
  report.cleanup=errors.length?errors:'PASS';await save(path.join(dir,'result.json'),report);console.log(JSON.stringify({...report,fixture:undefined,evidence:dir},null,2));if(errors.length)process.exitCode=1;
}

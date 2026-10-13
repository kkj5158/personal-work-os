// Isolated canonical API + production Next build. Browser reuses the existing TEAM profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import readline from 'node:readline';
import {available,ownedProcess,readiness,save} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),resume=process.argv[2],runId=resume??'web-v2-'+randomUUID(),dir=path.join(root,'.qa/runs',runId),data=path.join(dir,'owned-pg'),pg='C:/Program Files/PostgreSQL/18/bin';
if(resume&&!/^web-v2-[0-9a-f-]{36}$/.test(resume))throw Error('INVALID_OWNED_RUN');
const previous=resume?JSON.parse(await fs.readFile(path.join(dir,'owner.json'),'utf8')):null;
if(previous&&(previous.data!==data||previous.runId!==runId||path.dirname(await fs.realpath(data))!==await fs.realpath(dir)))throw Error('OWNED_RESUME_IDENTITY_MISMATCH');
if(previous){try{process.kill(previous.pid,0);throw Error('PREVIOUS_RUNTIME_STILL_LIVE');}catch(error){if(error.code!=='ESRCH')throw error;}}
const ports={pg:55443,api:13223,web:13222},owner=previous?.owner??randomUUID(),username='web_v2_synthetic',children=[],logSuffix=Date.now();
for(const port of Object.values(ports))if(!await available(port))throw Error('OWNED_PORT_OCCUPIED:'+port);
await fs.mkdir(dir,{recursive:true});if(!resume)await fs.mkdir(data);
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(key))),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''};
await save(path.join(dir,'owner.json'),{pid:process.pid,runId,data,ports,owner});
function start(name,exe,args,cwd=root){const task=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(dir,name+'-'+logSuffix+'.log')});children.push(task);return task;}
let postgres;
async function cleanup(){const errors=[];for(const task of children.toReversed())if(task!==postgres)try{await task.stop();}catch(error){errors.push(error.message);}
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==ports.pg)throw Error('POSTGRES_OWNERSHIP_MISMATCH');await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 await save(path.join(dir,'cleanup.json'),{errors,portsReleased:await Promise.all(Object.values(ports).map(available)),dataRetained:true});console.log('OWNED_RUNTIME_STOPPED '+dir);
}
try{
 if(!resume)await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 postgres=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=10']);
 for(let attempt=0;attempt<120&&!postgres.output.includes('ready to accept connections');attempt++){postgres.check();await new Promise(resolve=>setTimeout(resolve,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 if(!resume)await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 const api=start('backend','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--app.money.classification-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/api/workflow/attention/snapshot`,api,150000);
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${ports.api}/api/workflow/attention${endpoint}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const result=await response.json();if(!response.ok)throw Error('FIXTURE_API:'+response.status+JSON.stringify(result));return result;};
 const state=await request('/snapshot'),ids=[];
 if(!resume)for(let i=0;i<161;i++){const id=randomUUID(),origin=['SOURCE_PROVIDED','LOCAL_EXTRACTIVE','EVENT_METADATA',null][i%4],result=await request('/items',{id,operationId:randomUUID(),action:`WEB V2 QA ${String(i+1).padStart(3,'0')} · 확인할 항목`,projectLabel:['MONEY','SLEEP','WORK QUEUE'][i%3],laneId:state.lanes[i<3?0:i%2].id,source:{kind:['CHATGPT','CODEX_DESKTOP','TEAM_KAFKA'][i%3],reference:'synthetic-'+id,url:`https://example.com/?workqueueQA=${id}`,producer:'MANUAL',intent:['RESPONSE_COMPLETED','BLOCKED','REVIEW_REQUIRED','manual-qa'][i%4],generation:'fixture-1',completionPolicy:'ACK_ONLY',...(origin?{summary:`검증된 ${origin} 요약입니다. 응답과 사용자 메모를 구분합니다.`,summaryOrigin:origin}:{})}});ids.push(id);if(i===0)await request('/items/'+id+'/memo',{operationId:randomUUID(),expectedMemoRevision:0,memo:'기존 사용자 메모'});}
 if(!resume)await save(path.join(dir,'fixture.json'),{owner,ports,ids,lanes:state.lanes,items:161,database:'OWNED_LOOPBACK_ONLY',sharedDatabase:'NEVER_CONNECTED'});
 const web=start('web','node',[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));await readiness(`http://127.0.0.1:${ports.web}/workflow/attention`,web,60000);
 await save(path.join(dir,'runtime.json'),{runId,owner,ports,processes:children.map(task=>({name:task.name,pid:task.child.pid})),status:'READY'});console.log('WEB_V2_RUNTIME_READY '+dir);
 const input=readline.createInterface({input:process.stdin});await new Promise(resolve=>{input.on('line',line=>{if(line.trim()==='stop'){input.close();resolve();}});input.on('close',resolve);});
}catch(error){console.error(error.message);process.exitCode=1;}finally{await cleanup();}

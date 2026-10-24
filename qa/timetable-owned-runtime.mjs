// A foreground owner holds disposable loopback PostgreSQL, API and built Next web.
// No shared DEV or PROD database is connected. Browser uses the approved TEAM MCP.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import readline from 'node:readline';
import {available,ownedProcess,readiness,save,git} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),runId='timetable-'+randomUUID(),dir=path.join(root,'.qa/runs',runId),data=path.join(dir,'owned-pg'),pg='C:/Program Files/PostgreSQL/18/bin';
const ports={pg:55444,api:13233,web:13232},owner=randomUUID(),username='timetable_synthetic',children=[];
for(const port of Object.values(ports))if(!await available(port))throw Error('OWNED_PORT_OCCUPIED:'+port);
await fs.mkdir(data,{recursive:true});
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(key))),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',QA_TIMETABLE_PG_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,QA_TIMETABLE_PG_USERNAME:username};
function start(name,command,args,cwd=root){const child=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});children.push(child);return child;}
let postgres;
async function cleanup(){const errors=[];for(const task of children.toReversed())if(task!==postgres)try{await task.stop();}catch(e){errors.push(e.message);}
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==ports.pg)throw Error('POSTGRES_OWNERSHIP_MISMATCH');await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 const released=await Promise.all(Object.values(ports).map(available));
 if(errors.length===0&&released.every(Boolean)&&path.dirname(await fs.realpath(data))===await fs.realpath(dir))await fs.rm(data,{recursive:true});
 await save(path.join(dir,'cleanup.json'),{errors,portsReleased:released,dataRemoved:!await fs.stat(data).then(()=>true,()=>false)});
 if(errors.length||!released.every(Boolean))throw Error('OWNED_CLEANUP_FAILED');
}
try{
 await save(path.join(dir,'owner.json'),{runId,pid:process.pid,owner,ports,data,revision:git(root,'rev-parse','HEAD'),sharedDatabase:'NEVER_CONNECTED'});
 await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 postgres=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=20']);
 for(let attempt=0;attempt<120&&!postgres.output.includes('ready to accept connections');attempt++){postgres.check();await new Promise(resolve=>setTimeout(resolve,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 await start('backend-checks','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.timetable.*','--tests','com.kafka.backend.calendar.CalendarCreationOperationsTest','--tests','com.kafka.backend.common.SecurityProfileIsolationTest','--tests','com.kafka.backend.common.ProdSecurityConfigJwtDecoderTest','bootJar','--no-daemon'],path.join(root,'backend')).wait(240000);
 const api=start('backend','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--app.money.classification-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/api/calendar/timetables`,api,150000);
 const web=start('web','node',[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
 await readiness(`http://127.0.0.1:${ports.web}/calendar?tab=timetable`,web,60000);
 await save(path.join(dir,'runtime.json'),{runId,owner,ports,processes:children.map(task=>({name:task.name,pid:task.child.pid})),status:'READY'});console.log('TIMETABLE_RUNTIME_READY '+dir);
 const input=readline.createInterface({input:process.stdin});await new Promise(resolve=>{input.on('line',line=>{if(line.trim()==='stop'){input.close();resolve();}});input.on('close',resolve);});
}catch(e){console.error(e.message);process.exitCode=1;}finally{await cleanup();}

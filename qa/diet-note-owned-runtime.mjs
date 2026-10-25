// Task-owned loopback integration environment. No shared DEV/PROD connection.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import readline from 'node:readline';
import {available,ownedProcess,readiness,save,git} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),runId='diet-note-'+randomUUID(),dir=path.join(root,'.qa/runs',runId),data=path.join(dir,'owned-pg'),pg='C:/Program Files/PostgreSQL/18/bin';
const ports={pg:55453,api:13453,web:13454},owner=randomUUID(),username='diet_note_synthetic',children=[];
for(const port of Object.values(ports))if(!await available(port))throw Error('TASK_PORT_OCCUPIED:'+port);
await fs.mkdir(data,{recursive:true});
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|GRADLE_USER_HOME)$/i.test(key))),JAVA_HOME:'C:/Program Files/Java/jdk-21',DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',DIET_JOURNAL_DB_TESTS:'1',NOTE_OPERATIONAL_DB_TESTS:'1',DIET_MOBILE_DB_TESTS:'1'};
const sourcePath=Object.entries(process.env).find(([key])=>key.toUpperCase()==='PATH')?.[1]??''; for(const key of Object.keys(env))if(key.toUpperCase()==='PATH')delete env[key]; env.PATH=env.JAVA_HOME+'/bin;'+sourcePath;
function start(name,command,args,cwd=root){console.log('START '+name);const child=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});children.push(child);return child;}
let postgres,api,web,stopping=false;
async function startApi(){api=start('backend','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=3','--spring.datasource.hikari.minimum-idle=0',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--app.money.classification-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--app.absence-backfill-cron=-']);await readiness(`http://127.0.0.1:${ports.api}/api/diet`,api,180000);}
async function cleanup(){if(stopping)return;stopping=true;const errors=[];for(const task of children.toReversed())if(task!==postgres)try{await task.stop();}catch(e){errors.push(e.message);}
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==ports.pg)throw Error('POSTGRES_OWNERSHIP_MISMATCH');await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 const released=await Promise.all(Object.values(ports).map(available));
 // The cluster has synthetic task data only; leave stopped data for audit, no recursive removal.
 await save(path.join(dir,'cleanup.json'),{errors,portsReleased:released,syntheticClusterStopped:true});
 if(errors.length||!released.every(Boolean))throw Error('OWNED_CLEANUP_FAILED');console.log('CLEANUP_PASS');
}
try{
 await save(path.join(root,'.qa/diet-runtime.json'),{runId,dir,owner,ports,username,revision:git(root,'rev-parse','HEAD'),sharedDatabase:'NEVER_CONNECTED'});
 await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(180000);
 postgres=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=20']);
 for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(resolve=>setTimeout(resolve,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 await startApi();console.log('DIET_DB_READY '+dir);
 const input=readline.createInterface({input:process.stdin});
 for await(const line of input){
  if(line.trim()==='stop')break;
  try {
  if(line.trim()==='rebuild'){
   await web?.stop();await api?.stop();
   await start('backend-final','cmd.exe',['/d','/c','gradlew.bat','test','--rerun-tasks','--tests','com.kafka.backend.diet.*','--tests','com.kafka.backend.notesystem.*','bootJar','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(600000);
   await fs.cp(path.join(root,'backend/build/test-results/test'),path.join(dir,'backend-tests'),{recursive:true});
   await startApi();console.log('DIET_API_REBUILT');
  }
  if(line.trim()==='web'){
   await web?.stop();await start('frontend-build',process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'build'],path.join(root,'frontend')).wait(600000);
   web=start('web',process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
   await readiness(`http://127.0.0.1:${ports.web}/diet/note`,web,120000);console.log('DIET_WEB_READY '+dir);
  }
  } catch(error) { console.log('COMMAND_FAILED '+error.message); }
 }
 input.close();
}catch(e){console.error(e.message);process.exitCode=1;}finally{await cleanup();}

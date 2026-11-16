// Isolated loopback PostgreSQL and UI; never connects to a real user's database.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,readiness,save,git} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';
const root=process.cwd(),dir='F:/artifacts/checklist-unrestricted-deletion-20261116/local',data=path.join(dir,'postgres'),pg='C:/Program Files/PostgreSQL/18/bin';
const ports={pg:55476,api:18116,web:13116},owner=randomUUID(),username='checklist_synthetic',children=[];
for(const port of Object.values(ports))if(!await available(port))throw Error('PORT_OCCUPIED:'+port);
await fs.mkdir(dir,{recursive:true});
const env={...systemEnvironment(),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,CHECKLIST_SYS_DB_TEST:'true',NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`};
function start(name,command,args,cwd=root){console.log('STAGE '+name);const task=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});children.push(task);return task;}
let postgres;
const report={source:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),ports,owner,dir,status:'RUNNING',database:'OWNED_SYNTHETIC_ONLY'};
try{
 await start('initdb',pg+'/initdb.exe',['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(180000);
 postgres=start('postgres',pg+'/postgres.exe',['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=20']);
 for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(r=>setTimeout(r,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',pg+'/psql.exe',['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 const api=start('api','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--money.ai.classification-provider-enabled=false','--money.ai.classification-worker-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/api/checklist-sys`,api,180000);
 await start('backend-tests','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.checklistsys.*','--tests','com.kafka.backend.checklist.*','--no-daemon','--rerun-tasks','--console=plain'],path.join(root,'backend')).wait(900000);
 await fs.cp(path.join(root,'backend/build/test-results/test'),path.join(dir,'test-results'),{recursive:true});report.tests='PASS';
 const web=start('web',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
 await readiness(`http://127.0.0.1:${ports.web}/checklist`,web,120000);
 report.status='READY';await save(path.join(dir,'runtime.json'),report);console.log('CHECKLIST_READY '+dir);
 while(true){api.check();web.check();try{await fs.access(path.join(dir,'stop'));break;}catch{}await new Promise(r=>setTimeout(r,500));}
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{
 for(const child of children.toReversed())if(child!==postgres)await child.stop().catch(()=>{});
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==path.resolve(data)||Number(identity[3])!==ports.pg)throw Error('OWNED_POSTGRES_IDENTITY_MISMATCH');await start('postgres-stop',pg+'/pg_ctl.exe',['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 if(postgres)await postgres.stop();
 report.cleanup=await Promise.all(Object.values(ports).map(available));await save(path.join(dir,'result.json'),report);console.log(JSON.stringify(report));
}

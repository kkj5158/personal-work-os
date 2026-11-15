// Task-owned PostgreSQL and real application; never loads shared database credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,readiness,git,save} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';
const root=process.cwd(),run='money-v3-'+Date.now(),dir=path.join(root,'.qa/runs',run),data=path.join(dir,'postgres'),pg='C:/Program Files/PostgreSQL/18/bin';
const ports={pg:55468,api:18096,web:13016},owner=randomUUID(),username='money_v3_synthetic',children=[];
for(const port of Object.values(ports))if(!await available(port))throw Error('OWNED_PORT_OCCUPIED:'+port);
await fs.mkdir(dir,{recursive:true});
const env={...systemEnvironment(),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''};
function start(name,command,args,cwd=root){const task=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});children.push(task);return task;}
let postgres;
const report={run,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),database:'OWNED_LOOPBACK_SYNTHETIC',sharedDatabase:'NEVER_CONNECTED',ports,owner,dir,status:'RUNNING'};
try{
 await start('initdb',pg+'/initdb.exe',['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(180000);
 postgres=start('postgres',pg+'/postgres.exe',['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=20']);
 for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(r=>setTimeout(r,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',pg+'/psql.exe',['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 const filters=['MoneyBalanceObservationPostgresTest','MoneyReconciliationReadPostgresTest','MoneyAccountHistoryPostgresTest','MoneyFinancialPostgresTest','MoneySavingsReadPostgresTest','MoneyAccountManagementTest','VerifiedMoneyMatcherTest','MoneyControllerSecurityTest'];
 await start('backend-build','cmd.exe',['/d','/c','gradlew.bat','bootJar','--no-daemon','--console=plain'],path.join(root,'backend')).wait(600000);
 const api=start('api','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--money.ai.classification-worker-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/api/money/accounts`,api,180000);
 await start('backend-tests','cmd.exe',['/d','/c','gradlew.bat','test',...filters.flatMap(f=>['--tests','com.kafka.backend.money.'+f]),'--no-daemon','--rerun-tasks','--console=plain'],path.join(root,'backend')).wait(600000);
 await fs.cp(path.join(root,'backend/build/test-results/test'),path.join(dir,'backend-tests'),{recursive:true});
 report.tests='PASS';
 if(process.argv.includes('--runtime')){
  // Real synthetic fixtures, using authoritative APIs. No approved-mock values are seeded in shared environments.
  const call=async(url,payload)=>{const r=await fetch(`http://127.0.0.1:${ports.api}/api/money${url}`,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});if(!r.ok)throw Error('FIXTURE_API_'+r.status+':'+url);return r.json();};
  const at='2026-09-15T01:00:00Z',ids=[];
  for(let i=0;i<8;i++){const a=await call('/accounts',{provider:i===7?'CASH':'IBK',displayName:'QA V3 Account '+(i+1),role:i===7?'CASH':'SPENDING',suffix:i===7?null:String(1000+i),includeInAssets:false});ids.push(a.id);}
  report.accounts=ids;
  await start('web-build',process.execPath,['node_modules/next/dist/bin/next','build'],path.join(root,'frontend')).wait(600000);
  const web=start('web',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
  await readiness(`http://127.0.0.1:${ports.web}/money/accounts`,web,120000);await save(path.join(root,'.qa/money-v3-runtime.json'),report);console.log('MONEY_V3_READY '+dir);
  const deadline=Date.now()+3600000;
  while(Date.now()<deadline){api.check();web.check();try{await fs.access(path.join(dir,'stop'));break;}catch{}await new Promise(r=>setTimeout(r,500));}
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{
 const errors=[];for(const child of children.toReversed())if(child!==postgres)try{await child.stop();}catch(e){errors.push(e.message);}
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==ports.pg)throw Error('OWNED_POSTGRES_IDENTITY_MISMATCH');try{await start('postgres-stop',pg+'/pg_ctl.exe',['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}catch(e){errors.push(e.message);}}
 if(postgres)try{await postgres.stop();}catch(e){errors.push(e.message);}report.cleanup=errors.length?errors:'PASS';await save(path.join(dir,'result.json'),report);console.log(JSON.stringify(report));
}

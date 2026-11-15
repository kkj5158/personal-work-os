import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,readiness} from './runtime/core.mjs';

// Disposable loopback PostgreSQL; never reads DEV/PROD environment or browser credentials.
const root=process.cwd(),runId='orbit-'+randomUUID(),runDir=path.join(root,'.qa','runs',runId);
const pg='C:/Program Files/PostgreSQL/18/bin',port=55469,data=path.join(runDir,'owned-pg');
if(!await available(port))throw Error('ORBIT_OWNED_PORT_OCCUPIED: preserve existing process');
await fs.mkdir(runDir,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME|LANG|LC_ALL)$/i.test(k)));
const tasks=[];
function start(name,cmd,args,cwd=root,values=env){const p=ownedProcess(cmd,args,{cwd,env:values,name,logFile:path.join(runDir,name+'.log')});tasks.push(p);return p;}
let server;
try{
 await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U','orbit_synthetic','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 server=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=40']);
 for(let i=0;i<120;i++){server.check();if(server.output.includes('ready to accept connections'))break;await new Promise(r=>setTimeout(r,250));}
 await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U','orbit_synthetic','-d','postgres','-v','ON_ERROR_STOP=1','-c',"CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001');"]).wait(30000);
 const url=`jdbc:postgresql://127.0.0.1:${port}/postgres`;
 const testEnv={...env,SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE:'2',SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE:'0',APP_MONEY_PROCESSING_ENABLED:'false',APP_MONEY_CLASSIFICATION_ENABLED:'false',APP_ABSENCE_BACKFILL_CRON:'-',ORBIT_OWNED_DB_TEST:'true',ORBIT_TEST_DB_URL:url,DEV_DB_URL:url,DEV_DB_USERNAME:'orbit_synthetic',DEV_DB_PASSWORD:'',APP_DEV_USER_ID:'00000000-0000-0000-0000-000000000001'};
 const filters=process.argv.includes('--full')?[]:['com.kafka.backend.orbit.*','com.kafka.backend.workflow.WorkflowOrbitReadServiceTest','com.kafka.backend.common.ProdSecurityConfigJwtDecoderTest'];
 if(!process.argv.includes('--full')&&process.argv.includes('--sleep'))filters.push('com.kafka.backend.sleep.GoogleSleepPostgresTest');
 // Existing PostgreSQL suites expect a migrated database before their alphabetic execution.
 // Bootstrap with the real ORBIT HTTP gate rather than letting unrelated suites run on an empty schema.
 if(process.argv.includes('--full'))await start('migration-and-http-gate','cmd.exe',['/d','/c','gradlew.bat','test','--console=plain','--tests','com.kafka.backend.orbit.OrbitHttpIntegrationTest'],path.join(root,'backend'),testEnv).wait(300000);
 await start('gradle','cmd.exe',['/d','/c','gradlew.bat','test',...filters.flatMap(f=>['--tests',f]),'bootJar','--console=plain'],path.join(root,'backend'),testEnv).wait(2400000);
 console.log('ORBIT_OWNED_QA=PASS '+runId);
 if(process.argv.includes('--console-ui')){
  const apiPort=18089,webPort=13009;if(!await available(apiPort)||!await available(webPort))throw Error('ORBIT_UI_PORT_OCCUPIED');
  const runtimeEnv={...testEnv,SPRING_PROFILES_ACTIVE:'dev',APP_MONEY_PROCESSING_ENABLED:'false',APP_MONEY_CLASSIFICATION_ENABLED:'false',APP_ABSENCE_BACKFILL_CRON:'-'};
  const api=start('console-api','java',['-jar','backend/build/libs/backend-0.0.1-SNAPSHOT.jar','--server.address=127.0.0.1','--server.port='+apiPort,'--spring.flyway.enabled=false','--spring.jpa.hibernate.ddl-auto=validate','--app.dev-allowed-origins=http://127.0.0.1:'+webPort],root,runtimeEnv);
  await readiness('http://127.0.0.1:'+apiPort+'/api/money/accounts',api,120000);
  const request=async(route,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+apiPort+'/api/money/'+route,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('UI_FIXTURE_HTTP_'+r.status);return r.json();};
  const account=await request('accounts','POST',{provider:'TEST',displayName:'ORBIT 합성 계좌',role:'SPENDING'});
  const category=await request('categories','POST',{name:'ORBIT 합성 교통',kind:'EXPENSE',color:'#5b8def',archived:false});
  await request('tracking','PUT',{expense:[account.id],income:[],expectedVersion:0});
  const fact=await request('transactions','POST',{type:'EXPENSE',fromAccountId:account.id,amount:1200,occurredAt:new Date().toISOString(),counterpartyText:'ORBIT 합성 교통 거래',title:'ORBIT 합성 교통 거래',excluded:false});
  const web=start('console-web',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(webPort)],path.join(root,'frontend'),{...env,NEXT_PUBLIC_API_BASE_URL:'http://127.0.0.1:'+apiPort,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''});
  await readiness('http://127.0.0.1:'+webPort+'/money/bookkeeping',web,90000);
  await fs.writeFile(path.join(runDir,'console-ui-ready.json'),JSON.stringify({runId,api:'http://127.0.0.1:'+apiPort,web:'http://127.0.0.1:'+webPort,accountId:account.id,categoryId:category.id,transactionId:fact.id,revision:(await import('./runtime/core.mjs')).git(root,'rev-parse','HEAD')}));
  console.log('ORBIT_TEAM_BROWSER_READY '+runDir);
  const deadline=Date.now()+20*60000;let result;
  while(Date.now()<deadline){api.check();web.check();try{result=JSON.parse(await fs.readFile(path.join(runDir,'console-ui-result.json'),'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,1000));}
  if(result?.status!=='PASS')throw Error('ORBIT_TEAM_UI_NOT_PASSED');
 }
}finally{
 if(server&&!server.exited){
  const pid=Number((await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/)[0]);
  if(pid!==server.child.pid||path.dirname(data)!==runDir)throw Error('OWNED_PG_IDENTITY_MISMATCH');
  await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','300','stop']).wait(315000);
 }
 for(const task of tasks.toReversed())await task.stop();
 if(!await available(port))throw Error('OWNED_PG_PORT_NOT_RELEASED');
 if(path.dirname(data)!==runDir||!data.startsWith(path.join(root,'.qa','runs')+path.sep))throw Error('OWNED_PG_PATH_MISMATCH');
 await fs.rm(data,{recursive:true,force:true});
 console.log('ORBIT_OWNED_CLEANUP=PASS');
}

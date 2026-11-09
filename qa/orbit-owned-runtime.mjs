import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess} from './runtime/core.mjs';

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
 // Existing PostgreSQL suites expect a migrated database before their alphabetic execution.
 // Bootstrap with the real ORBIT HTTP gate rather than letting unrelated suites run on an empty schema.
 if(process.argv.includes('--full'))await start('migration-and-http-gate','cmd.exe',['/d','/c','gradlew.bat','test','--console=plain','--tests','com.kafka.backend.orbit.OrbitHttpIntegrationTest'],path.join(root,'backend'),testEnv).wait(300000);
 await start('gradle','cmd.exe',['/d','/c','gradlew.bat','test',...filters.flatMap(f=>['--tests',f]),'bootJar','--console=plain'],path.join(root,'backend'),testEnv).wait(2400000);
 console.log('ORBIT_OWNED_QA=PASS '+runId);
}finally{
 if(server&&!server.exited){
  const pid=Number((await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/)[0]);
  if(pid!==server.child.pid||path.dirname(data)!==runDir)throw Error('OWNED_PG_IDENTITY_MISMATCH');
  await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','60','stop']).wait(65000);
 }
 for(const task of tasks.toReversed())await task.stop();
 if(!await available(port))throw Error('OWNED_PG_PORT_NOT_RELEASED');
 if(path.dirname(data)!==runDir||!data.startsWith(path.join(root,'.qa','runs')+path.sep))throw Error('OWNED_PG_PATH_MISMATCH');
 await fs.rm(data,{recursive:true,force:true});
 console.log('ORBIT_OWNED_CLEANUP=PASS');
}

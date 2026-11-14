import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,git,ownedProcess,save} from './runtime/core.mjs';

const root=await fs.realpath(process.cwd()),runId='study-foundation-'+randomUUID(),runDir=path.join(root,'.qa','runs',runId),data=path.join(runDir,'owned-pg');
const port=55449,pg='C:/Program Files/PostgreSQL/18/bin',user='study_test';
if(!await available(port))throw Error('STUDY_TEST_PORT_OCCUPIED:existing process preserved');
await fs.mkdir(runDir,{recursive:true});await fs.mkdir(data);if(await fs.realpath(data)!==data||path.dirname(data)!==runDir)throw Error('OWNED_PATH_REDIRECT');
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(k))),JAVA_HOME:'C:/Program Files/Java/jdk-21',STUDY_TEST_DB:`jdbc:postgresql://127.0.0.1:${port}/postgres?currentSchema=study_owned_test,public`};
// The exact loopback root is separately checked by the test; schema is an owned connection property.
env.STUDY_TEST_DB=`jdbc:postgresql://127.0.0.1:${port}/postgres`;
const tasks=[],result={runId,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),database:'OWNED_LOOPBACK',storage:'SYNTHETIC_OBJECT_BOUNDARY',startedAt:new Date().toISOString(),result:'NOT_RUN'};
function start(name,exe,args,cwd=root){const child=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(runDir,name+'.log')});tasks.push(child);return child;}
let server,failure;
try{
 await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U',user,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(120000);
 server=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=10']);
 for(let i=0;i<120&&!server.output.includes('ready to accept connections');i++){server.check();await new Promise(r=>setTimeout(r,250));}
 const bootstrap=path.join(runDir,'bootstrap.sql');await fs.writeFile(bootstrap,'CREATE SCHEMA study_owned_test; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);');
 await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U',user,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 await start('tests','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.study.*','--tests','com.kafka.backend.common.SecurityProfileIsolationTest','--tests','com.kafka.backend.shareddesk.storage.FilePolicyTest','--tests','com.kafka.backend.shareddesk.storage.S3ObjectStorageTest','bootJar','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(600000);
 result.result='PASS';
}catch(error){failure=error;result.result='FAIL';result.error=error.message;}
finally{
 const errors=[];for(const task of tasks.toReversed())if(task!==server)try{await task.stop();}catch(e){errors.push(e.message);}
 if(server&&!server.exited)try{const lines=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(lines[0])!==server.child.pid||path.resolve(lines[1])!==data||Number(lines[3])!==port)throw Error('PG_OWNERSHIP_MISMATCH');await start('pg-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}catch(e){errors.push(e.message);}
 for(const task of tasks.toReversed())try{await task.stop();}catch(e){errors.push(e.message);}
 result.cleanup={errors,portReleased:await available(port),ownedDataRetained:true};result.finishedAt=new Date().toISOString();
 result.xml=[];const xmlDir=path.join(root,'backend','build','test-results','test');for(const name of await fs.readdir(xmlDir).catch(()=>[])){if(!name.endsWith('.xml'))continue;const xml=await fs.readFile(path.join(xmlDir,name),'utf8'),attrs=xml.match(/<testsuite\b([^>]*)>/)?.[1]??'';const count=k=>Number(attrs.match(new RegExp(`\\b${k}="([0-9]+)"`))?.[1]??0);result.xml.push({name,tests:count('tests'),failures:count('failures'),errors:count('errors'),skipped:count('skipped')});}
 await save(path.join(runDir,'result.json'),result);
}
console.log(JSON.stringify({...result,evidence:path.join(runDir,'result.json')},null,2));if(failure)throw failure;

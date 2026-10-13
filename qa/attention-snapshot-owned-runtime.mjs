import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {available,git,ownedProcess,save} from './runtime/core.mjs';

const root=await fs.realpath(process.cwd()),runId='attention-snapshot-'+randomUUID();
const runDir=path.join(root,'.qa','runs',runId),data=path.join(runDir,'owned-pg'),port=55443;
const postgres='C:/Program Files/PostgreSQL/18/bin',username='attention_snapshot_synthetic';
if(process.platform!=='win32'||!await available(port))throw Error('OWNED_LOOPBACK_PORT_UNAVAILABLE:existing process preserved');
await fs.mkdir(runDir,{recursive:true});if(await fs.realpath(runDir)!==runDir||path.dirname(data)!==runDir)throw Error('OWNED_QA_PATH_REDIRECT_REJECTED');
await fs.mkdir(data,{recursive:false});
const safeEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME|LANG|LC_ALL)$/i.test(key)));
const env={...safeEnv,QA_ATTENTION_PG_URL:`jdbc:postgresql://127.0.0.1:${port}/postgres`};
const marker=path.join(runDir,'owner.json'),token=randomUUID();await save(marker,{pid:process.pid,token,data,port});
const tasks=[],evidence={runId,revision:git(root,'rev-parse','HEAD'),dirty:Boolean(git(root,'status','--porcelain')),database:'OWNED_LOOPBACK_SYNTHETIC',sharedDatabase:'NEVER_CONNECTED',port,startedAt:new Date().toISOString(),result:'NOT_RUN',cleanup:{status:'PENDING'}};
function start(name,exe,args,cwd=root){const child=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(runDir,name+'.log')});tasks.push(child);return child;}
async function identity(){const current=JSON.parse(await fs.readFile(marker,'utf8'));if(current.pid!==process.pid||current.token!==token||current.data!==data||current.port!==port||await fs.realpath(data)!==data)throw Error('OWNED_QA_IDENTITY_MISMATCH');}
let server,failure;
try{
 await identity();await start('initdb',path.join(postgres,'initdb.exe'),['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 if(!await available(port))throw Error('OWNED_LOOPBACK_PORT_RACED:existing process preserved');
 server=start('postgres',path.join(postgres,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=10']);
 let ready=false;for(let i=0;i<120;i++){server.check();if(server.output.includes('ready to accept connections')){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}if(!ready)throw Error('OWNED_POSTGRES_READINESS_TIMEOUT');
 const bootstrap=path.join(runDir,'bootstrap.sql');await fs.writeFile(bootstrap,"COMMENT ON DATABASE postgres IS 'owned-work-queue-snapshot-qa';\nCREATE SCHEMA auth;\nCREATE TABLE auth.users(id UUID PRIMARY KEY);\n");
 await start('bootstrap',path.join(postgres,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 const init=path.join(runDir,'tests.init.gradle');await fs.writeFile(init,"allprojects { afterEvaluate { tasks.withType(Test).configureEach { maxParallelForks=1; reports.junitXml.outputLocation=file(System.getenv('QA_ATTENTION_EVIDENCE_DIR')+'/xml'); reports.html.outputLocation=file(System.getenv('QA_ATTENTION_EVIDENCE_DIR')+'/html'); outputs.upToDateWhen { false } } } }\n");env.QA_ATTENTION_EVIDENCE_DIR=runDir;
 await start('attention-tests','cmd.exe',['/d','/c','gradlew.bat','-I',init,'test','--tests','com.kafka.backend.workflow.attention.*','bootJar','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(600000);
 evidence.result='PASS';
}catch(error){failure=error;evidence.result='FAIL';evidence.error=error.message;}
finally{
 const errors=[];
 for(const child of tasks.toReversed())if(child!==server)try{await child.stop();}catch(error){errors.push(error.message);}
 if(server&&!server.exited)try{
  await identity();const lines=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);
  if(Number(lines[0])!==server.child.pid||path.resolve(lines[1])!==data||Number(lines[3])!==port)throw Error('LIVE_POSTGRES_OWNERSHIP_MISMATCH');
  await start('postgres-stop',path.join(postgres,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);
 }catch(error){errors.push(error.message);}
 for(const child of tasks.toReversed())try{await child.stop();}catch(error){errors.push(error.message);}
 const portReleased=await available(port);if(!portReleased)errors.push('OWNED_PORT_NOT_RELEASED:external owner preserved');
 let dataRemoved=false;if(!errors.length)try{await identity();await fs.rm(data,{recursive:true,force:false});dataRemoved=true;}catch(error){errors.push(error.message);}
 evidence.xml=[];for(const file of await fs.readdir(path.join(runDir,'xml')).catch(()=>[]))if(file.endsWith('.xml')){
  const xml=await fs.readFile(path.join(runDir,'xml',file),'utf8'),attributes=xml.match(/<testsuite\b([^>]*)>/)?.[1]??'';const count=key=>Number(attributes.match(new RegExp(`\\b${key}="([0-9]+)"`))?.[1]??0);
  evidence.xml.push({file,sha256:createHash('sha256').update(xml).digest('hex'),tests:count('tests'),failures:count('failures'),errors:count('errors'),skipped:count('skipped')});
 }
 if(evidence.result==='PASS'&&(!evidence.xml.some(row=>row.file.endsWith('AttentionSnapshotPostgresTest.xml')&&row.tests===9&&row.skipped===0)||evidence.xml.some(row=>row.failures||row.errors||row.skipped))){evidence.result='FAIL';failure??=Error('CURRENT_FULL_PG_XML_MISSING_OR_FAILED');}
 if(git(root,'rev-parse','HEAD')!==evidence.revision){evidence.result='FAIL';failure??=Error('TARGET_CHANGED_DURING_QA');}
 evidence.processes=tasks.map(child=>({name:child.name,pid:child.child.pid,exited:child.exited}));evidence.cleanup={status:errors.length?'FAIL':'PASS',portReleased,dataRemoved,errors};evidence.finishedAt=new Date().toISOString();
 await save(path.join(runDir,'result.json'),evidence);if(!errors.length)await fs.unlink(marker);if(errors.length)failure=Error('OWNED_QA_CLEANUP_FAILED:'+errors.join(';'));
}
console.log(JSON.stringify({result:evidence.result,cleanup:evidence.cleanup,xml:evidence.xml,evidence:path.join(runDir,'result.json')},null,2));if(failure)throw failure;

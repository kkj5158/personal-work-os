import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {loadEnvironment,systemEnvironment} from './runtime/environment.mjs';
import {ownedProcess,choosePort,available,readiness,git,acquireLock,save} from './runtime/core.mjs';
import {restoreTsconfig} from './runtime/build-files.mjs';

// Foreground owner inspection. No provider activation, migrations, fixture writes, or detached launcher.
const root=process.cwd(),revision=git(root,'rev-parse','HEAD'),id='workpad-inspection-'+randomUUID();
const common=path.resolve(root,git(root,'rev-parse','--git-common-dir'));
const dir=path.join(root,'.qa/inspection',id),frontend=path.join(root,'frontend'),backend=path.join(root,'backend');
const backendPort=await choosePort(undefined,18020,18039),frontendPort=await choosePort(undefined,13020,13039);
const apiURL=`http://127.0.0.1:${backendPort}`,url=`http://127.0.0.1:${frontendPort}`;
const {values:options}=parseArgs({options:{'env-source':{type:'string'},'startup-timeout-ms':{type:'string'}}});
if(!options['env-source'])throw Error('WORKPAD_INSPECTION_REQUIRES_EXPLICIT_DEV_ENV_SOURCE');
const startupTimeoutMs=Number(options['startup-timeout-ms']??90000);
if(!Number.isInteger(startupTimeoutMs)||startupTimeoutMs<90000||startupTimeoutMs>300000)throw Error('INVALID_WORKPAD_STARTUP_TIMEOUT');
// Pin this authorized DEV runtime to the selected application config. Inherited
// diagnostic DB variables may select a different role whose default is read-only.
// Do not alter that role, database settings, or the shared QA loader precedence.
const loaded=await loadEnvironment(root,options['env-source'],{}),safe=systemEnvironment(),tasks=[];
const env={...safe,...loaded.values,QA_TOOL_ROOT:root,QA_RUN_DIR:dir,QA_RUN_ID:id,QA_MODE:'integration',QA_MIGRATIONS:path.join(backend,'src/main/resources/db/migration')};
const dist='.next-'+id,next=path.join(frontend,'node_modules/next/dist/bin/next');
let release,tsconfig;
await fs.mkdir(dir,{recursive:true});
const state={id,revision,dirty:!!git(root,'status','--porcelain'),environmentSource:path.resolve(options['env-source']),inheritedDiagnosticDbOverrides:false,startupTimeoutMs,ownerPid:process.pid,frontendURL:url,backendURL:apiURL,ports:{backend:backendPort,frontend:frontendPort},authentication:'EXISTING_DEV_OWNER_SESSION_LOOPBACK_ONLY',providers:'DISABLED',schedulers:'DISABLED',status:'STARTING',processes:[],startedAt:new Date().toISOString()};
function start(name,exe,args,cwd,childEnv){const task=ownedProcess(exe,args,{name,cwd,env:childEnv,logFile:path.join(dir,name+'.log'),secrets:Object.values(loaded.values),onStart:p=>state.processes.push(p)});tasks.push(task);return task;}
let stop;
const hold=new Promise(resolve=>{stop=resolve;});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());process.on('message',m=>{if(m==='stop')stop();});
try{
 release=await acquireLock(path.join(common,'pos-central-qa.lock'),{runId:id,pid:process.pid,worktree:root,revision});
 await start('build-audit','cmd.exe',['/d','/c','gradlew.bat','--no-daemon','--console=plain','-I',path.join(root,'qa/runtime/gradle.init.gradle'),'bootJar','qaDatabaseAudit'],backend,env).wait(300000);
 const jars=(await fs.readdir(path.join(backend,'build/libs'))).filter(n=>n.endsWith('.jar')&&!n.endsWith('-plain.jar'));
 if(jars.length!==1||!await available(backendPort))throw Error('INSPECTION_BACKEND_OWNERSHIP_GATE');
 const app=start('backend','java',['-jar',path.join(backend,'build/libs',jars[0]),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${backendPort}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0',`--spring.datasource.hikari.pool-name=qa-${id}`,`--spring.datasource.hikari.data-source-properties.ApplicationName=qa-${id}`,'--spring.flyway.enabled=false',`--app.dev-allowed-origins=${url}`,'--app.money.processing-enabled=false','--app.money.classification-enabled=false','--app.absence-backfill-cron=-','--money.ai.classification-provider-enabled=false','--money.ai.conversation-provider-enabled=false'],backend,env);
 await readiness(apiURL+'/api/workflow',app,startupTimeoutMs);
 const browserEnv={...safe,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_PUBLIC_API_BASE_URL:apiURL,NEXT_DIST_DIR:dist};
 tsconfig=await fs.readFile(path.join(frontend,'tsconfig.json'),'utf8');
 await start('frontend-build',process.execPath,[next,'build'],frontend,browserEnv).wait(300000);
 await restoreTsconfig(path.join(frontend,'tsconfig.json'),tsconfig,dist);
 if(!await available(frontendPort))throw Error('INSPECTION_FRONTEND_PORT_RACED');
 const ui=start('frontend',process.execPath,[next,'start','--hostname','127.0.0.1','--port',String(frontendPort)],frontend,browserEnv);
 await readiness(url+'/workflow/today',ui,60000);
 if(git(root,'rev-parse','HEAD')!==revision)throw Error('INSPECTION_REVISION_CHANGED');
 state.status='READY_FOR_OWNER_INSPECTION';await save(path.join(dir,'state.json'),state);
 await release();release=undefined;
 console.log(JSON.stringify({status:state.status,frontendURL:url,backendURL:apiURL,revision,authentication:state.authentication,state:path.join(dir,'state.json')}));
 // The root terminal remains alive and retains the two foreground child handles.
 await Promise.race([hold,app.done.then(()=>{throw Error('INSPECTION_BACKEND_EXITED');}),ui.done.then(()=>{throw Error('INSPECTION_FRONTEND_EXITED');})]);
}catch(error){state.error=error.message;process.exitCode=1;}
finally{
 const errors=[];for(const task of tasks.toReversed())try{await task.stop();}catch(error){errors.push(task.name+':'+error.message);}
 const classpath=await fs.readFile(path.join(dir,'audit-classpath.txt'),'utf8').catch(()=>null);
 if(classpath)try{const audit=start('connections','java',['-cp',classpath,'DatabaseAudit','connections'],root,env);try{await audit.wait(45000);}finally{await audit.stop();}}catch(error){errors.push('CONNECTIONS:'+error.message);}
 try{if(tsconfig)await restoreTsconfig(path.join(frontend,'tsconfig.json'),tsconfig,dist);const build=path.join(frontend,dist);if(path.dirname(build)!==frontend||!dist.startsWith('.next-workpad-inspection-'))throw Error('INSPECTION_BUILD_OWNERSHIP_MISMATCH');await fs.rm(build,{recursive:true,force:true});}catch(error){errors.push('BUILD:'+error.message);}
 state.status=state.error||errors.length?'FAILED_AND_STOPPED':'OWNER_RUNTIME_STOPPED';state.cleanupErrors=errors;state.stoppedAt=new Date().toISOString();state.portsReleased=await available(backendPort)&&await available(frontendPort);await save(path.join(dir,'state.json'),state);
 if(release)try{await release();}catch(error){state.cleanupErrors.push('LOCK:'+error.message);await save(path.join(dir,'state.json'),state);}
 if(errors.length)process.exitCode=1;
}

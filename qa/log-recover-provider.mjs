// Reconcile exact synthetic keys retained by a completed LOG QA run. Never lists a provider bucket.
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {available,ownedProcess,save} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),runId=process.argv[2];
if(!/^log-v4-runtime-[a-f0-9-]{36}$/.test(runId??''))throw Error('Explicit owned LOG run ID required');
const dir=path.join(root,'.qa/runs',runId),record=JSON.parse(await fs.readFile(path.join(dir,'runtime.json'),'utf8')),data=path.join(dir,'postgres'),pg='C:/Program Files/PostgreSQL/18/bin';
if(record.runId!==runId||record.sharedDatabase!=='NEVER_CONNECTED'||!record.owner?.match(/^[a-f0-9-]{36}$/)||await fs.realpath(data)!==data)throw Error('OWNED_RUN_PROVENANCE_MISMATCH');
if(!await available(55454))throw Error('OWNED_PORT_OCCUPIED: existing process preserved');
let v;try{v=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command','railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service eba7d263-7dc3-448a-a6b8-c2994721b597 --json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));}catch{throw Error('DEV_PROVIDER_ACCESS_FAILED:details_withheld');}
if(v.SHARED_DESK_STORAGE_ENVIRONMENT!=='DEV'||v.RAILWAY_ENVIRONMENT_ID!=='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c')throw Error('DEV_PROVIDER_SCOPE_MISMATCH');
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(k)))};for(const[k,value]of Object.entries(v))if(k.startsWith('SHARED_DESK_STORAGE_'))env[k]=value;
const tasks=[],secrets=Object.values(v).filter(x=>typeof x==='string'&&x.length>12);const start=(name,exe,args,cwd=root)=>{const task=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(dir,'recovery-'+name+'.log'),secrets});tasks.push(task);return task;};let server;const result={runId,scope:'EXACT_SYNTHETIC_LOG_DEV_KEYS',status:'FAIL',startedAt:new Date().toISOString()};
try{
 server=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p','55454','-c','max_connections=8','-c','io_method=sync']);for(let i=0;i<120&&!server.output.includes('ready to accept connections');i++){server.check();await new Promise(r=>setTimeout(r,250));}
 const sql=`BEGIN READ ONLY;SELECT coalesce(json_agg(json_build_object('staging',staging_key,'final',final_key)),'[]') FROM log_images WHERE owner_id='${record.owner}';ROLLBACK;`;
 const raw=execFileSync(path.join(pg,'psql.exe'),['-h','127.0.0.1','-p','55454','-U','log_runtime','-d','postgres','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 const keys=JSON.parse(raw);for(const pair of keys)for(const key of Object.values(pair))if(!new RegExp(`^log/dev/${record.owner}/(staging|final)/[a-f0-9-]{36}$`).test(key))throw Error('EXACT_KEY_PROVENANCE_MISMATCH');
 env.LOG_CLEANUP_OWNER=record.owner;env.LOG_CLEANUP_KEYS=raw;
 await start('provider-cleanup','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.log.LogProviderCleanupTest','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(180000);result.status='PASS';result.imageRows=keys.length;result.acknowledgedObjectDeletes=keys.length*2;
}finally{
 for(const task of tasks.toReversed())if(task!==server)await task.stop();
 if(server&&!server.exited){const lines=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(lines[0])!==server.child.pid||path.resolve(lines[1])!==data||Number(lines[3])!==55454)throw Error('OWNED_POSTGRES_IDENTITY_MISMATCH');await start('pg-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 for(const task of tasks.toReversed())await task.stop();result.portReleased=await available(55454);result.finishedAt=new Date().toISOString();await save(path.join(dir,'provider-recovery.json'),result);await save('D:/DEV_SPACE/pos-log-v4-evidence-20261115/provider-recovery.json',result);console.log(JSON.stringify(result));
}

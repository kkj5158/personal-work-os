// Task-owned loopback PostgreSQL only. No hosted/PROD configuration is loaded.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,save} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),runId='attention-management-'+randomUUID(),dir=path.join(root,'.qa/runs',runId),data=path.join(dir,'owned-pg'),bin='C:/Program Files/PostgreSQL/18/bin',port=55443;
if(!await available(port))throw Error('OWNED_PORT_OCCUPIED_PRESERVED');
await fs.mkdir(data,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(k))),children=[];
function start(name,exe,args){const p=ownedProcess(exe,args,{cwd:root,env,name,logFile:path.join(dir,name+'.log')});children.push(p);return p;}
let pg;
try{
 console.log(JSON.stringify({status:'OWNED_MANAGEMENT_PG_INITIALIZING',runId,port,directory:dir}));
 await start('initdb',path.join(bin,'initdb.exe'),['-D',data,'-U','attention_snapshot_synthetic','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(180000);
 pg=start('postgres',path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=20']);
 for(let i=0;i<120&&!pg.output.includes('ready to accept connections');i++){pg.check();await new Promise(r=>setTimeout(r,250));}
 const sql=path.join(dir,'bootstrap.sql');await fs.writeFile(sql,"COMMENT ON DATABASE postgres IS 'owned-work-queue-snapshot-qa'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);");
 await start('bootstrap',path.join(bin,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U','attention_snapshot_synthetic','-d','postgres','-v','ON_ERROR_STOP=1','-f',sql]).wait(30000);
 await save(path.join(dir,'owner.json'),{runId,pid:process.pid,postgresPid:pg.child.pid,port,data,scope:'OWNED_LOOPBACK_ONLY'});
 console.log(JSON.stringify({status:'OWNED_MANAGEMENT_PG_READY',runId,port,pid:process.pid,directory:dir}));
 const input=readline.createInterface({input:process.stdin});await new Promise(resolve=>{input.on('line',v=>{if(v.trim()==='stop'){input.close();resolve();}});input.on('close',resolve);});
}finally{
 for(const child of children.toReversed())if(child!==pg&&!child.exited)await child.stop();
 if(pg&&!pg.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==pg.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==port)throw Error('POSTGRES_OWNERSHIP_MISMATCH');await start('postgres-stop',path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}
 await save(path.join(dir,'cleanup.json'),{runId,portReleased:await available(port),onlyOwnedProcessStopped:true});console.log('OWNED_MANAGEMENT_PG_STOPPED');
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {ownedProcess,available} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';
const root=process.cwd(),runDir=process.env.QA_RUN_DIR;
if(!runDir||path.dirname(path.resolve(runDir))!==path.join(root,'.qa/runs'))throw Error('Managed QA run directory required');
const postgres='C:/Program Files/PostgreSQL/18/bin',data=path.join(runDir,'owned-transfer-pg');const port=55441;
if(!await available(port))throw Error('OWNED_TRANSFER_PORT_OCCUPIED:preserve other process');
await fs.mkdir(data,{recursive:false});const env={...systemEnvironment(),QA_RUN_ID:process.env.QA_RUN_ID,QA_RUN_DIR:runDir};const tasks=[];
function start(name,exe,args){const p=ownedProcess(exe,args,{name,cwd:root,env,logFile:path.join(runDir,name+'.log')});tasks.push(p);return p;}
let server,validationResult='NOT_RUN';
try{
 await start('transfer-initdb',path.join(postgres,'initdb.exe'),['-D',data,'-U','money_integrated_synthetic','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 server=start('transfer-postgres',path.join(postgres,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=10']);
 let ready=false;for(let i=0;i<120;i++){server.check();if(!await available(port)&&server.output.includes('ready to accept connections')){ready=true;break;}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('OWNED_TRANSFER_READINESS_TIMEOUT');
 await start('transfer-39-cases',process.execPath,['qa/money-transfer-regression.mjs']).wait(300000);
 validationResult='PASS';
}finally{
 const errors=[];
 // PostgreSQL must finish its logger and background children before generic handle cleanup.
 // The live server handle and its exact owned data directory authorize this stop.
 if(server&&!server.exited&&server.child.exitCode===null)try{
  const pid=Number((await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/)[0]);
  if(pid!==server.child.pid||path.dirname(data)!==path.resolve(runDir))throw Error('LIVE_PG_DATA_OWNERSHIP_MISMATCH');
  await start('transfer-postgres-stop',path.join(postgres,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);
 }catch(error){errors.push(error.message);}
 for(const task of tasks.toReversed())try{await task.stop();}catch(error){errors.push(error.message);}
 const portReleased=await available(port);if(!portReleased)errors.push('OWNED_TRANSFER_PORT_NOT_RELEASED');
 let dataRemoved=false;
 if(!errors.length)try{if(path.dirname(data)!==path.resolve(runDir))throw Error('PG_DATA_OWNERSHIP_MISMATCH');await fs.rm(data,{recursive:true,force:true});dataRemoved=true;}catch(error){errors.push(error.message);}
 await fs.writeFile(path.join(runDir,'owned-transfer-runtime.json'),JSON.stringify({database:'OWNED_LOOPBACK_SYNTHETIC',port,processes:tasks.map(p=>({name:p.name,pid:p.child.pid})),result:validationResult,cleanup:{status:errors.length?'FAILED':'PASS',portReleased,dataRemoved,errors}},null,2));
 if(errors.length)throw Error('OWNED_TRANSFER_CLEANUP_FAILED:'+errors.join(';'));
}

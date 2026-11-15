import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {available,ownedProcess,save,git} from '../runtime/core.mjs';
const root=process.cwd(),id='study-backup-'+randomUUID(),dir=path.join('D:/DEV_Space/study-v2-prod-release-artifacts-20261115/runs',id),data=path.join(dir,'owned-pg');
const pg='C:/Program Files/PostgreSQL/18/bin',port=55491,python='D:/DEV_Space/study-v2-prod-release-artifacts-20261115/backup-runtime/Scripts/python.exe';
if(!await available(port))throw Error('BACKUP_TEST_PORT_OCCUPIED:foreign process preserved');await fs.mkdir(data,{recursive:true});
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(k))),BACKUP_TEST_DATABASE_URL:'postgresql://desk_backup_test@127.0.0.1:55491/postgres'};
const tasks=[],result={runId:id,commit:git(root,'rev-parse','HEAD'),startedAt:new Date().toISOString(),scope:'OWNED_LOOPBACK_DB_AND_SYNTHETIC_OBJECT_TRANSPORT',result:'NOT_RUN'};
const start=(name,exe,args)=>{const p=ownedProcess(exe,args,{cwd:root,env,name,logFile:path.join(dir,name+'.log')});tasks.push(p);return p;};let server,error;
try{await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U','desk_backup_test','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(120000);
 server=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=15']);for(let n=0;n<120&&!server.output.includes('ready to accept connections');n++){server.check();await new Promise(r=>setTimeout(r,250));}
 await start('tests',python,['-m','unittest','discover','-s','ops/shared-desk-backup','-p','test_runner.py']).wait(300000);result.result='PASS';
}catch(e){error=e;result.result='FAIL';result.error=e.message;}
finally{const failures=[];if(server&&!server.exited)try{const pid=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(pid[0])!==server.child.pid||path.resolve(pid[1])!==path.resolve(data)||Number(pid[3])!==port)throw Error('OWNERSHIP_MISMATCH');await start('pg-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}catch(e){failures.push(e.message);}for(const p of tasks.toReversed())try{await p.stop();}catch(e){failures.push(e.message);}result.cleanup={failures,portReleased:await available(port),ownedSyntheticDataRetainedOutsideCheckout:true};result.finishedAt=new Date().toISOString();await save(path.join(dir,'result.json'),result);}
console.log(JSON.stringify({...result,evidence:dir},null,2));if(error)throw error;

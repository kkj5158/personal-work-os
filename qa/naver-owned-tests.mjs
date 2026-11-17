// Only a fresh owned loopback PostgreSQL database. No shared DEV/PROD credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,save,git} from './runtime/core.mjs';
const root=process.cwd(),runId='naver-'+randomUUID(),dir=path.join(root,'.qa','runs',runId),data=path.join(dir,'pg'),port=55457,bin='C:/Program Files/PostgreSQL/18/bin';
if(!await available(port))throw Error('OWNED_PORT_OCCUPIED');
await fs.mkdir(data,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(k)));env.ARCHIVE_TEST_DB=`jdbc:postgresql://127.0.0.1:${port}/postgres`;
const tasks=[],result={runId,revision:git(root,'rev-parse','HEAD'),database:'OWNED_LOOPBACK_SYNTHETIC',startedAt:new Date().toISOString()};let pg,failure;
function start(name,exe,args,cwd=root){const p=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});tasks.push(p);return p;}
try{
 await start('initdb',path.join(bin,'initdb.exe'),['-D',data,'-U','archive_test','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(120000);
 pg=start('postgres',path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','io_method=sync','-c','max_connections=16']);
 for(let i=0;i<120&&!pg.output.includes('ready to accept connections');i++){pg.check();await new Promise(r=>setTimeout(r,250));}
 await start('tests','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.naverarchive.*','--tests','com.kafka.backend.orbit.*','--tests','com.kafka.backend.log.LogSecurityTest','--tests','com.kafka.backend.common.SecurityProfileIsolationTest','bootJar','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(600000);
 const seed=path.join(dir,'restore-seed.sql'),dump=path.join(dir,'synthetic-backup.sql');
 await fs.writeFile(seed,"CREATE TABLE archive_restore_fixture(id integer primary key,body text); INSERT INTO archive_restore_fixture VALUES(1,E'SYNTHETIC\\r\\n  한글 원문\\n');");
 const pgArgs=['-h','127.0.0.1','-p',String(port),'-U','archive_test'];
 await start('backup-seed',path.join(bin,'psql.exe'),[...pgArgs,'-d','postgres','-v','ON_ERROR_STOP=1','-f',seed]).wait(30000);
 await start('backup',path.join(bin,'pg_dump.exe'),[...pgArgs,'-d','postgres','--no-owner','--no-privileges','-f',dump]).wait(30000);
 await start('restore-db',path.join(bin,'createdb.exe'),[...pgArgs,'archive_restore']).wait(30000);
 await start('restore',path.join(bin,'psql.exe'),[...pgArgs,'-d','archive_restore','-v','ON_ERROR_STOP=1','-f',dump]).wait(30000);
 const verify=start('restore-check',path.join(bin,'psql.exe'),[...pgArgs,'-d','archive_restore','-tA','-c',"select encode(convert_to(body,'UTF8'),'base64') from archive_restore_fixture where id=1"]);await verify.wait(30000);
 if(verify.output.trim()!==Buffer.from('SYNTHETIC\r\n  한글 원문\n').toString('base64'))throw Error('SYNTHETIC_RESTORE_BODY_MISMATCH');
 result.backupRestore='PASS_OWNED_SYNTHETIC_ONLY';result.status='PASS';
}catch(e){failure=e;result.status='FAIL';result.error=e.message;}
finally{
 const errors=[];for(const p of tasks.toReversed())try{await p.stop();}catch(e){errors.push(e.message);}
 result.cleanup={errors,portReleased:await available(port),ownedDataRetained:true};
 if(errors.length||!result.cleanup.portReleased){result.status='FAIL_CLEANUP';failure??=Error('Owned cleanup failed');}
 result.xml=[];for(const file of await fs.readdir(path.join(root,'backend/build/test-results/test')).catch(()=>[])){if(!file.endsWith('.xml'))continue;const xml=await fs.readFile(path.join(root,'backend/build/test-results/test',file),'utf8'),attrs=xml.match(/<testsuite\b([^>]*)>/)?.[1]??'';const count=k=>Number(attrs.match(new RegExp(`\\b${k}="([0-9]+)"`))?.[1]??0);result.xml.push({file,tests:count('tests'),failures:count('failures'),errors:count('errors'),skipped:count('skipped')});}
 result.finishedAt=new Date().toISOString();await save(path.join(dir,'result.json'),result);
}
console.log(JSON.stringify({...result,evidence:path.join(dir,'result.json')},null,2));if(failure)throw failure;

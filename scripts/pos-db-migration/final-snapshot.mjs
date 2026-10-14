import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';import {dir,conn,run,query,save,hash} from './db.mjs';
const scope=process.argv[2];if(!['DEV','PROD'].includes(scope))throw Error('Invalid scope');
const name=scope.toLowerCase()+'-final',file=path.join(dir,name+'.dump');try{await fs.access(file);throw Error('Final archive exists; refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
const c=conn(scope,'source');const keeper=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...c.env,PGAPPNAME:'pos-migration-snapshot-20261014'},windowsHide:true});let buffer='',stderr='';keeper.stderr.on('data',x=>stderr+=x);keeper.stdin.on('error',()=>{});const done=new Promise((resolve,reject)=>{keeper.on('error',reject);keeper.on('close',resolve);});
const snapshotPromise=new Promise((resolve,reject)=>{keeper.stdout.on('data',x=>{buffer+=x;const line=buffer.split(/\r?\n/).find(x=>x.startsWith('{'));if(line){try{resolve(JSON.parse(line));}catch{}}});keeper.on('close',()=>reject(Error('Snapshot exporter exited: '+c.redact(stderr).slice(0,240))));});
keeper.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT json_build_object('snapshot',pg_export_snapshot(),'at',clock_timestamp(),'readOnly',current_setting('default_transaction_read_only'));\n");
const snapshot=await snapshotPromise;if(!/^[0-9A-Fa-f-]+$/.test(snapshot.snapshot))throw Error('Invalid snapshot id');
const freeze=JSON.parse(await fs.readFile(path.join(dir,scope.toLowerCase()+'-write-freeze-verification.json'),'utf8'));if(!freeze.writeStatementRejected||freeze.fresh[0].jdbcWriters!==0)throw Error('Source write fence is not verified');
const receipt={scope,startedAt:new Date().toISOString(),identity:c.identity,file,snapshot,status:'RUNNING',consistent:true};await save(name+'-receipt.json',receipt);
const fingerprintSql=`SET timezone='UTC'; SET extra_float_digits=3;
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT '${snapshot.snapshot}';
SELECT format('SELECT json_build_object(''schema'',%L,''table'',%L,''rows'',count(*),''sha256'',encode(extensions.digest(coalesce(string_agg(rowhash,'''' ORDER BY rowhash),''''),''sha256''),''hex'')) FROM (SELECT encode(extensions.digest(row_to_json(t)::text,''sha256''),''hex'') AS rowhash FROM %I.%I t) h;',n.nspname,c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname
\\gexec
ROLLBACK;`;
try{
const results=await Promise.allSettled([run(scope,'source','pg_dump',['--format=custom','--snapshot='+snapshot.snapshot,'--file',file]),query(scope,'source',fingerprintSql)]);for(const r of results)if(r.status==='rejected')throw r.reason;
await save(name+'-source-fingerprints.json',{scope,snapshot,at:new Date().toISOString(),algorithm:'All-column row_to_json SHA-256 row multiset with duplicates, UTC',tables:results[1].value});
keeper.stdin.end('ROLLBACK;\n');await done;
const listing=await run(scope,'source','pg_restore',['--list',file]);await fs.writeFile(file+'.list',listing.stdout);
const roles=await run(scope,'source','pg_dumpall',['--roles-only','--no-role-passwords']);await fs.writeFile(path.join(dir,name+'-roles.sql'),roles.stdout);
Object.assign(receipt,await hash(file),{status:'ARCHIVE_CREATED_FROZEN_SNAPSHOT',completedAt:new Date().toISOString(),warnings:results[0].value.stderr,archiveEntries:listing.stdout.split('\n').filter(x=>/^\d+;/.test(x)).length,sourceTableFingerprints:results[1].value.length});await save(name+'-receipt.json',receipt);console.log(JSON.stringify(receipt));
}catch(e){keeper.stdin.end('ROLLBACK;\n');await done;Object.assign(receipt,{status:'FAILED',failedAt:new Date().toISOString(),error:e.message});await save(name+'-receipt.json',receipt);throw e;}


import {dir,conn,run,save,hash,vars} from './db.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const scope=process.argv[2],label=process.argv[3]||'preparation';if(!['DEV','PROD'].includes(scope)||!['preparation','final','destination-recovery'].includes(label))throw Error('Invalid arguments');
const target=label==='destination-recovery'?'destination':'source';
const name=scope.toLowerCase()+'-'+label;const file=path.join(dir,name+'.dump');
try{await fs.access(file);throw Error('Backup exists; refusing overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
const receipt={startedAt:new Date().toISOString(),identity:conn(scope,target).identity,label,status:'RUNNING',file};await save(name+'-receipt.json',receipt);
try{
const r=await run(scope,target,'pg_dump',['--format=custom','--file',file]);
const listing=await run(scope,target,'pg_restore',['--list',file]);await fs.writeFile(file+'.list',listing.stdout);
const roles=await run(scope,target,'pg_dumpall',['--roles-only','--no-role-passwords']);await fs.writeFile(path.join(dir,name+'-roles.sql'),roles.stdout);
const schema=await run(scope,target,'pg_dump',['--schema-only']);await fs.writeFile(path.join(dir,name+'-schema.sql'),schema.stdout);
Object.assign(receipt,await hash(file),{completedAt:new Date().toISOString(),status:'ARCHIVE_CREATED_RESTORE_PENDING',warnings:r.stderr,rolePasswordHashes:'EXCLUDED; connection configuration separately protected',archiveEntries:listing.stdout.split('\n').filter(x=>/^\d+;/.test(x)).length});
await save(name+'-receipt.json',receipt);console.log(JSON.stringify(receipt));
}catch(e){Object.assign(receipt,{status:'FAILED',failedAt:new Date().toISOString(),error:e.message});await save(name+'-receipt.json',receipt);throw e;}

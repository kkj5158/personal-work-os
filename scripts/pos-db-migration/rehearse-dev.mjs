import {dir,query,run,save,hash} from './db.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const startedAt=new Date().toISOString();
const existing=await query('DEV','destination',"SELECT json_build_object('roles',json_agg(rolname)) FROM pg_roles;");
const roles=await fs.readFile(path.join(dir,'dev-preparation-roles.sql'),'utf8');
const filtered=roles.split(/\r?\n/).filter(line=>{
 if(/^ALTER ROLE postgres WITH /.test(line))return false;
 const match=line.match(/^CREATE ROLE ([^;]+);$/);return !match||!existing[0].roles.includes(match[1]);
}).join('\n').replaceAll('GRANTED BY supabase_admin','GRANTED BY postgres');
await run('DEV','destination','psql',['-X','-q','-v','ON_ERROR_STOP=1'],filtered);
await run('DEV','destination','psql',['-X','-q','-v','ON_ERROR_STOP=1'],"CREATE DATABASE pos_dev_rehearsal TEMPLATE template0;");
process.env.POS_DESTINATION_DATABASE='pos_dev_rehearsal';
const archive=path.join(dir,'dev-preparation.dump');const integrity=await hash(archive);
const receipt={startedAt,database:'pos_dev_rehearsal',integrity,status:'RESTORING',options:['--single-transaction','--exit-on-error'],ownerAndAclPreserved:true,postgresRole:'Railway administrator superuser retained; source object ownership/ACL restored'};await save('dev-rehearsal-restore.json',receipt);
try{const r=await run('DEV','destination','pg_restore',['--dbname=pos_dev_rehearsal','--single-transaction','--exit-on-error',archive]);Object.assign(receipt,{status:'RESTORED_VALIDATION_PENDING',completedAt:new Date().toISOString(),warnings:r.stderr});await save('dev-rehearsal-restore.json',receipt);console.log(JSON.stringify(receipt));}catch(e){Object.assign(receipt,{status:'FAILED',failedAt:new Date().toISOString(),error:e.message});await save('dev-rehearsal-restore.json',receipt);throw e;}

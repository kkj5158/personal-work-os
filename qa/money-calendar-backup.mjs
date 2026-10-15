// MONEY table recovery archive on the existing protected local artifact boundary.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {vars, run} from '../scripts/pos-db-migration/db.mjs';
const scope=process.argv[2];if(!['DEV','PROD'].includes(scope))throw Error('DEV_OR_PROD_REQUIRED');
const v=vars(scope),url=new URL(v[scope+'_DB_URL'].replace(/^jdbc:/,''));
if(!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pos_'+scope.toLowerCase()+'_final')throw Error('ACTIVE_RAILWAY_DATABASE_REQUIRED');
process.env.POS_DESTINATION_DATABASE=url.pathname.slice(1);
const root=process.env.CALENDAR_EVIDENCE_DIR||'F:/artifacts/money-calendar-web-v1-20261015',file=`${root}/private/${scope.toLowerCase()}-money-before-calendar.dump`;
try{await fs.access(file);throw Error('ARCHIVE_ALREADY_EXISTS_REFUSE_OVERWRITE');}catch(e){if(e.code!=='ENOENT')throw e;}
const startedAt=new Date().toISOString();
await run(scope,'destination','pg_dump',['--format=custom','--no-owner','--no-privileges','--table=public.money_*','--file',file]);
const listing=await run(scope,'destination','pg_restore',['--list',file]);
const data=await fs.readFile(file);
const receipt={scope,database:url.pathname.slice(1),startedAt,completedAt:new Date().toISOString(),file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),archiveEntries:listing.stdout.split('\n').filter(row=>/^\d+;/.test(row)).length,status:'MONEY_TABLE_ARCHIVE_LIST_VERIFIED',scopeLimit:'Financial tables only; auth and broader app recovery use existing verified full DB backups. Restore into an isolated database with matching Flyway schema; never overwrite active user data automatically.',readOnlySource:true};
await fs.writeFile(`${root}/${scope.toLowerCase()}-backup-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));

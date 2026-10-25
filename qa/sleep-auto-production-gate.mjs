// Read-only aggregate preservation audit; optional exact Flyway migration runner.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const out='F:/artifacts/POS_SLEEP_AUTO_PROD_20261025';
const api='e46b58f4-e829-430f-a4c4-b27e24d46f19',database='e0b42e61-9207-4225-83ee-c516edc75202';
const mode=process.argv[2];
if(!['before','after','preflight','migrate','verify'].includes(mode))throw Error('Invalid release mode');
function vars(service){return JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',`railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment c2c20488-311f-4b9e-9ec9-d79508123176 --service ${service} --json`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000}));}
try{
 const v=vars(api),d=vars(database),u=new URL(v.PROD_DB_URL.replace(/^jdbc:/,''));
 if(v.SPRING_PROFILES_ACTIVE!=='prod'||u.pathname!=='/pos_prod_final'||v.SUPABASE_JWT_ISSUER!=='https://pos-auth-prod-production.up.railway.app/auth/v1'||!u.hostname.endsWith('.railway.internal'))throw Error('Production identity mismatch');
 if(!d.RAILWAY_TCP_PROXY_DOMAIN||!d.RAILWAY_TCP_PROXY_PORT)throw Error('Existing approved proxy unavailable');
 const env={...process.env,PGHOST:d.RAILWAY_TCP_PROXY_DOMAIN,PGPORT:d.RAILWAY_TCP_PROXY_PORT,PGDATABASE:u.pathname.slice(1),PGUSER:v.PROD_DB_USERNAME,PGPASSWORD:v.PROD_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15',PGAPPNAME:'sleep-auto-release-audit',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000',SLEEP_RELEASE_JDBC:`jdbc:postgresql://${d.RAILWAY_TCP_PROXY_DOMAIN}:${d.RAILWAY_TCP_PROXY_PORT}${u.pathname}?sslmode=require`,SLEEP_RELEASE_USER:v.PROD_DB_USERNAME,SLEEP_RELEASE_PASSWORD:v.PROD_DB_PASSWORD};
 await fs.mkdir(out,{recursive:true});
 if(['before','after'].includes(mode)){
  const tables=['sleep_sessions','sleep_events','sleep_naps','sleep_nap_events','sleep_receipts','sleep_settings','sleep_cycles','sleep_pending','sleep_context_revisions','sleep_tombstones','reflection_entries','calendar_weekly_reviews'];
  const available=JSON.parse(execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',"select json_agg(tablename) from pg_tables where schemaname='public'"],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}));
  const selected=tables.filter(x=>available.includes(x));
  const digests=selected.map(t=>{
   const row=t==='sleep_tombstones'?"(to_jsonb(t)-ARRAY['expected_wake_date','logical_wake_date'])":"to_jsonb(t)";
   return `'${t}',(SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(${row}::text,E'\\n' ORDER BY ${row}::text),''))) FROM public.${t} t)`;
  }).join(',');
  const sql=`BEGIN READ ONLY; SELECT json_build_object('history',(SELECT json_agg(h order by installed_rank) FROM (SELECT installed_rank,version,script,checksum,success FROM public.flyway_schema_history) h),'tables',json_build_object(${digests}),'invalidAnnotations',(select count(*) from sleep_sessions where (document ? 'sleepScore' and document->'sleepScore'<>'null'::jsonb) or (document ? 'sleepNote' and document->'sleepNote'<>'null'::jsonb))); ROLLBACK;`;
  const result=JSON.parse(execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}));
  result.at=new Date().toISOString();result.environment='PROD';result.readOnly=true;result.scope='Aggregate hashes/counts only; no raw facts or private annotations exported';
  if(mode==='after'){const before=JSON.parse(await fs.readFile(path.join(out,'production-before.json'),'utf8'));result.existingRowsUnchanged=JSON.stringify(before.tables)===JSON.stringify(result.tables);result.existingMigrationHistoryUnchanged=JSON.stringify(before.history)===JSON.stringify(result.history.filter(h=>!['90','95'].includes(h.version)));}
  await fs.writeFile(path.join(out,`production-${mode}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify({mode,readOnly:true,versions:result.history.filter(x=>x.version).map(x=>x.version).slice(-8),counts:Object.fromEntries(Object.entries(result.tables).map(([k,v])=>[k,v.count])),existingRowsUnchanged:result.existingRowsUnchanged,existingMigrationHistoryUnchanged:result.existingMigrationHistoryUnchanged,invalidAnnotations:result.invalidAnnotations}));
 }else{
  // The source-mode Java runner independently validates every applied checksum and the exact pending set.
  const log=execFileSync('java',['-cp',path.join(out,'migration-lib','*'),path.resolve('qa/SleepAutoReleaseMigration.java'),mode,path.resolve('backend/src/main/resources/db/migration')],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
  // JDBC URLs are never published, even if a library emits its datasource metadata.
  const safe=log.replaceAll(env.SLEEP_RELEASE_JDBC,'[REDACTED_DB]').replace(/(?:jdbc:)?postgres(?:ql)?:\/\/[^\s]+/g,'[REDACTED_DB]');
  await fs.writeFile(path.join(out,`flyway-${mode}.txt`),safe);console.log(safe);
 }
}catch(e){console.error('Production gate failed; private connection output withheld. '+(e.code||e.name));process.exitCode=1;}



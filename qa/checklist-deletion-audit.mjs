// Aggregate-only, read-only evidence using fixed official Railway identities.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const scope=process.argv[2],phase=process.argv[3];
assert.ok(['DEV','PROD'].includes(scope)&&['before','after'].includes(phase));
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const ids=scope==='DEV'?{env:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',db:'0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9'}:{env:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19',db:'e0b42e61-9207-4225-83ee-c516edc75202'};
const variables=service=>JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',`railway variable list --project ${project} --environment ${ids.env} --service ${service} --json`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000}));
try{
 const v=variables(ids.api);
 assert.equal(v.RAILWAY_ENVIRONMENT_ID,ids.env);assert.equal(v.SPRING_PROFILES_ACTIVE,scope==='DEV'?'hosted-dev':'prod');
 const u=new URL(v[scope+'_DB_URL'].replace(/^jdbc:/,''));
 if(u.hostname.endsWith('.internal')){const d=variables(ids.db);if(d.DATABASE_PUBLIC_URL){const p=new URL(d.DATABASE_PUBLIC_URL);u.hostname=p.hostname;u.port=p.port;}else{assert.ok(d.RAILWAY_TCP_PROXY_DOMAIN&&d.RAILWAY_TCP_PROXY_PORT);u.hostname=d.RAILWAY_TCP_PROXY_DOMAIN;u.port=d.RAILWAY_TCP_PROXY_PORT;}}
 const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:v[scope+'_DB_USERNAME'],PGPASSWORD:v[scope+'_DB_PASSWORD'],PGSSLMODE:u.searchParams.get('sslmode')??'prefer',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=30000 -c default_transaction_read_only=on',PGAPPNAME:'checklist-deletion-readonly'};
 const query=`BEGIN READ ONLY; SELECT json_build_object('history',(select json_agg(row_to_json(h)) from (select version,script,checksum,success from flyway_schema_history order by installed_rank)h),'tables',json_build_object(${['checklist_sys_identities','checklist_sys_areas','checklist_sys_items','checklist_sys_records','checklist_archive_periods'].map(t=>`'${t}',(select json_build_object('count',count(*),'digest',md5(coalesce(string_agg((to_jsonb(x)-'deleted_on')::text,'' order by (to_jsonb(x)-'deleted_on')::text),''))) from ${t} x)`).join(',')}),'usage',(select json_build_object('records',count(*),'items',count(distinct item_id),'dates',count(distinct entry_date),'firstDate',min(entry_date),'lastDate',max(entry_date),'success',count(*)filter(where state='SUCCESS'),'failure',count(*)filter(where state='FAILURE'),'notRecorded',count(*)filter(where state='NOT_RECORDED')) from checklist_sys_records),'constraints',(select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid='checklist_sys_records'::regclass)); ROLLBACK;`;
 const raw=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:45000});
 const result={scope,phase,readOnly:true,at:new Date().toISOString(),profile:v.SPRING_PROFILES_ACTIVE,...JSON.parse(raw.trim())};
 const dir='F:/artifacts/checklist-unrestricted-deletion-20261116';
 if(phase==='after'){const before=JSON.parse(await fs.readFile(`${dir}/${scope}-before.json`,'utf8'));assert.deepEqual(result.tables,before.tables,'existing checklist data changed');assert.deepEqual(result.history.slice(0,before.history.length),before.history);result.preservation='PASS';}
 await fs.writeFile(`${dir}/${scope}-${phase}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({scope,phase,head:result.history.at(-1),usage:result.usage,tables:result.tables,preservation:result.preservation}));
}catch{console.error('CHECKLIST_READONLY_AUDIT_FAILED: raw credential-bearing errors withheld');process.exitCode=1;}

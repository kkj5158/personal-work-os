import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {loadEnvironment} from '../qa/runtime/environment.mjs';
const [environment='dev',stage='before']=process.argv.slice(2);
if(!['dev','prod'].includes(environment)||!['before','after'].includes(stage))throw Error('Use dev|prod before|after');
const root='docs/sleep-web-v2-life-calendar/evidence';await fs.mkdir(root,{recursive:true});
let values,owner;
try{
 const dev=await loadEnvironment(process.cwd());owner=dev.values.APP_DEV_USER_ID;
 if(environment==='dev')values=dev.values;
 else{
  const raw=execFileSync('pwsh.exe',['-NoProfile','-Command','railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment c2c20488-311f-4b9e-9ec9-d79508123176 --service e46b58f4-e829-430f-a4c4-b27e24d46f19 --json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
  values=JSON.parse(raw);if(values.SPRING_PROFILES_ACTIVE!=='prod')throw Error('Unexpected PROD profile');
 }
 if(!/^[0-9a-f-]{36}$/i.test(owner))throw Error('Invalid audited owner');
 const u=new URL(values[environment==='dev'?'DEV_DB_URL':'PROD_DB_URL'].replace(/^jdbc:/,''));
 const prefix=environment.toUpperCase();const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:values[`${prefix}_DB_USERNAME`]||decodeURIComponent(u.username),PGPASSWORD:values[`${prefix}_DB_PASSWORD`]||decodeURIComponent(u.password),PGSSLMODE:u.searchParams.get('sslmode')||'require',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'sleep-life-readonly-audit',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000'};
 const tables=[['sleep_sessions','owner_id'],['sleep_naps','owner_id'],['sleep_settings','owner_id'],['exercise_documents','owner_id'],['planned_time_blocks','user_id'],['work_time_entries','user_id'],['supplemental_work_entries','user_id'],['life_time_entries','user_id'],['life_state_entries','user_id']];
 const sql=`BEGIN READ ONLY; SELECT json_build_object('history',(SELECT json_agg(h ORDER BY installed_rank) FROM (SELECT installed_rank,version,script,checksum,success FROM public.flyway_schema_history) h),'tables',json_build_object(${tables.map(([table,key])=>`'${table}',(SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),''))) FROM public.${table} t ${environment==='dev'?`WHERE ${key}='${owner}'::uuid`:''})`).join(',')})); ROLLBACK;`;
 const result=JSON.parse(execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}));
 result.at=new Date().toISOString();result.environment=environment;result.readOnly=true;result.scope=environment==='dev'?'Configured DEV owner UUID; no raw records, IDs, credentials or times exported':'All canonical PROD rows; no raw records, IDs, credentials or times exported';
 if(stage==='after'){const before=JSON.parse(await fs.readFile(`${root}/${environment}-before.json`,'utf8'));result.unchanged=JSON.stringify(before.tables)===JSON.stringify(result.tables);result.historyUnchanged=JSON.stringify(before.history)===JSON.stringify(result.history);}
 await fs.writeFile(`${root}/${environment}-${stage}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({environment,stage,readOnly:true,head:result.history.at(-1)?.version,counts:Object.fromEntries(Object.entries(result.tables).map(([table,value])=>[table,value.count])),unchanged:result.unchanged,historyUnchanged:result.historyUnchanged}));
}catch{console.error('Read-only audit could not verify environment/database access. No database mutation was attempted.');process.exitCode=1;}

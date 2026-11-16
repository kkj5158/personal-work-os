// Read-only fixed-target preservation proof. Never writes DB rows or emits credentials/content.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const [scope,phase]=process.argv.slice(2);
if(!['DEV','PROD'].includes(scope)||!['before','after'].includes(phase))throw Error('Explicit scope/phase required');
const cli='C:/Users/kimji/AppData/Local/npm-cache/_npx/79fa66f96c8fdacf/node_modules/@railway/cli/bin/railway.exe';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc',t=scope==='DEV'?{env:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',db:'0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9'}:{env:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19',db:'e0b42e61-9207-4225-83ee-c516edc75202'};
const call=(exe,args,env=process.env)=>execFileSync(exe,args,{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000});
const vars=service=>JSON.parse(call(cli,['variable','list','--project',project,'--environment',t.env,'--service',service,'--json']));
try{
 const v=vars(t.api);if(v.RAILWAY_ENVIRONMENT_ID!==t.env||v.SHARED_DESK_STORAGE_ENVIRONMENT!==scope)throw Error('SCOPE_MISMATCH');
 const u=new URL(v[scope+'_DB_URL'].replace(/^jdbc:/,''));if(u.hostname.endsWith('.internal')){const d=vars(t.db);if(d.DATABASE_PUBLIC_URL){const p=new URL(d.DATABASE_PUBLIC_URL);u.hostname=p.hostname;u.port=p.port;}else{u.hostname=d.RAILWAY_TCP_PROXY_DOMAIN;u.port=d.RAILWAY_TCP_PROXY_PORT;}}
 const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:v[scope+'_DB_USERNAME'],PGPASSWORD:v[scope+'_DB_PASSWORD'],PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=30000 -c default_transaction_read_only=on',PGAPPNAME:'attention-v31-readonly-audit'};
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'history',(select json_agg(row_to_json(h)) from (select version,script,checksum,success from flyway_schema_history order by installed_rank)h),
 'counts',(select json_object_agg(status,n) from (select status,count(*) n from attention_items group by status)s),
 'perItemDigests',(select json_object_agg(id,md5((to_jsonb(i)-'active_group')::text)) from attention_items i),
 'laneDigests',(select json_object_agg(id,md5((to_jsonb(l)-'queue_role')::text)) from attention_lanes l),
 'lanes',(select json_agg(json_build_object('id',id,'name',name,'order',sort_order)) from attention_lanes),
 'metadata',(select json_build_object('total',count(*),'generic',count(*) filter(where action='GPT 응답 확인'),'withSummary',count(*) filter(where source::jsonb->>'summary' is not null),'withMemo',count(*) filter(where memo<>'')) from attention_items),
 'columns',(select json_agg(column_name) from information_schema.columns where table_name='attention_items' and table_schema='public'));
 ROLLBACK;`;
 const record={...JSON.parse(call('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],env).trim()),scope,phase,observedAt:new Date().toISOString(),profile:v.SPRING_PROFILES_ACTIVE,scopeIds:t};
 const dir='D:/DEV_Space/work-queue-v3-1-artifacts-20261116';
 if(phase==='after'){const before=JSON.parse(await fs.readFile(`${dir}/${scope.toLowerCase()}-before.json`,'utf8'));const ids=Object.keys(before.perItemDigests??{});record.preservation={baseline:ids.length,missing:ids.filter(id=>!record.perItemDigests[id]).length,changed:ids.filter(id=>record.perItemDigests[id]&&record.perItemDigests[id]!==before.perItemDigests[id]).length,lanesUnchanged:JSON.stringify(before.laneDigests)===JSON.stringify(record.laneDigests)};}
 await fs.writeFile(`${dir}/${scope.toLowerCase()}-${phase}.json`,JSON.stringify(record,null,2));
 console.log(JSON.stringify({scope,phase,readOnly:record.readOnly,counts:record.counts,metadata:record.metadata,lanes:record.lanes,history:record.history.filter(h=>Number(h.version)>=100),preservation:record.preservation}));
}catch{console.error('ATTENTION_V31_READONLY_AUDIT_FAILED:sensitive_details_withheld');process.exitCode=1;}

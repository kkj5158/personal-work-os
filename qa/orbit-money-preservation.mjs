// Read-only deployed schema/owner-preservation audit, via official Railway API service environment.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [target,file]=process.argv.slice(2);
try{
 if(!['DEV','PROD'].includes(target)||!file)throw Error('FENCE');
 const dev=target==='DEV',profile=process.env.SPRING_PROFILES_ACTIVE??'';
 if(!(dev?profile.includes('hosted-dev'):profile.split(',').includes('prod')))throw Error('PROFILE_FENCE');
 const raw=process.env[dev?'DEV_DB_URL':'PROD_DB_URL'],owner=process.env[dev?'APP_DEV_USER_ID':'WORKFLOW_PROD_OWNER_ID'];
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(owner)||!raw?.startsWith('jdbc:postgresql://'))throw Error('IDENTITY_FENCE');
 const url=new URL(raw.slice(5));if(!url.hostname.endsWith('.railway.internal'))throw Error('DATABASE_FENCE');
 url.hostname=dev?'sakura.proxy.rlwy.net':'shuttle.proxy.rlwy.net';url.port=dev?'20671':'28335';
 const tables=['money_raw_notifications','money_accounts','money_transactions','money_transaction_sources','money_categories','money_category_rules','money_balance_checkpoints','money_loans','money_bookkeeping_overrides','money_rule_projections','money_classification_state','money_review_decisions','money_tracking_accounts','money_tracking_settings'];
 const parts=tables.map(t=>`select '${t}' as name,count(*) as count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as digest from ${t} t where user_id='${owner}'::uuid`).join(' UNION ALL ');
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30s'; SELECT jsonb_build_object('environment','${target}','ownerScope','CONFIGURED_CANONICAL_OWNER','tables',(select jsonb_agg(to_jsonb(x) order by name) from (${parts}) x),'flyway',(select jsonb_build_object('latestVersion',(select version from flyway_schema_history where success and version is not null order by installed_rank desc limit 1),'applied',count(*),'failures',count(*) filter(where not success)) from flyway_schema_history)); COMMIT;`;
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:process.env[dev?'DEV_DB_USERNAME':'PROD_DB_USERNAME'],PGPASSWORD:process.env[dev?'DEV_DB_PASSWORD':'PROD_DB_PASSWORD'],PGCONNECT_TIMEOUT:'15'};
 const out=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});const data=JSON.parse(out.split(/\r?\n/).find(x=>x.startsWith('{')));data.observedAt=new Date().toISOString();writeFileSync(file,JSON.stringify(data,null,2));console.log(JSON.stringify({target,status:'READ_ONLY_AUDIT_PASS',tables:data.tables.length,flyway:data.flyway}));
}catch{console.log(JSON.stringify({target,status:'READ_ONLY_AUDIT_FAIL'}));process.exitCode=1;}

// Owner-authorized READ ONLY aggregate audit via the existing official Railway CLI session.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const targets=[['DEV','9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c','eba7d263-7dc3-448a-a6b8-c2994721b597','0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9'],['PROD','c2c20488-311f-4b9e-9ec9-d79508123176','e46b58f4-e829-430f-a4c4-b27e24d46f19','e0b42e61-9207-4225-83ee-c516edc75202']];
const cliEnv={...process.env};delete cliEnv.RAILWAY_TOKEN;delete cliEnv.RAILWAY_API_TOKEN;
const vars=(environment,service)=>JSON.parse(execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0','variable','list','--project',project,'--environment',environment,'--service',service,'--json'],{env:cliEnv,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000}));
const report={observedAt:new Date().toISOString(),readOnly:true,environments:[]};
try{for(const [scope,environment,api,db] of targets){
 const a=vars(environment,api),v=vars(environment,db),u=new URL(v.DATABASE_URL);
 if(!u.hostname.endsWith('.railway.internal')||!v.RAILWAY_TCP_PROXY_DOMAIN||!v.RAILWAY_TCP_PROXY_PORT||a.RAILWAY_ENVIRONMENT_ID!==environment)throw Error('IDENTITY_FENCE');
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SET LOCAL statement_timeout='30000';
 SELECT json_build_object('kind','server','database',current_database(),'version',current_setting('server_version'),'readOnly',current_setting('transaction_read_only'));
 SELECT json_build_object('kind','flyway','version',version,'description',description,'script',script,'checksum',checksum,'success',success) FROM public.flyway_schema_history ORDER BY installed_rank;
 SELECT json_build_object('kind','reviewReasons','state',r.state,'archived',r.review_deferred,'reason',r.processing_reason,'count',count(*)) FROM money_raw_notifications r WHERE r.state IN ('REVIEW_REQUIRED','FAILED') GROUP BY r.state,r.review_deferred,r.processing_reason;
 SELECT json_build_object('kind','sourceIntegrity','multipleFacts',(SELECT count(*) FROM (SELECT user_id,raw_event_id FROM money_transaction_sources GROUP BY user_id,raw_event_id HAVING count(DISTINCT transaction_id)>1) x),'crossTenantSources',(SELECT count(*) FROM money_transaction_sources s LEFT JOIN money_transactions t ON t.id=s.transaction_id AND t.user_id=s.user_id LEFT JOIN money_raw_notifications r ON r.id=s.raw_event_id AND r.user_id=s.user_id WHERE t.id IS NULL OR r.id IS NULL));
 ROLLBACK;`;
 const out=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...cliEnv,PGHOST:v.RAILWAY_TCP_PROXY_DOMAIN,PGPORT:v.RAILWAY_TCP_PROXY_PORT,PGUSER:v.PGUSER,PGPASSWORD:v.PGPASSWORD,PGDATABASE:u.pathname.slice(1),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGAPPNAME:'money-review-v2-readonly'},input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,timeout:120000});
 const rows=out.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const settings=Object.fromEntries(['APP_MONEY_PROCESSING_ENABLED','APP_MONEY_OBSERVATION_WINDOW','APP_MONEY_TRANSFER_WINDOW','SPRING_PROFILES_ACTIVE'].map(k=>[k,a[k]??'UNSET_DEFAULT']));
 report.environments.push({scope,environment,settings,rows});
 }}catch{report.error='READ_ONLY_LIVE_AUDIT_FAILED; provider output withheld to protect credentials';process.exitCode=1;}
await fs.mkdir('.qa/review-v2',{recursive:true});await fs.writeFile('.qa/review-v2/live-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,environments:report.environments.map(e=>({...e,rows:undefined,flywayCount:e.rows.filter(r=>r.kind==='flyway').length,lastMigration:e.rows.filter(r=>r.kind==='flyway').at(-1),reasons:e.rows.filter(r=>r.kind==='reviewReasons'),integrity:e.rows.find(r=>r.kind==='sourceIntegrity')}))},null,2));

// Read-only, fixed PROD target. No values, connection strings or provider errors enter evidence.
import fs from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc',environment='c2c20488-311f-4b9e-9ec9-d79508123176';
const api='e46b58f4-e829-430f-a4c4-b27e24d46f19',database='e0b42e61-9207-4225-83ee-c516edc75202',backup='234e7ddc-da3e-4aba-8b28-f2c4345603aa';
const cli='C:/Users/kimji/AppData/Local/npm-cache/_npx/79fa66f96c8fdacf/node_modules/@railway/cli/bin/railway.exe';
const python='D:/DEV_Space/study-v2-prod-release-artifacts-20261115/backup-runtime/Scripts/python.exe';
const output='D:/DEV_Space/study-v2-prod-release-artifacts-20261115/evidence';
let stage='CONFIG';
try {
 const variables=service=>JSON.parse(execFileSync(cli,['variable','list','--project',project,'--environment',environment,'--service',service,'--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
 const v=variables(api),d=variables(database);
 if(v.RAILWAY_ENVIRONMENT_ID!==environment||v.SPRING_PROFILES_ACTIVE!=='prod'||v.SHARED_DESK_STORAGE_ENVIRONMENT!=='PROD')throw Error('IDENTITY');
 const url=new URL(v.PROD_DB_URL.replace(/^jdbc:/,''));
 if(url.hostname.endsWith('.internal')){if(d.DATABASE_PUBLIC_URL){const exposed=new URL(d.DATABASE_PUBLIC_URL);url.hostname=exposed.hostname;url.port=exposed.port;}else{if(!d.RAILWAY_TCP_PROXY_DOMAIN||!d.RAILWAY_TCP_PROXY_PORT)throw Error('NO_APPROVED_TCP_PROXY');url.hostname=d.RAILWAY_TCP_PROXY_DOMAIN;url.port=d.RAILWAY_TCP_PROXY_PORT;}}
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:v.PROD_DB_USERNAME,PGPASSWORD:v.PROD_DB_PASSWORD,PGCONNECT_TIMEOUT:'20',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000',PGAPPNAME:'study-prod-readonly-preflight'};
 stage='AUDIT';
 const sql="BEGIN READ ONLY; SELECT json_build_object('history',(select json_agg(row_to_json(h)) from(select version,description,checksum,success from flyway_schema_history where version::integer>=100 order by installed_rank)h),'studyTables',(select coalesce(json_agg(tablename),'[]'::json) from pg_tables where schemaname='public' and tablename like 'study_%'),'tableCounts',(select json_object_agg(relname,n_live_tup) from pg_stat_user_tables where schemaname='public')); ROLLBACK;";
 const raw=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:45000});
 const audit=JSON.parse(raw.trim());audit.observedAt=new Date().toISOString();audit.environment='PROD';audit.profileAndStorageFenceVerified=true;audit.variableNames=Object.keys(v).filter(k=>/^STUDY_|^SPRING_FLYWAY_OUT_OF_ORDER$/.test(k));
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/PROD_PREFLIGHT.json',JSON.stringify(audit,null,2));
 console.log(JSON.stringify({audit:'PASS',history:audit.history,studyTables:audit.studyTables,profileAndStorageFenceVerified:true,variableNames:audit.variableNames}));
 stage='BACKUP_STATUS';
 const b=variables(backup);if(b.BACKUP_ENVIRONMENT!=='prod'||b.DATA_S3_BUCKET!==v.SHARED_DESK_STORAGE_BUCKET||b.DATA_S3_BUCKET===b.BACKUP_S3_BUCKET)throw Error('BACKUP_ISOLATION');
 const bu=new URL(b.BACKUP_DATABASE_URL);bu.hostname=url.hostname;bu.port=url.port;b.BACKUP_DATABASE_URL=bu.toString();
 const child=spawnSync(python,['ops/shared-desk-backup/runner.py','status'],{env:{...process.env,...b},encoding:'utf8',windowsHide:true,timeout:120000,stdio:['ignore','pipe','pipe']});
 if(child.status!==0)throw Error('BACKUP_STATUS');const status=JSON.parse(child.stdout.trim());
 await fs.writeFile(output+'/PROD_BACKUP_PREFLIGHT.json',JSON.stringify({observedAt:new Date().toISOString(),sourceBucketMatchesApi:true,separatePrivateBackupBucket:true,...status},null,2));console.log(JSON.stringify({backup:status}));
}catch(error){console.error('STUDY_PROD_PREFLIGHT_FAILED:'+stage+':'+(error.code??error.name)+':raw_details_withheld');process.exitCode=1;}

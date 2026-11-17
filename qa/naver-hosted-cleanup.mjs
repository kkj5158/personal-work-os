// Only this run's disposable identities. Never a broad owner/data cleanup.
import {execFileSync} from 'node:child_process';
const[runId,...owners]=process.argv.slice(2),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
try{
 if(!uuid.test(runId)||owners.length<1||owners.length>2||owners.some(o=>!uuid.test(o))||process.env.RAILWAY_ENVIRONMENT_ID!=='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'||process.env.RAILWAY_SERVICE_ID!=='eba7d263-7dc3-448a-a6b8-c2994721b597'||process.env.SPRING_PROFILES_ACTIVE!=='hosted-dev')throw Error('DEV_FENCE');
 const url=new URL(process.env.DEV_DB_URL.replace(/^jdbc:/,''));if(!url.hostname.endsWith('.railway.internal'))throw Error('DB_FENCE');
 const d=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command','railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service 0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9 --json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));if(d.DATABASE_PUBLIC_URL){const proxy=new URL(d.DATABASE_PUBLIC_URL);url.hostname=proxy.hostname;url.port=proxy.port;}else{if(!d.RAILWAY_TCP_PROXY_DOMAIN||!d.RAILWAY_TCP_PROXY_PORT)throw Error('PROXY_MISSING');url.hostname=d.RAILWAY_TCP_PROXY_DOMAIN;url.port=d.RAILWAY_TCP_PROXY_PORT;}
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:process.env.DEV_DB_USERNAME,PGPASSWORD:process.env.DEV_DB_PASSWORD,PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=10000'};
 const query=sql=>execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-tA','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 const guards=owners.map(o=>`IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${o}'::uuid AND email LIKE 'naver-qa-${runId}-%@example.invalid' AND raw_user_meta_data->>'qaRunId'='${runId}') THEN RAISE EXCEPTION 'IDENTITY_FENCE'; END IF; IF EXISTS(SELECT 1 FROM naver_archive_posts WHERE owner_id='${o}'::uuid AND title NOT LIKE 'SYNTHETIC ${runId}%') THEN RAISE EXCEPTION 'TITLE_FENCE'; END IF;`).join(' '),ids=owners.map(o=>`'${o}'::uuid`).join(',');
 const tables=['naver_archive_assets','naver_archive_revisions','naver_archive_operations','naver_archive_read_progress','naver_archive_import_items','naver_archive_import_batches','naver_archive_posts','naver_archive_workspaces'];
 query('BEGIN; DO $$ BEGIN '+guards+' END $$; '+tables.map(t=>`DELETE FROM ${t} WHERE owner_id IN (${ids});`).join(' ')+' COMMIT;');
 for(const table of tables)if(query(`SELECT count(*) FROM ${table} WHERE owner_id IN (${ids})`)!=='0')throw Error('CLEANUP_COUNT');
 console.log(JSON.stringify({status:'SYNTHETIC_NAVER_CLEANUP_PASS',runId,identities:owners.length,tables:tables.length,remaining:0}));
}catch{console.error('SYNTHETIC_NAVER_CLEANUP_FAILED_NO_SECRET_OUTPUT');process.exitCode=1;}

// Only this run's disposable identities. Never a broad owner/data cleanup.
import {execFileSync} from 'node:child_process';
const[scope,runId,...owners]=process.argv.slice(2),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ids={DEV:{env:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',db:'0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9',profile:'hosted-dev'},PROD:{env:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19',db:'e0b42e61-9207-4225-83ee-c516edc75202',profile:'prod'}}[scope];
try{
 if(!ids||!uuid.test(runId)||owners.length<1||owners.length>2||owners.some(o=>!uuid.test(o))||process.env.RAILWAY_ENVIRONMENT_ID!==ids.env||process.env.RAILWAY_SERVICE_ID!==ids.api||process.env.SPRING_PROFILES_ACTIVE!==ids.profile)throw Error('DEV_FENCE');
 const url=new URL(process.env[scope+'_DB_URL'].replace(/^jdbc:/,''));if(!url.hostname.endsWith('.railway.internal'))throw Error('DB_FENCE');
 const d=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command','railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment '+ids.env+' --service '+ids.db+' --json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));if(d.DATABASE_PUBLIC_URL){const proxy=new URL(d.DATABASE_PUBLIC_URL);url.hostname=proxy.hostname;url.port=proxy.port;}else{if(!d.RAILWAY_TCP_PROXY_DOMAIN||!d.RAILWAY_TCP_PROXY_PORT)throw Error('PROXY_MISSING');url.hostname=d.RAILWAY_TCP_PROXY_DOMAIN;url.port=d.RAILWAY_TCP_PROXY_PORT;}
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:process.env[scope+'_DB_USERNAME'],PGPASSWORD:process.env[scope+'_DB_PASSWORD'],PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=10000'};
 // UTF-8 stdin avoids Windows ANSI argv conversion of the Korean queue fence.
 const query=sql=>execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-tA','-v','ON_ERROR_STOP=1','-f','-'],{env,input:sql,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
 const guards=owners.map(o=>`IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${o}'::uuid AND email LIKE 'naver-qa-${runId}-%@example.invalid' AND raw_user_meta_data->>'qaRunId'='${runId}') THEN RAISE EXCEPTION 'IDENTITY_FENCE'; END IF; IF EXISTS(SELECT 1 FROM naver_archive_posts WHERE owner_id='${o}'::uuid AND title NOT LIKE 'SYNTHETIC ${runId}%') THEN RAISE EXCEPTION 'TITLE_FENCE'; END IF;`).join(' '),ownerSql=owners.map(o=>`'${o}'::uuid`).join(',');
 const tables=['naver_archive_assets','naver_archive_revisions','naver_archive_operations','naver_archive_read_progress','naver_archive_import_items','naver_archive_import_batches','naver_archive_posts','naver_archive_workspaces'];
 // Reading an empty WORK QUEUE initializes exactly its default lanes/queue.
 // Fence that known fixture state; never remove items or credentials here.
 const queueFence=`IF EXISTS(SELECT 1 FROM attention_items WHERE user_id IN (${ownerSql})) OR EXISTS(SELECT 1 FROM attention_credentials WHERE user_id IN (${ownerSql})) OR EXISTS(SELECT 1 FROM attention_lanes WHERE user_id IN (${ownerSql}) AND name NOT IN ('지금 볼 것','구현 확인','나중에 확인')) THEN RAISE EXCEPTION 'SYNTHETIC_QUEUE_FENCE'; END IF;`;
 query('BEGIN; DO $$ BEGIN '+guards+queueFence+' END $$; '+tables.map(t=>`DELETE FROM ${t} WHERE owner_id IN (${ownerSql});`).join(' ')+` DELETE FROM attention_lanes WHERE user_id IN (${ownerSql}); DELETE FROM attention_queues WHERE user_id IN (${ownerSql}); COMMIT;`);
 for(const table of tables)if(query(`SELECT count(*) FROM ${table} WHERE owner_id IN (${ownerSql})`)!=='0')throw Error('CLEANUP_COUNT');
 for(const table of ['attention_lanes','attention_queues'])if(query(`SELECT count(*) FROM ${table} WHERE user_id IN (${ownerSql})`)!=='0')throw Error('QUEUE_CLEANUP_COUNT');
 console.log(JSON.stringify({status:'SYNTHETIC_NAVER_CLEANUP_PASS',runId,identities:owners.length,tables:tables.length,remaining:0}));
}catch{console.error('SYNTHETIC_NAVER_CLEANUP_FAILED_NO_SECRET_OUTPUT');process.exitCode=1;}

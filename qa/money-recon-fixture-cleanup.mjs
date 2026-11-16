// Exact disposable DEV owner only. Run via official Railway CLI backend environment injection.
import {execFileSync} from 'node:child_process';
const [owner,runId]=process.argv.slice(2),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
try{
 if(!uuid.test(owner)||!uuid.test(runId)||!process.env.SPRING_PROFILES_ACTIVE?.includes('hosted-dev'))throw Error('FENCE');
 const url=new URL(process.env.DEV_DB_URL.slice(5));if(!url.hostname.endsWith('.railway.internal'))throw Error('FENCE');
 // Existing verified public proxy of this exact DEV database. No new network interface is created.
 url.hostname='sakura.proxy.rlwy.net';url.port='20671';
 const tables=['money_reconciliation_plans','money_reconciliation_runs','money_statement_effects','money_statement_rows','money_bank_statements','money_statement_chunks','money_statement_uploads','money_ai_events','money_command_outcomes','money_meaning_audit','money_classification_jobs','money_classification_state','money_classification_events','money_review_decisions','money_rule_projections','money_bookkeeping_overrides','money_category_rules','money_transaction_sources','money_transactions','money_tracking_accounts','money_tracking_settings','money_accounts','money_categories'];
 const fence=`id='${owner}'::uuid and email='orbit-money-qa-${runId}@example.invalid' and raw_user_meta_data->>'qaRunId'='${runId}'`;
 const sql=`BEGIN; DO $$ BEGIN IF NOT EXISTS(select 1 from auth.users where ${fence}) THEN RAISE EXCEPTION 'SYNTHETIC_IDENTITY_FENCE'; END IF; END $$; ${tables.map(t=>`DELETE FROM ${t} WHERE user_id='${owner}'::uuid;`).join('\n')} DELETE FROM auth.users WHERE ${fence}; COMMIT; SELECT count(*) FROM auth.users WHERE id='${owner}'::uuid;`;
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:process.env.DEV_DB_USERNAME,PGPASSWORD:process.env.DEV_DB_PASSWORD,PGCONNECT_TIMEOUT:'15'};
 const out=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});if(!out.trim().endsWith('0'))throw Error('CLEANUP');console.log('SYNTHETIC_MONEY_CLEANUP_PASS');
}catch{console.log('SYNTHETIC_MONEY_CLEANUP_FAIL');process.exitCode=1;}

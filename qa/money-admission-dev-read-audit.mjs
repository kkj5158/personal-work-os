// DEV-only read audit; no raw notification, owner/account identity or credentials in output.
import fs from 'node:fs/promises';
import {vars,query} from '../scripts/pos-db-migration/db.mjs';
const config=vars('DEV'),url=new URL(config.DEV_DB_URL.replace(/^jdbc:/,'')),owner=config.APP_DEV_USER_ID;
if(!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pos_dev_final'||!/^[-a-f0-9]{36}$/i.test(owner??''))throw Error('ACTIVE_DEV_OWNER_DATABASE_REQUIRED');
process.env.POS_DESTINATION_DATABASE='pos_dev_final';
let rows;try{rows=await query('DEV','destination',`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30000';
SELECT json_build_object('kind','identity','database',current_database(),'readOnly',current_setting('transaction_read_only'),'existingOwnerPresent',EXISTS(SELECT 1 FROM auth.users WHERE id='${owner}'));
SELECT json_build_object('kind','integrity','rawLinkedToMultipleFacts',(SELECT count(*) FROM (SELECT raw_event_id FROM money_transaction_sources WHERE user_id='${owner}' GROUP BY raw_event_id HAVING count(DISTINCT transaction_id)>1) x),
 'missingOrCrossOwnerSourceFact',(SELECT count(*) FROM money_transaction_sources s LEFT JOIN money_transactions t ON t.id=s.transaction_id AND t.user_id=s.user_id LEFT JOIN money_raw_notifications r ON r.id=s.raw_event_id AND r.user_id=s.user_id WHERE s.user_id='${owner}' AND (t.id IS NULL OR r.id IS NULL)),
 'crossOwnerCanonicalAccount',(SELECT count(*) FROM money_transactions t LEFT JOIN money_accounts a ON a.id=t.from_account_id AND a.user_id=t.user_id LEFT JOIN money_accounts b ON b.id=t.to_account_id AND b.user_id=t.user_id WHERE t.user_id='${owner}' AND ((t.from_account_id IS NOT NULL AND a.id IS NULL) OR (t.to_account_id IS NOT NULL AND b.id IS NULL))));
WITH timing AS (SELECT DISTINCT r.id,extract(epoch FROM (t.created_at-r.received_at))*1000 AS ms FROM money_raw_notifications r JOIN money_transaction_sources s ON s.user_id=r.user_id AND s.raw_event_id=r.id JOIN money_transactions t ON t.id=s.transaction_id AND t.user_id=s.user_id WHERE r.user_id='${owner}' AND r.received_at>='2026-10-14T05:00:03.770Z'::timestamptz AND t.created_at>=r.received_at)
SELECT json_build_object('kind','deployedSourceTiming','samples',count(*),'storedTransactionStartLagAverageMs',avg(ms),'storedTransactionStartLagP50Ms',percentile_cont(0.5) WITHIN GROUP(ORDER BY ms),'storedTransactionStartLagP95Ms',percentile_cont(0.95) WITHIN GROUP(ORDER BY ms),'storedTransactionStartLagMaxMs',max(ms),'storedTransactionStartLagOver10s',count(*) FILTER(WHERE ms>10000)) FROM timing;
SELECT json_build_object('kind','flyway','entries',count(*),'failed',count(*) FILTER(WHERE NOT success),'latestVersion',max(version::int)) FROM flyway_schema_history;
ROLLBACK;`);}catch{throw Error('READ_ONLY_DEV_AUDIT_FAILED_OUTPUT_WITHHELD');}
const result={observedAt:new Date().toISOString(),scope:'Configured existing DEV owner; read only, no fixtures created',timingBoundary:'DB received_at to canonical created_at; created_at is PostgreSQL transaction-start time, NOT decision, commit acknowledgement or UI visibility; no HTTP/Android measurement',rows};
await fs.mkdir('.qa/acceptance',{recursive:true});await fs.writeFile('.qa/acceptance/dev-read-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

// Exact-ID cleanup of records created by the authenticated Calendar DEV scenario.
// No financial ledger tables are writable by this command.
import fs from 'node:fs/promises';
import {vars,query} from '../scripts/pos-db-migration/db.mjs';
const mode=process.argv[2];if(!['inspect','cleanup'].includes(mode))throw Error('INSPECT_OR_CLEANUP_REQUIRED');
const dir='F:/artifacts/money-calendar-web-v1-20261015';
const manifest=JSON.parse(await fs.readFile(dir+'/DEV_FIXTURE_MANIFEST.json','utf8'));
if(manifest.scope!=='DEV'||!/^[A-Z0-9_]+$/.test(manifest.run)||Object.values(manifest.baseline).some(n=>n!==0))throw Error('OWNED_EMPTY_BASELINE_REQUIRED');
if(mode==='cleanup'&&manifest.preserveDuringPriorityHotfix)throw Error('PRIORITY_HOTFIX_PRESERVE_FIXTURES');
const uuid=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error('UUID_REQUIRED');return "'"+value+"'";};
const version=value=>{if(!Number.isSafeInteger(value)||value<1)throw Error('EXPECTED_VERSION_REQUIRED');return value;};
const sqlText=value=>"'"+String(value).replaceAll("'","''")+"'";
const config=vars('DEV'),url=new URL(config.DEV_DB_URL.replace(/^jdbc:/,''));
if(!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pos_dev_final')throw Error('ACTIVE_DEV_RAILWAY_DATABASE_REQUIRED');
process.env.POS_DESTINATION_DATABASE='pos_dev_final';const owner=uuid(config.APP_DEV_USER_ID);
const workIds=manifest.work.map(row=>uuid(row.id)).join(','),templateIds=manifest.templates.map(row=>uuid(row.id)).join(','),weekIds=manifest.weeks.map(row=>uuid(row.id)).join(','),paymentIds=manifest.payments.map(uuid).join(',');
if(!workIds||!templateIds||!weekIds||!paymentIds)throw Error('EXPLICIT_NONEMPTY_FIXTURE_IDS_REQUIRED');
const checks=[];
for(const row of manifest.work){if(!row.memo.startsWith(manifest.run))throw Error('FIXTURE_MEMO_REQUIRED');checks.push(`IF NOT EXISTS(SELECT 1 FROM money_coupang_work_records WHERE user_id=${owner} AND id=${uuid(row.id)} AND version=${version(row.version)} AND data->>'memo'=${sqlText(row.memo)}) THEN RAISE EXCEPTION 'Owned work missing or changed; preserve'; END IF;`);}
for(const row of manifest.templates)checks.push(`IF NOT EXISTS(SELECT 1 FROM money_work_templates WHERE user_id=${owner} AND id=${uuid(row.id)} AND version=${version(row.version)} AND starts_with(data->>'name',${sqlText(manifest.run)})) THEN RAISE EXCEPTION 'Owned template missing or changed; preserve'; END IF;`);
for(const row of manifest.weeks)checks.push(`IF NOT EXISTS(SELECT 1 FROM money_work_weeks WHERE user_id=${owner} AND id=${uuid(row.id)} AND version=${version(row.version)}) THEN RAISE EXCEPTION 'Owned week missing or changed; preserve'; END IF;`);
checks.push(`IF EXISTS(SELECT 1 FROM money_coupang_work_records WHERE user_id=${owner} AND id NOT IN (${workIds}) AND data->>'templateId' IN (${manifest.templates.map(row=>sqlText(row.id)).join(',')})) THEN RAISE EXCEPTION 'Another work record uses the template; preserve'; END IF;`);
checks.push(`IF (SELECT count(*) FROM money_work_payments WHERE user_id=${owner} AND work_record_id IN (${workIds}))<>${manifest.payments.length} OR (SELECT count(*) FROM money_work_payments WHERE user_id=${owner} AND work_record_id IN (${workIds}) AND id IN (${paymentIds}))<>${manifest.payments.length} THEN RAISE EXCEPTION 'Payment list changed; preserve'; END IF;`);
const inspection=`SELECT json_build_object('table','work','id',id,'version',version) FROM money_coupang_work_records WHERE user_id=${owner} AND id IN (${workIds}); SELECT json_build_object('table','template','id',id,'version',version) FROM money_work_templates WHERE user_id=${owner} AND id IN (${templateIds}); SELECT json_build_object('table','week','id',id,'version',version) FROM money_work_weeks WHERE user_id=${owner} AND id IN (${weekIds});`;
const mutation=`SELECT pg_advisory_xact_lock(hashtextextended('money-calendar:'||${owner}::text,0));
DO $$ BEGIN ${checks.join('\n')} END $$;
DELETE FROM money_work_payments WHERE user_id=${owner} AND id IN (${paymentIds}) RETURNING json_build_object('deleted','payment','id',id);
DELETE FROM money_coupang_work_records WHERE user_id=${owner} AND id IN (${workIds}) RETURNING json_build_object('deleted','work','id',id);
DELETE FROM money_work_weeks WHERE user_id=${owner} AND id IN (${weekIds}) RETURNING json_build_object('deleted','week','id',id);
DELETE FROM money_work_templates WHERE user_id=${owner} AND id IN (${templateIds}) RETURNING json_build_object('deleted','template','id',id);`;
const rows=await query('DEV','destination',`${mode==='cleanup'?'BEGIN;':'BEGIN READ ONLY;'} SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30000'; ${mode==='cleanup'?mutation:inspection} ${mode==='cleanup'?'COMMIT;':'ROLLBACK;'}`);
const report={mode,scope:'DEV',run:manifest.run,observedAt:new Date().toISOString(),financialLedgerWrites:0,status:mode==='cleanup'?'EXACT_OWNED_FIXTURE_CLEANUP_COMMITTED':'READ_ONLY_INSPECTION',rows};
await fs.writeFile(dir+'/dev-fixture-'+mode+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

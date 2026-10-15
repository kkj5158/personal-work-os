// Exact owned DEV fixture cleanup, after normal authenticated UI acceptance.
import fs from 'node:fs/promises';
import {vars,query} from '../scripts/pos-db-migration/db.mjs';
const mode=process.argv[2];if(!['inspect','cleanup'].includes(mode))throw Error('MODE_REQUIRED');
const dir=process.env.CALENDAR_EVIDENCE_DIR;
if(!dir?.startsWith('F:/artifacts/money-coupang-hotfix-001-004-20261015'))throw Error('TASK_ARTIFACT_DIRECTORY_REQUIRED');
const manifest=JSON.parse(await fs.readFile(dir+'/DEV_FIXTURE_MANIFEST.json','utf8'));
if(manifest.scope!=='DEV'||manifest.run!=='COUPANG_HOTFIX_QA_20261015')throw Error('OWN_TASK_MANIFEST_REQUIRED');
const config=vars('DEV'),url=new URL(config.DEV_DB_URL.replace(/^jdbc:/,''));
if(!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pos_dev_final')throw Error('ACTIVE_DEV_REQUIRED');
process.env.POS_DESTINATION_DATABASE='pos_dev_final';
const uuid=v=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw Error('UUID_REQUIRED');return "'"+v+"'";};
const text=v=>"'"+String(v).replaceAll("'","''")+"'";
const owner=uuid(config.APP_DEV_USER_ID),checks=[],inspect=[],deletes=[];
for(const [key,table,label]of [['work','money_coupang_work_records','memo'],['weeks','money_work_weeks',null],['payWeeks','money_work_pay_weeks',null],['templates','money_work_templates','name']]){
 const rows=manifest[key];if(!Array.isArray(rows)||!rows.length)throw Error('EXPLICIT_OWNED_IDS_REQUIRED:'+key);
 const ids=rows.map(r=>uuid(r.id)).join(',');
 for(const row of rows){if(!Number.isSafeInteger(row.version)||row.version<1)throw Error('VERSION_REQUIRED');if(label&&!String(row[label]).startsWith(manifest.run))throw Error('TASK_MARK_REQUIRED');checks.push(`IF NOT EXISTS(SELECT 1 FROM ${table} WHERE user_id=${owner} AND id=${uuid(row.id)} AND version=${row.version}${label?` AND data->>${text(label)}=${text(row[label])}`:''}) THEN RAISE EXCEPTION 'Owned fixture changed; preserve'; END IF;`);}
 inspect.push(`SELECT json_build_object('table','${table}','id',id,'version',version) FROM ${table} WHERE user_id=${owner} AND id IN (${ids});`);
 deletes.push(`DELETE FROM ${table} WHERE user_id=${owner} AND id IN (${ids}) RETURNING json_build_object('deleted','${table}','id',id);`);
}
const workIds=manifest.work.map(r=>uuid(r.id)).join(','),paymentIds=manifest.payments.map(uuid).join(',');
if(!paymentIds)throw Error('OWNED_PAYMENTS_REQUIRED');
checks.push(`IF (SELECT count(*) FROM money_work_payments WHERE user_id=${owner} AND work_record_id IN (${workIds}))<>${manifest.payments.length} OR (SELECT count(*) FROM money_work_payments WHERE user_id=${owner} AND id IN (${paymentIds}) AND work_record_id IN (${workIds}))<>${manifest.payments.length} THEN RAISE EXCEPTION 'Owned payment list changed; preserve'; END IF;`);
checks.push(`IF EXISTS(SELECT 1 FROM money_coupang_work_records WHERE user_id=${owner} AND id NOT IN (${workIds}) AND data->>'templateId' IN (${manifest.templates.map(r=>text(r.id)).join(',')})) THEN RAISE EXCEPTION 'Another work uses owned template; preserve'; END IF;`);
const mutation=`SELECT pg_advisory_xact_lock(hashtextextended('money-calendar:'||${owner}::text,0)); DO $$ BEGIN ${checks.join('\n')} END $$; DELETE FROM money_work_payments WHERE user_id=${owner} AND id IN (${paymentIds}) RETURNING json_build_object('deleted','money_work_payments','id',id); ${deletes.join('\n')}`;
const rows=await query('DEV','destination',`${mode==='cleanup'?'BEGIN;':'BEGIN READ ONLY;'} SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30000'; ${mode==='cleanup'?mutation:inspect.join('\n')} ${mode==='cleanup'?'COMMIT;':'ROLLBACK;'}`);
const report={mode,scope:'DEV',run:manifest.run,observedAt:new Date().toISOString(),financialLedgerWrites:0,status:mode==='cleanup'?'EXACT_OWNED_FIXTURE_CLEANUP_COMMITTED':'READ_ONLY_INSPECTION',rows};
await fs.writeFile(dir+'/dev-fixture-'+mode+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

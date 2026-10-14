// DEV read-only preservation receipt. No row payload, account IDs or credentials are emitted.
import fs from 'node:fs/promises';
import path from 'node:path';
import {vars,query} from '../scripts/pos-db-migration/db.mjs';
const root=process.cwd(),dir=path.join(root,'.qa/admission-release');await fs.mkdir(dir,{recursive:true});
const phase=process.argv[2];if(!['before','after'].includes(phase))throw Error('Use before or after');
const config=vars('DEV'),url=new URL(config.DEV_DB_URL.replace(/^jdbc:/,''));
if(!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pos_dev_final')throw Error('ACTIVE_DEV_RAILWAY_DATABASE_REQUIRED');
process.env.POS_DESTINATION_DATABASE=url.pathname.slice(1);
const owner=config.APP_DEV_USER_ID;if(!/^[a-f0-9-]{36}$/i.test(owner??''))throw Error('CONFIGURED_DEV_OWNER_REQUIRED');
const before=phase==='after'?JSON.parse(await fs.readFile(path.join(dir,'before.json'),'utf8')):null;
const cutoff=before?.cutoff??new Date().toISOString();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutoff))throw Error('RECEIPT_CUTOFF_REQUIRED');
const tables=['money_transactions','money_accounts','money_loans','money_categories','money_bookkeeping_overrides','money_classification_state','money_classification_events','money_registration_events'];
const existing=await query('DEV','destination',"BEGIN READ ONLY; SELECT json_build_object('name',table_name,'columns',json_agg(column_name)) FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'money_%' GROUP BY table_name; ROLLBACK;");
const names=new Set(existing.map(r=>r.name));
// The creation cutoff compares established records, excluding valid new traffic during deployment.
const checks=tables.filter(t=>names.has(t)&&t!=='money_classification_state').map(table=>{
 const columns=existing.find(r=>r.name===table).columns;
 const clock=columns.includes('created_at')?'created_at':columns.includes('updated_at')?'updated_at':null;
 // Dictionaries without timestamps are compared in full; new owner edits must be explained.
 return `SELECT json_build_object('table','${table}','count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),''))) FROM public.${table} t WHERE t.user_id='${owner}' ${clock?`AND t.${clock}<='${cutoff}'::timestamptz`:''};`;
});
checks.push(`SELECT json_build_object('table','money_classification_state','count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY to_jsonb(s)::text),''))) FROM public.money_classification_state s JOIN public.money_transactions t ON t.user_id=s.user_id AND t.id=s.transaction_id WHERE s.user_id='${owner}' AND t.created_at<='${cutoff}'::timestamptz;`);
checks.push(`SELECT json_build_object('table','money_transaction_sources','count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY to_jsonb(s)::text),''))) FROM public.money_transaction_sources s JOIN public.money_raw_notifications r ON r.user_id=s.user_id AND r.id=s.raw_event_id JOIN public.money_transactions t ON t.user_id=s.user_id AND t.id=s.transaction_id WHERE s.user_id='${owner}' AND r.received_at<='${cutoff}'::timestamptz AND t.created_at<='${cutoff}'::timestamptz;`);
checks.push(`SELECT json_build_object('table','money_raw_immutable','count',count(*),'digest',md5(coalesce(string_agg(md5(jsonb_build_object('source',r.source_package,'posted',r.posted_at,'payload',r.raw_payload,'key',r.dedupe_key,'hash',r.content_hash,'received',r.received_at)::text),'' ORDER BY r.id),''))) FROM public.money_raw_notifications r WHERE r.user_id='${owner}' AND r.received_at<='${cutoff}'::timestamptz;`);
let rows;try{rows=await query('DEV','destination',`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30000'; SELECT json_build_object('table','owner_identity','count',count(*)) FROM auth.users WHERE id='${owner}'; ${checks.join('\n')} ROLLBACK;`);}catch{throw Error('READ_ONLY_PRESERVATION_QUERY_FAILED: connection closed; no runtime mutation');}
const receipt={phase,observedAt:new Date().toISOString(),cutoff,environment:'DEV',database:'pos_dev_final',readOnly:true,rows};
if(before){receipt.changed=rows.filter(row=>JSON.stringify(row)!==JSON.stringify(before.rows.find(r=>r.table===row.table))).map(row=>row.table);receipt.establishedRecordsUnchanged=receipt.changed.length===0;}
await fs.writeFile(path.join(dir,phase+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));

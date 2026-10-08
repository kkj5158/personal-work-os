// Read-only audit of only the disposable production nap owned by this smoke run.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {targets,sql} from 'file:///D:/DEV_SPACE/personal-work-os/.qa/prod-dev-refresh-20261002/common.mjs';
Object.assign(process.env,(await loadEnvironment(process.cwd())).values);
const smoke=JSON.parse(await fs.readFile('.qa/sleep-web-v1/hosted-prod.json','utf8'));
assert.equal(smoke.failures.length,0);assert.equal(smoke.disposableIds.length,1);
const id=smoke.disposableIds[0];assert.match(id,/^[0-9a-f-]{36}$/);
const target=(await targets()).PROD;
const row=JSON.parse(await sql(target,`select json_build_object(
 'facts',(select count(*) from sleep_naps where id='${id}'::uuid),
 'events',(select count(*) from sleep_nap_events where nap_id='${id}'::uuid),
 'tombstones',(select count(*) from sleep_nap_tombstones where nap_id='${id}'::uuid),
 'receipts',(select count(*) from sleep_receipts where receipt->>'resourceType'='NAP' and receipt->>'napId'='${id}'),
 'privateEndpointKeys',(select count(*) from sleep_receipts where receipt->>'resourceType'='NAP' and receipt->>'napId'='${id}' and ((request::text||receipt::text) ~ '"(startAt|endAt|startLocalDate|startTimezone|endTimezone|startOffsetMinutes|endOffsetMinutes|intervalMinutes|certainty|source|before|after)"' or request-'redactedRequestHash'<>'{}'::jsonb or coalesce(receipt->'nap','{}'::jsonb)-'id'-'revision'-'deleted'<>'{}'::jsonb))
 )`));
assert.deepEqual(row,{facts:0,events:0,tombstones:1,receipts:3,privateEndpointKeys:0});
const report={at:new Date().toISOString(),environment:'PROD',disposableNapId:id,counts:row,result:'PASS',queryMode:'read-only',genuineRowsTouched:false};
await fs.writeFile('.qa/sleep-web-v1/prod-cleanup-privacy.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

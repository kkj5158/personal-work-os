import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Explicit owned runtime only. Never loads workspace.xml, .env, shared credentials,
// browser profiles or a Playwright browser. The caller retains runtime ownership.
const root=await fs.realpath(process.cwd());
const runDir=process.env.QA_RUN_DIR&&await fs.realpath(process.env.QA_RUN_DIR);
assert.ok(runDir&&path.dirname(runDir)===path.join(root,'.qa','runs'),'Managed run directory required');
const url=new URL(process.env.QA_API_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.ok(Number(url.port)>=18080&&Number(url.port)<=18109);assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.pathname,'/');
assert.match(process.env.DEV_DB_URL??'',/^jdbc:postgresql:\/\/127\.0\.0\.1:5544[0-9]\/[A-Za-z0-9_]+(?:\?.*)?$/);
const manifest=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
assert.equal(manifest.dataBoundary,'OWNED_LOOPBACK_SYNTHETIC');
const classpath=(await fs.readFile(process.env.QA_CLASSPATH_FILE??path.join(runDir,'audit-classpath.txt'),'utf8')).trim();assert.ok(classpath);
const fixture=path.join(root,'qa/suites/money-review-simplification/ReviewSimplificationFixture.java');
const api=url.origin+'/api/money',timings=[],checks=[];
function inspect(action,...args) {
 const child=spawnSync('java',['-cp',classpath,fixture,action,...args],{cwd:path.join(root,'backend'),env:process.env,encoding:'utf8',timeout:60000});
 assert.equal(child.status,0,'Owned fixture '+action+' failed: '+child.stderr);
 const line=child.stdout.trim().split(/\r?\n/).at(-1);return JSON.parse(line);
}
async function call(route,method='GET',body) {
 const start=performance.now(),response=await fetch(api+route,{method,body:body===undefined?undefined:JSON.stringify(body),headers:body===undefined?{}:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000)});
 timings.push({route,method,status:response.status,elapsedMs:Math.round(performance.now()-start)});
 if(!response.ok())throw Error(method+' '+route+' failed '+response.status+' '+await response.text());
 return response.status===204?null:response.json();
}
async function preview(action,keys) {
 return call('/review/batches/preview','POST',{scope:'SELECTED',action,state:'PENDING',search:'',accountId:null,reason:null,items:keys.map(key=>({kind:'RAW',id:manifest.ids[key]}))});
}
async function execute(previewValue) {
 const command={previewId:previewValue.previewId,requestId:randomUUID()},outcome=await call('/review/batches/execute','POST',command);
 return {command,outcome};
}
function passed(name,details={}){checks.push({name,status:'PASS',...details});}
const evidence={dataBoundary:'OWNED_LOOPBACK_SYNTHETIC',startedAt:new Date().toISOString(),status:'RUNNING',checks,timings};
try {
 const before=inspect('snapshot');
 for(const key of ['blocked-owned','foreign']) {const value=await preview('MOVE_TO_BOOKKEEPING',[key]);assert.equal(value.eligibleCount,0);assert.equal(value.excludedCount,1);assert.ok(value.items[0].exclusionReason);passed(key+' move blocked',{reason:value.items[0].exclusionReason});}
 const protectedFact=await preview('NON_TRANSACTION',['api-move']);assert.equal(protectedFact.eligibleCount,0);passed('financial source cannot be silently dismissed');
 const move=await preview('MOVE_TO_BOOKKEEPING',['api-move','api-replay-move']);assert.equal(move.eligibleCount,2);
 const moved=await execute(move);assert.ok(moved.outcome.completed);assert.deepEqual(moved.outcome.items.map(row=>row.status),['SAVED','SAVED']);
 const replay=await call('/review/batches/execute','POST',moved.command);assert.deepEqual(replay,moved.outcome);assert.deepEqual(await call('/review/batches/outcomes/'+moved.command.requestId),moved.outcome);
 const afterMove=inspect('snapshot');
 for(const key of ['api-move','api-replay-move']) {const ledger=afterMove.ledger.filter(row=>row.raw_event_id===manifest.ids[key]);assert.equal(ledger.length,1);assert.equal(ledger[0].currency,'KRW');assert.equal(ledger[0].category_id,null);assert.equal(ledger[0].type,'EXPENSE');assert.equal(ledger[0].from_account_id,manifest.ids.account);assert.ok(Number(ledger[0].amount)>0);}
 passed('Bookkeeping move registers each raw exactly once as uncategorized KRW; request replay/outcome is stable');
 const partial=await preview('NON_TRANSACTION',['api-partial-a','api-partial-b']);assert.equal(partial.eligibleCount,2);inspect('bump',manifest.ids['api-partial-b']);
 const result=await execute(partial);assert.ok(result.outcome.completed);assert.deepEqual(result.outcome.items.map(row=>row.status),['SAVED','CONFLICT']);assert.deepEqual(await call('/review/batches/execute','POST',result.command),result.outcome);assert.deepEqual(await call('/review/batches/outcomes/'+result.command.requestId),result.outcome);
 const partialSnapshot=inspect('snapshot');assert.equal(partialSnapshot.rawEvidence.find(row=>row.id===manifest.ids['api-partial-b']).state,'REVIEW_REQUIRED');
 passed('stale bulk item produces documented partial success; failed row remains pending; replay does not resubmit');
 for(const [key,action] of [['api-defer','DEFER'],['api-nontransaction','NON_TRANSACTION']]) {
  const value=await preview(action,[key]);assert.equal(value.eligibleCount,1);const result=await execute(value),event=result.outcome.items[0];assert.equal(event.status,'SAVED');assert.ok(event.canUndo);assert.ok(event.eventId);
  const state=inspect('snapshot').rawEvidence.find(row=>row.id===manifest.ids[key]);
  if(action==='DEFER') {assert.equal(state.review_deferred,true);const tab=await call('/ai/workbench?state=DEFERRED&search='+encodeURIComponent(key)+'&limit=50&offset=0');assert.ok(tab.items.some(row=>row.id===manifest.ids[key]));}
  else assert.equal(state.state,'PROCESSED');
  await call('/ai/events/'+event.eventId+'/undo','POST',{});const restored=inspect('snapshot').rawEvidence.find(row=>row.id===manifest.ids[key]);assert.equal(restored.state,'REVIEW_REQUIRED');assert.equal(restored.review_deferred,false);
  passed(action+' uses existing evidence-preserving semantics and supported Undo');
 }
 const after=inspect('snapshot');
 const original=new Map(before.rawEvidence.map(row=>[row.id,row]));assert.equal(after.rawEvidence.length,before.rawEvidence.length);
 for(const row of after.rawEvidence) {assert.equal(row.payload_hash,original.get(row.id).payload_hash);assert.equal(row.text_hash,original.get(row.id).text_hash);}
 assert.equal(after.counts.money_parse_attempts,before.counts.money_parse_attempts);assert.equal(after.counts.money_transactions-before.counts.money_transactions,2);assert.equal(after.counts.money_transaction_sources-before.counts.money_transaction_sources,2);
 assert.equal(after.counts.money_ai_lookups,before.counts.money_ai_lookups);assert.equal(after.counts.money_recommendation_usage,before.counts.money_recommendation_usage);
 passed('original notification evidence and parse count preserved; exactly two expected ledger/source additions; no external lookup/paid recommendation usage');
 evidence.before=before;evidence.after=after;evidence.status='PASS';
} catch(error) {evidence.status='FAIL';evidence.error=error.message;process.exitCode=1;}
finally {evidence.finishedAt=new Date().toISOString();await fs.writeFile(path.join(runDir,'review-api-probe.json'),JSON.stringify(evidence,null,2));}
console.log('Review API probe: '+evidence.status+'; '+checks.length+' checks; evidence '+path.join(runDir,'review-api-probe.json'));

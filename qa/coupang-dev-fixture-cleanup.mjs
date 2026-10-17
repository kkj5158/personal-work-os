// Exact Task 1 synthetic fixtures only. No credentials, broad deletes or PROD access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
let phase='session-preflight';
try {
const base = 'https://workflow-api-development-development.up.railway.app/api/money/calendar';
const templates = [
  ['e5d650fb-0dd9-4b21-a057-0b64ba1852e8', 'QA Coupang 20261017', 2],
  ['9fc35d3a-152f-4037-8161-ea90f76b361b', 'QA Coupang other 20261017', 1],
];
const work = [
  ['af60badc-3254-4edc-a05a-84e19f93baf0', '2026-10-14', 8],
  ['2007f2c5-fd80-4f80-be8f-abf766edaecd', '2026-10-15', 2],
  ['4a562239-e6b0-4244-ae74-b72d5954c42a', '2026-10-16', 1],
  ['eb7a2a34-f162-43c0-9407-962c0e79b91e', '2026-10-17', 1],
  ['6551f277-fe64-4e92-9287-16ddd142281e', '2026-10-18', 1],
  ['6330da53-c011-4fe4-819a-1a5e0f33bba5', '2026-10-19', 1],
];
const execute = process.argv.includes('--execute');
if (!process.env.COUPANG_DEV_ACCESS_TOKEN_FILE) throw Error('Provide COUPANG_DEV_ACCESS_TOKEN_FILE containing an authorized DEV access token; never paste it into logs.');
const token = (await fs.readFile(process.env.COUPANG_DEV_ACCESS_TOKEN_FILE, 'utf8')).trim();
const expectedOwner = process.env.COUPANG_DEV_EXPECTED_USER_ID;
assert.match(expectedOwner ?? '', /^[0-9a-f-]{36}$/i, 'Run through Invoke-CoupangDevSession.ps1 with a server-verified owner.');
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
assert.equal(claims.iss, 'https://pos-auth-dev-development.up.railway.app/auth/v1');
assert.equal(claims.sub, expectedOwner);
assert(claims.exp * 1000 > Date.now() + 60000, 'Reauthenticate before cleanup; never retry partially executed cleanup blindly.');
const results = [];
async function request(path, method='GET', body, expectedStatus=200) {
  phase=method+' '+path;
  let response;
  try { response = await fetch(base + path, {method, redirect:'error', signal:AbortSignal.timeout(30000), headers:{Authorization:'Bearer '+token, 'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body)}); }
  catch { throw Error(method+' '+path+' network failure; stop and review committed state before any retry.'); }
  assert.equal(response.status,expectedStatus,'Unexpected DEV response status; review before retry.');
  if(expectedStatus===409) return;
  return response.json();
}
// Validate every fixture BEFORE any mutation. Any newer edit blocks the entire plan.
const catalog = await Promise.all(templates.map(async ([id,name,version])=>{
  const row=await request('/templates/'+id); assert.equal(row.id,id); assert.equal(row.name,name); assert.equal(row.version,version); return row;
}));
const records = await Promise.all(work.map(async ([id,date,version])=>{
  const row=await request('/earnings-records/'+id); assert.equal(row.id,id); assert.equal(row.workDate,date); assert.equal(row.version,version);
  assert.equal(row.contractVersion,4); assert(!row.removed); assert(templates.some(([template])=>template===row.templateId));
  assert.equal(row.payments.length,0); return row;
}));
const week = await request('/earnings-weeks/2026-10-11');
assert.equal(week.version,1); assert.equal(week.specialWorkAllowance,10000); assert.equal(week.weeklyHolidayAllowance,15000);
console.log(JSON.stringify({mode:execute?'execute':'validated-dry-run',work:work.map(([id,date,version])=>({id,date,version})),templates:templates.map(([id,name,version])=>({id,name,version})),week:'2026-10-11'}));
if(execute){
  for(const row of records){
    const payload={contractVersion:4,expectedVersion:row.version,workDate:row.workDate,status:'OFF',templateId:null,presetId:null,reselectPreset:false,startTime:null,endTime:null,overnight:false,breakMinutes:0,durationMinutes:0,basePay:null,totalDeduction:null,confirmedDailyPay:0,dailyIncentive:0,receiptConfirmed:false,memo:'QA Coupang 20261017 cleanup; original synthetic facts retained in transition history'};
    const off=await request('/earnings-records/'+row.id,'PUT',payload);
    // Independent bearer client: replay the identical request with its original version.
    // Simulates a lost first response without changing fixtures beyond authorized cleanup.
    const replay=await request('/earnings-records/'+row.id,'PUT',payload);
    assert.deepEqual(replay,off,'Identical OFF retry must preserve canonical result and history.');
    assert.deepEqual(await request('/earnings-records/'+row.id),off,'Replay must not increment versions or duplicate history.');
    const archived=await request('/work-records/'+row.id+'/remove-off','POST',{expectedVersion:off.version});
    assert.equal(archived.removed,true);
    assert.deepEqual(archived.payments,row.payments,'Historical payments must remain unchanged.');
    // The archive is an intervening edit: the old OFF retry must now be rejected.
    await request('/earnings-records/'+row.id,'PUT',payload,409);
    assert.deepEqual(await request('/earnings-records/'+row.id),archived,'Stale retry must leave archive/history unchanged.');
    results.push({id:row.id,archived:true,version:archived.version,immediateReplay:'PASS',interveningEdit409:'PASS'});
  }
  // Keep exact fixture row identity; zero the synthetic allowance rather than delete it.
  const current=await request('/earnings-weeks/2026-10-11');
  assert.equal(current.version,week.version);
  await request('/earnings-weeks/2026-10-11','PUT',{expectedVersion:current.version,expectedDailyFingerprint:current.dailyFingerprint,specialWorkAllowance:0,weeklyHolidayAllowance:0});
  for(const template of catalog){const {id,version,...fields}=template; await request('/templates/'+id,'PUT',{...fields,expectedVersion:version,active:false});}
  console.log(JSON.stringify({status:'API_SOFT_CLEANUP_COMPLETE',results,independentBearerReplay:'PASS',physicalRowsDeleted:false,ledgerWrites:false}));
}
} catch (error) {
  // Never print assertion diffs, raw exceptions, full DTOs, headers or credentials.
  console.error(JSON.stringify({status:'STOPPED',phase,reason:error?.code==='ERR_ASSERTION'?'FIXTURE_GUARD_MISMATCH':'SESSION_OR_REQUEST_FAILURE',action:'Review canonical fixture state; no blind retry or version guard changes.'}));
  process.exitCode=1;
}

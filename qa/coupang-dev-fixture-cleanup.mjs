// Exact Task 1 synthetic fixtures only. No credentials, broad deletes or PROD access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const reviewed = process.argv.includes('--reviewed');
if (!process.env.COUPANG_DEV_ACCESS_TOKEN_FILE) throw Error('Provide COUPANG_DEV_ACCESS_TOKEN_FILE containing an authorized DEV access token; never paste it into logs.');
const token = (await fs.readFile(process.env.COUPANG_DEV_ACCESS_TOKEN_FILE, 'utf8')).trim();
const expectedOwner = process.env.COUPANG_DEV_EXPECTED_USER_ID;
assert.match(expectedOwner ?? '', /^[0-9a-f-]{36}$/i, 'Run through Invoke-CoupangDevSession.ps1 with a server-verified owner.');
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
assert.equal(claims.iss, 'https://pos-auth-dev-development.up.railway.app/auth/v1');
assert.equal(claims.sub, expectedOwner);
assert(claims.exp * 1000 > Date.now() + 60000, 'Reauthenticate before cleanup; never retry partially executed cleanup blindly.');
const results = [];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
let manifest;
if(reviewed){
  manifest=JSON.parse((await fs.readFile(new URL('./fixtures/coupang-cleanup-reviewed-20261017.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.environment,'DEV');assert.equal(manifest.authenticatedUserId,expectedOwner);
  assert.deepEqual(manifest.work.map(row=>[row.id,row.workDate]),work.map(([id,date])=>[id,date]));
  assert.deepEqual(manifest.templates.map(row=>[row.id,row.version]),templates.map(([id,,version])=>[id,version]));
  for(const [i,[id,,originalVersion]] of work.entries())assert.equal(manifest.work[i].version,id==='eb7a2a34-f162-43c0-9407-962c0e79b91e'?8:originalVersion);
  assert.equal(manifest.reconciliation.id,'eb7a2a34-f162-43c0-9407-962c0e79b91e');assert.equal(manifest.reconciliation.originalVersion,1);assert.equal(manifest.reconciliation.reviewedVersion,8);
  assert.equal(manifest.reconciliation.successfulQaMutations.length,7);
  for(const row of [...manifest.work,...manifest.templates])assert.match(row.canonicalSha256,/^[a-f0-9]{64}$/);
}
async function request(path, method='GET', body, expectedStatus=200) {
  phase=method+' '+path;
  let response;
  try { response = await fetch(base + path, {method, redirect:'error', signal:AbortSignal.timeout(30000), headers:{Authorization:'Bearer '+token, 'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body)}); }
  catch { throw Error(method+' '+path+' network failure; stop and review committed state before any retry.'); }
  if(response.status!==expectedStatus){const error=Error('Unexpected DEV response status');error.httpStatus=response.status;throw error;}
  if(expectedStatus===409) return;
  return response.json();
}
// Validate every fixture BEFORE any mutation. Any newer edit blocks the entire plan.
const catalog=[],records=[];
for(const [id] of templates) catalog.push(await request('/templates/'+id));
for(const [id] of work) records.push(await request('/earnings-records/'+id));
const week = await request('/earnings-weeks/2026-10-11');
// Restrict saved evidence to these exact QA rows; omit free text and payment contents.
const fields=['id','workDate','version','contractVersion','status','removed','templateId','presetId','selectedTemplateVersion','expectedAmount','confirmedDailyPay','dailyIncentive','basePay','totalDeduction','receiptConfirmed','receiptConfirmedAmount','startTime','endTime','durationMinutes','breakMinutes','overnight','wageModel','receiptConfirmation','expectedSnapshot','confirmed','amount','revision','workVersion'];
const project=row=>Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
const guards=[];
const guard=(id,field,actual,expected)=>{if(actual!==expected)guards.push({id,field,...(typeof actual==='number'||typeof actual==='boolean'||actual===null?{observed:actual}:{}),...(typeof expected==='number'||typeof expected==='boolean'||expected===null?{expected}:{} )});};
for(const [i,[id,name,version]] of templates.entries()){
  const row=catalog[i];guard(id,'id',row.id,id);guard(id,'name',row.name,name);guard(id,'version',row.version,version);
  if(reviewed)guard(id,'reviewedCanonicalSha256',digest(row),manifest.templates[i].canonicalSha256);
}
for(const [i,[id,date,version]] of work.entries()){
  const row=records[i];guard(id,'id',row.id,id);guard(id,'workDate',row.workDate,date);guard(id,'version',row.version,reviewed?manifest.work[i].version:version);
  if(reviewed)guard(id,'reviewedCanonicalSha256',digest(row),manifest.work[i].canonicalSha256);
  guard(id,'contractVersion',row.contractVersion,4);guard(id,'removed',Boolean(row.removed),false);
  guard(id,'ownedQaTemplate',templates.some(([template])=>template===row.templateId),true);
  guard(id,'paymentsCount',Array.isArray(row.payments)?row.payments.length:-1,0);
}
guard('2026-10-11','version',week.version,1);guard('2026-10-11','specialWorkAllowance',week.specialWorkAllowance,10000);guard('2026-10-11','weeklyHolidayAllowance',week.weeklyHolidayAllowance,15000);
if(reviewed){guard('2026-10-11','reviewedDailyFingerprint',week.dailyFingerprint,manifest.week.dailyFingerprint);assert.equal(manifest.week.start,'2026-10-11');}
const audit={environment:'DEV',authenticatedUserId:expectedOwner,readOnlyPreflight:true,observedUtc:new Date().toISOString(),guards,
  templates:catalog.map((row,i)=>({id:templates[i][0],version:row.version,active:row.active,canonicalSha256:digest(row),presetIds:row.presets?.map(p=>p.id)})),
  work:records.map((row,i)=>({allowlistedId:work[i][0],...project(row),paymentsCount:row.payments?.length,canonicalSha256:digest(row),memoSha256:digest(row.memo??null),
    histories:Object.fromEntries(['offTransitionHistory','earningsTransitionHistory','receiptConfirmationHistory'].map(key=>[key,{count:row[key]?.length??0,sha256:digest(row[key]??[]),entries:(row[key]??[]).map(project)}]))})),
  week:{start:'2026-10-11',version:week.version,specialWorkAllowance:week.specialWorkAllowance,weeklyHolidayAllowance:week.weeklyHolidayAllowance,dailyFingerprint:week.dailyFingerprint}};
const evidenceAt=process.argv.indexOf('--evidence');
if(evidenceAt!==-1) await fs.writeFile(process.argv[evidenceAt+1],JSON.stringify(audit,null,2));
if(guards.length){console.error(JSON.stringify({status:'FIXTURE_GUARD_MISMATCH',guards,readOnly:true}));phase='all-fixture-guards';assert.fail('Fixture preflight blocked');}
console.log(JSON.stringify({mode:execute?'execute':'validated-dry-run',manifest:reviewed?'reviewed-20261017':'original',work:work.map(([id,date,version],i)=>({id,date,version:reviewed?manifest.work[i].version:version})),templates:templates.map(([id,name,version])=>({id,name,version})),week:'2026-10-11'}));
if(execute){
  for(const row of records){
    const payload={contractVersion:4,expectedVersion:row.version,workDate:row.workDate,status:'OFF',templateId:null,presetId:null,reselectPreset:false,startTime:null,endTime:null,overnight:false,breakMinutes:0,durationMinutes:0,basePay:null,totalDeduction:null,confirmedDailyPay:0,dailyIncentive:0,receiptConfirmed:false,memo:'QA Coupang 20261017 cleanup; original synthetic facts retained in transition history'};
    const off=await request('/earnings-records/'+row.id,'PUT',payload);
    // Independent bearer client: replay the identical request with its original version.
    // Simulates a lost first response without changing fixtures beyond authorized cleanup.
    const replay=await request('/earnings-records/'+row.id,'PUT',payload);
    assert.deepEqual(replay,off,'Identical OFF retry must preserve canonical result and history.');
    assert.deepEqual(await request('/earnings-records/'+row.id),off,'Replay must not increment versions or duplicate history.');
    for(const history of ['offTransitionHistory','earningsTransitionHistory','receiptConfirmationHistory']){
      const before=row[history]??[];assert.equal(digest((off[history]??[]).slice(0,before.length)),digest(before),'Preexisting history must remain a prefix.');
    }
    const archived=await request('/work-records/'+row.id+'/remove-off','POST',{expectedVersion:off.version});
    assert.equal(archived.removed,true);
    assert.deepEqual(archived.payments,row.payments,'Historical payments must remain unchanged.');
    for(const history of ['offTransitionHistory','earningsTransitionHistory','receiptConfirmationHistory'])assert.equal(digest(archived[history]??[]),digest(off[history]??[]),'Archive must preserve history exactly.');
    // The archive is an intervening edit: the old OFF retry must now be rejected.
    await request('/earnings-records/'+row.id,'PUT',payload,409);
    const canonicalArchived=await request('/earnings-records/'+row.id);
    const {wageCompatibility:derivedCompatibility,...canonicalArchiveFields}=canonicalArchived;
    assert.equal(digest(canonicalArchiveFields),digest(archived),'Stale retry must leave archive/history unchanged.');
    results.push({id:row.id,archived:true,version:archived.version,immediateReplay:'PASS',interveningEdit409:'PASS'});
  }
  // Keep exact fixture row identity; zero the synthetic allowance rather than delete it.
  const current=await request('/earnings-weeks/2026-10-11');
  assert.equal(current.version,week.version);
  await request('/earnings-weeks/2026-10-11','PUT',{expectedVersion:current.version,expectedDailyFingerprint:current.dailyFingerprint,specialWorkAllowance:0,weeklyHolidayAllowance:0});
  const clearedWeek=await request('/earnings-weeks/2026-10-11');assert.equal(clearedWeek.version,current.version+1);assert.equal(clearedWeek.specialWorkAllowance,0);assert.equal(clearedWeek.weeklyHolidayAllowance,0);
  for(const template of catalog){const {id,version,...fields}=template;await request('/templates/'+id,'PUT',{...fields,expectedVersion:version,active:false});const saved=await request('/templates/'+id);assert.equal(saved.active,false);assert.equal(saved.version,version+1);assert.deepEqual(saved.presets,template.presets);}
  const result={status:'API_SOFT_CLEANUP_COMPLETE',results,independentBearerReplay:'PASS',interveningEdit409:'PASS',historyPreservation:'PASS',physicalRowsDeleted:false,ledgerWrites:false,weekVersion:clearedWeek.version};
  const resultAt=process.argv.indexOf('--result');if(resultAt!==-1)await fs.writeFile(process.argv[resultAt+1],JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
} catch (error) {
  // Never print assertion diffs, raw exceptions, full DTOs, headers or credentials.
  console.error(JSON.stringify({status:'STOPPED',phase,reason:error?.code==='ERR_ASSERTION'?'FIXTURE_GUARD_MISMATCH':'SESSION_OR_REQUEST_FAILURE',...(Number.isInteger(error?.httpStatus)?{httpStatus:error.httpStatus}:{}),action:'Review canonical fixture state; no blind retry or version guard changes.'}));
  process.exitCode=1;
}

// Exact Task 1 synthetic fixtures only. No credentials, broad deletes or PROD access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
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
const results = [];
async function request(path, method='GET', body) {
  const response = await fetch(base + path, {method, headers:{Authorization:'Bearer '+token, 'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok) throw Error(method+' '+path+' HTTP '+response.status+'; stop and review; do not blindly retry cleanup.');
  return response.json();
}
// Validate every fixture BEFORE any mutation. Any newer edit blocks the entire plan.
const catalog = await Promise.all(templates.map(async ([id,name,version])=>{
  const row=await request('/templates/'+id); assert.equal(row.name,name); assert.equal(row.version,version); return row;
}));
const records = await Promise.all(work.map(async ([id,date,version])=>{
  const row=await request('/earnings-records/'+id); assert.equal(row.workDate,date); assert.equal(row.version,version);
  assert.equal(row.contractVersion,4); assert(!row.removed); assert(templates.some(([template])=>template===row.templateId));
  assert.equal(row.payments.length,0); return row;
}));
const week = await request('/earnings-weeks/2026-10-11');
assert.equal(week.version,1); assert.equal(week.specialWorkAllowance,10000); assert.equal(week.weeklyHolidayAllowance,15000);
console.log(JSON.stringify({mode:execute?'execute':'validated-dry-run',work:work.map(([id,date,version])=>({id,date,version})),templates:templates.map(([id,name,version])=>({id,name,version})),week:'2026-10-11'}));
if(execute){
  for(const row of records){
    const off=await request('/earnings-records/'+row.id,'PUT',{contractVersion:4,expectedVersion:row.version,workDate:row.workDate,status:'OFF',templateId:null,presetId:null,reselectPreset:false,startTime:null,endTime:null,overnight:false,breakMinutes:0,durationMinutes:0,basePay:null,totalDeduction:null,confirmedDailyPay:0,dailyIncentive:0,receiptConfirmed:false,memo:'QA Coupang 20261017 cleanup; original synthetic facts retained in transition history'});
    const archived=await request('/work-records/'+row.id+'/remove-off','POST',{expectedVersion:off.version});
    assert.equal(archived.removed,true); results.push({id:row.id,archived:true,version:archived.version});
  }
  // Keep exact fixture row identity; zero the synthetic allowance rather than delete it.
  const current=await request('/earnings-weeks/2026-10-11');
  assert.equal(current.version,week.version);
  await request('/earnings-weeks/2026-10-11','PUT',{expectedVersion:current.version,expectedDailyFingerprint:current.dailyFingerprint,specialWorkAllowance:0,weeklyHolidayAllowance:0});
  for(const template of catalog){const {id,version,...fields}=template; await request('/templates/'+id,'PUT',{...fields,expectedVersion:version,active:false});}
  console.log(JSON.stringify({status:'API_SOFT_CLEANUP_COMPLETE',results,physicalRowsDeleted:false,ledgerWrites:false}));
}

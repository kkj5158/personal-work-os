// Fixed loopback target, disposable task cluster only. Never uses shared credentials/data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:13456/api/money/calendar';
const owner=JSON.parse(await fs.readFile('.qa/part-time-runtime.json','utf8'));
assert.equal(owner.ports.api,13456);assert.equal(owner.sharedDatabase,'NEVER_CONNECTED');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-date.getUTCDay());const sunday=date.toISOString().slice(0,10);
const id={a:randomUUID(),b:randomUUID(),pa:randomUUID(),pb:randomUUID(),ta:randomUUID(),ta2:randomUUID(),tb:randomUUID(),r1:randomUUID(),r2:randomUUID(),r3:randomUUID()};
const checks=[];
async function call(method,path,body,status=200){const r=await fetch(base+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,method+' '+path);return r.json();}
const get=path=>call('GET',path),put=(path,body,status)=>call('PUT',path,body,status);
const place=(v,name,preset,amount,active=true)=>({expectedVersion:v,name,active,presets:[{id:preset,name:'공유 일급',amount,active:true}]});
const template=(v,workplaceId,preset,name='QA 오전')=>({expectedVersion:v,workplaceId,name,durationMinutes:240,startTime:'09:00',endTime:'13:00',breakMinutes:0,overnight:false,shiftDescription:'오전',groupName:'QA',active:true,presets:[],defaultPresetId:preset});
const input=(v,templateId,presetId,pay,version=1,memo='합성 QA 근무')=>({expectedVersion:v,contractVersion:4,workDate:day,status:'COMPLETED',templateId,presetId,startTime:'09:00',endTime:'13:00',overnight:false,breakMinutes:0,durationMinutes:240,confirmedDailyPay:pay,dailyIncentive:2000,basePay:null,totalDeduction:null,selectedTemplateVersion:version,reselectPreset:false,receiptConfirmed:true,memo});
try {
 await put('/workplaces/'+id.a,place(0,'QA 카페',id.pa,65000));await put('/workplaces/'+id.b,place(0,'QA 매장',id.pb,70000));
 await put('/templates/'+id.ta,template(0,id.a,id.pa));await put('/templates/'+id.ta2,template(0,id.a,id.pa,'QA 오후'));await put('/templates/'+id.tb,template(0,id.b,id.pb,'QA 매장 근무'));checks.push('workplaces_shared_presets');
 const first=await put('/earnings-records/'+id.r1,input(0,id.ta,id.pa,38410));const second=await put('/earnings-records/'+id.r2,input(0,id.ta,id.pa,74560));await put('/earnings-records/'+id.r3,input(0,id.tb,id.pb,40000));
 assert.deepEqual(await put('/earnings-records/'+id.r2,input(0,id.ta,id.pa,74560)),second);checks.push('same_date_same_workplace_overlap_allowed_and_replay');
 const month=await get('/earnings-calendar?month='+day.slice(0,7));assert.equal(month.records.length,3);assert.equal(month.summary.workdays,1);assert.equal(month.summary.confirmedDailyPay,152970);assert.equal(month.summary.incentiveTotal,6000);checks.push('distinct_workdays_incentive_not_added');
 for(const [placeId,special,rest] of [[id.a,10000,15000],[id.b,3000,0]]){const path='/earnings-weeks/'+sunday+'?workplaceId='+placeId;const current=await get(path);await put(path,{expectedVersion:current.version,expectedDailyFingerprint:current.dailyFingerprint,specialWorkAllowance:special,weeklyHolidayAllowance:rest});}
 const week=await get('/earnings-weeks/'+sunday);assert.equal(week.finalPay,180970);assert.equal(week.workplaceBreakdowns.reduce((n,w)=>n+w.finalPay,0),week.finalPay);checks.push('weekly_sum_scoped_allowances');
 const filtered=await get('/earnings-calendar?month='+day.slice(0,7)+'&workplaceId='+id.b);assert.equal(filtered.records.length,1);assert.equal(filtered.allRecords.length,3);assert.equal(filtered.summary.confirmedDailyPay,40000);checks.push('workplace_filter_all_records_selector');
 await put('/earnings-records/'+id.r1,input(1,id.ta,id.pa,40000));assert.deepEqual(await get('/earnings-records/'+id.r2),second);await put('/earnings-records/'+id.r1,input(0,id.ta,id.pa,12345),409);checks.push('independent_edit_conflict_preserves_other_entry');
 const stored=await get('/earnings-records/'+id.r1);await put('/workplaces/'+id.a,place(1,'QA 카페 변경',id.pa,90000));assert.deepEqual(await get('/earnings-records/'+id.r1),stored);checks.push('catalog_change_preserves_saved_pay_and_receipts');
 await put('/workplaces/'+id.a,place(2,'QA 카페 변경',id.pa,90000,false));await put('/earnings-records/'+randomUUID(),input(0,id.ta,id.pa,12345,2),400);
 await put('/earnings-records/'+id.r1,input(2,id.ta,id.pa,40000,1,'보관 근무지 역사 편집'));await put('/workplaces/'+id.a,place(3,'QA 카페 변경',id.pa,90000,true));checks.push('archive_blocks_new_work_history_edit_and_restore');
 const catalog=await get('/templates/'+id.ta2);const moved=await put('/templates/'+id.ta2,template(catalog.version,id.b,id.pa,'QA 이동 템플릿'));assert.equal(moved.defaultPresetId,null);await put('/templates/'+id.ta2,template(moved.version,id.b,id.pa),400);checks.push('move_clears_cross_workplace_default');
 const currentA=await get('/templates/'+id.ta);await put('/templates/'+id.ta,{...template(currentA.version,id.a,id.pa),active:false});assert.equal((await get('/templates/'+id.ta)).active,false);const archived=await get('/templates/'+id.ta);await put('/templates/'+id.ta,template(archived.version,id.a,id.pa));checks.push('template_archive_restore');
 const off=await put('/earnings-records/'+randomUUID(),{expectedVersion:0,contractVersion:4,workDate:day,status:'OFF',templateId:null,presetId:null,startTime:null,endTime:null,overnight:false,breakMinutes:0,durationMinutes:0,confirmedDailyPay:0,dailyIncentive:0,basePay:null,totalDeduction:null,receiptConfirmed:false,memo:'합성 휴무 마커'});assert.equal(off.confirmedDailyPay,0);const final=await get('/earnings-calendar?month='+day.slice(0,7));assert.equal(final.summary.workdays,1);assert.equal(final.summary.confirmedDailyPay,154560);checks.push('rest_marker_does_not_count_as_paid_shift');
 const report={status:'PASS',environment:'OWNED_LOOPBACK_SYNTHETIC',day,checks,checkCount:checks.length,initialDailyTotal:152970,initialWeeklyTotal:180970,incentiveInformational:6000,credentialsStored:false,sharedDatabase:'NEVER_CONNECTED'};
 await fs.writeFile('docs/part-time-calendar/evidence/api-smoke.json',JSON.stringify(report,null,2));await fs.writeFile('.qa/part-time-fixture.json',JSON.stringify(id));console.log(JSON.stringify(report));
}catch(e){console.error('API_SMOKE_FAILED '+e.message);process.exitCode=1;}

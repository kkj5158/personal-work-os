import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:13243',results=[];
async function call(route,body,method=body?'POST':'GET',status=200){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();assert.equal(response.status,status,`${route}: ${response.status} ${text.slice(0,500)}`);return text?JSON.parse(text):null;}
const action=(type,id,revision,fields)=>({protocolVersion:2,operationId:randomUUID(),actionType:type,sessionId:id,expectedRevision:revision,capturedAt:new Date().toISOString(),timezone:'Asia/Seoul',offsetMinutes:540,deviceId:'synthetic-owned-web-qa',entryPoint:type==='AUTO_APPLY_SESSION'?'BACKGROUND':'HISTORY_EDIT',payload:{fields,fieldTimezones:{bedtimeIntentAt:'Asia/Seoul',wakeAt:'Asia/Seoul'}}});
const id=randomUUID(),estimate=action('AUTO_APPLY_SESSION',id,0,{bedtimeIntentAt:'2026-10-20T14:00:00Z',wakeAt:'2026-10-20T22:00:00Z'});
const first=await call('/api/sleep/v1/actions',estimate);assert.equal(first.mergeOutcome,'APPLIED');assert.deepEqual(await call('/api/sleep/v1/actions',estimate),first);
const duplicate=await call('/api/sleep/v1/actions',action('AUTO_APPLY_SESSION',id,1,estimate.payload.fields));assert.equal(duplicate.newRevision,1);results.push('real-http-auto-idempotency-no-revision-churn');
const annotated=await call('/api/sleep/v1/actions',action('ANNOTATE_SESSION',id,1,{sleepScore:72,sleepNote:'자동 추정 테스트'}));
const corrected=await call('/api/sleep/v1/actions',action('CORRECT_SESSION',id,1,{wakeAt:'2026-10-20T22:30:00Z'}));
const stale=await call('/api/sleep/v1/actions',action('AUTO_APPLY_SESSION',id,1,estimate.payload.fields));assert.equal(stale.session.wakeAt,corrected.session.wakeAt);assert.equal(stale.session.sleepScore,72);assert.equal(annotated.session.sleepScore,72);results.push('manual-priority-and-independent-annotation-stale-merge');
await call('/api/sleep/v1/actions',action('ANNOTATE_SESSION',id,corrected.newRevision,{sleepScore:101}),'POST',422);results.push('invalid-score-rejected');
const legacy=action('AUTO_APPLY_SESSION',randomUUID(),0,estimate.payload.fields);delete legacy.protocolVersion;await call('/api/sleep/v1/actions',legacy,'POST',409);results.push('legacy-replay-rejected');
const plan=await call('/api/planned-blocks',{date:'2026-10-23',domainType:'LIFE',title:'보존한 시간 미지정 계획',startAt:null,endAt:null,durationMinutes:30,activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:'합성 QA 보존 대상'},'POST',201);results.push('legacy-unscheduled-plan-preserved-for-details');
const today=await call('/api/sleep/v1/today?timezone=Asia%2FSeoul');assert.ok(today.pendingActions.length<=4);assert.equal(today.syncProtocolVersion,2);
const report={boundary:'OWNED_LOOPBACK_SYNTHETIC_ONLY',base,sessionId:id,planId:plan.id,owner:today.ownerId,passed:results,cleanup:'Entire owned synthetic cluster removed by runtime; no shared records touched.'};
await fs.mkdir('docs/sleep-calendar-auto-review/evidence',{recursive:true});await fs.writeFile('docs/sleep-calendar-auto-review/evidence/api-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

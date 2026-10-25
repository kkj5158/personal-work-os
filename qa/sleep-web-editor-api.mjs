import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:13443/api/sleep/v1',checks=[];
async function call(route,body,expected=200){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.equal(response.status,expected,route+': '+JSON.stringify(value).slice(0,450));return value;}
const action=(type,id,revision,fields)=>({protocolVersion:2,operationId:randomUUID(),actionType:type,sessionId:id,expectedRevision:revision,capturedAt:new Date().toISOString(),timezone:'Asia/Seoul',offsetMinutes:540,deviceId:'sleep-editor-owned-qa',entryPoint:type==='AUTO_APPLY_SESSION'?'BACKGROUND':'HISTORY_EDIT',payload:{fields,fieldTimezones:{bedtimeIntentAt:'Asia/Seoul',wakeAt:'Asia/Seoul'}}});
const napsAction=(type,id,revision,start,end)=>({protocolVersion:2,operationId:randomUUID(),actionType:type,napId:id,expectedRevision:revision,capturedAt:new Date().toISOString(),timezone:'Asia/Seoul',offsetMinutes:540,deviceId:'sleep-editor-owned-qa',entryPoint:'HISTORY_EDIT',payload:{...(start?{startAt:start,startTimezone:'Asia/Seoul',startOffsetMinutes:540}:{}),...(end?{endAt:end,endTimezone:'Asia/Seoul',endOffsetMinutes:540}:{})}});
const before=await call('/today?timezone=Asia%2FSeoul'),main=[],naps=[];
for(const [start,end,type] of [['2026-10-18T14:00:42Z','2026-10-18T22:00:42Z','AUTO_APPLY_SESSION'],['2026-10-19T14:00:00Z','2026-10-19T22:30:00Z','CORRECT_SESSION'],['2026-10-20T14:30:00Z','2026-10-20T22:00:00Z','CORRECT_SESSION'],['2026-10-21T14:00:00Z','2026-10-21T22:00:00Z','CORRECT_SESSION']]){const id=randomUUID(),body=action(type,id,0,{bedtimeIntentAt:start,wakeAt:end}),r=await call('/actions',body);assert.equal(r.newRevision,1);assert.deepEqual(await call('/actions',body),r);main.push(id);}
checks.push('existing-v2-auto-and-manual-actions-and-exact-replay');
await call('/actions',action('ANNOTATE_SESSION',main[0],1,{sleepScore:80,sleepNote:'격리 QA 기록'}));
const exclude=action('EXCLUDE_SESSION',main[3],1,{});exclude.payload={reason:'격리 QA 제외 테스트'};await call('/actions',exclude);
const partial=randomUUID();await call('/actions',action('CORRECT_SESSION',partial,0,{wakeAt:'2026-10-23T00:00:00Z'}));main.push(partial);
const beforeNaps=await call('/today?timezone=Asia%2FSeoul');
for(const [start,end] of [['2026-10-19T04:00:00Z','2026-10-19T04:30:00Z'],['2026-10-20T04:30:00Z','2026-10-20T05:15:00Z'],['2026-10-21T06:00:00Z','2026-10-21T06:15:00Z']]){const id=randomUUID();await call('/naps/actions',napsAction('CREATE_NAP',id,0,start,end));naps.push(id);}
checks.push('excluded-unknown-multiple-nap-representative-fixtures');
const canonical=await call('/sessions/'+main[0]);
await call('/actions',action('CORRECT_SESSION',main[0],canonical.revision+1,{wakeAt:'2026-10-18T22:05:00Z'}),409);assert.deepEqual(await call('/sessions/'+main[0]),canonical);checks.push('future-main-revision-rejected-without-partial-write');
const napOriginal=await call('/naps/'+naps[0]);await call('/naps/actions',napsAction('UPDATE_NAP',naps[0],0,'2026-10-19T04:05:00Z','2026-10-19T04:30:00Z'),409);assert.deepEqual(await call('/naps/'+naps[0]),napOriginal);checks.push('stale-nap-revision-rejected-without-partial-write');
await call('/naps/actions',napsAction('CREATE_NAP',randomUUID(),0,'2026-10-18T21:00:00Z','2026-10-18T21:30:00Z'),409);assert.deepEqual(await call('/sessions/'+main[0]),canonical);checks.push('main-nap-overlap-preserves-confirmed-source');
const second=await call('/sessions/'+main[1]);await call('/actions',action('CORRECT_SESSION',main[1],1,{bedtimeIntentAt:'2026-10-19T23:00:00Z',wakeAt:'2026-10-19T22:30:00Z'}),422);assert.deepEqual(await call('/sessions/'+main[1]),second);checks.push('invalid-pair-atomic-rejection');
assert.deepEqual((await call('/today?timezone=Asia%2FSeoul')).settings,beforeNaps.settings);checks.push('settings-and-reminder-identity-preserved');
const report={boundary:'DISPOSABLE_LOOPBACK_ONLY',owner:before.ownerId,main,naps,checks,cleanup:'Cluster cleanup is owned by foreground runtime.'};
await fs.mkdir('docs/sleep-web-editor/evidence',{recursive:true});await fs.writeFile('docs/sleep-web-editor/evidence/api-fixtures.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

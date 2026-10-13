import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const runtime=JSON.parse(await fs.readFile('.qa/local-http-runtime.json','utf8'));
if(!/^sleep_web_qa_[0-9a-f]{32}$/.test(runtime.schema)||runtime.port!==8462)throw Error('Owned isolated runtime required');
const base='http://127.0.0.1:8462/api/sleep/v1';const checks=[];
async function read(path){const r=await fetch(base+path);assert.equal(r.status,200);return r.json();}
const action=(actionType,id,revision,payload={},nap=false)=>({operationId:randomUUID(),actionType,[nap?'napId':'sessionId']:id,expectedRevision:revision,capturedAt:new Date().toISOString(),timezone:'Asia/Seoul',offsetMinutes:540,deviceId:'sleep-life-owned-local-http-qa',entryPoint:'HISTORY_EDIT',payload});
async function send(a,status=200){const r=await fetch(base+(a.napId?'/naps/actions':'/actions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)});assert.equal(r.status,status);return r.json();}
const today=await read('/today');assert.equal((await read('/intervals?start=2026-10-11T15:00:00Z&end=2026-10-13T15:00:00Z&from=2026-10-12&to=2026-10-13')).sessions.length,0);
const settings=await read('/reminder-settings'),id=randomUUID(),napId=randomUUID();
try{
const original=(await send(action('CORRECT_SESSION',id,0,{fields:{bedtimeIntentAt:'2026-10-12T14:15:42Z',wakeAt:'2026-10-12T22:30:12Z'}}))).session;
const range=await read('/intervals?start=2026-10-11T15:00:00Z&end=2026-10-12T15:00:00Z&from=2026-10-12&to=2026-10-12');assert.equal(range.ownerId,today.ownerId);assert.equal(range.sessions.length,1);assert.equal(range.sessions[0].id,id);assert.equal(range.sessions[0].intervalMinutes,494.5);checks.push('HTTP range includes one cross-midnight canonical original beyond attribution boundary');
const edit=action('CORRECT_SESSION',id,1,{fields:{wakeAt:'2026-10-12T22:35:12Z'}}),saved=await send(edit);assert.equal(saved.session.id,id);assert.equal(saved.newRevision,2);for(const field of ['bedtimeIntentAt','bedtimeTimezone','bedtimeSource','bedtimeCertainty'])assert.equal(saved.session[field],original[field]);assert.deepEqual(await send(edit),saved);checks.push('existing action envelope retains ID, untouched endpoint provenance and exact replay');
const stale=await send(action('CORRECT_SESSION',id,1,{fields:{wakeAt:'2026-10-12T22:40:12Z'}}),409);assert.equal(stale.code,'REVISION_CONFLICT');assert.equal((await read('/sessions/'+id)).revision,2);checks.push('stale revision rejected; original server record not overwritten');
const undone=await send(action('UNDO_EVENT',id,2,{targetEventId:saved.eventId}));assert.equal(undone.session.wakeAt,original.wakeAt);checks.push('existing Sleep Undo restores the original endpoint through its domain action');
const nap=await send(action('CREATE_NAP',napId,0,{startAt:'2026-10-12T04:20:00Z',endAt:'2026-10-12T04:45:00Z'},true));assert.equal(nap.nap.id,napId);assert.equal(nap.nap.intervalMinutes,25);assert.equal((await read('/naps/'+napId)).revision,1);checks.push('canonical persisted nap read and source namespace remain separate');
const afterSettings=await read('/reminder-settings');for(const field of ['bedtime','wake','reminderDeviceId','timezoneMode'])assert.deepEqual(afterSettings[field],settings[field]);if(settings.revision>0)assert.deepEqual(afterSettings,settings);checks.push('shared reminders and Android reminder assignment unchanged (first capture initializes absent settings under the existing policy)');
await send(action('DELETE_NAP',napId,1,{},true));await send(action('DELETE_SESSION',id,undone.newRevision));
const result={at:new Date().toISOString(),environment:'isolated loopback DEV using the existing fixed-owner profile; NOT authenticated hosted DEV acceptance',schema:runtime.schema,checks,passed:checks.length};await fs.writeFile('docs/sleep-web-v2-life-calendar/evidence/local-http-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:checks.length,environment:result.environment}));

}finally{for(const [resource,fixtureId,nap] of [['sessions',id,false],['naps',napId,true]]){const response=await fetch(base+'/'+resource+'/'+fixtureId);if(response.status===404)continue;assert.equal(response.status,200);const record=await response.json();assert.equal(record.id,fixtureId);await send(action(nap?'DELETE_NAP':'DELETE_SESSION',fixtureId,record.revision,{},nap));}}

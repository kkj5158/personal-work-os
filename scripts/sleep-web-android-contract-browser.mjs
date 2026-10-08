import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8462/api/sleep/v1',id=crypto.randomUUID();
const report={at:new Date().toISOString(),checks:[],ownedId:id,failures:[]};
const action=(type,revision,payload,nap=false)=>({operationId:crypto.randomUUID(),actionType:type,[nap?'napId':'sessionId']:id,expectedRevision:revision,capturedAt:new Date().toISOString(),timezone:'Asia/Seoul',offsetMinutes:540,deviceId:'sleep-web-owned-android-contract-fixture',entryPoint:'HISTORY_EDIT',payload});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}});
try{
 assert.equal((await api('/naps/actions',action('CREATE_NAP',0,{startAt:'2026-10-03T01:00:00Z',endAt:'2026-10-03T01:30:00Z'},true))).status,200);
 assert.equal((await api('/actions',action('CORRECT_SESSION',0,{fields:{bedtimeIntentAt:'2026-10-02T14:00:00Z',wakeAt:'2026-10-02T22:00:00Z'}}))).status,200);
 await page.goto('http://localhost:13027/life/sleep/records?date=2026-10-03&kind=main&view=list');
 await page.locator('.sleep-record').filter({hasText:'8시간 0분'}).click();await page.getByLabel('기상 시각',{exact:true}).fill('10:15');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByText('오류: SESSION_OVERLAP').waitFor();await page.getByRole('heading',{name:'겹치는 기록 NAP'}).waitFor();
 assert.equal(await page.getByLabel('기상 시각',{exact:true}).inputValue(),'10:15');
 const canonical=(await api('/sessions/'+id)).body;assert.equal(canonical.revision,1);assert.equal(canonical.wakeAt,'2026-10-02T22:00:00Z');
 const state=JSON.parse(await page.locator('.sleep-compare pre').nth(0).textContent());assert.equal(state.wakeAt,canonical.wakeAt);assert.ok(!state.startAt);
 const collision=JSON.parse(await page.locator('.sleep-compare pre').nth(1).textContent());assert.equal(collision.startAt,'2026-10-03T01:00:00Z');
 report.checks.push('same UUID main/nap: main canonical and conflicting nap separated; rejected write preserves draft and original fact');
 await page.screenshot({path:'.qa/sleep-web-v1/main-nap-conflict.png',fullPage:true});
}catch(e){report.failures.push(e.message);process.exitCode=1;}
finally{
 for(const nap of [true,false]){const route=nap?'/naps/':'/sessions/';const current=await api(route+id);if(current.status===200)assert.equal((await api(nap?'/naps/actions':'/actions',action(nap?'DELETE_NAP':'DELETE_SESSION',current.body.revision,{},nap))).status,200);assert.equal((await api(route+id)).status,404);}
 report.cleanup='only owned same UUID main/nap fixtures deleted';await browser.close();await fs.writeFile('.qa/sleep-web-v1/android-contract-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}

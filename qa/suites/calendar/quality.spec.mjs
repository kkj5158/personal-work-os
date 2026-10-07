import {test as base, expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {appendFile} from 'node:fs/promises';
import path from 'node:path';
import {FixtureScope} from '../../helpers/api.mjs';
import {collectErrors} from '../../helpers/browser.mjs';

const api=process.env.QA_API_URL, date='2001-01-08', nextDate='2001-01-09';
const source='LIFE_TIME_ENTRY';
const test=base.extend({
  fixtures:async({page},use)=>{
    const scope=new FixtureScope(), ids=new Set(), errors=collectErrors(page);
    const receiptWrites=[];
    const receipt=key=>appendFile(path.join(process.env.QA_RUN_DIR,'calendar-operations.txt'),key+'\n');
    page.on('request',request=>{const key=request.headers()['idempotency-key'];if(key&&request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/calendar/actual/'))receiptWrites.push(receipt(key));});
    const own=(kind,id)=>{const key=`${kind}:${id}`;if(ids.has(key))return;ids.add(key);scope.own(async()=>{
      const path=kind==='actual'?`/api/calendar/actual/${source}/${id}`:kind==='plan'?`/api/planned-blocks/${id}`:`/api/life-state-entries/${id}`;
      const response=await page.request.delete(api+path);
      expect([200,204,404]).toContain(response.status());
      if(kind==='actual')expect((await page.request.get(api+path)).status()).toBe(404);
    });};
    const call=async(path,method='GET',data,headers)=>{
      const response=await page.request.fetch(api+path,{method,data,headers});
      expect(response.ok(),`${method} ${path} HTTP ${response.status()}`).toBeTruthy();
      return response.status()===204?null:response.json();
    };
    const actual=async(patch={},key=randomUUID())=>{await receipt(key);const value=await call(`/api/calendar/actual/${source}`,'POST',{
      date,categoryId:null,title:`QA Calendar ${process.env.QA_RUN_ID}`,durationMinutes:30,
      startTime:'10:00',endTime:'10:30',memo:'Disposable Calendar quality fixture',phaseId:null,...patch
    },{'Idempotency-Key':key});own('actual',value.id);return value;};
    const plan=async(patch={})=>{const value=await call('/api/planned-blocks','POST',{
      domainType:'LIFE',title:`QA Plan ${randomUUID().slice(0,8)}`,date,startAt:date+'T11:30:00',endAt:date+'T11:35:00',
      activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:'Disposable Calendar quality fixture',...patch
    });own('plan',value.id);return value;};
    try{await use({actual,plan,call,own});}finally{
      await scope.close();
      await Promise.all(receiptWrites);
      const injected=base.info().annotations.some(a=>a.type==='injected-network-failure');
      const unexpected=errors.filter(e=>!(injected&&(e.type==='http'&&e.status===503||e.type==='console'&&/Failed to load resource.*(503|ERR_FAILED)/.test(e.message))));
      expect(unexpected,'Unexpected browser runtime errors').toEqual([]);
    }
  }
});
const toolbar=page=>page.getByRole('region',{name:'Calendar'});
async function open(page,mode='actual',view='day',day=date){
  const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/calendar'&&r.status()===200);
  await page.goto(`/calendar?date=${day}&view=${view}&mode=${mode}`);await loaded;
  await expect(page.locator(`[data-calendar-date="${day}"]`)).toBeVisible();
  await expect(toolbar(page).getByRole('button',{name:mode==='all'?'전체':mode==='review'?'회고':mode==='plan'?'Plan':'Actual',exact:true})).toHaveAttribute('aria-pressed','true');
}
async function clickMinute(page,minute,day=date){
  const scroll=page.locator('[data-minute-scale]').first();
  await scroll.evaluate((el,m)=>el.scrollTop=Math.max(0,m-200),minute);
  const box=await page.locator(`[data-calendar-date="${day}"]`).boundingBox();
  await page.mouse.click(box.x+Math.min(50,box.width/2),box.y+minute);
}
async function lifeDraft(page){
  await page.locator('.calendar-editor label').filter({hasText:/^Domain/}).locator('select').selectOption('LIFE');
}
async function dragBlock(page,id,delta,resize=false){
  const block=page.locator(`[data-calendar-block="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  if(resize)await block.click({position:{x:20,y:2}});
  const target=resize?block.getByRole('separator',{name:'종료 시간 조절'}):block;
  const box=await target.boundingBox();
  const x=box.x+Math.min(box.width/2,40), y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+delta,{steps:5});await page.mouse.up();
}

test('calendar.operation-identity',async({page,fixtures:f})=>{
  const key=randomUUID(), payload={title:`QA duplicate ${randomUUID()}`};
  const [one,replay]=await Promise.all([f.actual(payload,key),f.actual(payload,key)]);
  expect(replay.id).toBe(one.id);
  const [two,three]=await Promise.all([f.actual(payload),f.actual(payload)]);
  expect(new Set([one.id,two.id,three.id]).size).toBe(3);
  const conflict=await page.request.post(api+`/api/calendar/actual/${source}`,{headers:{'Idempotency-Key':randomUUID()},data:{...payload,title:'Different title conflict',date,durationMinutes:30,startTime:'10:00',endTime:'10:30'}});
  expect(conflict.status()).toBe(400);
  await open(page);for(const item of [one,two,three])await expect(page.locator(`[data-calendar-block="${item.id}"]`)).toHaveCount(1);
  await page.reload();for(const item of [one,two,three])await expect(page.locator(`[data-calendar-block="${item.id}"]`)).toHaveCount(1);
});

test('calendar.lost-response-retry',async({page,fixtures:f})=>{
  test.info().annotations.push({type:'injected-network-failure',description:'Server commit then browser response abort, DEV only'});
  await open(page);await clickMinute(page,600);await lifeDraft(page);
  await page.getByLabel('시간 미지정',{exact:true}).check();
  const title=`QA lost response ${randomUUID()}`, keys=[];let first=true;
  await page.route(`**/api/calendar/actual/${source}`,async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    const response=await route.fetch();const created=await response.json();f.own('actual',created.id);
    if(first){first=false;await route.abort('failed');}else await route.fulfill({response});
  });
  await page.getByLabel('제목',{exact:true}).fill(title);
  await page.getByRole('button',{name:'다시 저장',exact:true}).click();
  await expect(page.locator('.calendar-editor').getByRole('status')).toContainText('저장됨');
  expect(keys.length).toBeGreaterThanOrEqual(2);expect(new Set(keys).size).toBe(1);expect(keys[0]).toBeTruthy();
  const range=await f.call(`/api/calendar?from=${date}&to=${date}`);
  expect(range.unscheduledActual.filter(x=>x.title===title)).toHaveLength(1);
  expect(range.unscheduledActual.find(x=>x.title===title).durationMinutes).toBe(30);
  await page.unroute(`**/api/calendar/actual/${source}`);await page.reload();
  await expect(page.getByRole('button',{name:new RegExp(title)})).toHaveCount(1);
});

test('calendar.local-draft-autosave',async({page,fixtures:f})=>{
  for(const mode of ['all','actual']){
    await open(page,mode);await clickMinute(page,600);
    await expect(page.locator('[data-calendar-block="draft"]')).toHaveCount(1);
    const before=await f.call(`/api/calendar?from=${date}&to=${date}`);
    const title=`QA draft ${mode} ${randomUUID()}`;await lifeDraft(page);
    const saved=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===(mode==='actual'?`/api/calendar/actual/${source}`:'/api/planned-blocks'));
    await page.getByLabel('제목',{exact:true}).fill(title);const response=await saved;expect(response.ok()).toBeTruthy();
    const value=await response.json();f.own(mode==='actual'?'actual':'plan',value.id);
    await expect(page.locator(`[data-calendar-block="${value.id}"]`)).toHaveCount(1);
    expect([...before.actualBlocks,...before.planBlocks,...before.unscheduledActual].some(x=>x.title===title)).toBe(false);
    await page.reload();await expect(page.locator(`[data-calendar-block="${value.id}"]`)).toHaveCount(1);
  }
});

test('calendar.category-recovery',async({page,fixtures:f})=>{
  test.info().annotations.push({type:'injected-network-failure',description:'Category 503 followed by retry, DEV only'});
  const item=await f.plan();let failing=true,count=0;
  await page.route('**/api/activity-categories',route=>{count++;return failing?route.fulfill({status:503,json:{message:'QA category unavailable'}}):route.continue();});
  await open(page,'plan');await expect(page.getByRole('button',{name:'카테고리 다시 시도',exact:true})).toBeVisible();
  const before=count;failing=false;await page.getByRole('button',{name:'카테고리 다시 시도',exact:true}).click();
  await expect.poll(()=>count).toBeGreaterThan(before);await expect(page.locator(`[data-calendar-block="${item.id}"]`)).toHaveCount(1);
  await expect(page.getByRole('button',{name:'카테고리 다시 시도',exact:true})).toHaveCount(0);
});

test('calendar.date-owned-review',async({page,fixtures:f})=>{
  test.info().annotations.push({type:'injected-network-failure',description:'New-date Calendar 503, DEV only'});
  await f.actual({durationMinutes:145,startTime:null,endTime:null});await open(page,'review');
  await expect(page.getByRole('region',{name:'Actual 회고 요약'})).toContainText('2시간 25분');
  await page.route('**/api/calendar?*',route=>new URL(route.request().url()).searchParams.get('from')===nextDate?route.fulfill({status:503,json:{message:'QA range unavailable'}}):route.continue());
  await toolbar(page).getByRole('button',{name:'다음',exact:true}).click();await expect(page).toHaveURL(new RegExp(`date=${nextDate}`));
  await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Actual 회고 요약'})).not.toContainText('2시간 25분');
  await page.unroute('**/api/calendar?*');await page.getByRole('button',{name:'다시 시도',exact:true}).click();
  await expect(page.getByRole('region',{name:'Actual 회고 요약'})).toContainText('전체 0분');
});

test('calendar.short-block-day-week',async({page,fixtures:f})=>{
  const item=await f.actual({startTime:'11:30',endTime:'11:35',durationMinutes:5});
  for(const view of ['day','week']){
    await open(page,'actual',view);const before=await f.call(`/api/calendar/actual/${source}/${item.id}`);
    const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith(`/${item.id}`));await dragBlock(page,item.id,15);expect((await saved).ok()).toBeTruthy();
    const moved=await f.call(`/api/calendar/actual/${source}/${item.id}`);expect(moved.durationMinutes).toBe(5);
    expect(moved.startTime).not.toBe(before.startTime);
    const resized=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith(`/${item.id}`));await dragBlock(page,item.id,15,true);expect((await resized).ok()).toBeTruthy();
    const after=await f.call(`/api/calendar/actual/${source}/${item.id}`);expect(after.startTime).toBe(moved.startTime);expect(after.durationMinutes).toBe(20);
    // Restore the small fixture for the other view without creating a new identity.
    await f.call(`/api/calendar/actual/${source}/${item.id}`,'PUT',{...after,startTime:'11:30',endTime:'11:35',durationMinutes:5});
  }
  await page.reload();await expect(page.locator(`[data-calendar-block="${item.id}"]`)).toHaveCount(1);
});

test('calendar.late-day-placement',async({page,fixtures:f})=>{
  const item=await f.actual({title:`QA late ${randomUUID()}`,durationMinutes:59,startTime:null,endTime:null});await open(page);
  await page.locator('[data-minute-scale]').first().evaluate(el=>el.scrollTop=1200);
  const chip=page.getByRole('button',{name:new RegExp(item.title)}),box=await chip.boundingBox();
  const column=await page.locator(`[data-calendar-date="${date}"]`).boundingBox();
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith(`/${item.id}`));
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(column.x+50,column.y+1380,{steps:8});await page.mouse.up();
  expect((await saved).ok()).toBeTruthy();const after=await f.call(`/api/calendar/actual/${source}/${item.id}`);
  expect(after.startTime.slice(0,5)).toBe('23:00');expect(after.endTime.slice(0,5)).toBe('23:59');expect(after.durationMinutes).toBe(59);
});

test('calendar.rapid-navigation',async({page})=>{
  for(const [view,target] of [['day','2001-01-10'],['week','2001-01-22']]){
    await open(page,'all',view);const next=toolbar(page).getByRole('button',{name:'다음',exact:true});
    await next.dblclick({delay:20});
    await expect(page).toHaveURL(new RegExp(`date=${target}`));
    const prev=toolbar(page).getByRole('button',{name:'이전',exact:true});await prev.dblclick({delay:20});
    await expect(page).toHaveURL(new RegExp(`date=${date}`));
  }
});

test('calendar.mode-restoration',async({page})=>{
  await open(page,'all');await toolbar(page).getByRole('button',{name:'Actual',exact:true}).click();
  await expect(toolbar(page).getByRole('button',{name:'Actual',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('calendar.appearance.v1')).mode)).toBe('actual');
  await page.goto('/calendar');await expect(toolbar(page).getByRole('button',{name:'Actual',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.goto('/calendar?mode=plan');await expect(toolbar(page).getByRole('button',{name:'Plan',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('calendar.seoul-today',async({browser})=>{
  const context=await browser.newContext({timezoneId:'UTC'});const page=await context.newPage();
  try{
    await page.clock.install({time:new Date('2026-10-05T16:10:00Z')});await page.goto('/calendar');
    await expect(page.locator('[data-calendar-date="2026-10-06"]')).toBeVisible();
    await page.goto(`/calendar?date=${date}&mode=all`);await toolbar(page).getByRole('button',{name:'오늘',exact:true}).click();
    await expect(page).toHaveURL(/date=2026-10-06/);
    await expect(page.locator('[data-current-time="2026-10-06"]')).toHaveCount(1);
  }finally{await context.close();}
});

test('calendar.week-inactive-editor',async({page,fixtures:f})=>{
  await open(page,'all','week');await expect(page.locator('.calendar-shell')).toHaveClass(/editor-collapsed/);
  await clickMinute(page,600);await expect(page.locator('.calendar-editor')).toBeVisible();
  await toolbar(page).getByRole('button',{name:'다음',exact:true}).click();await expect(page.locator('.calendar-shell')).toHaveClass(/editor-collapsed/);
  await open(page,'actual','week');await clickMinute(page,600);await lifeDraft(page);
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/api/calendar/actual/${source}`));
  await page.getByLabel('제목',{exact:true}).fill(`QA active ${randomUUID()}`);const item=await(await saved).json();f.own('actual',item.id);
  await expect(page.locator('.calendar-editor')).toBeVisible();await page.getByLabel('메모',{exact:true}).fill('Typing continuity');await expect(page.locator('.calendar-editor')).toBeVisible();
  await page.getByRole('button',{name:'편집기 접기',exact:true}).click();await expect(page.locator('.calendar-shell')).toHaveClass(/editor-collapsed/);
});

test('calendar.nearby-state-conversion',async({page,fixtures:f})=>{
  const item=await f.plan({startAt:date+'T14:00:00',endAt:date+'T14:30:00'});
  const adjacent=await f.actual({startTime:'14:30',endTime:'15:00'});
  const state=await f.call('/api/life-state-entries','POST',{entryDate:date,stateGroup:'LOW',label:'QA State',startTime:'14:00',endTime:'15:00',memo:'Disposable'});f.own('state',state.id);
  await open(page,'all');const block=page.locator(`[data-calendar-block="${item.id}"]`);await block.scrollIntoViewIfNeeded();await block.click();
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/calendar/state'));
  await page.locator('.cal-state-selector').getByRole('button',{name:'Actual',exact:true}).click();const converted=await(await saved).json();f.own('actual',converted.id);
  await expect(page.locator(`[data-calendar-block="${item.id}"]`)).toHaveCount(0);await expect(page.locator(`[data-calendar-block="${converted.id}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-calendar-block="${adjacent.id}"]`)).toHaveCount(1);await expect(page.locator('[data-state-rail]')).toHaveCount(1);
  const replay=await f.call('/api/calendar/state','POST',{kind:'PLAN',id:item.id,targetState:'ACTUAL',actual:{date,categoryId:null,title:item.title,durationMinutes:30,startTime:'14:00',endTime:'14:30',memo:item.memo,phaseId:null}});
  expect(replay.id).toBe(converted.id);const range=await f.call(`/api/calendar?from=${date}&to=${date}`);
  expect(range.actualBlocks.reduce((n,b)=>n+b.durationMinutes,0)).toBe(60);
});

import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
const samples=[];
const optimized=existsSync(path.join(process.env.QA_TARGET,'frontend/lib/money/cache.ts'));
const dock=p=>p.locator('.money-dock');
const route=(p,name)=>p.getByRole('button',{name,exact:true}).first().click();
const rows=p=>p.locator('.money-main tbody tr');
async function setup(page){await page.addInitScript(()=>{
 window.__perf={pending:0,last:0,requests:[]}; const a=window.__perf, original=window.fetch;
 window.fetch=async function(...args){const url=String(args[0] instanceof Request?args[0].url:args[0]);if(!url.includes('/api/money'))return original.apply(this,args);const r={url,start:Date.now(),method:args[1]?.method||'GET'};a.requests.push(r);a.pending++;try{const response=await original.apply(this,args);r.status=response.status;await response.clone().arrayBuffer();r.end=Date.now();return response;}finally{a.pending--;a.last=Date.now();}};
 new MutationObserver(()=>a.last=Date.now()).observe(document,{subtree:true,childList:true,characterData:true});
});}
async function settle(p){await p.waitForFunction(()=>window.__perf.pending===0&&Date.now()-window.__perf.last>150);}
async function measure(p,sample,label,action,ready,delay=0){
 const start=Date.now();await action();await ready?.();if(delay)await p.waitForTimeout(delay);await settle(p);
 const data=await p.evaluate(start=>({requests:window.__perf.requests.filter(r=>r.start>=start),last:window.__perf.last}),start);
 samples.push({sample,label,visibleMs:Math.max(start,data.last,...data.requests.map(r=>r.end||r.start))-start,requests:data.requests});
 await writeFile(path.join(process.env.QA_RUN_DIR,'phase2-performance.json'),JSON.stringify({optimized,samples},null,2));
 return samples.at(-1);
}
test('money.performance.phase2',async({browser,request})=>{
 test.setTimeout(880000);
 const api=process.env.QA_API_URL+'/api/money';
 const call=async url=>{const r=await request.get(api+url);expect(r.ok()).toBe(true);return r.json();};
 for(let sample=0;sample<3;sample++){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
  p.setDefaultTimeout(15000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await setup(p);
  try{
   await measure(p,sample,'Overview cold',()=>p.goto('/money'),()=>expect(p.getByLabel('계좌 그룹별 순자금 흐름')).toBeVisible());
   await measure(p,sample,'Transactions first',()=>route(p,'Transactions'),()=>expect(rows(p).first()).toBeVisible());
   const overview=await measure(p,sample,'Overview warm',()=>route(p,'Overview'),()=>expect(p.getByLabel('계좌 그룹별 순자금 흐름')).toBeVisible());
   const transactions=await measure(p,sample,'Transactions warm',()=>route(p,'Transactions'),()=>expect(rows(p).first()).toBeVisible());
   await measure(p,sample,'Accounts first',()=>route(p,'Accounts'),()=>expect(p.locator('.money-account-card').first()).toBeVisible());
   await route(p,'Transactions');await settle(p);
   const accounts=await measure(p,sample,'Accounts warm',()=>route(p,'Accounts'),()=>expect(p.locator('.money-account-card').first()).toBeVisible());
   if(optimized)for(const result of [overview,transactions,accounts])expect(result.requests).toHaveLength(0);
   await measure(p,sample,'Bookkeeping expense',()=>route(p,'가계부'),()=>expect(rows(p).first()).toBeVisible());
   for(const kind of ['EXPENSE','INCOME']){
    if(kind==='INCOME')await measure(p,sample,'Bookkeeping income',()=>p.getByRole('button',{name:'수입',exact:true}).click(),()=>expect(rows(p).first()).toBeVisible());
    // Start on page two. Coalescing must not request page zero of the previous query.
    await p.getByRole('button',{name:'다음',exact:true}).click();await settle(p);
    const result=await measure(p,sample,kind+' search burst',()=>p.getByLabel('가계부 검색').pressSequentially('Audit',{delay:90}),null,400);
    const queries=result.requests.filter(r=>r.url.includes('/bookkeeping?'));
    if(optimized){expect(queries).toHaveLength(1);expect(new URL(queries[0].url).searchParams.get('offset')).toBe('0');}
    const final=queries.at(-1);expect(new URL(final.url).searchParams.get('search')).toBe('Audit');
    const authoritative=await call(new URL(final.url).pathname.replace('/api/money','')+new URL(final.url).search);
    expect(await rows(p).count()).toBe(authoritative.items.length);
    await expect(p.locator('.money-metric').first()).toContainText(new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(authoritative.summary.total));
    const visibleTitles=await p.locator('.money-main tbody button').allTextContents();
    expect(visibleTitles).toEqual(authoritative.items.map(t=>t.title));
    await measure(p,sample,kind+' search clear',()=>p.getByLabel('가계부 검색').fill(''),null,400);
    // Slow stale response must not replace the final query's empty state.
    await p.route('**/api/money/bookkeeping?*',async r=>{if(new URL(r.request().url()).searchParams.get('search')==='Slow'){const response=await r.fetch();await new Promise(resolve=>setTimeout(resolve,900));await r.fulfill({response});}else await r.continue();});
    await p.getByLabel('가계부 검색').fill('Slow');await p.waitForTimeout(300);
    await p.getByLabel('가계부 검색').fill('NoSuchSyntheticItem');await p.waitForTimeout(1400);await settle(p);await expect(rows(p)).toHaveCount(0);
    await p.unroute('**/api/money/bookkeeping?*');await p.getByLabel('가계부 검색').fill('');await p.waitForTimeout(300);await settle(p);
   }
   await route(p,'Transactions');await settle(p);
   const start=Date.now();let panelRequests=0;const listener=r=>{if(r.url().includes('/api/money'))panelRequests++;};p.on('request',listener);
   await p.locator('.money-main tbody button').first().click();await expect(dock(p).getByLabel('제목',{exact:true})).toBeEditable();
   samples.push({sample,label:'Panel editable',visibleMs:Date.now()-start,requests:[]});await settle(p);p.off('request',listener);samples.at(-1).apiRequests=panelRequests;if(optimized)expect(panelRequests).toBe(0);
   // Save memo changes, then compare to the authoritative version and inherited Bookkeeping.
   const editedTitle=await dock(p).getByLabel('제목',{exact:true}).inputValue();
   await dock(p).getByLabel('제목',{exact:true}).fill(editedTitle+' updated '+sample);
   const saved=await measure(p,sample,'Transaction save',()=>dock(p).getByRole('button',{name:'저장',exact:true}).click(),()=>expect(dock(p)).toHaveCount(0));
   if(optimized)expect(saved.requests.filter(r=>/\/api\/money\/(accounts|categories)(\?|$)/.test(r.url))).toHaveLength(0);
   await expect(p.getByRole('button',{name:editedTitle+' updated '+sample,exact:true})).toBeVisible();
   // Candidates become available only when entering refund. Provenance stays collapsed.
   await p.locator('.money-main tbody button').first().click();
   if(optimized) {
    const startRequests=await p.evaluate(()=>window.__perf.requests.length);
    for(const kind of ['INCOME','EXPENSE','TRANSFER'])await dock(p).getByLabel('유형',{exact:true}).selectOption(kind);
    await settle(p);expect(await p.evaluate(()=>window.__perf.requests.length)).toBe(startRequests);
   }
   const refund=await measure(p,sample,'Refund candidates',()=>dock(p).getByLabel('유형',{exact:true}).selectOption('REFUND'),()=>expect(dock(p).getByLabel('원 소비 연결',{exact:true}).locator('option')).not.toHaveCount(1));
   if(optimized)expect(refund.requests.filter(r=>r.url.includes('limit=200'))).toHaveLength(1);
   expect(await dock(p).locator('details[open]').count()).toBe(0);
   p.once('dialog',d=>d.dismiss());await p.getByLabel('패널 닫기').click();await expect(dock(p)).toBeVisible();
   p.once('dialog',d=>d.accept());await p.getByLabel('패널 닫기').click();await expect(dock(p)).toHaveCount(0);
   if(optimized&&sample===0)await p.screenshot({path:path.join(process.env.QA_RUN_DIR,'01-transactions-implementation.png'),fullPage:true});
   if(optimized) {
    const refreshed=await measure(p,sample,'Explicit refresh',()=>p.getByLabel('새로고침',{exact:true}).click(),()=>expect(rows(p).first()).toBeVisible());
    expect(refreshed.requests.some(r=>new URL(r.url).pathname.endsWith('/transactions'))).toBe(true);
   }
   await route(p,'Overview');await settle(p);
   await measure(p,sample,'Overview period change',()=>p.getByRole('button',{name:'분기',exact:true}).click(),()=>expect(p.getByRole('button',{name:'분기',exact:true})).toHaveAttribute('aria-pressed','true'));
   await p.getByRole('button',{name:'1개월',exact:true}).click();await settle(p);
   await measure(p,sample,'Flow initial',()=>p.getByRole('button',{name:'흐름 탐색 →',exact:true}).click(),()=>expect(p.locator('.money-flow-total')).toBeVisible());
   await measure(p,sample,'Flow relationship selection',()=>p.getByRole('button',{name:/외부 소비 · 환불 차감/}).click(),()=>expect(p.locator('.money-flow-detail h2')).toHaveText('소비 자금 → 외부 소비'));
   await route(p,'Transactions');await settle(p);
   await measure(p,sample,'Transaction filter',()=>p.getByRole('group',{name:'거래 유형',exact:true}).getByRole('button',{name:'소비',exact:true}).dblclick(),()=>expect(rows(p).first()).toBeVisible());
   await p.getByRole('group',{name:'거래 유형',exact:true}).getByRole('button',{name:'전체 선택',exact:true}).click();await settle(p);
   await route(p,'Accounts');await settle(p);await p.locator('.money-account-card').first().click();
   await measure(p,sample,'Account detail history',()=>dock(p).getByText('잔액 근거 · 이번 달 집계',{exact:true}).click(),()=>expect(dock(p).getByText(/유입 .*유출/)).toBeVisible());
   await p.getByLabel('패널 닫기').click();
   await measure(p,sample,'Loans first',()=>route(p,'Loans'),()=>expect(p.locator('.money-loan-card').first()).toBeVisible());
   await measure(p,sample,'Loan panel',()=>p.locator('.money-loan-card').first().click(),()=>expect(dock(p).getByLabel('대출명',{exact:true})).toBeEditable());
   await dock(p).getByLabel('대출 메모',{exact:true}).fill('Synthetic performance note '+sample);
   await measure(p,sample,'Loan save',()=>dock(p).getByRole('button',{name:'저장',exact:true}).click(),()=>expect(dock(p)).toHaveCount(0));
   expect(errors).toEqual([]);
  } finally {await settle(p).catch(()=>{});await context.close();await writeFile(path.join(process.env.QA_RUN_DIR,'phase2-performance.json'),JSON.stringify({optimized,samples},null,2));}
 }
});

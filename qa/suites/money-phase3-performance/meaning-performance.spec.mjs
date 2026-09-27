import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const phase3=existsSync(path.join(process.env.QA_TARGET,'frontend/app/money/MoneyBookkeeping.tsx'));
const samples=[];
const dock=p=>p.locator('.money-dock'),rows=p=>p.locator('.money-main tbody tr');
const route=(p,name)=>p.getByRole('button',{name,exact:true}).first().click();
async function instrument(p){await p.addInitScript(()=>{const a=window.__meaningPerf={pending:0,last:0,requests:[]},fetch=window.fetch;window.fetch=async function(...args){const url=String(args[0] instanceof Request?args[0].url:args[0]);if(!url.includes('/api/money'))return fetch.apply(this,args);const row={url,start:Date.now(),method:args[1]?.method||'GET'};a.requests.push(row);a.pending++;try{const r=await fetch.apply(this,args);row.status=r.status;await r.clone().arrayBuffer();row.end=Date.now();return r;}finally{a.pending--;a.last=Date.now();}};new MutationObserver(()=>a.last=Date.now()).observe(document,{subtree:true,childList:true,characterData:true});});}
async function settle(p){await p.waitForFunction(()=>window.__meaningPerf.pending===0&&Date.now()-window.__meaningPerf.last>150);}
async function measure(p,sample,label,action,ready,delay=0){const start=Date.now();await action();if(ready)await ready();if(delay)await p.waitForTimeout(delay);await settle(p);const data=await p.evaluate(start=>({last:window.__meaningPerf.last,requests:window.__meaningPerf.requests.filter(r=>r.start>=start)}),start);const result={sample,label,visibleMs:Math.max(start,data.last,...data.requests.map(r=>r.end||r.start))-start,requests:data.requests};samples.push(result);await output();return result;}
async function output(){await writeFile(path.join(process.env.QA_RUN_DIR,'meaning-performance.json'),JSON.stringify({phase3,samples},null,2));}
test('money.performance.phase3',async({browser,request})=>{
 test.setTimeout(850000);const api=process.env.QA_API_URL+'/api/money';const call=async(url,method='GET',data)=>{const r=await request.fetch(api+url,{method,data});expect(r.ok(),url+' '+r.status()).toBe(true);return r.json();};
 for(let sample=0;sample<3;sample++){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();p.setDefaultTimeout(20000);await instrument(p);const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
   await measure(p,sample,'Overview cold',()=>p.goto('/money'),()=>expect(p.locator('.money-main .money-metric').first()).toBeVisible());
   await route(p,'Transactions');await expect(rows(p).first()).toBeVisible();await settle(p);
   const overview=await measure(p,sample,'Overview warm',()=>route(p,'Overview'),()=>expect(p.locator('.money-main .money-metric').first()).toBeVisible());expect(overview.requests).toHaveLength(0);
   const transactions=await measure(p,sample,'Transactions warm',()=>route(p,'Transactions'),()=>expect(rows(p).first()).toBeVisible());expect(transactions.requests).toHaveLength(0);
   await route(p,'Accounts');await expect(p.locator('.money-account-card').first()).toBeVisible();await settle(p);await route(p,'Transactions');await settle(p);
   const accounts=await measure(p,sample,'Accounts warm',()=>route(p,'Accounts'),()=>expect(p.locator('.money-account-card').first()).toBeVisible());expect(accounts.requests).toHaveLength(0);
   await measure(p,sample,'Bookkeeping Expense first',()=>route(p,'가계부'),()=>expect(rows(p).first()).toBeVisible());
   for(const kind of ['Expense','Income']){
    if(kind==='Income')await measure(p,sample,'Bookkeeping Income switch',()=>p.getByRole(phase3?'tab':'button',{name:'수입',exact:true}).click(),()=>expect(rows(p).first()).toBeVisible());
    const result=await measure(p,sample,kind+' five-key search',()=>p.getByLabel('가계부 검색').pressSequentially('Audit',{delay:60}),()=>expect(rows(p).first()).toBeVisible(),400);expect(result.requests.filter(r=>r.url.includes('/bookkeeping?'))).toHaveLength(1);
    await p.getByLabel('가계부 검색').fill('');await p.waitForTimeout(300);await settle(p);
   }
   await measure(p,sample,'Bookkeeping panel editable',()=>rows(p).first().click(),()=>expect(dock(p).getByLabel('가계부 제목')).toBeEditable());
   await dock(p).getByLabel('가계부 메모').fill('Synthetic performance memo '+sample);
   await measure(p,sample,'Bookkeeping save visible',()=>dock(p).getByRole('button',{name:'저장',exact:true}).click(),()=>expect(dock(p)).toHaveCount(0));
   await rows(p).first().click();await dock(p).getByRole('button',{name:phase3?'사용자 수정 초기화 · 상속값으로':'원거래 값으로 되돌리기',exact:true}).click();
   await measure(p,sample,'Bookkeeping reset visible',()=>dock(p).getByRole('button',{name:'저장',exact:true}).click(),()=>expect(dock(p)).toHaveCount(0));
   await measure(p,sample,'Review first',()=>route(p,'Review Required'),()=>expect(p.getByRole('button',{name:'Audit review 0',exact:true})).toBeVisible());
   await measure(p,sample,'Review panel',()=>p.getByRole('button',{name:'Audit review 0',exact:true}).click(),()=>expect(dock(p).getByLabel('금액 (KRW)',{exact:true})).toBeEditable());await p.getByLabel('패널 닫기').click();
   if(phase3){
    const accounts=await call('/accounts');const account=accounts.find(a=>a.displayName==='Audit account 1');
    const create=title=>call('/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:1234,occurredAt:new Date().toISOString(),counterpartyText:'Performance only',title,excluded:false});
    const single=await create('Perf single '+sample),a=await create('Perf bulk A '+sample),b=await create('Perf bulk B '+sample);await p.getByLabel('새로고침',{exact:true}).click();await expect(p.getByLabel(single.id+' 검토 제목')).toBeVisible();await settle(p);
    p.once('dialog',d=>d.accept());await measure(p,sample,'Review single complete',()=>p.getByLabel(single.id+' 검토 제목').locator('..').locator('..').getByRole('button',{name:'검토 완료',exact:true}).click(),()=>expect(p.getByLabel(single.id+' 검토 제목')).toHaveCount(0));
    await p.getByLabel('Perf bulk A '+sample+' 선택',{exact:true}).check();await p.getByLabel('Perf bulk B '+sample+' 선택',{exact:true}).check();p.once('dialog',d=>d.accept());
    await measure(p,sample,'Review bulk complete',()=>p.getByRole('button',{name:'선택 2건 검토 완료',exact:true}).click(),()=>expect(p.getByLabel(a.id+' 검토 제목')).toHaveCount(0));expect((await call('/bookkeeping/'+b.id)).title).toBe('Perf bulk B '+sample);
   }
   const categoriesResult=await measure(p,sample,'Categories load',()=>route(p,phase3?'분류 · 규칙':'Settings'),()=>expect(p.getByRole('heading',{name:phase3?'카테고리 관리':'카테고리',exact:true})).toBeVisible());
   await measure(p,sample,'Rules list load',async()=>{if(phase3)await p.getByRole('tab',{name:'자동 분류 규칙'}).click();},()=>expect(p.getByText('synthetic merchant 1',{exact:true})).toBeVisible());
   await measure(p,sample,'Rule panel',()=>p.getByText('synthetic merchant 1',{exact:true}).click(),()=>expect(dock(p).getByLabel(phase3?'규칙 이름':'거래처 정확히 일치',{exact:true})).toBeEditable());
   await dock(p).getByLabel('기본 메모',{exact:true}).fill('Synthetic rule memo '+sample);
   await measure(p,sample,'Rule save visible',()=>dock(p).getByRole('button',{name:'저장',exact:true}).click(),()=>expect(dock(p)).toHaveCount(0));
   if(phase3){
    const rules=await call('/classification-rules');if(rules.length===1)await call('/classification-rules','POST',{name:'Second performance rule',conditions:[{field:'merchant',operator:'EXACT',value:'No match'}],titleDefault:'No match',status:'ACTIVE'});
    await p.getByLabel('새로고침',{exact:true}).click();await expect(rows(p)).toHaveCount(2);await settle(p);
    await measure(p,sample,'Rule reorder visible',()=>rows(p).last().getByTitle('위로 이동').click(),()=>expect(rows(p).first()).not.toContainText(rules[0].name||rules[0].merchant));
   }
   if(!phase3)samples.push({...categoriesResult,label:'Settings first',basis:'Baseline categories and settings share one route'});
   if(phase3)await measure(p,sample,'Settings first',async()=>{await route(p,'Settings');},()=>expect(p.getByRole('heading',{name:phase3?'MONEY Bridge':'연결 및 수집',exact:true})).toBeVisible());
   await measure(p,sample,'Bridge status detail',async()=>{if(!phase3)await p.getByText('Android Bridge 연결 · 기기 상태',{exact:true}).click();await p.getByRole('button',{name:'상태 새로고침',exact:true}).click();},()=>expect(p.getByRole('region',{name:'Android Bridge'})).toBeVisible());
   expect(errors).toEqual([]);
  }finally{await context.close();await output();}
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {ApiError} from '@/lib/api/client';
import {moneyApi as api,type Account} from '@/lib/money/model';
import {MoneyDataProvider,useMoneyCache} from './MoneyDataProvider';
import type {LedgerRow} from '@/lib/money/accountLedger';
import type {Props} from './MoneyWebViews';
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const accounts=['one','two'].map(id=>({id,displayName:'Account '+id,archived:false,version:0,provider:'CASH',role:'CASH'}) as Account);
const base={amount:100,currency:'KRW',occurred_at:'2026-11-15T01:00:00Z',memo:null,counterparty_text:null,version:1,loan_id:null,principal:null,interest:null,fee:null,refund_of:null,sourceCount:0,sources:[],fingerprint:'fingerprint',meaning_state:'CONFIRMED'};
const expense={...base,id:'expense',title:'Expense',type:'EXPENSE',from_account_id:'one',to_account_id:null,categoryEligible:true,signedAmount:-100,direction:'OUT',book:{id:'expense',categoryId:null,type:'EXPENSE',title:'Expense'}} as unknown as LedgerRow;
const transfer={...base,id:'transfer',title:'Transfer',type:'TRANSFER',from_account_id:'one',to_account_id:'two',categoryEligible:false,signedAmount:null,direction:'TRANSFER'} as unknown as LedgerRow;
const refund={...base,id:'refund',title:'Refund',type:'REFUND',from_account_id:null,to_account_id:'two',categoryEligible:false,signedAmount:100,direction:'IN',book:{id:'refund',type:'REFUND'}} as unknown as LedgerRow;
const props={accounts,categories:[],ready:true,period:{preset:'month',from:'2026-11-01',to:'2026-11-30'},select:()=>{},navigate:()=>{}} as Props;
async function mount(){const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example/money/ledger'});Object.assign(globalThis,{React,self:dom.window,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,ResizeObserver:class { observe(){} disconnect(){} },Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});const {createRoot}=await import('react-dom/client');return {dom,root:createRoot(document.getElementById('root')!)};}
async function tick(){await act(async()=>{await new Promise(r=>setTimeout(r,8));});}
function page(path:string){if(path==='/category-groups'||path==='/loans')return [];if(path.startsWith('/account-ledger/rows/'))return expense;if(path.startsWith('/account-ledger/pending?'))return {items:[{id:'raw',title:'Unposted RAW',occurredAt:base.occurred_at,amount:99,accountId:null,reason:'확인 필요'}],total:1,accountCounts:[],summary:{total:1,unresolved:0}};if(path.startsWith('/account-ledger?')){const q=new URL(path,'https://test.example').searchParams,scope=q.get('accountId'),all=[expense,transfer,refund],items=all.filter(row=>!scope||row.from_account_id===scope||row.to_account_id===scope).map(row=>({...row,signedAmount:scope?(row.from_account_id===scope?-row.amount:row.amount):row.signedAmount}));return {items,total:items.length,accountCounts:[{accountId:'one',count:120},{accountId:'two',count:85}],summary:{total:items.length,unresolved:0,currencies:['KRW']}};}if(path.endsWith('/activity'))return {recommendations:[],saves:[]};if(path.endsWith('/usage'))return {items:[]};return {items:[]};}
test('account chips select exactly one scope and full counts are independent of current page',async()=>{const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;let writes=0;api.get=async<T,>(path:string)=>page(path) as T;api.post=async()=>{writes++;throw Error('Unexpected write');};try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('[data-transaction-id="transfer"]').length,1);assert.equal(document.querySelectorAll('.al-account-filter button[aria-pressed=true]').length,1);assert.match(document.querySelector('.al-account-buttons')!.textContent!,/120/);assert.equal(document.querySelectorAll('[aria-label$="생활 카테고리"]').length,2);const one=document.querySelectorAll<HTMLButtonElement>('.al-account-chip')[0];await act(()=>one.click());await tick();assert.equal(document.querySelectorAll('.al-account-filter button[aria-pressed=true]').length,1);assert.equal(document.querySelectorAll('[data-transaction-id]').length,2);assert.match(document.querySelector('[data-transaction-id="transfer"] .al-amount')!.textContent!,/−100/);await act(()=>document.querySelectorAll<HTMLButtonElement>('.al-account-chip')[1].click());await tick();assert.match(document.querySelector('[data-transaction-id="transfer"] .al-amount')!.textContent!,/\+100/);await act(()=>document.querySelector<HTMLButtonElement>('.al-account-all')!.click());await tick();assert.equal(document.querySelectorAll('[data-transaction-id]').length,3);assert.equal(writes,0);}finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}});
test('pending notifications are isolated from canonical table and link to existing review',async()=>{const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get;api.get=async<T,>(path:string)=>page(path) as T;try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();await act(()=>[...document.querySelectorAll<HTMLButtonElement>('.al-toolbar nav button')].find(b=>b.textContent==='미처리 알림')!.click());await tick();assert.equal(document.querySelector('.al-table'),null);assert.match(document.body.textContent!,/금융 거래와 별도/);assert.match(document.body.textContent!,/집계 제외/);assert.equal(document.querySelector<HTMLAnchorElement>('.al-raw a')!.getAttribute('href'),'/money/review');assert.match(document.body.textContent!,/Unposted RAW/);}finally{await act(()=>root.unmount());api.get=get;dom.window.close();}});

test('lost metadata response retains original request and recovery banner when the row becomes hidden',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;const writes:{requestId:string}[]=[];
 api.get=async<T,>(path:string)=>(path.includes('/outcomes/')?{status:'UNKNOWN'}:page(path)) as T;
 api.post=async<T,>(path:string,body:unknown)=>{if(path.endsWith('/metadata')){writes.push(body as {requestId:string});throw Error('Response lost');}return {} as T;};
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="Expense 제목 수정"]')!.click());await tick();const input=document.querySelector<HTMLInputElement>('[aria-label="Expense 제목 편집"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Owner title');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await act(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await tick();
  assert.equal(writes.length,1);assert.match(document.body.textContent!,/제목·메모 저장 결과 확인 필요/);const original=writes[0].requestId;
  await act(()=>document.querySelectorAll<HTMLButtonElement>('.al-account-chip')[1].click());await tick();assert.equal(document.querySelector('[data-transaction-id="expense"]'),null);assert.match(document.body.textContent!,new RegExp(original));
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='제목·메모 원래 요청 결과 확인')!.click());await tick();assert.equal(writes.length,1);assert.match(document.body.textContent!,new RegExp(original));
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

test('a live evidence refresh cannot silently replace the financial draft baseline',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get;let current=expense,cache:ReturnType<typeof useMoneyCache>|null=null;
 function Capture(){cache=useMoneyCache();return null;}
 api.get=async<T,>(path:string)=>(path.startsWith('/account-ledger/rows/')?current:page(path)) as T;
 try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><Capture/><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="Expense 상세 편집"]')!.click());await tick();
  const select=document.querySelector<HTMLSelectElement>('[aria-label="편집 금융 유형"]')!;
  await act(()=>{select.value='TRANSFER';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await tick();
  current={...expense,version:2,fingerprint:'changed-evidence',amount:200};await act(()=>cache!.invalidate(key=>key==='/account-ledger/rows/expense'));await tick();
  assert.match(document.querySelector('.al-editor')!.textContent!,/현재 서버: 버전 2/);assert.equal([...document.querySelectorAll<HTMLButtonElement>('.al-editor button')].find(b=>b.textContent==='방향·카테고리 저장')!.disabled,true);assert.equal((document.querySelector('[aria-label="편집 금융 유형"]') as HTMLSelectElement).value,'TRANSFER');
 }finally{await act(()=>root.unmount());api.get=get;dom.window.close();}
});

test('Shadow Mode reports stored results and recovers with the same run ID',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;
 const runs:string[]=[];
 const receipt={total:1,evaluated:1,distribution:{PROPOSE_ONLY:1},items:[],cashDelta:0};
 api.get=async<T,>(path:string)=>{
  if(path.startsWith('/financial-engine/shadow-runs/'))return receipt as T;
  if(path.startsWith('/financial-engine/backfill-preview'))return receipt as T;
  if(path==='/financial-engine/status')return {unresolvedCount:1,engineVersion:'1.1.0',autoConfirmEnabled:false} as T;
  if(path.startsWith('/financial-engine/candidates'))return {total:1,items:[]} as T;
  return page(path) as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
  assert.equal(path,'/financial-engine/shadow-runs');
  runs.push((body as {requestId:string}).requestId);
  if(runs.length===1)throw new Error('응답을 받지 못했습니다.');
  return {...receipt,id:runs[0]} as T;
 };
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));
  await act(()=>button('금융유형 자동분류').click());await tick();
  await act(()=>button('과거 미확정 읽기 전용 평가').click());await tick();
  assert.match(document.querySelector('.al-engine-receipt')!.textContent!,/읽기 전용 평가 결과/);
  assert.equal(runs.length,0);
  await act(()=>button('Shadow 실행').click());await tick();
  await act(()=>button('같은 Shadow 요청 다시 확인').click());await tick();
  assert.deepEqual(runs,[runs[0],runs[0]]);
  assert.match(document.querySelector('.al-engine-receipt')!.textContent!,/1 \/ 1건 평가/);
  assert.match(document.querySelector('.al-engine-receipt')!.textContent!,/확정 후보 1건/);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

test('review link opens the canonical ledger row outside the current period and page',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get;
 const id='4d5fc7a9-6472-48f2-8408-800642610020',reads:string[]=[];
 api.get=async<T,>(path:string)=>{reads.push(path);return (path==='/account-ledger/rows/'+id?{...expense,id,title:'연결된 합성 거래'}:page(path)) as T;};
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams({transactionId:id})}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));
  await tick();
  assert.ok(reads.includes('/account-ledger/rows/'+id));
  assert.ok(document.querySelector('[aria-label="연결된 원장 거래"] .al-editor'));
 }finally{await act(()=>root.unmount());api.get=get;dom.window.close();}
});

type DecisionRequest={requestId:string;expectedVersion:number;financialType?:string;decisionRequestId?:string};
const outgoing={...expense,counterparty_text:'오픈 송금 이체',quickConfirmAvailable:false,id:'debit',title:'Debit',meaning_state:'UNRESOLVED',categoryEligible:false} as LedgerRow;
const incoming={...refund,id:'credit',title:'Credit',type:'INCOME',meaning_state:'UNRESOLVED',categoryEligible:false} as LedgerRow;
async function withDecisions(run:(tools:{
 choose:(id:string,type:string)=>Promise<void>;calls:{id:string;command:DecisionRequest}[];reads:string[];
 intercept:(fn:((id:string,command:DecisionRequest)=>Promise<void>)|null)=>void;
 dom:JSDOM;records:Map<string,LedgerRow>;reload:()=>Promise<void>;showPeriod:(period:Props['period'])=>Promise<void>;
})=>Promise<void>){
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount();
 const get=api.get,patch=api.patch,post=api.post,records=new Map([outgoing,incoming,expense].map(row=>[row.id,row]));
 const calls:{id:string;command:DecisionRequest}[]=[],reads:string[]=[];
 let before:((id:string,command:DecisionRequest)=>Promise<void>)|null=null;
 api.get=async<T,>(path:string)=>{
  reads.push(path);
  if(path.startsWith('/account-ledger?')){
   const state=new URL(path,'https://test.example').searchParams.get('state');
   const items=[...records.values()].filter(row=>state==='UNRESOLVED'?row.meaning_state==='UNRESOLVED':state==='RELATION_PENDING'?row.relationStatus&&row.relationStatus!=='NONE':true);
   return {...page(path),items,total:items.length} as T;
  }
  if(path.startsWith('/account-ledger/rows/'))return records.get(path.split('/').at(-1)!) as T;
  return page(path) as T;
 };
 api.post=async()=>{throw Error('Unexpected multi-step financial write');};
 api.patch=async<T,>(path:string,body:unknown)=>{
  const match=path.match(/^\/account-ledger\/rows\/([^/]+)\/financial-type(\/undo)?$/);assert.ok(match);
  const id=match[1],command=body as DecisionRequest;calls.push({id,command});
  if(before)await before(id,command);
  const previous=records.get(id)!;if(previous.version!==command.expectedVersion)throw new ApiError(409,'Conflict');
  if(match[2]){assert.ok(command.decisionRequestId);assert.equal(command.financialType,undefined);}
  const type=match[2]?'UNRESOLVED':command.financialType!,ordinary=['EXPENSE','INCOME'].includes(type),pending=type==='TRANSFER';
  const row:LedgerRow={...previous,type:ordinary?type:previous.type,declaredFinancialType:type,meaning_state:ordinary?'CONFIRMED':'UNRESOLVED',categoryEligible:ordinary,meaningApplied:!pending,relationStatus:pending?'TRANSFER_PAIR_PENDING':'NONE',version:previous.version+1};
  records.set(id,row);
  return {requestId:command.requestId,transactionId:id,intentSaved:true,meaningApplied:!pending,currentVersion:row.version,row} as T;
 };
 async function choose(id:string,type:string){
  await act(()=>document.querySelector<HTMLButtonElement>('[data-transaction-id="'+id+'"] .al-type-trigger')!.click());
  const group=[...document.querySelectorAll<HTMLButtonElement>('[aria-label="거래 방향"] button')];
  assert.deepEqual(group.map(button=>button.textContent),['입금','출금','이체']);
  const direction=type==='INCOME'?0:type==='EXPENSE'?1:2;
  assert.equal(group[direction].disabled,false);
  assert.equal(group.length,3);await act(()=>group[direction].click());await tick();

 }
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();
  async function reload(){
   await act(()=>root.render(null));
   await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();
  }
  async function showPeriod(period:Props['period']){
   await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props} period={period}/></MoneyDataProvider></SearchParamsContext>));await tick();
  }
  await run({choose,calls,reads,records,dom,reload,showPeriod,intercept:fn=>{before=fn;}});
 }finally{await act(()=>root.unmount());api.get=get;api.patch=patch;api.post=post;dom.window.close();}
}
test('ordinary outgoing and incoming decisions each send one versioned PATCH, enable categories and support durable undo',async()=>{
 await withDecisions(async({choose,calls,reads,records})=>{
  await choose('debit','EXPENSE');await choose('credit','INCOME');
  assert.equal(calls.length,2);assert.equal(calls[0].command.expectedVersion,1);
  assert.deepEqual(Object.keys(calls[0].command).sort(),['expectedVersion','financialType','requestId']);
  assert.ok(!reads.some(path=>path.startsWith('/account-ledger/rows/')));
  assert.ok(document.querySelector('[aria-label="Debit 생활 카테고리"]'));assert.ok(document.querySelector('[aria-label="Credit 생활 카테고리"]'));
  assert.equal(document.querySelector('.al-editor'),null);
  await act(()=>document.querySelector<HTMLButtonElement>('[data-transaction-id=debit] .al-decision-result button')!.click());await tick();
  assert.equal(calls[2].command.decisionRequestId,calls[0].command.requestId);assert.equal(calls[2].command.financialType,undefined);assert.equal(calls[2].command.expectedVersion,2);
  assert.notEqual(calls[0].command.requestId,calls[2].command.requestId);
  assert.equal(records.get('debit')!.signedAmount,-100);assert.ok(document.querySelector('[aria-label="Debit 생활 카테고리"]'));
 });
});
test('W01 unresolved owner declaration can reselect the same inline direction despite transfer keywords',async()=>{
 await withDecisions(async({choose,records,reload,calls})=>{
  records.set('debit',{...records.get('debit')!,declaredFinancialType:'EXPENSE',meaningApplied:false});
  await reload();await choose('debit','EXPENSE');
  assert.equal(calls.length,1);assert.equal(calls[0].command.financialType,'EXPENSE');
 });
});
test('W01/W02 explicit same-direction choices on unresolved declarations work in detail and batch',async()=>{
 await withDecisions(async({dom,calls,records,reload})=>{
  records.set('debit',{...records.get('debit')!,declaredFinancialType:'EXPENSE',meaningApplied:false});
  records.set('credit',{...records.get('credit')!,declaredFinancialType:'INCOME',meaningApplied:false});
  await reload();
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="Debit 상세 편집"]')!.click());await tick();
  assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="편집 금융 유형"]')!.value,'EXPENSE');
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('.al-editor button')].find(b=>b.textContent==='방향·카테고리 저장')!.click());await tick();
  assert.equal(calls[0].command.financialType,'EXPENSE');
  await act(()=>document.querySelector<HTMLInputElement>('[aria-label="Credit 분류 선택"]')!.click());
  const select=document.querySelector<HTMLSelectElement>('[aria-label="일괄 금융유형"]')!;
  await act(()=>{select.value='INCOME';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='선택 거래에 적용')!.click());await tick();
  assert.deepEqual(calls.map(c=>c.command.financialType),['EXPENSE','INCOME']);
 });
});
test('W03 filtered-out decision reports pending from the durable receipt',async()=>{
 await withDecisions(async({choose})=>{
  await choose('expense','TRANSFER');
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('nav button')].find(b=>b.textContent==='미처리 알림')!.click());await tick();
  assert.match(document.querySelector('.al-pending')!.textContent!,/금융 반영 대기.*상대 거래 연결 대기/);
 });
});
test('unmatched relationship persists on confirmed row and is discoverable under follow-up',async()=>{
 await withDecisions(async({choose,calls,reads})=>{
  await choose('expense','TRANSFER');
  const row=document.querySelector('[data-transaction-id=expense]')!;
  assert.match(row.textContent!,/상대 거래 연결 대기/);assert.match(row.textContent!,/금융 반영 대기/);
  assert.equal(row.querySelector('[aria-label="Expense 생활 카테고리"]'),null);
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('nav button')].find(b=>b.textContent==='후속 연결 대기')!.click());await tick();
  assert.equal(document.querySelectorAll('.al-row').length,1);
  assert.ok(reads.some(path=>path.includes('state=RELATION_PENDING')));assert.equal(calls.length,1);
 });
});
test('unknown outcome locks only its row and replays exactly the original request',async()=>{
 await withDecisions(async({choose,calls,intercept,reload,dom})=>{
  intercept(async(id)=>{if(id==='debit')throw Error('Lost response');});
  await choose('debit','EXPENSE');
  assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Debit 금융 유형"]')!.disabled,true);
  assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Expense 생활 카테고리"]')!.disabled,false);
  await choose('credit','INCOME');
  const stored=dom.window.sessionStorage.getItem('ledger-type-requests:dev-fixed-owner');
  assert.ok(stored);assert.ok(!stored.includes('Debit')&&!stored.includes('KRW'));
  await reload();assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Debit 금융 유형"]')!.disabled,true);
  intercept(null);
  await act(()=>document.querySelector<HTMLButtonElement>('[data-transaction-id=debit] .al-decision-result button')!.click());await tick();
  assert.equal(dom.window.sessionStorage.getItem('ledger-type-requests:dev-fixed-owner'),null);
  assert.deepEqual(calls[0],calls[2]);assert.ok(document.querySelector('[aria-label="Debit 생활 카테고리"]'));
 });
});
test('picker keyboard navigation restores focus on Escape and Enter saves exactly one choice',async()=>{
 await withDecisions(async({dom,calls})=>{
  const trigger=document.querySelector<HTMLButtonElement>('[aria-label="Debit 금융 유형"]')!;
  const key=async(name:string)=>{await act(()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true})));};
  const direction=()=>[...document.querySelectorAll<HTMLButtonElement>('[aria-label="거래 방향"] button')];
  await act(()=>trigger.click());assert.equal(document.activeElement,direction()[1]);
  assert.equal(direction()[0].disabled,false);
  assert.equal(document.querySelector('[role=option]'),null);
  await key('Escape');assert.equal(document.activeElement,trigger);assert.equal(calls.length,0);
  await act(()=>trigger.click());await key('ArrowDown');assert.equal(document.activeElement,direction()[2]);
  await key('Enter');await tick();
  assert.equal(calls.length,1);assert.equal(calls[0].command.financialType,'TRANSFER');
 });
});
test('explicit bulk carries checkbox-time versions and retries only failed selections',async()=>{
 await withDecisions(async({calls,dom,records,intercept})=>{
  const all=document.querySelector<HTMLInputElement>('[aria-label="현재 페이지 거래 선택"]')!;
  await act(()=>all.click());
  const select=document.querySelector<HTMLSelectElement>('[aria-label="일괄 금융유형"]')!;
  await act(()=>{select.value='TRANSFER';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  intercept(async(id)=>{if(id==='credit')throw new ApiError(422,'보류');});
  const apply=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='선택 거래에 적용')!;
  await act(()=>apply().click());await tick();
  assert.equal(calls.length,3);assert.ok(calls.every(c=>c.command.expectedVersion===1));
  assert.match(document.querySelector('.al-batch-result')!.textContent!,/연결 대기 2건.*확인 필요 1건/);
  intercept(null);await act(()=>apply().click());await tick();
  assert.equal(calls.length,4);assert.equal(calls[3].id,'credit');assert.equal(records.get('credit')?.declaredFinancialType,'TRANSFER');
 });
});
test('period changes clear selection and a late bulk failure cannot restore it after switching back',async()=>{
 await withDecisions(async({calls,dom,intercept,showPeriod})=>{
  const checkbox=(id:string)=>document.querySelector<HTMLInputElement>('[data-transaction-id="'+id+'"] input[type=checkbox]')!;
  await act(()=>checkbox('debit').click());
  await showPeriod({...props.period});assert.equal(checkbox('debit').checked,true);
  const type=document.querySelector<HTMLSelectElement>('[aria-label="일괄 금융유형"]')!;
  await act(()=>{type.value='TRANSFER';type.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  let finish!:()=>void;
  const delayed=new Promise<void>(resolve=>{finish=resolve;});
  intercept(async()=>{await delayed;throw new ApiError(422,'보류');});
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='선택 거래에 적용')!.click());
  assert.equal(calls.length,1);
  await showPeriod({...props.period,from:'2026-12-01',to:'2026-12-31'});assert.equal(checkbox('debit').checked,false);
  await showPeriod(props.period);assert.equal(checkbox('debit').checked,false);
  assert.equal(checkbox('credit').disabled,true);
  await act(async()=>{finish();await delayed;});await tick();
  assert.equal(checkbox('debit').checked,false);assert.equal(checkbox('credit').disabled,false);
  assert.equal(document.querySelector('.al-batch-result'),null);
 });
});
test('same-row conflict keeps desired type, refreshes latest row and requires explicit reapply',async()=>{
 await withDecisions(async({choose,records,calls})=>{
  records.set('debit',{...records.get('debit')!,version:2});await choose('debit','EXPENSE');
  assert.match(document.querySelector('[data-transaction-id=debit]')!.textContent!,/소비.*거래가 변경/);
  await act(()=>document.querySelector<HTMLButtonElement>('[data-transaction-id=debit] .al-decision-result button')!.click());await tick();
  assert.equal(calls[1].command.expectedVersion,2);assert.notEqual(calls[0].command.requestId,calls[1].command.requestId);
 });
});

test('source-backed 8,000 KRW incoming cash saves a category on selection without opening financial details',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount();
 const get=api.get,post=api.post;
 const category={id:'income',name:'합성 수입',kind:'INCOME' as const,color:'#778899',archived:false,version:1};
 let row:LedgerRow={...incoming,amount:8000,signedAmount:8000,book:undefined,classificationVersion:3,quickConfirmAvailable:true,sourceCount:1};
 let acknowledge!:()=>void;
 const requests:{path:string;body:Record<string,unknown>}[]=[];
 api.get=async<T,>(path:string)=>(path.startsWith('/account-ledger?')?{...page(path),items:[row]}:path.endsWith('/rows/credit')?row:page(path)) as T;
 api.post=async<T,>(path:string,body:unknown)=>{
  requests.push({path,body:body as Record<string,unknown>});
  await new Promise<void>(resolve=>{acknowledge=resolve;});
  row={...row,meaning_state:'CONFIRMED',version:2,classificationVersion:4,categoryEligible:true,book:{...incoming.book!,categoryId:category.id,classificationVersion:4}};
  return {status:'APPLIED',result:{row}} as T;
 };
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props} categories={[category]}/></MoneyDataProvider></SearchParamsContext>));await tick();
  const transaction=()=>document.querySelector('[data-transaction-id=credit]')!;
  assert.match(transaction().textContent!,/8,000/);
  assert.match(transaction().textContent!,/금융 의미 미확정/);
  await act(()=>transaction().querySelector<HTMLButtonElement>('[aria-label="Credit 생활 카테고리"]')!.click());
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="합성 수입 직접 지정"]')!.click());await tick();
  assert.equal(requests.length,1);
  assert.equal(requests[0].path,'/account-ledger/rows/credit/category');
  assert.equal(requests[0].body.baseDirection,'INCOME');
  assert.equal(requests[0].body.expectedClassificationVersion,3);
  assert.match(transaction().textContent!,/저장 중/);
  assert.doesNotMatch(transaction().textContent!,/저장됨/);
  assert.equal(document.querySelector('.al-editor-row'),null);
  await act(()=>acknowledge());await tick();
  assert.match(transaction().textContent!,/저장됨/);
  assert.match(transaction().textContent!,/합성 수입/);
  assert.equal(document.querySelector('.al-editor-row'),null);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

test('special category intent saves inline, recovers the same request and opens guarded details only on demand',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount();
 const get=api.get,post=api.post;
 const category={id:'bound',name:'은행 분할',kind:'EXPENSE' as const,color:'#778899',archived:false,version:2,semanticCode:'LOAN_PAYMENT' as const,semanticPolicyVersion:1};
 const ordinary={...category,id:'copy',name:'대출 상환',semanticCode:null,semanticPolicyVersion:null};
 const requests:{path:string;body:Record<string,unknown>}[]=[],reads:string[]=[];
 let row=expense;
 api.get=async<T,>(path:string)=>{
  reads.push(path);
  return (path.includes('/outcomes/')?{status:'UNKNOWN'}:path.startsWith('/account-ledger?')?{...page(path),items:[row]}:path.endsWith('/rows/expense')?row:page(path)) as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
  requests.push({path,body:body as Record<string,unknown>});
  if(requests.length===1)throw Error('Lost response');
  row={...row,semanticCategoryId:category.id,declaredFinancialType:'LOAN_PAYMENT',relationStatus:'LOAN_SPLIT_PENDING',meaning_state:'UNRESOLVED',meaningApplied:false,version:2,classificationVersion:1};
  return {status:'APPLIED',result:{row}} as T;
 };
 const transaction=()=>document.querySelector('[data-transaction-id=expense]')!;
 async function click(selector:string){const node=document.querySelector<HTMLButtonElement>(selector);assert.ok(node,selector);await act(()=>node.click());await tick();}
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props} categories={[category,ordinary]}/></MoneyDataProvider></SearchParamsContext>));await tick();
  await click('[aria-label="Expense 생활 카테고리"]');await click('[aria-label="은행 분할 직접 지정"]');
  assert.equal(requests.length,1);
  assert.match(transaction().textContent!,/은행 분할.*원래 요청 결과/);
  assert.equal(document.querySelector('.al-editor-row'),null);
  await act(()=>[...transaction().querySelectorAll('button')].find(button=>button.textContent==='원래 요청 재확인')!.click());await tick();
  assert.deepEqual(requests[0],requests[1]);
  assert.equal(reads.filter(path=>path.endsWith('/outcomes/'+requests[0].body.requestId)).length,2);
  assert.equal(requests[0].path,'/account-ledger/rows/expense/category');
  assert.equal(requests[0].body.categoryId,'bound');assert.equal(requests[0].body.semanticPolicyVersion,1);
  assert.equal(requests[0].body.thisTransactionOnly,true);assert.equal(requests[0].body.principal,undefined);
  assert.match(transaction().textContent!,/저장됨.*원금·이자 분할 미확정/);
  assert.equal(document.querySelector('[aria-label="연결 대출"]'),null);
  await act(()=>[...transaction().querySelectorAll('button')].find(button=>button.textContent==='관계 확인')!.click());await tick();
  assert.ok(document.querySelector('[aria-label="연결 대출"]'));
  assert.equal(document.querySelector('.al-editor-row')?.textContent?.includes('분류 저장'),false);
  assert.equal(requests.length,2);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

test('category conflict keeps the draft, and confirmed ordinary category undo uses fresh versions',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;
 const categories=['이전 식비','새 식비'].map((name,i)=>({id:String(i),name,kind:'EXPENSE' as const,color:'#778899',archived:false,version:1}));
 let row:LedgerRow={...expense,classificationVersion:1,book:{...expense.book!,categoryId:'0',classificationVersion:1}};
 const writes:Record<string,unknown>[]=[];
 api.get=async<T,>(path:string)=>(path.startsWith('/account-ledger?')?{...page(path),items:[row]}:path.endsWith('/rows/expense')?row:page(path)) as T;
 api.post=async<T,>(_path:string,body:unknown)=>{
  const command=body as Record<string,unknown>;
  writes.push(command);
  const nextVersion=(row.classificationVersion??0)+1;
  row={...row,classificationVersion:nextVersion,book:{...row.book!,classificationVersion:nextVersion,
   categoryId:writes.length===1?'0':String(command.categoryId)}};
  return (writes.length===1?{status:'NOT_APPLIED',result:{reason:'VERSION_CONFLICT'}}:{status:'APPLIED',result:{row}}) as T;
 };
 const cell=()=>document.querySelector('[data-transaction-id=expense] .al-category-result')!;
 function button(label:string){return [...cell().querySelectorAll('button')].find(b=>b.textContent===label)!;}
 async function pick(){
  await act(()=>cell().querySelector<HTMLButtonElement>('.category-picker button')!.click());
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="새 식비 직접 지정"]')!.click());await tick();
 }
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props} categories={categories}/></MoneyDataProvider></SearchParamsContext>));await tick();
  await pick();
  assert.match(cell().textContent!,/이전 식비.*새 식비.*저장 충돌/);
  await act(()=>button('선택 다시 적용').click());await tick();
  assert.match(cell().textContent!,/새 식비.*저장됨/);
  assert.equal(writes[1].expectedClassificationVersion,2);
  assert.notEqual(writes[0].requestId,writes[1].requestId);
  await pick();
  assert.equal(writes.length,2);
  await act(()=>button('카테고리 실행 취소').click());await tick();
  assert.equal(writes[2].categoryId,'0');
  assert.equal(writes[2].expectedClassificationVersion,3);
  assert.notEqual(writes[1].requestId,writes[2].requestId);
  assert.match(cell().textContent!,/이전 식비.*저장됨/);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

test('monthly composition persists family support and sends the account and exact cutoff to detail',async()=>{
 const {MoneyMonthlySummary}=await import('./MoneyMonthlySummary'),{dom,root}=await mount();
 const get=api.get,put=api.put;
 const cut='2026-10-31T14:59:59.999999Z';
 const before={includeFamilySupport:false,version:0};
 let preference=before;
 let drilldown:Record<string,unknown>={};
 const writes:unknown[]=[];
 const savings={accountId:'one',displayName:'확인된 저축',color:'#7FAAA4',balance:580000,known:true,observedAt:cut,status:'BANK_OBSERVED',reason:null};
 const unknown={accountId:'two',displayName:'확인할 적금',color:'#92A6BF',balance:null,known:false,observedAt:null,status:'UNKNOWN',reason:'NO_ANCHOR'};
 api.get=async<T,>(request:string)=>{
  const endpoint=request.split('?')[0];
  switch(endpoint){
   case '/v4/composition-preference':return preference as T;
   case '/v4/income-composition':return {...preference,actualIncome:110000,familySupport:30000,chartIncome:preference.includeFamilySupport?140000:110000,
    composition:preference.includeFamilySupport?[{bucket:'FAMILY_SUPPORT',categoryId:'support',amount:30000,count:1}]:[]} as T;
   case '/v4/statistical-balances':return {asOfCutoff:cut,unresolved:[],
    savings:{total:580000,confirmedPartialSum:580000,memberCount:1,knownCount:1,members:[savings]},
    installment:{total:null,confirmedPartialSum:null,memberCount:1,knownCount:0,members:[unknown]}} as T;
   case '/v4/summary':return {actualIncome:110000,consumption:0,totalExpense:0,loanRepayment:0,composition:[]} as T;
   default:return {} as T;
  }
 };
 api.put=async<T,>(request:string,value:unknown)=>{
  assert.equal(request,'/v4/composition-preference');
  writes.push(value);
  preference={includeFamilySupport:true,version:1};
  return preference as T;
 };
 const render=()=>root.render(<MoneyDataProvider><MoneyMonthlySummary from="2026-10-01" to="2026-10-31"
  scope={null} loanAccounts={['one']} categories={[]} filter={null} onFilter={value=>{drilldown={...value};return true;}}/></MoneyDataProvider>);
 try{
  await act(render);await tick();
  const charts=()=>[...document.querySelectorAll('.money-month-donut')];
  const center=(index:number)=>charts()[index].querySelector('.money-month-center strong')?.textContent;
  assert.equal(charts().length,5);
  assert.equal(center(0),'110,000원');
  assert.equal(center(4),'확인 필요');
  assert.match(charts()[4].textContent!,/확인 0\/1계좌.*잔액 근거 없음|잔액 근거 없음.*확인 0\/1계좌/);
  await act(()=>charts()[0].querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await tick();
  assert.deepEqual(writes,[{includeFamilySupport:true,expectedVersion:0}]);
  assert.equal(center(0),'140,000원');
  assert.equal(document.querySelector('.money-month-kpis strong')?.textContent,'110,000원');
  await act(()=>charts()[3].querySelector<HTMLButtonElement>('.money-month-legend button')!.click());
  assert.equal(drilldown.kind,'STOCK');
  assert.equal(drilldown.accountId,'one');
  assert.equal(drilldown.asOf,cut);
  await act(()=>root.render(null));await act(render);await tick();
  assert.equal(charts()[0].querySelector<HTMLInputElement>('input[type=checkbox]')?.checked,true);
 }finally{await act(()=>root.unmount());api.get=get;api.put=put;dom.window.close();}
});

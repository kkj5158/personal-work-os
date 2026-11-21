import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
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
async function mount(){const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example/money/ledger'});Object.assign(globalThis,{React,self:dom.window,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});const {createRoot}=await import('react-dom/client');return {dom,root:createRoot(document.getElementById('root')!)};}
async function tick(){await act(async()=>{await new Promise(r=>setTimeout(r,8));});}
function page(path:string){if(path.startsWith('/account-ledger/rows/'))return expense;if(path.startsWith('/account-ledger/pending?'))return {items:[{id:'raw',title:'Unposted RAW',occurredAt:base.occurred_at,amount:99,accountId:null,reason:'확인 필요'}],total:1,accountCounts:[],summary:{total:1,unresolved:0}};if(path.startsWith('/account-ledger?')){const q=new URL(path,'https://test.example').searchParams,scope=q.get('accountId'),all=[expense,transfer,refund],items=all.filter(row=>!scope||row.from_account_id===scope||row.to_account_id===scope).map(row=>({...row,signedAmount:scope?(row.from_account_id===scope?-row.amount:row.amount):row.signedAmount}));return {items,total:items.length,accountCounts:[{accountId:'one',count:120},{accountId:'two',count:85}],summary:{total:items.length,unresolved:0,currencies:['KRW']}};}if(path.endsWith('/activity'))return {recommendations:[],saves:[]};if(path.endsWith('/usage'))return {items:[]};return {items:[]};}
test('account chips select exactly one scope and full counts are independent of current page',async()=>{const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;let writes=0;api.get=async<T,>(path:string)=>page(path) as T;api.post=async()=>{writes++;throw Error('Unexpected write');};try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('[data-transaction-id="transfer"]').length,1);assert.equal(document.querySelectorAll('.al-account-filter button[aria-pressed=true]').length,1);assert.match(document.querySelector('.al-account-buttons')!.textContent!,/120/);assert.equal(document.querySelectorAll('[aria-label$="생활 카테고리"]').length,1);const one=document.querySelectorAll<HTMLButtonElement>('.al-account-chip')[0];await act(()=>one.click());await tick();assert.equal(document.querySelectorAll('.al-account-filter button[aria-pressed=true]').length,1);assert.equal(document.querySelectorAll('[data-transaction-id]').length,2);assert.match(document.querySelector('[data-transaction-id="transfer"] .al-amount')!.textContent!,/−100/);await act(()=>document.querySelectorAll<HTMLButtonElement>('.al-account-chip')[1].click());await tick();assert.match(document.querySelector('[data-transaction-id="transfer"] .al-amount')!.textContent!,/\+100/);await act(()=>document.querySelector<HTMLButtonElement>('.al-account-all')!.click());await tick();assert.equal(document.querySelectorAll('[data-transaction-id]').length,3);assert.equal(writes,0);}finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}});
test('table financial choice opens immediate inline draft, scope switch discards it without writes',async()=>{const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;let writes=0;api.get=async<T,>(path:string)=>page(path) as T;api.post=async()=>{writes++;throw Error('Unexpected write');};try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();const select=document.querySelector<HTMLSelectElement>('[aria-label="Expense 금융 유형"]')!;await act(()=>{select.value='UNRESOLVED';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await tick();assert.ok(document.querySelector('#ledger-editor-expense'));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.querySelector('[aria-label="편집 금융 유형"]')?.getAttribute('value'),null);assert.equal((document.querySelector('[aria-label="편집 금융 유형"]') as HTMLSelectElement).value,'UNRESOLVED');assert.equal(writes,0);await act(()=>document.querySelector<HTMLButtonElement>('.al-account-chip')!.click());await tick();assert.equal(document.querySelector('.al-editor'),null);assert.equal(writes,0);}finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}});
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
  const select=document.querySelector<HTMLSelectElement>('[aria-label="Expense 금융 유형"]')!;await act(()=>{select.value='UNRESOLVED';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await tick();
  current={...expense,version:2,fingerprint:'changed-evidence',amount:200};await act(()=>cache!.invalidate(key=>key==='/account-ledger/rows/expense'));await tick();
  assert.match(document.querySelector('.al-editor')!.textContent!,/현재 서버: 버전 2/);assert.equal([...document.querySelectorAll<HTMLButtonElement>('.al-editor button')].find(b=>b.textContent==='금융 유형 영향 확인')!.disabled,true);assert.equal((document.querySelector('[aria-label="편집 금융 유형"]') as HTMLSelectElement).value,'UNRESOLVED');
 }finally{await act(()=>root.unmount());api.get=get;dom.window.close();}
});

test('one-click unresolved expense uses existing preview and execute without amount/time edits',async()=>{
 const {AccountLedger}=await import('./MoneyAccountLedger'),{dom,root}=await mount(),get=api.get,post=api.post;
 const unresolved={...expense,id:'quick',title:'Quick',type:'EXPENSE',meaning_state:'UNRESOLVED',sourceCount:1,direction:'OUT',from_account_id:'one',to_account_id:null,version:1,fingerprint:'current-quick'} as LedgerRow;
 const writes:{path:string;body:any}[]=[];
 api.get=async<T,>(path:string)=>{if(path==='/account-ledger/rows/quick')return unresolved as T;if(path.startsWith('/account-ledger?'))return {...page(path),items:[unresolved],total:1} as T;return page(path) as T;};
 api.post=async<T,>(path:string,body:unknown)=>{writes.push({path,body});return (path.endsWith('/preview')?{status:'APPLIED',previewToken:'locked-token'}:{status:'APPLIED'}) as T;};
 try{
  await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));await tick();
  const button=document.querySelector<HTMLButtonElement>('[aria-label="Quick 현재 금융유형 빠른 확정"]');
  assert.ok(button);
  await act(()=>button!.click());await tick();
  assert.equal(writes.length,2);
  assert.match(writes[0].path,/\/preview$/);assert.match(writes[1].path,/\/execute$/);
  assert.equal(writes[0].body.edit.action,'TYPE');assert.equal(writes[0].body.edit.type,'EXPENSE');
  assert.equal(writes[0].body.edit.expectedVersion,1);assert.equal(writes[0].body.fingerprint,'current-quick');
  assert.equal(writes[1].body.previewToken,'locked-token');
  assert.equal(writes[0].body.edit.requestId,writes[1].body.edit.requestId);
  assert.equal(writes[0].body.edit.amount,undefined);assert.equal(writes[0].body.edit.occurredAt,undefined);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
});

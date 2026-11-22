import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {moneyApi as api,type Category} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import type {Props} from './MoneyWebViews';
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
async function fixture(run:(root:import('react-dom/client').Root)=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example/money/bookkeeping'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const get=api.get,post=api.post;
 try{await run(root);}finally{await act(()=>root.unmount());api.get=get;api.post=post;dom.window.close();}
}
async function click(label:string){
 const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent===label);
 assert.ok(b,label);await act(()=>b.click());
}
test('deletion requires impact confirmation, retries an unknown outcome under the original ID, and restores the original transaction',()=>fixture(async root=>{
 const {RegistrationAction,RegistrationUndoNotice}=await import('./MoneyRegistration');
 const calls:{path:string;command:Record<string,unknown>}[]=[];
 api.get=async<T,>(path:string)=>{
  if(path.endsWith('/impact'))return {canDelete:true,reason:null,amount:120,currency:'KRW',version:3,sourceCount:1} as T;
  if(path.endsWith('/context'))return {version:4,loanVersion:null} as T;
  assert.equal(path,'/ai/classification/outcomes/'+calls[0].command.requestId);return {status:'UNKNOWN'} as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{calls.push({path,command:body as Record<string,unknown>});
  if(calls.length===1)throw Error('response lost');
  return {status:'APPLIED',result:{transaction:{version:calls.length===2?4:5},cancellationId:'cancel-1'}} as T;
 };
 await act(()=>root.render(<MoneyDataProvider><RegistrationAction id="tx" version={3}/><RegistrationUndoNotice/></MoneyDataProvider>));
 await click('삭제');assert.equal(calls.length,0);assert.match(document.body.textContent!,/원본 1건/);
 await click('삭제 확인');await click('원래 요청 확인·재시도');
 assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].command.simpleDelete,true);
 await click('복원');assert.equal(calls[2].path,'/registration/tx/restore');assert.equal(calls[2].command.cancellationId,'cancel-1');
 assert.equal(calls[2].command.expectedVersion,4);
}));
test('protected relationship displays its correction route and sends no cancellation',()=>fixture(async root=>{
 const {RegistrationAction}=await import('./MoneyRegistration');
 api.get=async<T,>()=>({canDelete:false,reason:'대출 정정에서 확인하세요.',amount:120,currency:'KRW',version:3,sourceCount:1}) as T;
 let posts=0;api.post=async()=>{posts++;throw Error('unexpected mutation');};
 await act(()=>root.render(<MoneyDataProvider><RegistrationAction id="loan" version={3}/></MoneyDataProvider>));
 await click('삭제');assert.match(document.body.textContent!,/대출 정정/);assert.doesNotMatch(document.body.textContent!,/삭제 확인/);assert.equal(posts,0);
}));
test('ledger assignment uses searchable category tree, filters by direction and sends the observed versions and fingerprint',()=>fixture(async root=>{
 const {AccountLedger}=await import('./MoneyAccountLedger');
 const row={id:'tx',title:'Sample',type:'EXPENSE',meaning_state:'CONFIRMED',version:2,fingerprint:'evidence-v2',occurred_at:'2026-11-15T00:00:00Z',amount:100,currency:'KRW',from_account_id:'one',to_account_id:null,direction:'OUT',sourceCount:0,sources:[],book:{id:'tx',type:'EXPENSE',title:'Sample',classificationVersion:7}};
 const categories=[{id:'food',name:'식비',kind:'EXPENSE',color:'#24775d',iconType:'EMOJI',iconValue:'🍚'},{id:'income',name:'급여',kind:'INCOME'}] as Category[];
 const props={accounts:[],categories,ready:true,period:{preset:'month',from:'2026-11-01',to:'2026-11-30'},select:()=>{},navigate:()=>{}} as Props;
 const writes:Record<string,unknown>[]=[];
 api.get=async<T,>(path:string)=>{
  if(path.startsWith('/account-ledger?'))return {items:[row],total:1,accountCounts:[],summary:{unresolved:0,currencies:['KRW']}} as T;
  if(path==='/account-ledger/rows/tx')return row as T;
  if(path==='/category-groups')return [] as T;
  if(path.endsWith('/activity'))return {recommendations:[],saves:[]} as T;
  return {items:[]} as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
  assert.equal(path,'/account-ledger/rows/tx/category');
  writes.push(body as Record<string,unknown>);
  return {status:'APPLIED',result:{row:{...row,classificationVersion:8,book:{...row.book,categoryId:'food',classificationVersion:8}}}} as T;
 };
 await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountLedger {...props}/></MoneyDataProvider></SearchParamsContext>));
 const trigger=document.querySelector<HTMLButtonElement>('button[aria-label="Sample 생활 카테고리"]');assert.ok(trigger);
 await act(()=>trigger.click());assert.ok(document.querySelector('[aria-label="카테고리 검색"]'));assert.equal(document.querySelector('[aria-label="급여 직접 지정"]'),null);
 const accent=document.querySelector<HTMLElement>('.money-tree-row .category-picker-icon')!;
 assert.equal(accent.style.borderInlineStartColor,'rgb(36, 119, 93)');
 assert.match(accent.textContent!,/🍚/);
 const stylesheet=document.createElement('style');
 stylesheet.textContent=readFileSync('app/money/money-category.css','utf8');document.head.append(stylesheet);
 const columns=[...document.querySelectorAll<HTMLElement>('.money-tree-scroll')];
 assert.equal(columns.length,3);
 assert.ok(columns.every(column=>window.getComputedStyle(column).overflow==='auto'));
 await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="식비 직접 지정"]')!.click());
 assert.equal(writes.length,1);assert.equal(writes[0].categoryId,'food');assert.equal(writes[0].expectedVersion,2);assert.equal(writes[0].expectedClassificationVersion,7);assert.equal(writes[0].fingerprint,'evidence-v2');assert.equal(writes[0].thisTransactionOnly,true);assert.ok(writes[0].requestId);
 assert.equal(document.activeElement,trigger);
 assert.match(trigger.textContent!,/식비/);
 await act(()=>trigger.click());
 assert.match(document.querySelector('.category-recents')!.textContent!,/식비/);
}));

test('installment KPI and donut distinguish bank observation, partial coverage, absent evidence and ledger estimates',()=>fixture(async root=>{
 const {MoneyMonthlySummary}=await import('./MoneyMonthlySummary');
 const bank={accountId:'bank',displayName:'관측 적금',balance:4700,status:'BANK_OBSERVED',known:true,reason:null};
 const absent={accountId:'absent',displayName:'미확인 적금',balance:null,status:'UNKNOWN',known:false,reason:'NO_ANCHOR'};
 const estimate={accountId:'estimate',displayName:'계산 적금',balance:7900,status:'LEDGER_ESTIMATE',known:false,reason:'NO_OBSERVATION_AT_CUTOFF'};
 const cases=[
  {name:'bank',members:[bank],total:4700,partial:null,amount:'4,700원',note:'은행 명세 확인',legend:'4,700원'},
  {name:'partial',members:[bank,absent],total:null,partial:4700,amount:'확인 필요',note:'확인된 부분 합계 4,700원',legend:'확인된 부분 합계 4,700원'},
  {name:'absent',members:[absent],total:null,partial:null,amount:'확인 필요',note:'잔액 근거 없음',legend:'잔액 근거 없음'},
  {name:'estimate',members:[estimate],total:null,partial:null,amount:'확인 필요',note:'장부 기준 추정',legend:'추정 7,900원'},
 ];
 for(const item of cases){
  const knownCount=item.members.filter(member=>member.known).length;
  const group={members:item.members,knownCount,memberCount:item.members.length,total:item.total,confirmedPartialSum:item.partial};
  api.get=async<T,>(path:string)=>(path.includes('/statistical-balances?')?{asOfCutoff:'2026-11-30T14:59:59Z',unresolved:[],savings:{...group,members:[]},installment:group}:null) as T;
  await act(()=>root.render(<MoneyDataProvider key={item.name}><MoneyMonthlySummary from="2026-11-01" to="2026-11-30" categories={[]} scope={null} loanAccounts={null} filter={null} onFilter={()=>true}/></MoneyDataProvider>));
  const kpi=document.querySelector('.money-month-kpis section:last-child')!;
  const donut=document.querySelector('.money-month-donut:last-child')!;
  assert.equal(kpi.querySelector('strong')!.textContent,item.amount,item.name);
  assert.equal(donut.querySelector('.money-month-center strong')!.textContent,item.amount,item.name);
  assert.ok(kpi.textContent!.includes(item.note),item.name);
  assert.ok(donut.textContent!.includes(item.legend),item.name);
  assert.ok(kpi.textContent!.includes('확인 '+knownCount+'/'+item.members.length+'계좌'),item.name);
  assert.ok(donut.textContent!.includes('확인 '+knownCount+'/'+item.members.length+'계좌'),item.name);
 }
}));

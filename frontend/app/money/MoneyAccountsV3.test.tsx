import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {moneyApi as api,type Account} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import type {Props} from './MoneyWebViews';
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const accounts=Array.from({length:8},(_,i)=>({id:'account-'+i,provider:'CASH',displayName:'Synthetic '+i,role:'CASH',fundGroup:i%2?'OTHER':'LIVING',archived:false,version:0,includeInAssets:false}) as Account);
const summary={calculatedAt:'2026-11-01T01:00:00Z',counts:{MISMATCH:2,MATCH:2,CHECK:4},accounts:accounts.map((account,i)=>({account,currentLedgerBalance:100,calculatedAt:'2026-11-01T01:00:00Z',basisAt:null,basis:'CALCULATED',observedBalance:i<4?0:null,observedAt:null,source:i<4?'USER_MANUAL':null,ledgerAtObservedAt:100,difference:i<2?-100:i<4?0:null,bucket:i<2?'MISMATCH':i<4?'MATCH':'CHECK',status:'TEST',reason:'Synthetic reason',independentVerification:false}))};
async function mount(){const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example/money/accounts'});Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});const {createRoot}=await import('react-dom/client');return {dom,root:createRoot(document.getElementById('root')!)};}
const props={accounts,categories:[],ready:true,period:{},select:()=>{},navigate:()=>{}} as unknown as Props;
async function tick(){await act(async()=>{await new Promise(r=>setTimeout(r,5));});}
function data(path:string){if(path==='/reconciliation-summary')return summary;if(path==='/tracking')return {income:[],expense:[],version:0};if(path==='/overview/preferences')return {accountIds:[],version:0};if(path==='/accounts/table-preferences')return {hiddenColumns:[],version:0};return [];}
test('eight-account unified table has four tracking columns, closed drawer and guarded inline naming',async()=>{
 const {AccountsV3}=await import('./MoneyAccountsV3'),{dom,root}=await mount(),get=api.get,put=api.put;let selected=0;
 api.get=async<T,>(path:string)=>data(path) as T;api.put=async()=>{throw Error('Version conflict');};
 try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountsV3 {...props} select={()=>selected++}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('thead th').length,15);assert.equal(document.querySelectorAll('tbody tr').length,8);assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(selected,0);
  const name=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Synthetic 0')!;await act(()=>name.click());const input=document.querySelector<HTMLInputElement>('[aria-label="Synthetic 0 계좌명 편집"]')!;assert.ok(input);await act(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await tick();assert.equal(input.value,'Synthetic 0');assert.match(document.body.textContent??'',/Version conflict/);assert.equal(selected,0);
 }finally{await act(()=>root.unmount());api.get=get;api.put=put;dom.window.close();}
});
test('read-only dashboard counts filter actual rows and routes to the account drawer',async()=>{
 const {ReconciliationV3}=await import('./MoneyAccountsV3'),{dom,root}=await mount(),get=api.get,post=api.post,put=api.put;let writes=0,destination='';api.get=async<T,>(path:string)=>data(path) as T;api.post=api.put=async()=>{writes++;throw Error('Unexpected write');};
 try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><ReconciliationV3 {...props} navigate={url=>destination=url}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('tbody tr').length,8);assert.equal(document.querySelectorAll('.money-v3-counts section').length,3);assert.equal(document.querySelectorAll('input[type="checkbox"]').length,0);assert.equal(document.querySelectorAll('form').length,0);
  const mismatch=[...document.querySelectorAll<HTMLButtonElement>('.money-v3-tabs button')].find(b=>b.textContent==='차이 있음 2')!;await act(()=>mismatch.click());assert.equal(document.querySelectorAll('tbody tr').length,2);await act(()=>document.querySelector<HTMLButtonElement>('tbody button')!.click());assert.match(destination,/\/money\/accounts\?account=account-/);assert.equal(writes,0);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;api.put=put;dom.window.close();}
});
test('existing financial institution requires an impact preview and explicit confirmation',async()=>{
 const {RevisionAccountPanel}=await import('./MoneyAccountRevision'),{dom,root}=await mount(),get=api.get,put=api.put;
 const bank={...accounts[0],role:'SPENDING',provider:'IBK',suffix:'0140',version:4} as Account;
 const selection={kind:'account',value:bank,edit:true} as const;
 const preview={currentProvider:'IBK',nextProvider:'KAKAO',version:4,transactions:7,linkedAlerts:5,preservedObservations:3,reviewAlerts:1,scheduledAlerts:0,collision:false,fingerprint:'impact-hash'};
 const writes:unknown[]=[];let collision=false,saved=0;
 Object.assign(dom.window.HTMLDialogElement.prototype,{
  showModal(this:HTMLDialogElement){this.setAttribute('open','');},
  close(this:HTMLDialogElement){this.removeAttribute('open');},
 });
 api.get=async<T,>(path:string)=>{
  if(path.endsWith('/provider-impact?provider=KAKAO'))return {...preview,collision} as T;
  if(path==='/overview/current-stock')return {unsupportedCurrencyAccountIds:[]} as T;
  if(path.startsWith('/transactions?'))return {items:[]} as T;
  if(path.endsWith('/deletion-eligibility'))return {allowed:false,reasons:['Synthetic transaction']} as T;
  return data(path) as T;
 };
 api.put=async<T,>(path:string,payload:unknown)=>{writes.push({path,payload});return {...bank,provider:'KAKAO',version:5} as T;};
 try{
  await act(()=>root.render(<MoneyDataProvider><RevisionAccountPanel value={bank} selection={selection} accounts={[bank]} categories={[]} onClose={()=>{}} onSaved={()=>saved++} select={()=>{}}/></MoneyDataProvider>));await tick();
  const select=[...document.querySelectorAll<HTMLSelectElement>('label select')].find(s=>s.parentElement?.querySelector('span')?.textContent==='금융기관')!;
  const choose=async()=>{await act(async()=>{select.value='KAKAO';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b=>b.textContent===name)!;
  await choose();
  assert.equal(select.value,'IBK');
  const impactText=document.querySelector('dialog')!.textContent??'';
  assert.match(impactText,/기존 거래7건 유지/);
  assert.match(impactText,/거래에 연결된 알림5건 유지/);
  assert.equal(writes.length,0);
  await act(()=>button('취소').click());
  assert.equal(document.querySelector('dialog'),null);
  assert.equal(writes.length,0);
  collision=true;
  await choose();
  assert.equal(button('금융기관 변경').disabled,true);
  await act(()=>button('취소').click());
  collision=false;
  await choose();
  await act(async()=>button('금융기관 변경').click());
  assert.deepEqual(writes,[{path:`/accounts/${bank.id}/provider`,payload:{provider:'KAKAO',expectedVersion:4,fingerprint:'impact-hash'}}]);
  assert.equal(select.value,'KAKAO');
  assert.equal(saved,1);
 }finally{await act(()=>root.unmount());api.get=get;api.put=put;dom.window.close();}
});
test('manual observation preserves KST instant and accepts signed zero and negative without rounding',async()=>{const {observationInstant,observationAmount}=await import('./MoneyBalanceObservations');assert.equal(observationInstant('2026-09-15T10:23:45'),'2026-09-15T01:23:45.000Z');assert.equal(observationAmount('0'),'0');assert.equal(observationAmount('-123.45'),'-123.45');assert.equal(observationAmount('9999999999999999.99'),'9999999999999999.99');assert.throws(()=>observationAmount(''));assert.throws(()=>observationAmount('1.001'));assert.throws(()=>observationInstant('2099-01-01T00:00:00'));});
test('editing a large observation displays and resubmits the exact server decimal text',async()=>{
 const {BalanceObservations}=await import('./MoneyBalanceObservations'),{dom,root}=await mount(),get=api.get,put=api.put;let submitted:unknown;
 const exact='9999999999999999.99',at='2026-09-15T01:23:45.123Z';
 api.get=async<T,>(path:string)=>(path.endsWith('/observations')?[{id:'observation-1',accountId:accounts[0].id,amount:10000000000000000,amountText:exact,observedAt:at,origin:'USER_MANUAL',status:'ACTIVE',version:0,createdAt:at,updatedAt:at}]:data(path)) as T;
 api.put=async<T,>(_path:string,payload:unknown)=>{submitted=payload;return {} as T;};
 try{await act(()=>root.render(<MoneyDataProvider><BalanceObservations account={accounts[0]}/></MoneyDataProvider>));await tick();
  assert.match(document.body.textContent??'',/9,999,999,999,999,999\.99원/);
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='편집')!.click());
  assert.equal(document.querySelector<HTMLInputElement>('[aria-label="직접 확인 잔액"]')!.value,exact);
  await act(()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await tick();
  assert.equal((submitted as {amount:string}).amount,exact);assert.equal((submitted as {observedAt:string}).observedAt,at);
 }finally{await act(()=>root.unmount());api.get=get;api.put=put;dom.window.close();}
});

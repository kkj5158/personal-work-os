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
test('eight-account unified table has 13 columns, closed drawer and guarded inline naming',async()=>{
 const {AccountsV3}=await import('./MoneyAccountsV3'),{dom,root}=await mount(),get=api.get,put=api.put;let selected=0;
 api.get=async<T,>(path:string)=>data(path) as T;api.put=async()=>{throw Error('Version conflict');};
 try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><AccountsV3 {...props} select={()=>selected++}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('thead th').length,13);assert.equal(document.querySelectorAll('tbody tr').length,8);assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(selected,0);
  const name=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Synthetic 0')!;await act(()=>name.click());const input=document.querySelector<HTMLInputElement>('[aria-label="Synthetic 0 계좌명 편집"]')!;assert.ok(input);await act(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await tick();assert.equal(input.value,'Synthetic 0');assert.match(document.body.textContent??'',/Version conflict/);assert.equal(selected,0);
 }finally{await act(()=>root.unmount());api.get=get;api.put=put;dom.window.close();}
});
test('read-only dashboard counts filter actual rows and routes to the account drawer',async()=>{
 const {ReconciliationV3}=await import('./MoneyAccountsV3'),{dom,root}=await mount(),get=api.get,post=api.post,put=api.put;let writes=0,destination='';api.get=async<T,>(path:string)=>data(path) as T;api.post=api.put=async()=>{writes++;throw Error('Unexpected write');};
 try{await act(()=>root.render(<SearchParamsContext value={new URLSearchParams()}><MoneyDataProvider><ReconciliationV3 {...props} navigate={url=>destination=url}/></MoneyDataProvider></SearchParamsContext>));await tick();assert.equal(document.querySelectorAll('tbody tr').length,8);assert.equal(document.querySelectorAll('.money-v3-counts section').length,3);assert.equal(document.querySelectorAll('input[type="checkbox"]').length,0);assert.equal(document.querySelectorAll('form').length,0);
  const mismatch=[...document.querySelectorAll<HTMLButtonElement>('.money-v3-tabs button')].find(b=>b.textContent==='차이 있음 2')!;await act(()=>mismatch.click());assert.equal(document.querySelectorAll('tbody tr').length,2);await act(()=>document.querySelector<HTMLButtonElement>('tbody button')!.click());assert.match(destination,/\/money\/accounts\?account=account-/);assert.equal(writes,0);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;api.put=put;dom.window.close();}
});
test('manual observation preserves KST instant and accepts signed zero and negative without rounding',async()=>{const {observationInstant,observationAmount}=await import('./MoneyBalanceObservations');assert.equal(observationInstant('2026-09-15T10:23:45'),'2026-09-15T01:23:45.000Z');assert.equal(observationAmount('0'),'0');assert.equal(observationAmount('-123.45'),'-123.45');assert.equal(observationAmount('9999999999999999.99'),'9999999999999999.99');assert.throws(()=>observationAmount(''));assert.throws(()=>observationAmount('1.001'));assert.throws(()=>observationInstant('2099-01-01T00:00:00'));});

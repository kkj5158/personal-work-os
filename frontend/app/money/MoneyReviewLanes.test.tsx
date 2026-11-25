import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {moneyApi} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import type {Props} from './MoneyWebViews';

const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});

test('the review workspace confirms a matching direction in one request and refreshes its active lane',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/review'});
  Object.assign(globalThis,{React,self:dom.window,window:dom.window,document:dom.window.document,
    HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client'),{MoneyReviewLanes}=await import('./MoneyReviewLanes');
  const root=createRoot(document.getElementById('root')!);
  const props:Props={period:{preset:'month',from:'2026-11-01',to:'2026-11-30'},accounts:[],categories:[],select:()=>{}};
  const row={id:'synthetic',title:'합성 급여',type:'INCOME',version:0,amount:84671,currency:'KRW',
    occurred_at:'2026-11-25T00:00:00Z',to_account_id:'account',meaning_state:'UNRESOLVED',reviewReason:'SOURCE_INCOMPLETE_OR_CONFLICTED'};
  let applied=false;
  const calls:string[]=[],get=moneyApi.get,patch=moneyApi.patch;
  moneyApi.get=async<T,>(path:string)=>{
    calls.push(path);
    if(path.includes('lane=UNRESOLVED'))return {items:applied?[]:[row],total:applied?0:1} as T;
    return {items:[],total:0} as T;
  };
  moneyApi.patch=async<T,>(path:string,input:unknown)=>{
    assert.equal(applied,false);
    assert.equal(path,'/account-ledger/rows/synthetic/financial-type');
    const command=input as {requestId:string;financialType:string;expectedVersion:number;requireApplied:boolean};
    assert.ok(command.requestId);assert.equal(command.expectedVersion,0);
    assert.equal(command.financialType,'INCOME');assert.equal(command.requireApplied,true);
    applied=true;
    return {requestId:command.requestId,transactionId:row.id,intentSaved:true,meaningApplied:true,currentVersion:1,row:{...row,version:1,meaning_state:'CONFIRMED'}} as T;
  };
  try{
    await act(async()=>root.render(<SearchParamsContext value={new URLSearchParams({lane:'UNRESOLVED'})}><MoneyDataProvider><MoneyReviewLanes {...props}/></MoneyDataProvider></SearchParamsContext>));
    assert.deepEqual([...document.querySelectorAll('[role="tab"]')].map(t=>t.textContent),['금융 의미 미확정','후속 연결 대기','미처리 알림','처리 오류','보류','처리 이력']);
    assert.match(document.body.textContent!,/원본 알림과 계좌 정보를 확인/);
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="합성 급여 금융 유형"]')!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="거래 방향"] [aria-pressed="true"]')!.click());
    assert.equal(applied,true);assert.equal(document.querySelector('[data-transaction-id="synthetic"]'),null);
    assert.ok(calls.filter(path=>path.includes('lane=UNRESOLVED')).length>=2);
    assert.match(document.body.textContent!,/검토할 거래가 없습니다/);
  }finally{moneyApi.get=get;moneyApi.patch=patch;await act(()=>root.unmount());dom.window.close();}
});

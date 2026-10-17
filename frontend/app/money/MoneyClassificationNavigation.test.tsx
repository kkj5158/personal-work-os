import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {moneyApi as api} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import type {Props} from './MoneyWebViews';

// The real navigation and destination screens share a synthetic read-only API.
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,nextLoad:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url, context, nextLoad) {
  if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
  return nextLoad(url, context);
}});

test('six classification tabs retain destinations, contextual automation controls and the unsaved-context guard',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/classification'});
  const previous={get:api.get,appEnv:process.env.NEXT_PUBLIC_APP_ENV};
  process.env.NEXT_PUBLIC_APP_ENV='dev';
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  api.get=async<T,>(path:string)=>(['/classification-rules','/category-groups','/ai/history-runs'].includes(path)?[]:{items:[],total:0,identities:[],proposals:[],history:[],conversations:[],drafts:[]}) as T;
  const {Classification}=await import('./MoneyClassification');
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  let allow=true;
  const props={accounts:[],categories:[],period:{from:'2026-10-01',to:'2026-10-31',preset:'month'},select:()=>{},changeContext:()=>allow} as Props;
  async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
  async function click(text:string,role='tab'){
    const target=[...document.querySelectorAll<HTMLButtonElement>(role==='tab'?'[role="tablist"][aria-label="분류·규칙"] [role="tab"]':'button')].find(button=>button.textContent===text);
    assert.ok(target,'Missing '+text);await act(()=>target.click());await settle();
  }
  function selected(text:string){
    const tabs=[...document.querySelectorAll('[role="tablist"][aria-label="분류·규칙"] [role="tab"]')];
    assert.equal(tabs.length,6);
    assert.deepEqual(tabs.filter(tab=>tab.getAttribute('aria-selected')==='true').map(tab=>tab.textContent),[text]);
    const tab=tabs.find(tab=>tab.textContent===text)!;
    assert.equal(document.getElementById(tab.getAttribute('aria-controls')!)?.getAttribute('aria-labelledby'),tab.id);
  }
  try {
    await act(()=>root.render(<SearchParamsContext.Provider value={new URLSearchParams()}><MoneyDataProvider><Classification {...props}/></MoneyDataProvider></SearchParamsContext.Provider>));await settle();
    assert.deepEqual([...document.querySelectorAll('[role="tablist"][aria-label="분류·규칙"] [role="tab"]')].map(tab=>tab.textContent),['분류 기준','자동화 규칙','학습·개선','수동 관리','AI 개선','AI 대화']);
    selected('분류 기준');assert.match(document.body.textContent??'',/분류 구조/);
    await click('수동 관리');selected('수동 관리');assert.match(document.body.textContent??'',/분류 구조/);
    await click('자동화 규칙');selected('자동화 규칙');assert.match(document.body.textContent??'',/자동 분류 규칙/);
    await click('거래처 규칙','button');selected('자동화 규칙');assert.match(document.body.textContent??'',/거래처 자동 분류/);
    await click('자동화 설정·적용 이력','button');selected('자동화 규칙');assert.match(document.body.textContent??'',/자동 분류 이력·설정/);
    await click('학습·개선');selected('학습·개선');assert.match(document.body.textContent??'',/자동 분류 이력·설정/);
    await click('AI 개선');selected('AI 개선');assert.ok(document.querySelector('[data-money-ai-screen="S05"]'));
    allow=false;await click('AI 대화');selected('AI 개선');assert.ok(document.querySelector('[data-money-ai-screen="S05"]'));
    allow=true;await click('AI 대화');selected('AI 대화');assert.match(document.body.textContent??'',/저장된 대화/);
    await click('분류 기준');selected('분류 기준');assert.match(document.body.textContent??'',/분류 구조/);
  } finally {
    await act(()=>root.unmount());api.get=previous.get;
    if(previous.appEnv===undefined)delete process.env.NEXT_PUBLIC_APP_ENV;else process.env.NEXT_PUBLIC_APP_ENV=previous.appEnv;
    dom.window.close();
  }
});

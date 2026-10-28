import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api,type Account} from '@/lib/money/model';
import type {UnifiedRow,UnifiedOutcome} from '@/lib/money/unified';
import {MoneyDataProvider} from './MoneyDataProvider';

const initial:UnifiedRow={id:'fact',type:'EXPENSE',meaning_state:'CONFIRMED',from_account_id:'account',to_account_id:null,amount:500000,currency:'KRW',occurred_at:'2026-10-28T01:00:00Z',title:'합성 상환 거래',memo:null,counterparty_text:'합성 은행',version:1,loan_id:null,principal:null,interest:null,fee:null,refund_of:null,sourceCount:0,sources:[]};
const run=async(action:()=>void)=>{await act(async()=>{action();for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));});};
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label||node.getAttribute('aria-label')===label||node.classList.contains('money-financial-choice')&&node.textContent?.endsWith(label));assert.ok(node,'Missing '+label);return node;}
function control(label:string){const node=document.querySelector<HTMLInputElement|HTMLSelectElement>('[aria-label="'+label+'"]');assert.ok(node,'Missing '+label);return node;}

test('financial editor stages valid requests, preserves drafts and confirmed allocations, guards conflicts, retries and locked types',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/bookkeeping'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const {UnifiedFinancialAction}=await import('./MoneyFinancialEditor');
 const original={get:api.get,post:api.post};
 let row={...initial},shown=true,outcome:UnifiedOutcome['status']='APPLIED',failureReason='VALIDATION',loanVersion=7,readsFail=false;
 const posts:{path:string;body:Record<string,unknown>}[]=[];
 api.get=async<T,>(path:string)=>{
  if(path.includes('/outcomes/'))return {status:'UNKNOWN'} as T;
  if(path.includes('/rows/')){if(readsFail)throw Error('read failed');return {...row} as T;}
  if(path==='/loans')return [{id:'loan',name:'합성 대출',status:'ACTIVE',version:loanVersion}] as T;
  return {items:[]} as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
  const command=body as Record<string,unknown>;posts.push({path,body:command});
  if(outcome==='APPLIED'){row={...row,type:String(command.type??row.type),version:row.version+1};return {status:'APPLIED',result:{row}} as T;}
  return {status:outcome,result:{reason:failureReason,message:'합성 거절'}} as T;
 };
 const render=()=>run(()=>root.render(<MoneyDataProvider>{shown&&<UnifiedFinancialAction id="fact" label="소비" accounts={[{id:'account',displayName:'합성 생활비'} as Account]}/>}</MoneyDataProvider>));
 const open=()=>run(()=>button('소비').click());
 const choose=(name:string)=>run(()=>button(name).click());
 const change=(label:string,value:string)=>run(()=>{
  const input=control(label),select=input.tagName==='SELECT';
  Object.getOwnPropertyDescriptor(select?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,value);
  input.dispatchEvent(new dom.window.Event(select?'change':'input',{bubbles:true}));
 });
 const close=()=>choose('금융 편집 닫기');
 const evict=async()=>{shown=false;await render();shown=true;await render();await open();};
 try{
  await render();await open();
  assert.ok(document.activeElement===button('금융 편집 닫기'),'Opening moves focus into the editor');
  assert.equal(document.querySelector<HTMLDetailsElement>('details')?.open,false);
  assert.equal(button('변경 저장').disabled,false);
  await choose('대출 상환원금·이자 납입');assert.equal(posts.length,0);
  assert.equal(button('변경 저장').disabled,true);
  await change('상환 대출','loan');assert.equal(button('변경 저장').disabled,false,'Unresolved allocation remains saveable');
  await change('원금','420000');assert.equal(button('변경 저장').disabled,true,'Partial split is rejected');
  await change('이자','70000');await change('수수료','9999');assert.equal(button('변경 저장').disabled,true);
  await change('수수료','10000');assert.equal(button('변경 저장').disabled,false);
  await close();await open();assert.equal(control('원금').value,'420000');
  await evict();assert.equal(control('원금').value,'420000','Provider preserves the draft across row eviction');
  await choose('소비일반 결제·지출');assert.equal(document.querySelector('[aria-label="원금"]'),null);
  assert.equal(button('변경 저장').disabled,false,'Irrelevant split cannot disable expense save');
  await choose('변경 저장');assert.deepEqual(Object.keys(posts.at(-1)!.body).sort(),['action','expectedVersion','requestId','type']);
  assert.match(document.body.textContent??'',/서버에 저장했습니다/);
  await close();row={...initial,type:'LOAN_PAYMENT',loan_id:'loan',principal:420000,interest:70000,fee:10000,version:3};await open();
  assert.equal(control('원금').value,'420000');assert.equal(control('상환 대출').disabled,true);
  await choose('대출 상환원금·이자 납입');assert.equal(control('원금').value,'420000');
  await change('이자','60000');await change('수수료','20000');
  outcome='NOT_APPLIED';await choose('변경 저장');assert.equal(control('원금').value,'420000');assert.match(document.body.textContent??'',/합성 거절/);
  assert.equal(posts.at(-1)!.body.loanId,'loan');assert.equal(posts.at(-1)!.body.loanVersion,7);
  assert.equal(posts.at(-1)!.body.principal,420000);
  failureReason='VERSION_CONFLICT';row={...row,version:4};loanVersion=8;await choose('변경 저장');
  assert.equal(button('변경 저장').disabled,true);assert.match(document.body.textContent??'',/다른 기기에서 변경/);
  await choose('최신 값과 비교 후 재적용 준비');assert.equal(button('변경 저장').disabled,false);
  outcome='UNKNOWN';await run(()=>{button('변경 저장').click();button('변경 저장').click();});
  const frozen=posts.at(-1)!.body,count=posts.length;assert.equal(button('변경 저장').disabled,true);
  await choose('처리 결과 확인');assert.equal(posts.length,count);
  await choose('같은 요청 재시도');assert.deepEqual(posts.at(-1)!.body,frozen);assert.equal(frozen.expectedVersion,4);assert.equal(frozen.loanVersion,8);
  outcome='APPLIED';await choose('같은 요청 재시도');await close();
  row={...initial,version:9};await open();await choose('이체내 계좌 간 이동');await close();row={...row,version:10};await open();
  assert.equal(button('변경 저장').disabled,true,'Reopening an externally changed draft requires comparison');
  await choose('최신 값과 비교 후 재적용 준비');await choose('변경 저장');await close();
  for(const type of ['INITIAL_BALANCE','BALANCE_ADJUSTMENT','LOAN_RECEIPT']){
   row={...initial,type,version:row.version+1};await open();assert.equal([...document.querySelectorAll('button')].some(node=>node.textContent==='변경 저장'),false);assert.match(document.body.textContent??'',/별도 정정/);await close();
  }
  row={...initial,version:20};await open();await run(()=>document.querySelector('summary')!.click());
  await change('연결 대상 ID','other-transaction');await change('연결 대상 버전','99');
  await change('원본 알림 ID','raw-source');await change('금융 정정 사유','원본과 동일 금융 사실 확인');
  assert.equal(button('동일 금융 사실 알림 연결').disabled,true,'A transaction version cannot stand in for a source processing version');
  await change('원본 알림 처리 버전','0');assert.equal(button('동일 금융 사실 알림 연결').disabled,false,'Explicit version zero is valid');
  await choose('동일 금융 사실 알림 연결');
  assert.equal(posts.at(-1)!.body.otherId,'raw-source');assert.equal(posts.at(-1)!.body.otherVersion,0);assert.equal(posts.at(-1)!.body.type,undefined);
  await close();readsFail=true;await open();assert.equal(document.querySelector('.money-financial-summary'),null,'Failed reload cannot leave stale editable data');assert.match(document.body.textContent??'',/read failed/);
 }finally{api.get=original.get;api.post=original.post;await act(()=>root.unmount());dom.window.close();}
});

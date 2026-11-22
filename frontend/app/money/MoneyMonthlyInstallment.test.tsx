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
const accounts=['source','installment'].map(id=>({id,displayName:id,archived:false,version:0,provider:'CASH',role:'CASH'}) as Account);
const props={accounts,categories:[],ready:true,period:{preset:'month',from:'2026-11-01',to:'2026-11-30'},select:()=>{},navigate:()=>{}} as Props;
test('four V4 axes preserve tracked scope and drill into the loan and savings ledgers',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example/money/bookkeeping'});
 Object.assign(globalThis,{React,self:dom.window,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.open=true;}});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 Object.assign(globalThis,{ResizeObserver:class {observe(){} unobserve(){} disconnect(){}},requestAnimationFrame:(fn:()=>void)=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout});
 const {Bookkeeping}=await import('./MoneyBookkeeping'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const get=api.get,post=api.post,put=api.put,paths:string[]=[];let writes=0,selected='';
 let tracking={version:1,expense:['source'],income:['installment']};
 let finishTracking!:()=>void,failDecember!:()=>void;
 const decemberRead=new Promise<void>(resolve=>{failDecember=resolve;});
 const trackingRead=new Promise<void>(resolve=>{finishTracking=resolve;});
 const allocated={id:'loan-row',type:'LOAN_PAYMENT',meaning_state:'CONFIRMED',amount:100000,principal:80000,interest:19000,fee:1000,currency:'KRW',occurred_at:'2026-11-09T00:00:00Z',title:'합성 분할 상환',from_account_id:'source',to_account_id:null,loan_id:'loan-a',sourceCount:2};
 const pending={...allocated,id:'pending-row',amount:40000,principal:null,interest:null,fee:null,title:'합성 미배분 상환'};
 const unlinked={...pending,type:'EXPENSE',meaning_state:'UNRESOLVED',declaredFinancialType:'LOAN_PAYMENT',relationStatus:'PENDING',id:'unlinked-row',amount:2000,loan_id:null,title:'합성 미연결 상환'};
 const rows=Array.from({length:51},(_,i)=>({id:'payment-'+i,amount:100,currency:'KRW',occurredAt:'2026-11-01T00:00:00Z',fromAccountId:'source',toAccountId:'installment',title:'counted-'+i,fromName:'ordinary',toName:'installment'}));
 api.get=async<T,>(path:string)=>{paths.push(path);const q=new URL(path,'https://test.example').searchParams;
  if(path==='/tracking'){await trackingRead;return tracking as T;}
  if(path.startsWith('/bookkeeping/unified/loan-repayments?')){
   if(q.get('from')==='2026-12-01'){await decemberRead;throw Error('상환 API 테스트 실패');}
   if(q.get('from')==='2027-01-01'||q.get('accountIds')!=='source')return {loanRepayment:'0',loanRepaymentBreakdown:{byLoan:[],byPart:{principal:'0',interest:'0',fee:'0'}},unallocatedAmount:'0',unallocatedCount:0} as T;
   return {loanRepayment:'142000',loanRepaymentBreakdown:{byLoan:[{loanId:'loan-a',label:'합성 대출 A',amount:'140000'},{loanId:null,label:'미연결 대출상환',amount:'2000'}],byPart:{principal:'80000',interest:'19000',fee:'1000',unallocated:'42000'}},unallocatedAmount:'42000',unallocatedCount:2} as T;
  }
  if(path.startsWith('/bookkeeping/unified?')){
   let items:(typeof allocated|typeof pending|typeof unlinked)[]=q.has('repaymentGroup')?(q.get('repaymentGroup')==='unlinked'?[unlinked]:[allocated,pending]):q.get('repaymentPart')==='UNALLOCATED'?[pending,unlinked]:[allocated];
   if(q.get('accountIds')!=='source')items=[];
   const search=q.get('search')??'';
   items=items.filter(row=>row.title.includes(search));
   return {total:items.length,items} as T;
  }
  if(path.startsWith('/v4/summary?')){
   const zero=q.get('from')==='2027-01-01'||q.get('accountIds')!=='source'||!tracking.expense.length;
   if(q.get('from')==='2026-12-01'){await decemberRead;throw Error('월간 합계 테스트 실패');}
   return {actualIncome:100,consumption:100,totalExpense:zero?100:142100,loanRepayment:zero?0:142000,savingsIn:5100,savingsOut:900,savingsMovement:6000,savingsNet:4200,composition:[]} as T;
  }
  if(path.startsWith('/v4/contributions?')){const matching=q.get('search')?rows.filter(r=>r.title.includes(q.get('search')!)):rows,offset=Number(q.get('offset'));return {items:matching.slice(offset,offset+50),total:matching.length,filteredAmount:matching.length*100,totals:{amount:5100,count:51,analyticsUnavailable:false,unknownHistoryCount:0,currencies:['KRW'],composition:[{accountId:'installment',label:'purpose installment',amount:5100,count:51}]}} as T;}
  if(path.includes('category-groups')||path==='/loans')return [] as T;
  if(path.startsWith('/transactions/'))return {id:path.split('/').at(-1)} as T;
  if(path.startsWith('/bookkeeping?'))return {items:[],total:0,summary:{total:100,count:0},composition:[],trend:[]} as T;
  if(path.includes('/selections/'))return {ids:[]} as T;
  return {items:[],count:0,expense:[],income:[],recommendations:[],saves:[]} as T;
 };
 api.put=async<T,>(path:string,body:unknown)=>{
  assert.equal(path,'/tracking');
  const draft=body as typeof tracking&{expectedVersion:number};
  assert.equal(draft.expectedVersion,tracking.version);
  tracking={version:tracking.version+1,expense:draft.expense,income:draft.income};
  return tracking as T;
 };
 api.post=async()=>{writes++;throw Error('Unexpected financial write');};
 const tick=()=>act(async()=>{await new Promise(r=>setTimeout(r,12));});
 try {
  const render=(period=props.period,accountId='source')=>root.render(<SearchParamsContext value={new URLSearchParams({accountId})}><MoneyDataProvider><Bookkeeping {...props} period={period} select={selection=>{if(selection.kind==='transaction')selected=selection.value?.id??'';}}/></MoneyDataProvider></SearchParamsContext>);
  await act(()=>render());await tick();
  assert.ok(paths.includes('/tracking'));
  assert.ok(!paths.some(p=>p.includes('/loan-repayments?')));
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'—');
  await act(()=>finishTracking());await tick();
  assert.deepEqual([...document.querySelectorAll('.money-month-kpis small')].map(n=>n.textContent),['실제 소득','전체 지출','대출상환','저축 납입액']);
  assert.deepEqual([...document.querySelectorAll('.money-month-donut h3')].map(n=>n.textContent),['실제 소득 구성','일반 소비 구성','대출상환 구성','저축 유입·유출']);
  assert.deepEqual([...document.querySelectorAll('.money-month-kpis strong')].map(n=>n.textContent),['100원','142,100원','142,000원','5,100원']);
  assert.ok(paths.some(p=>p.startsWith('/v4/summary?')&&p.includes('accountIds=source')));
  assert.ok(paths.some(p=>p.includes('/loan-repayments?')&&p.includes('accountIds=source')));
  const loan=[...document.querySelectorAll('.money-month-donut')].find(n=>n.querySelector('h3')?.textContent==='대출상환 구성')!;
  assert.equal(loan.querySelector('.money-month-center strong')?.textContent,'142,000원');
  assert.equal(loan.querySelector('[aria-label="대출상환 보기"] button')?.getAttribute('aria-pressed'),'true');
  const segment=loan.querySelector('circle[role="button"]')!;
  await act(()=>{segment.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});await tick();
  assert.ok(paths.some(p=>p.includes('repaymentGroup=loan-a')&&p.includes('accountIds=source')));
  const loanTable=document.querySelector('[aria-label="대출상환 거래"]')!;
  assert.equal(document.activeElement,loanTable);
  assert.deepEqual([...loanTable.querySelectorAll('tbody tr')].map(n=>n.getAttribute('data-transaction-id')),['loan-row','pending-row']);
  assert.match(loanTable.querySelector('tbody')!.textContent!,/합성 미배분 상환.*배분 미확정/);
  assert.doesNotMatch(loanTable.querySelector('.money-grouped-filter')!.textContent!,/installment/);
  await act(()=>loanTable.querySelector<HTMLButtonElement>('tbody button')!.click());assert.equal(selected,'loan-row');
  await act(()=>[...loan.querySelectorAll<HTMLButtonElement>('header button')].find(b=>b.textContent==='원금·이자')!.click());await tick();
  assert.equal(document.querySelector('[aria-label="대출상환 거래"]'),null);
  const parts=[...loan.querySelectorAll<HTMLButtonElement>('.money-month-legend button')];
  assert.deepEqual(parts.map(n=>n.textContent),['원금80,000원','이자19,000원','수수료1,000원','배분 미확정42,000원']);
  await act(()=>parts[2].click());await tick();
  assert.ok(paths.some(p=>p.includes('repaymentPart=FEE')&&p.includes('type=LOAN_PAYMENT')));
  await act(()=>parts[3].click());await tick();
  const pendingTable=document.querySelector('[aria-label="대출상환 거래"]')!;
  const pendingRows=()=>[...pendingTable.querySelectorAll('tbody tr')].map(n=>n.getAttribute('data-transaction-id'));
  assert.deepEqual(pendingRows(),['pending-row','unlinked-row']);
  assert.match(document.querySelector('.money-month-summary')!.textContent!,/배분 미확정 2건 · 42,000원/);
  assert.equal(pendingTable.querySelector('[data-transaction-id="unlinked-row"] a')?.getAttribute('href'),'/money/ledger?transactionId=unlinked-row');
  const search=pendingTable.querySelector<HTMLInputElement>('input[aria-label="대출상환 거래 검색"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(search,'미연결');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await tick();
  assert.deepEqual(pendingRows(),['unlinked-row']);
  await act(()=>[...pendingTable.querySelectorAll<HTMLButtonElement>('.money-grouped-filter header button')].find(b=>b.textContent==='전체 해제')!.click());await tick();
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'0원');
  assert.deepEqual(pendingRows(),[]);
  for(const path of paths.filter(p=>p.includes('/loan-repayments?')||p.includes('repaymentPart=')||p.includes('repaymentGroup='))){
   const params=new URL(path,'https://test.example').searchParams;
   assert.equal(params.get('bookkeepingScope'),'true');
   assert.ok(['source','none'].includes(params.get('accountIds')??''));
   assert.deepEqual([params.get('from'),params.get('to')],['2026-11-01','2026-11-30']);
  }
  assert.ok(paths.some(p=>p.includes('repaymentPart=UNALLOCATED')&&p.includes('accountIds=none')&&p.includes('offset=0')));
  const donut=[...document.querySelectorAll('.money-month-donut')].find(n=>n.querySelector('h3')?.textContent==='저축 유입·유출')!;
  assert.equal(donut.querySelector('.money-month-center strong')?.textContent,'6,000원');
  await act(()=>donut.querySelector<HTMLButtonElement>('.money-month-legend button')!.click());await tick();
  assert.ok(document.querySelector('[aria-label="저축 납입 거래"]'));
  assert.equal(document.querySelectorAll('[aria-label="저축 납입 거래"] tbody tr').length,50);
  assert.ok(paths.some(p=>p.includes('bucket=SI')));assert.ok(!paths.some(p=>p.startsWith('/bookkeeping/savings')));
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('.money-pagination button')].find(b=>b.textContent==='다음')!.click());await tick();
  assert.equal(document.querySelectorAll('[aria-label="저축 납입 거래"] tbody tr').length,1);assert.match(document.querySelector('tbody')!.textContent!,/counted-50/);
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('tbody button')].find(b=>b.textContent==='상세 보기')!.click());await tick();assert.equal(selected,'payment-50');
  const input=document.querySelector<HTMLInputElement>('[aria-label="저축 납입 거래 검색"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'counted-1');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await tick();
  assert.equal(document.querySelectorAll('[aria-label="저축 납입 거래"] tbody tr').length,11);
  assert.ok(paths.some(p=>p.includes('search=counted-1')&&p.includes('offset=0')));
  await act(()=>document.querySelector<HTMLButtonElement>('.money-month-filter button')!.click());await tick();assert.equal(document.querySelector('[aria-label="저축 납입 거래"]'),null);
  await act(()=>render({...props.period,from:'2026-12-01',to:'2026-12-31'}));
  assert.match(document.querySelector('.money-month-summary')!.textContent!,/불러오는 중/);
  await act(()=>failDecember());await tick();
  assert.match(document.querySelector('.money-month-summary')!.textContent!,/대출상환 조회 실패/);
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'—');
  await act(()=>render({...props.period,from:'2027-01-01',to:'2027-01-31'}));await tick();
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'0원');
  assert.match(document.querySelector('.money-month-summary')!.textContent!,/확정된 대출상환이 없습니다/);
  await act(()=>render());await tick();
  await act(()=>render(props.period,'installment'));await tick();
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'0원','An income-only temporary account cannot widen expense tracking');
  assert.ok(paths.some(p=>p.includes('/loan-repayments?')&&p.includes('accountIds=none')));
  await act(()=>render());await tick();
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'142,000원');
  const beforeSave=paths.length;
  await act(()=>document.querySelector<HTMLButtonElement>('.money-book-tracking')!.click());
  const dialog=document.querySelector('dialog[aria-label="가계부 추적 계좌 설정"]')!;
  await act(()=>dialog.querySelector<HTMLInputElement>('section input')!.click());
  await act(()=>dialog.querySelector<HTMLButtonElement>('button.money-primary')!.click());await tick();
  assert.deepEqual(tracking.expense,[]);
  assert.deepEqual(tracking.income,['installment']);
  assert.equal(document.querySelector('.money-month-loan strong')!.textContent,'0원');
  const afterSave=paths.slice(beforeSave);
  assert.ok(afterSave.includes('/tracking'));
  assert.ok(afterSave.some(p=>p.includes('/loan-repayments?')&&p.includes('accountIds=none')));
  assert.ok(afterSave.some(p=>p.startsWith('/v4/summary?')));
  assert.equal(writes,0);
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;api.put=put;dom.window.close();}
});

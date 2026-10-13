import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api, type Account} from '@/lib/money/model';
import type {AiItem} from '@/lib/money/ai';
import type {Props} from './MoneyWebViews';
import {MoneyDataProvider} from './MoneyDataProvider';

// The real component imports its stylesheet. JSDOM verifies behavior and DOM
// semantics; geometry remains a verified TEAM KAFKA Chrome release gate.
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,nextLoad:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url, context, nextLoad) {
  if (url.endsWith('.css')) return {format:'module',source:'export {};',shortCircuit:true};
  return nextLoad(url, context);
}});

type Action = 'MOVE_TO_BOOKKEEPING'|'DEFER'|'NON_TRANSACTION';
type Identity = {kind:string;id:string};
type Command = {previewId:string;requestId:string};
type Result = Identity & {status:string;eventId?:string;canUndo?:boolean;message?:string};
type Outcome = {requestId:string;completed:boolean;items:Result[]};
type PreviewRequest = {scope:string;action:Action;items:Identity[];state:string;search:string;accountId:string|null;reason:string|null};
type Preview = {previewId:string;scope:string;action:Action;selectedCount:number;eligibleCount:number;excludedCount:number;items:(AiItem & {eligible:boolean;exclusionReason:string|null;nextAction:string;commandGroup:string})[];groups:Record<string,number>};
const account:Account = {id:'owned-krw',displayName:'생활비',provider:'KAKAO',role:'SPENDING',maskedReference:null,suffix:'8557',archived:false,version:0,emoji:null,imageData:null,fundingAccountId:null};
function item(id:string, extra:Partial<AiItem>={}):AiItem {
  return {
    id,kind:'RAW',state:'PENDING',reason:'UNMATCHED_OR_EXTERNAL_UNPROVEN',lane:'DECISION',
    title:'입출금내역 알림',merchant:'사조푸디스트(주)씨유(C',amount:12000,currency:'KRW',accountId:account.id,
    categoryId:null,memo:null,type:'EXPENSE',occurredAt:'2026-10-13T00:10:00Z',version:3,
    overrideVersion:0,projectionVersion:0,transactionVersion:3,reviewType:'NOISE',
    candidate:{provider:'KAKAO',amount:12000,direction:'OUT',currency:'KRW',sourceAccountHint:'생활비(8557)'},
    current:{title:'입출금내역 알림',memo:null,categoryId:null,amount:12000,currency:'KRW',type:'EXPENSE',merchant:'사조푸디스트(주)씨유(C',accountId:account.id},
    proposal:{categoryId:null,basis:'NONE',reason:''},
    evidence:{summary:'확인된 합성 원문',confirmedDecisions:[],rules:[],external:[],merchantIdentity:null},
    ...extra,
  } as AiItem;
}
function button(text:string, within:ParentNode=document):HTMLButtonElement {
  const found=[...within.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text);
  assert.ok(found,'Missing button '+text);return found;
}
function rows(){return [...document.querySelectorAll<HTMLTableRowElement>('.money-notice-ledger tbody tr')];}
function checkbox(row:HTMLElement){const value=row.querySelector<HTMLInputElement>('input[type="checkbox"]');assert.ok(value);return value;}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
async function click(node:HTMLElement){await act(async()=>{node.click();});await settle();}
async function input(value:string){
  const node=document.querySelector<HTMLInputElement>('input[type="search"]');assert.ok(node);
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});await settle();
}
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}

async function mount(initial:AiItem[]) {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/review'});
  const previous={get:api.get,post:api.post,appEnv:process.env.NEXT_PUBLIC_APP_ENV};
  process.env.NEXT_PUBLIC_APP_ENV='dev';
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const {NotificationReview} = await import('./MoneyNotificationReview');
  // A retained legacy dialog must fail semantic assertions, but its optional
  // DOM API does not prevent the test from identifying that regression.
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const reads:string[]=[],writes:{path:string;body:unknown}[]=[],selected:unknown[]=[],previews=new Map<string,Preview>();
  let all=initial.map(row=>({...row})),saved=0;
  const behavior:{blocked:Set<string>;previewError?:Error;execute?:(command:Command,preview:Preview)=>Promise<Outcome>;recover?:Outcome}={blocked:new Set()};
  const filtered=(q:URLSearchParams)=>all.filter(row=>row.state===(q.get('state')??'PENDING')&&(!q.get('search')||(row.title+' '+row.merchant).includes(q.get('search')!))&&(!q.get('accountId')||row.accountId===q.get('accountId'))&&(!q.get('reason')||row.reason===q.get('reason')));
  function apply(outcome:Outcome,preview:Preview) {
    for(const result of outcome.items) if(result.status==='SAVED') {
      const row=all.find(r=>r.id===result.id&&r.kind===result.kind);if(row)row.state=preview.action==='DEFER'?'DEFERRED':'COMPLETED';
    }
    return outcome;
  }
  api.get=async<T,>(path:string)=>{
    reads.push(path);
    if(path.startsWith('/ai/workbench?')) {const q=new URLSearchParams(path.split('?')[1]),found=filtered(q);return {items:found.slice(Number(q.get('offset')??0),Number(q.get('offset')??0)+Number(q.get('limit')??50)),total:found.length,reasons:[...new Set(all.map(r=>r.reason))]} as T;}
    if(path.startsWith('/review/batches/outcomes/')) {assert.ok(behavior.recover,'Recovery fixture missing');return behavior.recover as T;}
    throw Error('Unexpected Review GET '+path);
  };
  api.post=async<T,>(path:string,body:unknown)=>{
    writes.push({path,body});
    if(path==='/review/batches/preview') {
      if(behavior.previewError)throw behavior.previewError;
      const request=body as PreviewRequest;
      const found=request.scope==='FILTER'?filtered(new URLSearchParams({state:request.state,search:request.search,accountId:request.accountId??'',reason:request.reason??''})):request.items.flatMap(value=>all.filter(r=>r.id===value.id&&r.kind===value.kind));
      const result:Preview={previewId:'preview-'+previews.size,scope:request.scope,action:request.action,selectedCount:found.length,eligibleCount:found.filter(row=>!behavior.blocked.has(row.id)).length,excludedCount:found.filter(row=>behavior.blocked.has(row.id)).length,items:found.map(row=>({...row,eligible:!behavior.blocked.has(row.id),exclusionReason:behavior.blocked.has(row.id)?'소유 계좌를 확인하세요':null,nextAction:behavior.blocked.has(row.id)?'소유 계좌 확인':'처리 가능',commandGroup:row.kind})),groups:{RAW:found.length}};
      previews.set(result.previewId,result);return result as T;
    }
    if(path==='/review/batches/execute') {
      const command=body as Command,preview=previews.get(command.previewId);assert.ok(preview,'Must execute the exact server preview');assert.ok(command.requestId,'Must bind request identity');
      const outcome=behavior.execute?await behavior.execute(command,preview):{requestId:command.requestId,completed:true,items:preview.items.filter(row=>row.eligible).map(row=>({id:row.id,kind:row.kind,status:'SAVED',eventId:'event-'+saved++,canUndo:true}))};
      return apply(outcome,preview) as T;
    }
    if(/^\/ai\/events\/[^/]+\/undo$/.test(path))return {} as T;
    throw Error('Unexpected Review POST '+path);
  };
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const props={accounts:[account],categories:[],period:{from:'2026-10-01',to:'2026-10-31',preset:'month'},select:(value:unknown)=>{selected.push(value);}} as Props;
  await act(async()=>root.render(<MoneyDataProvider><NotificationReview {...props}/></MoneyDataProvider>));await settle();
  return {dom,reads,writes,selected,behavior,previews,
    replace(next:AiItem[]){all=next;},
    async close(){api.get=previous.get;api.post=previous.post;if(previous.appEnv===undefined)delete process.env.NEXT_PUBLIC_APP_ENV;else process.env.NEXT_PUBLIC_APP_ENV=previous.appEnv;await act(()=>root.unmount());dom.window.close();},
  };
}

test('merchant-first pending rows expose exactly three direct actions without a financial panel or category editor',async()=>{
  const h=await mount([item('merchant'),item('fallback',{merchant:null})]);
  try {
    assert.ok([...document.querySelectorAll('th')].some(th=>th.textContent==='거래처·알림'));
    const merchant=rows()[0],cell=merchant.cells[2];
    assert.ok(cell.querySelector('strong,b')?.textContent?.includes('사조푸디스트(주)씨유(C'));
    assert.equal(cell.querySelector('small')?.textContent,'입출금내역 알림');
    assert.ok(rows()[1].textContent?.includes('거래처 미확인'));
    assert.deepEqual([...merchant.querySelectorAll('.money-notice-row-actions button')].map(b=>b.textContent),['가계부 이동','보류','비거래 처리']);
    assert.ok(!document.body.textContent?.includes('알림 금융 사실 확인'));
    assert.ok(!document.body.textContent?.includes('원문·금융 확인'));
    assert.ok(!document.body.textContent?.includes('알림 정리 검토'));
    assert.equal(document.querySelector('.money-category-picker'),null);
    assert.equal(h.writes.length,0);
    assert.deepEqual(h.selected,[]);
  } finally {await h.close();}
});

for(const [name,action] of [['가계부 이동','MOVE_TO_BOOKKEEPING'],['보류','DEFER'],['비거래 처리','NON_TRANSACTION']] as const) test(`${name} directly sends guarded preview and a single category-free command, then removes only confirmed success`,async()=>{
  const h=await mount([item('direct'),item('surrounding')]);
  try {
    await click(button(name,rows()[0]));
    assert.equal(h.writes.length,2);
    assert.equal(h.writes[0].path,'/review/batches/preview');
    const request=h.writes[0].body as PreviewRequest;
    assert.equal(request.action,action);assert.equal(request.scope,'SELECTED');assert.deepEqual(request.items,[{kind:'RAW',id:'direct'}]);
    assert.equal(h.writes[1].path,'/review/batches/execute');
    assert.deepEqual(Object.keys(h.writes[1].body as Command).sort(),['previewId','requestId']);
    assert.equal(rows().length,1);assert.ok(rows()[0].textContent?.includes('사조푸디스트'));
    assert.deepEqual(h.selected,[],'Processing must not open the right financial panel');
    assert.ok(!h.writes.some(value=>/classif|lookup|recommend|conversation|provider/.test(value.path)),'Ordinary processing never invokes AI');
    if(action==='DEFER') {await click(button('보류',document.querySelector('[role="tablist"]')!));assert.equal(rows().length,1);}
  } finally {await h.close();}
});

test('server-ineligible direct action remains pending and shows its actionable reason without executing',async()=>{
  const h=await mount([item('blocked',{accountId:null,reason:'ACCOUNT_RESOLUTION_REQUIRED'})]);h.behavior.blocked.add('blocked');
  try {
    await click(button('가계부 이동',rows()[0]));
    assert.equal(h.writes.length,1);assert.equal(h.writes[0].path,'/review/batches/preview');
    assert.equal(rows().length,1);assert.match(rows()[0].textContent??'',/소유 계좌/);
    assert.ok(rows()[0].querySelector('[role="alert"]'),'Blocking explanation stays with its row');
    assert.ok(!button('가계부 이동',rows()[0]).disabled);
  } finally {await h.close();}
});

test('preview API failure leaves the row and selection intact without sending a command',async()=>{
  const h=await mount([item('failure')]);h.behavior.previewError=Error('검토 상태 충돌');
  try {
    await click(checkbox(rows()[0]));await click(button('가계부 이동',rows()[0]));
    assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,true);
    assert.equal(h.writes.length,1);assert.match(document.body.textContent??'',/검토 상태 충돌/);
  } finally {await h.close();}
});

test('in-flight direct action disables duplicate submission and has immediate processing feedback',async()=>{
  const h=await mount([item('slow')]),gate=deferred<Outcome>();let command:Command|undefined;
  h.behavior.execute=async value=>{command=value;return gate.promise;};
  try {
    const target=button('가계부 이동',rows()[0]);await click(target);
    assert.ok(command);assert.ok(target.disabled);assert.match(document.body.textContent??'',/처리 중|서버 처리/);
    await click(target);assert.equal(h.writes.filter(value=>value.path.endsWith('/execute')).length,1);
    await act(async()=>gate.resolve({requestId:command!.requestId,completed:true,items:[{kind:'RAW',id:'slow',status:'SAVED'}]}));await settle();
    assert.equal(rows().length,0);
  } finally {await h.close();}
});

test('response loss retains the original request and rows, blocks blind retry, and recovers using GET only',async()=>{
  const h=await mount([item('uncertain')]);let command:Command|undefined;
  h.behavior.execute=async value=>{command=value;throw Error('연결 끊김');};
  try {
    await click(checkbox(rows()[0]));await click(button('가계부 이동',rows()[0]));assert.ok(command);
    assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,true);
    assert.ok(button('가계부 이동',rows()[0]).disabled);
    const before=h.writes.length;
    await click(button('가계부 이동',rows()[0]));assert.equal(h.writes.length,before);
    h.replace([item('uncertain',{state:'COMPLETED'})]);
    h.behavior.recover={requestId:command!.requestId,completed:true,items:[{kind:'RAW',id:'uncertain',status:'SAVED'}]};
    await click(button('원래 요청 결과 조회'));
    assert.equal(h.writes.length,before);assert.ok(h.reads.includes('/review/batches/outcomes/'+command!.requestId));assert.equal(rows().length,0);
    assert.equal([...document.querySelectorAll('button')].filter(b=>b.textContent==='원래 요청 결과 조회').length,0);
  } finally {await h.close();}
});

test('two selection/processing stages preserve pagination and refresh, then clear old selection when filtering',async()=>{
  const h=await mount(Array.from({length:55},(_,i)=>item('page-'+i,{merchant:'거래처 '+i})));
  try {
    assert.equal(rows().length,50);assert.match(document.body.textContent??'',/처리 대상 선택/);assert.match(document.body.textContent??'',/선택 항목 일괄 처리/);
    await click(button('현재 페이지 전체 선택'));assert.equal(rows().filter(r=>checkbox(r).checked).length,50);
    await click(button('다음'));assert.equal(rows().length,5);assert.match(document.body.textContent??'',/선택 50건/);
    await click(button('새로고침'));assert.match(document.body.textContent??'',/선택 50건/);
    await click(button('필터 결과 전체 선택 (55건)'));assert.match(document.body.textContent??'',/선택 55건/);
    const filter=h.writes.at(-1)!.body as PreviewRequest;assert.equal(filter.scope,'FILTER');assert.deepEqual(filter.items,[]);
    assert.equal(h.writes.filter(value=>value.path.endsWith('/execute')).length,0,'Selecting never processes');
    await input('거래처 54');assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,false);assert.match(document.body.textContent??'',/선택 0건/);
    await click(checkbox(rows()[0]));await click(button('보류',document.querySelector('[role="tablist"]')!));assert.match(document.body.textContent??'',/선택 0건/);
  } finally {await h.close();}
});

test('bulk preview snapshots only selected IDs, reports exclusions, and does not execute until final confirmation',async()=>{
  const h=await mount([item('eligible'),item('blocked'),item('untouched')]);h.behavior.blocked.add('blocked');
  try {
    await click(checkbox(rows()[0]));await click(checkbox(rows()[1]));
    const toolbar=document.querySelector('.money-notice-toolbar');assert.ok(toolbar);await click(button('가계부 이동',toolbar));
    const preview=document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]');assert.ok(preview);
    assert.equal(preview.tagName,'SECTION','Bulk preview is an anchored compact section');
    assert.equal(h.writes.length,1);assert.deepEqual((h.writes[0].body as PreviewRequest).items,[{kind:'RAW',id:'eligible'},{kind:'RAW',id:'blocked'}]);
    assert.match(preview.textContent??'',/선택.*2건/);assert.match(preview.textContent??'',/적격.*1건/);assert.match(preview.textContent??'',/제외.*1건/);
    assert.equal(preview.querySelectorAll('tbody tr').length,2);assert.match(preview.textContent??'',/소유 계좌/);
    await click(button('1건 가계부 이동',preview));
    assert.equal(rows().length,2);assert.equal(rows().filter(r=>checkbox(r).checked).length,1,'Excluded row remains selected');
    assert.equal(h.writes.filter(value=>value.path.endsWith('/execute')).length,1);
  } finally {await h.close();}
});

test('bulk partial success leaves failed/unknown rows selected and recovery updates only confirmed records',async()=>{
  const h=await mount([item('saved'),item('failed'),item('unknown')]);let command:Command|undefined;
  h.behavior.execute=async value=>{command=value;return {requestId:value.requestId,completed:false,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'failed',status:'CONFLICT',message:'버전 충돌'},{kind:'RAW',id:'unknown',status:'UNKNOWN'}]};};
  try {
    await click(button('현재 페이지 전체 선택'));await click(button('보류',document.querySelector('.money-notice-toolbar')!));
    await click(button('3건 보류',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,2);assert.equal(rows().filter(r=>checkbox(r).checked).length,2);
    assert.match(document.body.textContent??'',/버전 충돌/);assert.match(document.body.textContent??'',/결과 미확인/);
    assert.ok(button('가계부 이동',rows()[0]).disabled);
    h.replace([item('saved',{state:'DEFERRED'}),item('failed'),item('unknown',{state:'DEFERRED'})]);
    h.behavior.recover={requestId:command!.requestId,completed:true,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'failed',status:'CONFLICT',message:'버전 충돌'},{kind:'RAW',id:'unknown',status:'SAVED'}]};
    const before=h.writes.length;await click(button('원래 요청 결과 조회'));assert.equal(h.writes.length,before);
    assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,true);assert.match(document.body.textContent??'',/선택 1건/);
  } finally {await h.close();}
});

test('Undo appears only for server-approved successful events and uses the existing evidence-preserving endpoint',async()=>{
  const h=await mount([item('undo')]);
  try {
    await click(button('비거래 처리',rows()[0]));const result=document.querySelector('.money-notice-results');assert.ok(result);
    await click(button('실행 취소',result));
    assert.equal(h.writes.at(-1)!.path,'/ai/events/event-0/undo');assert.deepEqual(h.writes.at(-1)!.body,{});
    assert.match(result.textContent??'',/취소 완료/);assert.equal([...result.querySelectorAll('button')].filter(b=>b.textContent==='실행 취소').length,0);
  } finally {await h.close();}
});

test('bulk success on a later page returns to the surviving conflict and keeps its selection',async()=>{
  const h=await mount(Array.from({length:52},(_,i)=>item('later-page-'+i,{merchant:'거래처 '+i})));
  h.behavior.execute=async(command,preview)=>({requestId:command.requestId,completed:true,items:preview.items.map(row=>({id:row.id,kind:row.kind,status:row.id==='later-page-0'?'CONFLICT':'SAVED',message:row.id==='later-page-0'?'버전 충돌':undefined}))});
  try {
    await click(button('다음'));assert.equal(rows().length,2);
    await click(button('필터 결과 전체 선택 (52건)'));
    await click(button('보류',document.querySelector('.money-notice-toolbar')!));
    await click(button('52건 보류',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,1,'Failed item must be reachable after page 2 disappears');
    assert.match(rows()[0].textContent??'',/거래처 0/);
    assert.equal(checkbox(rows()[0]).checked,true,'Only the conflict remains selected');
    assert.match(document.body.textContent??'',/선택 1건/);
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–1 \/ 1/);
    assert.ok(button('이전').disabled,'Offset must reset to the first surviving page');
    assert.ok(h.reads.slice(2).some(path=>new URLSearchParams(path.split('?')[1]).get('offset')==='0'),'The surviving page is fetched after targeted invalidation');
    const results=document.querySelector<HTMLElement>('.money-notice-result-items');assert.ok(results);
    assert.equal(results.getAttribute('role'),'region');assert.equal(results.tabIndex,0);
    assert.equal(results.querySelectorAll('p').length,52,'All per-item outcomes remain available in the bounded result region');
  } finally {await h.close();}
});

test('a confirmed total shrink preserves the current page while it remains valid',async()=>{
  const h=await mount(Array.from({length:105},(_,i)=>item('valid-page-'+i,{merchant:'거래처 '+i})));
  try {
    await click(button('다음'));assert.equal(rows().length,50);
    const reads=h.reads.length;
    await click(button('보류',rows()[0]));
    assert.equal(rows().length,49,'Valid current page remains patched in place');
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/51–100 \/ 104/);
    assert.ok(!button('이전').disabled);
    assert.equal(h.reads.length,reads,'No complete-table refetch for a still-valid page');
  } finally {await h.close();}
});

test('a fully processed first page refills with surviving later-page items at the same valid offset',async()=>{
  const h=await mount(Array.from({length:55},(_,i)=>item('refill-'+i,{merchant:'거래처 '+i})));
  try {
    await click(button('현재 페이지 전체 선택'));
    await click(button('보류',document.querySelector('.money-notice-toolbar')!));
    await click(button('50건 보류',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,5,'Surviving off-page rows must remain reachable without manual refresh');
    assert.match(rows()[0].textContent??'',/거래처 50/);
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–5 \/ 5/);
    assert.ok(button('이전').disabled);
    assert.equal(h.reads.length,2,'Only the emptied active page requires one refill');
    assert.ok(h.reads.every(path=>new URLSearchParams(path.split('?')[1]).get('offset')==='0'));
  } finally {await h.close();}
});

test('completed raw bookkeeping commands show verified registration and Korean history reason only with server proof',async()=>{
  const h=await mount([item('registered',{state:'COMPLETED',reason:'MOVE_TO_BOOKKEEPING',canUndo:false}),item('noise',{state:'COMPLETED',reason:'UNRECOGNIZED_SHAPE',amount:null,accountId:null})]);
  try {
    await click(button('처리 이력',document.querySelector('[role="tablist"]')!));
    assert.equal(rows().length,2);
    assert.match(rows()[0].cells[5].textContent??'',/가계부 등록/);
    assert.match(rows()[0].cells[6].textContent??'',/가계부 이동 완료/);
    assert.ok(!rows()[0].textContent?.includes('MOVE_TO_BOOKKEEPING'),'Internal action code is translated');
    assert.ok(!rows()[1].cells[5].textContent?.includes('가계부 등록'),'Completing a nontransaction notification does not prove financial registration');
    assert.ok([...rows()[0].querySelectorAll<HTMLButtonElement>('.money-notice-row-actions button')].every(button=>button.disabled));
    assert.equal(h.writes.length,0,'History labels remain read-only');
  } finally {await h.close();}
});

test('server-confirmed KRW defaults render alongside explicit foreign currency and genuinely unknown currency',async()=>{
  const h=await mount([item('domestic',{currency:null,effectiveCurrency:'KRW'}),item('foreign',{currency:'USD',effectiveCurrency:'KRW'}),item('uncertain',{currency:null,effectiveCurrency:null})]);
  try {
    assert.match(rows()[0].cells[3].textContent??'',/12,000원/);
    assert.match(rows()[1].cells[3].textContent??'',/USD/);
    assert.ok(!rows()[1].cells[3].textContent?.includes('원'));
    assert.match(rows()[2].cells[3].textContent??'',/통화 미확인/);
    assert.equal(h.writes.length,0,'Currency presentation never writes or converts stored evidence');
  } finally {await h.close();}
});

test('changing selected rows discards a prepared bulk scope and requires a fresh preview',async()=>{
  const h=await mount([item('a'),item('b')]);
  try {
    await click(checkbox(rows()[0]));await click(button('비거래 처리',document.querySelector('.money-notice-toolbar')!));
    assert.ok(document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]'));
    await click(checkbox(rows()[1]));assert.equal(document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]'),null);
    assert.equal(h.writes.filter(row=>row.path.endsWith('/execute')).length,0);
    await click(button('비거래 처리',document.querySelector('.money-notice-toolbar')!));
    assert.deepEqual((h.writes.at(-1)!.body as PreviewRequest).items,[{kind:'RAW',id:'a'},{kind:'RAW',id:'b'}]);
  } finally {await h.close();}
});

test('repeated incomplete outcome reads do not decrement counts or remove unconfirmed rows twice',async()=>{
  const h=await mount([item('saved'),item('unknown')]);let original:Outcome|undefined;
  h.behavior.execute=async command=>{original={requestId:command.requestId,completed:false,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'unknown',status:'UNKNOWN'}]};return original;};
  try {
    await click(button('현재 페이지 전체 선택'));await click(button('보류',document.querySelector('.money-notice-toolbar')!));
    await click(button('2건 보류',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,1);assert.match(button('필터 결과 전체 선택 (1건)').textContent??'',/1건/);
    h.behavior.recover=original;
    const commands=h.writes.length;await click(button('원래 요청 결과 조회'));await click(button('원래 요청 결과 조회'));
    assert.equal(h.writes.length,commands);assert.equal(rows().length,1);assert.ok(checkbox(rows()[0]).checked);
    assert.ok(button('필터 결과 전체 선택 (1건)'));
  } finally {await h.close();}
});

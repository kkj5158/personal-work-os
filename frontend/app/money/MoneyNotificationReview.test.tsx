import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api, type Account} from '@/lib/money/model';
import {ApiError} from '@/lib/api/client';
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

type Action = 'MOVE_TO_BOOKKEEPING'|'DEFER'|'REOPEN';
type Identity = {kind:string;id:string};
type Command = {previewId:string;requestId:string};
type Result = Identity & {status:string;eventId?:string;canUndo?:boolean;message?:string;transactionId?:string};
type Outcome = {requestId:string;completed:boolean;items:Result[]};
type PreviewRequest = {gate0:boolean;scope:string;action:Action;items:Identity[];state:string;search:string;accountId:string|null;reason:string|null};
type Preview = {previewId:string;scope:string;action:Action;selectedCount:number;eligibleCount:number;excludedCount:number;items:(AiItem & {eligible:boolean;exclusionReason:string|null;nextAction:string;commandGroup:string})[];groups:Record<string,number>};
const account:Account = {id:'owned-krw',displayName:'생활비',provider:'KAKAO',role:'SPENDING',maskedReference:null,suffix:'8557',archived:false,version:0,emoji:null,imageData:null,fundingAccountId:null};
function item(id:string, extra:Partial<AiItem>={}):AiItem {
  return {
    id,kind:'RAW',admissionFingerprint:'source-'+id,moveToBookkeepingEligible:true,state:'PENDING',reason:'UNMATCHED_OR_EXTERNAL_UNPROVEN',lane:'DECISION',
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
  const found=[...within.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text || b.getAttribute('aria-label')===text);
  assert.ok(found,'Missing button '+text);return found;
}
function rows(){return [...document.querySelectorAll<HTMLTableRowElement>('.money-notice-ledger .money-notice-record')];}
function checkbox(row:HTMLElement){const value=row.querySelector<HTMLInputElement>('input[type="checkbox"]');assert.ok(value);return value;}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
async function click(node:HTMLElement){await act(async()=>{node.click();});await settle();}
async function input(value:string){
  const node=document.querySelector<HTMLInputElement>('input[type="search"]');assert.ok(node);
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});await settle();
}
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}

async function mount(initial:AiItem[], storage:Record<string,string>={}) {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/review'});
  for(const [key,value] of Object.entries(storage))dom.window.sessionStorage.setItem(key,value);
  const previous={get:api.get,post:api.post,appEnv:process.env.NEXT_PUBLIC_APP_ENV};
  process.env.NEXT_PUBLIC_APP_ENV='dev';
  Object.assign(globalThis,{React,self:dom.window,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const {NotificationReview} = await import('./MoneyNotificationReview');
  // A retained legacy dialog must fail semantic assertions, but its optional
  // DOM API does not prevent the test from identifying that regression.
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const reads:string[]=[],writes:{path:string;body:unknown}[]=[],selected:unknown[]=[],previews=new Map<string,Preview>();
  let all=initial.map(row=>({...row})),saved=0;
  const behavior:{blocked:Set<string>;previewError?:Error;execute?:(command:Command,preview:Preview)=>Promise<Outcome>;single?:(command:{id:string;requestId:string;action:Action})=>Promise<Outcome>;recoverError?:Error;recover?:Outcome}={blocked:new Set()};
  const filtered=(q:URLSearchParams)=>all.filter(row=>row.state===(q.get('state')??'PENDING')&&(!q.get('search')||(row.title+' '+row.merchant).includes(q.get('search')!))&&(!q.get('accountId')||row.accountId===q.get('accountId'))&&(!q.get('reason')||row.reason===q.get('reason')));
  function apply(outcome:Outcome,preview:Preview) {
    for(const result of outcome.items) if(result.status==='SAVED') {
      const row=all.find(r=>r.id===result.id&&r.kind===result.kind);if(row){row.state=preview.action==='DEFER'?'DEFERRED':preview.action==='REOPEN'?'PENDING':'COMPLETED';row.transactionId=result.transactionId;}
    }
    return outcome;
  }
  api.get=async<T,>(path:string)=>{
    reads.push(path);
    if(path.startsWith('/ai/workbench?')) {const q=new URLSearchParams(path.split('?')[1]),found=filtered(q);assert.equal(q.get("scope"),"GATE0"); return {counts:{PENDING:all.filter(r=>r.state==="PENDING").length,DEFERRED:all.filter(r=>r.state==="DEFERRED").length,COMPLETED:all.filter(r=>r.state!=="PENDING").length},items:found.slice(Number(q.get('offset')??0),Number(q.get('offset')??0)+Number(q.get('limit')??50)),total:found.length,reasons:[...new Set(all.map(r=>r.reason))]} as T;}
    if(path==='/loans')return [] as T;
    if(path==='/review/owner/format')return {fingerprint:'synthetic',version:4,currency:null,amount:null,direction:null,candidate:{postedAt:'2026-11-22T07:38:28Z',timeSource:'OWNER_ENTERED'},raw:{title:'합성 알림',body:'마스킹된 합성 원문'},manualRequired:true,manualReason:'UNRECOGNIZED_SHAPE',partners:[],duplicates:[]} as T;
    if(path.endsWith('/diagnostic'))return {maskedTitle:'합성 은행 알림',maskedBody:'불변 원문 12000원 출금',sourcePackage:'합성 출처',missingFields:['amount'],existingSourceLinks:0,previousAttempt:{},currentParser:{parserVersion:'1.0.0'}} as T;
    if(path.startsWith('/review/batches/outcomes/')) {if(behavior.recoverError)throw behavior.recoverError;assert.ok(behavior.recover,'Recovery fixture missing');return behavior.recover as T;}
    throw Error('Unexpected Review GET '+path);
  };
  api.post=async<T,>(path:string,body:unknown)=>{
    writes.push({path,body});
    if(path==='/review/batches/single') {
      const command=body as {id:string;requestId:string;action:Action;version:number;admissionFingerprint?:string};
      assert.equal(command.version,3);assert.ok(command.requestId);
      if(command.action==='MOVE_TO_BOOKKEEPING')assert.equal(command.admissionFingerprint,'source-'+command.id);
      const outcome=behavior.single?await behavior.single(command):{requestId:command.requestId,completed:true,items:[{kind:'RAW',id:command.id,status:'SAVED',eventId:'event-'+saved++,canUndo:command.action!=='MOVE_TO_BOOKKEEPING',transactionId:command.action==='MOVE_TO_BOOKKEEPING'?'canonical-synthetic':undefined}]};
      return apply(outcome,{action:command.action} as Preview) as T;
    }
    if(path==='/review/batches/preview') {
      if(behavior.previewError)throw behavior.previewError;
      const request=body as PreviewRequest;assert.equal(request.gate0,true);
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

test('pending notifications expose the approved direct actions and read-only source detail',async()=>{
  const h=await mount([item('eligible'),item('blocked',{merchant:null,moveToBookkeepingEligible:false,moveToBookkeepingBlockReason:'입출금 근거 부족'})]);
  try {
    const row=rows()[0];assert.equal(row.cells[1].querySelector('strong')?.textContent,'사조푸디스트(주)씨유(C');
    assert.deepEqual([...row.querySelectorAll('button')].map(b=>b.textContent),['거래 등록','제외','상세']);
    assert.ok(button('등록 불가',rows()[1]).disabled);assert.equal(button('제외',rows()[1]).disabled,false);
    await click(button('상세',rows()[1]));const evidence=document.querySelector('[aria-label="원문 알림 및 처리 근거"]');
    assert.match(evidence?.textContent??'',/불변 원문 12000원 출금/);assert.match(evidence?.textContent??'',/입출금 근거 부족/);
    assert.equal(document.querySelector('dialog,.money-review-inline'),null);assert.equal(h.writes.length,0);
  } finally {await h.close();}
});
test('FORMAT keeps ordinary admission blocked while owner can open a blank manual assessment',async()=>{
  const h=await mount([item('format',{lane:'FORMAT',reason:'UNRECOGNIZED_SHAPE',moveToBookkeepingEligible:false,amount:null,accountId:null})]);
  try {
    assert.ok(button('등록 불가',rows()[0]).disabled);
    await click(button('직접 확인하여 등록',rows()[0]));await settle();
    assert.match(document.body.textContent??'',/마스킹된 합성 원문/);
    assert.equal(document.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.value,'');
    assert.ok(h.reads.includes('/review/owner/format'));assert.equal(h.writes.length,0);
  } finally {await h.close();}
});
for(const [label,action,state] of [['거래 등록','MOVE_TO_BOOKKEEPING','PENDING'],['제외','DEFER','PENDING'],['복원','REOPEN','DEFERRED']] as const) test(label+' commits one guarded command in place',async()=>{
  const h=await mount([item('direct',{state}),item('other',{state})]);
  try {
    if(state==='DEFERRED')await click(button('제외',document.querySelector('[role="tablist"]')!));
    await click(button(label,rows()[0]));assert.equal(h.writes.length,1);
    assert.equal(h.writes[0].path,'/review/batches/single');assert.equal((h.writes[0].body as {action:string}).action,action);
    assert.equal(rows().length,1);assert.equal(rows()[0].dataset.rowId,'other');
    assert.equal(document.querySelector('dialog,.money-review-inline,.money-notice-preview'),null);
    assert.equal(h.dom.window.location.pathname,'/money/review');assert.deepEqual(h.selected,[]);
    if(action==='MOVE_TO_BOOKKEEPING')assert.equal(document.querySelector('.money-notice-results a')?.getAttribute('href'),'/money/bookkeeping?transactionId=canonical-synthetic');
  } finally {await h.close();}
});
test('a lost single response blocks only its original row and recovers via GET without reposting',async()=>{
  const h=await mount([item('a'),item('b')]);let original='';
  h.behavior.single=async command=>{if(command.id==='a'){original=command.requestId;throw Error('connection interrupted');}return {requestId:command.requestId,completed:true,items:[{id:command.id,kind:'RAW',status:'SAVED'}]};};
  try {
    await click(button('거래 등록',rows()[0]));assert.ok(button('거래 등록',rows()[0]).disabled);assert.equal(button('제외',rows()[1]).disabled,false);
    await click(button('제외',rows()[1]));assert.equal(rows().length,1);assert.equal(h.writes.length,2);
    h.replace([item('a',{state:'COMPLETED'}),item('b',{state:'DEFERRED'})]);
    h.behavior.recover={requestId:original,completed:true,items:[{id:'a',kind:'RAW',status:'SAVED',transactionId:'original-cash'}]};
    await click(button('원래 요청 결과 조회'));assert.equal(h.writes.length,2);assert.ok(h.reads.includes('/review/batches/outcomes/'+original));assert.equal(rows().length,0);
    assert.equal(document.querySelector('.money-notice-results a')?.getAttribute('href'),'/money/bookkeeping?transactionId=original-cash');
  } finally {await h.close();}
});
test('double clicks on a row in flight produce one command and leave independent rows operable',async()=>{
  const h=await mount([item('a'),item('b')]);const pending=deferred<Outcome>();let id='';
  h.behavior.single=command=>{id=command.requestId;return pending.promise;};
  try {
    const target=button('거래 등록',rows()[0]);await act(async()=>{target.click();target.click();});
    assert.equal(h.writes.length,1);assert.equal(rows().length,2);assert.ok(button('제외',rows()[0]).disabled);assert.equal(button('제외',rows()[1]).disabled,false);
    await act(async()=>pending.resolve({requestId:id,completed:true,items:[{id:'a',kind:'RAW',status:'CONFLICT',message:'원문 근거가 변경되었습니다.'}]}));
    assert.match(rows()[0].textContent??'',/원문 근거가 변경/);assert.equal(button('제외',rows()[1]).disabled,false);
  } finally {await h.close();}
});

test('two selection/processing stages preserve pagination and refresh, then clear old selection when filtering',async()=>{
  const h=await mount(Array.from({length:55},(_,i)=>item('page-'+i,{merchant:'거래처 '+i})));
  try {
    assert.equal(rows().length,50);assert.match(document.body.textContent??'',/빠른 일괄 처리/);
    await click(document.querySelector<HTMLInputElement>('input[aria-label="현재 페이지 전체 선택"]')!);assert.equal(rows().filter(r=>checkbox(r).checked).length,50);
    await click(button('다음'));assert.equal(rows().length,5);assert.match(document.body.textContent??'',/선택 50건/);
    await click(button('새로고침'));assert.match(document.body.textContent??'',/선택 50건/);
    await click(button('필터 결과 전체 선택 (55건)'));assert.match(document.body.textContent??'',/선택 55건/);
    const filter=h.writes.at(-1)!.body as PreviewRequest;assert.equal(filter.scope,'FILTER');assert.deepEqual(filter.items,[]);
    assert.equal(h.writes.filter(value=>value.path.endsWith('/execute')).length,0,'Selecting never processes');
    await input('거래처 54');assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,false);assert.match(document.body.textContent??'',/빠른 일괄 처리/);
    await click(checkbox(rows()[0]));await click(button('제외',document.querySelector('[role="tablist"]')!));assert.match(document.body.textContent??'',/빠른 일괄 처리/);
  } finally {await h.close();}
});

test('bulk preview snapshots only selected IDs, reports exclusions, and does not execute until final confirmation',async()=>{
  const h=await mount([item('eligible'),item('blocked'),item('untouched')]);h.behavior.blocked.add('blocked');
  try {
    await click(checkbox(rows()[0]));await click(checkbox(rows()[1]));
    const toolbar=document.querySelector('.money-notice-toolbar');assert.ok(toolbar);await click(button('선택 거래 등록',toolbar));
    const preview=document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]');assert.ok(preview);
    assert.equal(preview.tagName,'SECTION','Bulk preview is an anchored compact section');
    assert.equal(h.writes.length,1);assert.deepEqual((h.writes[0].body as PreviewRequest).items,[{kind:'RAW',id:'eligible'},{kind:'RAW',id:'blocked'}]);
    assert.match(preview.textContent??'',/선택.*2건/);assert.match(preview.textContent??'',/적격.*1건/);assert.match(preview.textContent??'',/제외.*1건/);
    assert.equal(preview.querySelectorAll('li').length,2);assert.match(preview.textContent??'',/소유 계좌/);
    await click(button('1건 거래 등록',preview));
    assert.equal(rows().length,2);assert.equal(rows().filter(r=>checkbox(r).checked).length,1,'Excluded row remains selected');
    assert.equal(h.writes.filter(value=>value.path.endsWith('/execute')).length,1);
  } finally {await h.close();}
});

test('bulk partial success leaves failed/unknown rows selected and recovery updates only confirmed records',async()=>{
  const h=await mount([item('saved'),item('failed'),item('unknown')]);let command:Command|undefined;
  h.behavior.execute=async value=>{command=value;return {requestId:value.requestId,completed:false,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'failed',status:'CONFLICT',message:'버전 충돌'},{kind:'RAW',id:'unknown',status:'UNKNOWN'}]};};
  try {
    await click(document.querySelector<HTMLInputElement>('input[aria-label="현재 페이지 전체 선택"]')!);await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    await click(button('3건 제외',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,2);assert.equal(rows().filter(r=>checkbox(r).checked).length,2);
    assert.match(document.body.textContent??'',/버전 충돌/);assert.match(document.body.textContent??'',/결과 미확인/);
    assert.ok(button('거래 등록',rows()[0]).disabled);
    h.replace([item('saved',{state:'DEFERRED'}),item('failed'),item('unknown',{state:'DEFERRED'})]);
    h.behavior.recover={requestId:command!.requestId,completed:true,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'failed',status:'CONFLICT',message:'버전 충돌'},{kind:'RAW',id:'unknown',status:'SAVED'}]};
    const before=h.writes.length;await click(button('원래 요청 결과 조회'));assert.equal(h.writes.length,before);
    assert.equal(rows().length,1);assert.equal(checkbox(rows()[0]).checked,true);assert.match(document.body.textContent??'',/선택 1건/);
  } finally {await h.close();}
});

test('Undo appears only for server-approved successful events and uses the existing evidence-preserving endpoint',async()=>{
  const h=await mount([item('undo')]);
  try {
    await click(button('제외',rows()[0]));const result=document.querySelector('.money-notice-results');assert.ok(result);
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
    await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    await click(button('52건 제외',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,1,'Failed item must be reachable after page 2 disappears');
    assert.match(rows()[0].textContent??'',/거래처 0/);
    assert.equal(checkbox(rows()[0]).checked,true,'Only the conflict remains selected');
    assert.match(document.body.textContent??'',/선택 1건/);
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–1 \/ 1/);
    assert.ok(button('이전').disabled,'Offset must reset to the first surviving page');
    assert.ok(h.reads.slice(2).some(path=>new URLSearchParams(path.split('?')[1]).get('offset')==='0'),'The surviving page is fetched after targeted invalidation');
    const results=document.querySelector<HTMLTableElement>('.money-review-results');assert.ok(results);
    assert.equal(results.querySelectorAll('thead th').length,7);
    assert.equal(results.querySelectorAll('tbody tr').length,52,'All transaction snapshots remain available after leaving the processed page');
    assert.match(results.querySelector('tbody tr')?.textContent??'',/거래처 0/);
    await click(button('실패',document.querySelector('[aria-label="처리 결과 필터"]')!));
    assert.equal(results.querySelectorAll('tbody tr').length,1);
    assert.match(results.querySelector('tbody tr')?.textContent??'',/충돌/);
    assert.match(results.querySelector('tbody tr')?.textContent??'',/최신 값과 변경안 비교/);
  } finally {await h.close();}
});

test('a confirmed total shrink preserves the current page while it remains valid',async()=>{
  const h=await mount(Array.from({length:105},(_,i)=>item('valid-page-'+i,{merchant:'거래처 '+i})));
  try {
    await click(button('다음'));assert.equal(rows().length,50);
    const reads=h.reads.length;
    await click(button('제외',rows()[0]));
    assert.equal(rows().length,50,'Shifted records refill the current offset without skipping a row');
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/51–100 \/ 104/);
    assert.ok(!button('이전').disabled);
    assert.equal(h.reads.length,reads+1,'Only the active filtered page is revalidated');
  } finally {await h.close();}
});

test('a fully processed first page refills with surviving later-page items at the same valid offset',async()=>{
  const h=await mount(Array.from({length:55},(_,i)=>item('refill-'+i,{merchant:'거래처 '+i})));
  try {
    await click(document.querySelector<HTMLInputElement>('input[aria-label="현재 페이지 전체 선택"]')!);
    await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    await click(button('50건 제외',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,5,'Surviving off-page rows must remain reachable without manual refresh');
    assert.match(rows()[0].textContent??'',/거래처 50/);
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–5 \/ 5/);
    assert.ok(button('이전').disabled);
    assert.equal(h.reads.length,2,'Only the emptied active page requires one refill');
    assert.ok(h.reads.every(path=>new URLSearchParams(path.split('?')[1]).get('offset')==='0'));
  } finally {await h.close();}
});

test('completed raw bookkeeping commands show verified registration and Korean history reason only with server proof',async()=>{
  const h=await mount([item('registered',{state:'COMPLETED',reason:'MOVE_TO_BOOKKEEPING',transactionId:'canonical-history',canUndo:false}),item('noise',{state:'COMPLETED',reason:'UNRECOGNIZED_SHAPE',amount:null,accountId:null})]);
  try {
    await click(button('처리 이력',document.querySelector('[role="tablist"]')!));
    assert.equal(rows().length,2);
    assert.match(rows()[0].textContent??'',/거래 등록/);assert.match(rows()[0].textContent??'',/거래 등록/);
    assert.equal(rows()[0].querySelector('a')?.getAttribute('href'),'/money/bookkeeping?transactionId=canonical-history');
    assert.ok(!rows()[1].textContent?.includes('거래 등록'));assert.ok(!rows()[0].textContent?.includes('MOVE_TO_BOOKKEEPING'));
    assert.equal(document.querySelector('.money-notice-toolbar'),null);
    assert.equal(h.writes.length,0,'History labels remain read-only');
  } finally {await h.close();}
});

test('server-confirmed KRW defaults render alongside explicit foreign currency and genuinely unknown currency',async()=>{
  const h=await mount([item('domestic',{currency:null,effectiveCurrency:'KRW'}),item('foreign',{currency:'USD',effectiveCurrency:'KRW'}),item('uncertain',{currency:null,effectiveCurrency:null})]);
  try {
    assert.match(rows()[0].cells[2].textContent??'',/12,000원/);
    assert.match(rows()[1].cells[2].textContent??'',/USD/);
    assert.ok(!rows()[1].cells[2].textContent?.includes('원'));
    assert.match(rows()[2].cells[2].textContent??'',/통화 미확인/);
    assert.equal(h.writes.length,0,'Currency presentation never writes or converts stored evidence');
  } finally {await h.close();}
});

test('changing selected rows discards a prepared bulk scope and requires a fresh preview',async()=>{
  const h=await mount([item('a'),item('b')]);
  try {
    await click(checkbox(rows()[0]));await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    assert.ok(document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]'));
    await click(checkbox(rows()[1]));assert.equal(document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]'),null);
    assert.equal(h.writes.filter(row=>row.path.endsWith('/execute')).length,0);
    await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    assert.deepEqual((h.writes.at(-1)!.body as PreviewRequest).items,[{kind:'RAW',id:'a'},{kind:'RAW',id:'b'}]);
  } finally {await h.close();}
});

test('repeated incomplete outcome reads do not decrement counts or remove unconfirmed rows twice',async()=>{
  const h=await mount([item('saved'),item('unknown')]);let original:Outcome|undefined;
  h.behavior.execute=async command=>{original={requestId:command.requestId,completed:false,items:[{kind:'RAW',id:'saved',status:'SAVED'},{kind:'RAW',id:'unknown',status:'UNKNOWN'}]};return original;};
  try {
    await click(document.querySelector<HTMLInputElement>('input[aria-label="현재 페이지 전체 선택"]')!);await click(button('선택 제외',document.querySelector('.money-notice-toolbar')!));
    await click(button('2건 제외',document.querySelector('[aria-label="선택 항목 일괄 처리 미리보기"]')!));
    assert.equal(rows().length,1);assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–1 \/ 1/);
    h.behavior.recover=original;
    const commands=h.writes.length;await click(button('원래 요청 결과 조회'));await click(button('원래 요청 결과 조회'));
    assert.equal(h.writes.length,commands);assert.equal(rows().length,1);assert.ok(checkbox(rows()[0]).checked);
    assert.match(document.querySelector('.money-pagination')?.textContent??'',/1–1 \/ 1/);
  } finally {await h.close();}
});

test('review tabs support manual keyboard activation, one selected state, and discoverable focused tabs',async()=>{
  const h=await mount([item('pending'),item('held',{state:'DEFERRED'})]);
  try {
    const tabs=[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    assert.deepEqual(tabs.map(tab=>tab.textContent),['검토 대기','제외','처리 이력']);
    assert.deepEqual(tabs.map(tab=>tab.tabIndex),[0,-1,-1]);
    const scrolled:string[]=[];
    for(const tab of tabs)tab.scrollIntoView=()=>{scrolled.push(tab.textContent!);};
    await act(()=>tabs[0].focus());
    const before=h.reads.length;
    async function key(tab:HTMLButtonElement,value:string){await act(()=>{tab.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));});}
    await key(tabs[0],'ArrowRight');
    assert.equal(document.activeElement,tabs[1]);
    assert.equal(tabs[0].getAttribute('aria-selected'),'true','Arrow exploration keeps the existing view');
    assert.equal(h.reads.length,before,'Arrow exploration does not trigger data loading');
    assert.ok(scrolled.includes('제외'),'Focused tab is scrolled into view');
    await key(tabs[1],'End');assert.equal(document.activeElement,tabs[2]);
    await key(tabs[2],'ArrowRight');assert.equal(document.activeElement,tabs[0]);
    await key(tabs[0],'ArrowLeft');assert.equal(document.activeElement,tabs[2]);
    await key(tabs[2],'Home');assert.equal(document.activeElement,tabs[0]);
    await click(tabs[1]);
    assert.equal(document.querySelectorAll('[role="tab"][aria-selected="true"]').length,1);
    assert.equal(tabs[1].getAttribute('aria-selected'),'true');
    assert.equal(rows().length,1);
    const panel=document.getElementById(tabs[1].getAttribute('aria-controls')!);
    assert.equal(panel?.getAttribute('role'),'tabpanel');
    assert.equal(panel?.getAttribute('aria-labelledby'),tabs[1].id);
    assert.equal(h.writes.length,0);
  } finally {await h.close();}
});

test('a tab reload restores owner-bound opaque keys, looks up the outcome, and retries only the identical command on a missing receipt',async()=>{
  const h=await mount([item('source')]);
  h.behavior.single=async()=>{throw Error('connection closed');};
  const storage:Record<string,string>={};
  let first:unknown;
  try {
    await click(button('거래 등록',rows()[0]));
    first=h.writes[0].body;
    const k=h.dom.window.sessionStorage.key(0)!;
    storage[k]=h.dom.window.sessionStorage.getItem(k)!;
    assert.ok(!storage[k].includes('사조푸디스트'));assert.ok(!storage[k].includes('12000'));assert.ok(!storage[k].includes('입출금내역'));
    storage['money-review-requests-v1:another-owner']=storage[k].replaceAll('source','unrelated');
  } finally {await h.close();}
  const reopened=await mount([item('source'),item('unrelated')],storage);
  try {
    assert.ok(button('거래 등록',rows()[0]).disabled);assert.equal(button('거래 등록',rows()[1]).disabled,false);
    assert.equal(reopened.writes.length,0);assert.equal(document.querySelector('.money-notice-recovery')?.textContent?.includes('같은 요청으로 재시도'),false);
    reopened.behavior.recoverError=new ApiError(404,'원래 요청을 찾을 수 없습니다.');
    await click(button('원래 요청 결과 조회'));assert.equal(reopened.writes.length,0);
    await click(button('같은 요청으로 재시도'));assert.deepEqual(reopened.writes[0].body,first);
    assert.equal(reopened.dom.window.sessionStorage.getItem('money-review-requests-v1:dev-fixed-owner'),null);
    assert.ok(reopened.dom.window.sessionStorage.getItem('money-review-requests-v1:another-owner'));
    assert.equal(rows().length,1);
  } finally {await reopened.close();}
});

test('a definitive HTTP rejection leaves the row actionable without a receipt retry',async()=>{
  const h=await mount([item('changed')]);
  h.behavior.single=async()=>{throw new ApiError(409,'원문 버전이 변경되었습니다.');};
  try {
    await click(button('거래 등록',rows()[0]));
    assert.ok(rows()[0].textContent?.includes('원문 버전이 변경되었습니다.'));
    assert.equal(document.querySelector('.money-notice-recovery'),null);
    assert.equal(button('제외',rows()[0]).disabled,false);assert.equal(h.dom.window.sessionStorage.length,0);
  } finally {await h.close();}
});

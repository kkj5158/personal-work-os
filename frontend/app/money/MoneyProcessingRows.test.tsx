import assert from 'node:assert/strict';
import {test} from 'node:test';
import React, {act, useState} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api} from '@/lib/money/model';
import {visibleProcessingRows, type ProcessingRow} from '@/lib/money/processing';
import {MoneyDataProvider} from './MoneyDataProvider';
import {useMoneyData} from './MoneyWebData';
import {MoneyProcessingRows, useMoneyProcessing, PROCESSING_POLL_MS} from './MoneyProcessingRows';

const row: ProcessingRow = {rawEventId:'raw-a',direction:'OUT',amount:12000,currency:'KRW',accountId:'a',accountName:'생활 계좌',bankProvider:'은행',counterparty:'새 거래처',occurredAt:'2026-10-14T00:00:00Z',status:'PROCESSING',reasonCode:null,reasonText:null};
const filters = {kind:'EXPENSE' as const,search:'',accountIds:null,trackedAccountIds:['a'],minAmount:'',maxAmount:'',categoryFiltered:false,classificationState:'ALL',classificationOrigin:''};
const settle = async () => {await act(async () => {for (let i=0;i<15;i++) await new Promise(resolve=>setTimeout(resolve,0));});};

test('read-only processing rows retain eight cells and expose precise terminal review reason', async () => {
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client'), root=createRoot(document.getElementById('root')!);
  let reviews=0;
  try {
    await act(()=>root.render(<table><tbody><MoneyProcessingRows items={[row]} onReview={()=>reviews++}/></tbody></table>));
    assert.equal(document.querySelectorAll('td').length,8);
    assert.match(document.body.textContent??'',/처리 중/);
    assert.equal(document.querySelectorAll('input,button,select').length,0,'No selection, category or financial actions');
    await act(()=>root.render(<table><tbody><MoneyProcessingRows items={[{...row,status:'REVIEW_REQUIRED',reasonCode:'EXISTING_FACT_OVERLAP',reasonText:'이미 기록된 거래와 알림 근거가 겹침'}]} onReview={()=>reviews++}/></tbody></table>));
    assert.match(document.body.textContent??'',/이미 기록된 거래와 알림 근거가 겹침/);
    await act(()=>document.querySelector<HTMLButtonElement>('button')!.click());
    assert.equal(reviews,1);
  } finally {await act(()=>root.unmount());dom.window.close();}
});

test('ingestion polling replaces source row with canonical row and preserves staged choices and confirmed summary', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/bookkeeping'});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  const {createRoot}=await import('react-dom/client'), root=createRoot(document.getElementById('root')!);
  const original=api.get;
  let posted=false, ingested=false, tick: (()=>void)|null=null;
  const reads: string[] = [];
  const originalInterval=window.setInterval;
  window.setInterval=((handler: TimerHandler, timeout?:number)=>{if(timeout===PROCESSING_POLL_MS)tick=handler as ()=>void;return 123;}) as typeof window.setInterval;
  api.get=async<T,>(path:string)=> {
    reads.push(path);
    if(path.startsWith('/processing')) return {items:ingested&&!posted?[row]:[],truncated:false} as T;
    if(path.startsWith('/bookkeeping')) return {items:posted?[{id:'canonical',sourceRawEventIds:['raw-a']}]:[],summary:{total:posted?12000:0}} as T;
    throw Error('Unexpected API '+path);
  };
  function Harness() {
    const [draft,setDraft]=useState('소분류 입력 중'), [selected,setSelected]=useState(true);
    const processing=useMoneyProcessing('/processing?from=2026-10-01&to=2026-10-31', '/bookkeeping?kind=EXPENSE');
    const book=useMoneyData<{items:{id:string;sourceRawEventIds:string[]}[];summary:{total:number}}>('/bookkeeping?kind=EXPENSE');
    const items=visibleProcessingRows(processing.data?.items??[],filters,book.data?.items??[]);
    return <><input aria-label="분류 초안" value={draft} onChange={e=>setDraft(e.target.value)}/><input aria-label="기존 거래 선택" type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/><output>{book.data?.summary.total??0}</output><table><tbody><MoneyProcessingRows items={items} onReview={()=>{}}/>{book.data?.items.map(item=><tr key={item.id} data-canonical-id={item.id}><td>확정 거래</td></tr>)}</tbody></table></>;
  }
  try {
    await act(()=>root.render(<MoneyDataProvider><Harness/></MoneyDataProvider>));await settle();
    assert.equal(document.querySelector('[data-processing-id]'),null);
    const initialReads = reads.length;
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
    await act(()=>tick!());await settle();
    assert.equal(reads.length, initialReads, 'Hidden pages pause source and canonical polling');
    Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
    posted=true;
    for (let i=0;i<3;i++) {await act(()=>tick!());await settle();}
    assert.equal(document.querySelectorAll('[data-canonical-id]').length,1,'Immediate admission is refreshed even without an observed pending row');
    posted=false;
    for (let i=0;i<3;i++) {await act(()=>tick!());await settle();}
    ingested=true;
    await act(()=>tick!());await settle();
    assert.ok(document.querySelector('[data-processing-id]'),'Appears after ingestion without navigation');
    assert.equal(document.querySelector('output')?.textContent,'0','Pending amount excluded from confirmed totals');
    posted=true;
    await act(()=>tick!());await settle();
    assert.equal(document.querySelector('[data-processing-id]'),null);
    assert.equal(document.querySelectorAll('[data-canonical-id]').length,1);
    assert.equal(document.querySelector('output')?.textContent,'12000');
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="분류 초안"]')?.value,'소분류 입력 중');
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="기존 거래 선택"]')?.checked,true);
  } finally {api.get=original;window.setInterval=originalInterval;await act(()=>root.unmount());dom.window.close();}
});

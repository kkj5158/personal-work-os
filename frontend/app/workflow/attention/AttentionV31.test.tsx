import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import AttentionBoard from './AttentionBoard';
import AttentionCard from './AttentionCard';
import type {AttentionFeed,AttentionItem} from '@/lib/api/attention';
test('V3 renders exactly three fixed groups, completed checkbox and honest information gaps; Stack contains their union',()=>{
 Object.assign(globalThis,{React});
 const items=['ACTIVE','COMPLETED','DEFERRED'].map((g,i)=>({id:String(i),action:i===0?'GPT 응답 확인':'실제 작업 '+i,status:i===1?'COMPLETED':'OPEN',queueGroup:g,createdAt:'2026-01-01T00:00:00Z',projectLabel:'PROJECT',source:{kind:'CHATGPT',intent:'RESPONSE_COMPLETED',generation:'g'}} as AttentionItem));
 const feed={items,totals:{ACTIVE:1,COMPLETED:1,DEFERRED:1}} as AttentionFeed;
 const props={lanes:[],disabled:false,onComplete:()=>{},onSource:()=>{},onEdit:()=>{},onMemo:()=>{},onHold:()=>{}};
 const group=new JSDOM(renderToStaticMarkup(<AttentionBoard feed={feed} mode="GROUP" cardProps={props} onDragHold={()=>{}} onMove={()=>{}}/>));
 assert.deepEqual([...group.window.document.querySelectorAll('.aq-lane h2')].map(n=>n.firstChild?.textContent),['진행중','완료','나중에 확인']);
 assert.equal(group.window.document.querySelectorAll('input:checked').length,1);
 assert.equal(group.window.document.querySelectorAll('.aq-summary').length,3);
 assert.equal(group.window.document.querySelector('.aq-card-title strong')?.textContent,'원본 작업 제목 미수집');
 assert.ok(group.window.document.body.textContent?.includes('이름 지정'));
 const stack=new JSDOM(renderToStaticMarkup(<AttentionBoard feed={feed} mode="STACK" cardProps={props} onDragHold={()=>{}} onMove={()=>{}}/>));
 assert.equal(stack.window.document.querySelectorAll('[data-attention-id]').length,3);assert.equal(stack.window.document.querySelectorAll('.aq-lane').length,0);
 assert.equal(stack.window.document.querySelector('[aria-roledescription="draggable"]'),null);
 const hidden=new JSDOM(renderToStaticMarkup(<AttentionCard {...props} item={{...items[0],status:'DISMISSED'}} history groupMode onMove={()=>{}}/>));assert.equal(hidden.window.document.querySelector('[aria-label*="그룹 이동"]'),null);assert.equal(hidden.window.document.querySelector('button')?.textContent,'↶');hidden.window.close();
 group.window.close();stack.window.close();
});

test('a limited Desktop wait report shows the input-needed badge on an open card', () => {
  Object.assign(globalThis, {React});
  const timestamp = '2026-11-23T00:00:00Z';
  const item: AttentionItem = {
    id: 'desktop-wait', action: '질문', projectLabel: 'QA', status: 'OPEN', createdAt: timestamp, updatedAt: timestamp,
    displayTitle: '질문', laneId: 'active', stackOrder: 1, laneOrder: 1, attentionSequence: 1, revision: 1, sourceKey: 'desktop-wait',
    source: {kind: 'CODEX_DESKTOP', intent: 'COMPLETED', generation: 'turn', producer: 'MANUAL', completionPolicy: 'ACK_ONLY'},
    content: {schemaVersion: 'work-content.v1', eventId: 'desktop.wait', quality: 'LIMITED', contentRevision: 1,
      sourceTitle: {text: '질문', origin: 'EVENT_METADATA'}, requestProvenance: 'LOCAL_EXTRACTIVE',
      request: {text: '색상을 골라 주세요.', origin: 'EVENT_METADATA'}}
  };
  const card = new JSDOM(renderToStaticMarkup(<AttentionCard item={item} lanes={[]} disabled={false}
    onComplete={()=>{}} onSource={()=>{}} onEdit={()=>{}} onMemo={()=>{}} onHold={()=>{}}/>));
  const badge = card.window.document.querySelector('.aq-badge');
  assert.equal(badge?.textContent, '입력 필요');
  assert.ok(badge?.classList.contains('aq-event-needs_user_input'));
  card.window.close();
  const received: AttentionItem = {...item, content: {...item.content!, eventId: 'desktop.answered', contentRevision: 2}};
  const resolved = new JSDOM(renderToStaticMarkup(<AttentionCard item={received} lanes={[]} disabled={false}
    onComplete={()=>{}} onSource={()=>{}} onEdit={()=>{}} onMemo={()=>{}} onHold={()=>{}}/>));
  assert.equal(resolved.window.document.querySelector('.aq-badge')?.textContent, '입력 받음');
  assert.equal(resolved.window.document.querySelector('input')?.checked, false);
  resolved.window.close();
});

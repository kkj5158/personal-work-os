import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MoneyRuleChangeReview,type WorkspaceDraft,type WorkspacePreview} from './MoneyRuleChangeReview';
import type {Props} from './MoneyWebViews';
const account='a2a06e63-6b55-40af-8bfd-4706974d289e';
const p={accounts:[{id:account,displayName:'생활비 계좌'}],categories:[{id:'root',name:'생활',parentId:null},{id:'child',name:'생활용품',parentId:'root'}]} as Props;
const draft:WorkspaceDraft={id:'draft',version:4,targetRuleId:'rule',sourceVersion:2,summary:'생활용품 분류로 수정',conversationId:'conversation',rule:{name:'구매 맥락 규칙',conditions:[{field:'type',operator:'EXACT',value:'EXPENSE'},{field:'accountId',operator:'EXACT',value:account},{field:'merchant',operator:'EXACT',value:'거래처'}],categoryId:'child',titleDefault:null,memoDefault:null,status:'PAUSED',expectedVersion:2}};
const before={...draft.rule,categoryId:'root',status:'ACTIVE' as const,priority:1,origin:'MANUAL' as const,version:2,conditions:[{field:'merchant' as const,operator:'EXACT' as const,value:'이전 거래처'}]};
const preview:WorkspacePreview={fingerprint:'fingerprint',canApply:true,conflicts:[],changes:[{...draft,before,existingMatching:3,directEditsProtected:1,historicalChanges:0}]};
function render(value:WorkspacePreview|null){return renderToStaticMarkup(<MoneyRuleChangeReview p={p} drafts={[draft]} chosen={['draft']} onChosen={()=>{}} preview={value} busy={false} error="" notice="" onPreview={()=>{}} onApprove={()=>{}} onBack={()=>{}} onEdit={()=>{}}/>);}
test('independent change review shows actual before/after conditions, category/state and future/historical boundary',()=>{
 const html=render(preview);
 for(const text of ['이전 거래처','거래처','생활비 계좌','소분류 없음','생활용품','사용 중','일시 정지','현재 조건 일치 3건','과거 변경 0건','대화로 돌아가기'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes(account));assert.ok(!html.includes('ACTIVE'));assert.ok(!html.includes('PAUSED'));assert.ok(!html.includes('원본 v'));
});
test('rule approval is unavailable before actual preview or with real selected-draft conflict',()=>{
 assert.match(render(null),/<button[^>]*disabled=""[^>]*>확인한 선택 1개 함께 승인/);
 assert.match(render({...preview,canApply:false,conflicts:['같은 원본 규칙을 여러 초안이 수정합니다.']}),/<button[^>]*disabled=""[^>]*>확인한 선택 1개 함께 승인/);
});
test('existing overlapping rules are displayed only from actual current preview data',()=>{
 assert.ok(!render(preview).includes('겹치는 기존 규칙·현재 우선순위'));
 const value={...preview,changes:preview.changes.map(change=>({...change,overlappingRules:[{...before,name:'현재 겹치는 규칙',priority:7}]}))};
 const html=render(value);
 assert.ok(html.includes('현재 겹치는 규칙'));assert.ok(html.includes('현재 규칙 우선순위 7'));assert.ok(html.includes('이전 거래처'));
});

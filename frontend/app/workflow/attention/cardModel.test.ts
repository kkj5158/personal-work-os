import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {dragStartAllowed,eventBadge,groundedSummary,memoKeyAction,snapshotScope,chronological,genericTitle,incompleteInformation} from './cardModel';
import type {AttentionItem} from '../../../lib/api/attention';
const item={action:'확인할 제목',source:{intent:'RESPONSE_COMPLETED'}} as AttentionItem;
test('conditional snapshot scope follows the hashed owner, not queue revision',()=>{assert.equal(snapshotScope('"attention-0123456789abcdef-8-abc"'),snapshotScope('"attention-0123456789abcdef-2-def"'));assert.notEqual(snapshotScope('"attention-0123456789abcdef-8-abc"'),snapshotScope('"attention-fedcba9876543210-8-abc"'));assert.equal(snapshotScope(null),null);});
test('summaries retain supported origin and prefer source-provided over extractive',()=>{assert.deepEqual(groundedSummary({...item,summary:'발췌',summaryOrigin:'LOCAL_EXTRACTIVE',source:{...item.source,summary:'출처 제공',summaryOrigin:'SOURCE_PROVIDED'}}),{text:'출처 제공',origin:'SOURCE_PROVIDED'});});
test('blank, untrusted and title fallback metadata never become invented summaries',()=>{assert.deepEqual(groundedSummary({...item,summary:'   ',summaryOrigin:'SOURCE_PROVIDED'}),{text:'요약 정보 없음',origin:'TITLE_FALLBACK'});assert.deepEqual(groundedSummary({...item,summary:'무시',summaryOrigin:'AI_GENERATED' as never}),{text:'요약 정보 없음',origin:'TITLE_FALLBACK'});});
test('all six known events are distinct from lifecycle; unknown/manual have no badge',()=>{for(const value of ['RESPONSE_COMPLETED','COMPLETED','NEEDS_USER_INPUT','BLOCKED','FAILED','REVIEW_REQUIRED'])assert.ok(eventBadge(value));assert.equal(eventBadge('OPEN'),null);assert.equal(eventBadge('manual-1'),null);});
test('IME, multiline and cancel keys preserve editing intent',()=>{assert.equal(memoKeyAction('Enter',false,true,13),'compose');assert.equal(memoKeyAction('Enter',false,false,229),'compose');assert.equal(memoKeyAction('Enter',true,false,13),'type');assert.equal(memoKeyAction('Enter',false,false,13),'save');assert.equal(memoKeyAction('Escape',false,false,27),'cancel');});
test('whole card includes preview and excludes nested interactive controls',()=>{const dom=new JSDOM('<article><strong>title</strong><span>project</span><p>summary</p><div data-memo-preview role="button"><span>memo</span></div><button><span>action</span></button><a href="#">link</a><input type="checkbox"><textarea></textarea><select></select><div contenteditable="true">edit</div><div role="menuitem">menu</div></article>');const root=dom.window.document;for(const selector of ['article','strong','article>span','p','[data-memo-preview] span'])assert.equal(dragStartAllowed(root.querySelector(selector)!),true,selector);for(const selector of ['button span','a','input','textarea','select','[contenteditable]','[role="menuitem"]'])assert.equal(dragStartAllowed(root.querySelector(selector)!),false,selector);});

test('V3 chronological sort retains microseconds and stable IDs regardless of lifecycle or legacy order',()=>{
 const base={...item,createdAt:'2026-01-01T00:00:00.123456Z',id:'a',status:'OPEN',stackOrder:99} as AttentionItem;
 const values=[base,{...base,id:'b',status:'COMPLETED' as const},{...base,id:'c',createdAt:'2026-01-01T00:00:00.123457Z',queueGroup:'DEFERRED' as const}];
 assert.deepEqual(values.sort(chronological).map(i=>i.id),['c','b','a']);
 assert.equal(genericTitle('GPT 응답 확인'),true);assert.equal(incompleteInformation({...item,summary:item.action,summaryOrigin:'SOURCE_PROVIDED'}),true);
});

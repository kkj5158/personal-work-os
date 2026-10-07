import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryParts,conditionText,ruleState} from './surfacePresentation';
import type {Category} from './model';
const categories=[{id:'root',name:'생활',parentId:null},{id:'child',name:'생활용품',parentId:'root'}] as Category[];
test('actual root-direct classification is a saved state without synthesizing a child category',()=>{
 assert.deepEqual(categoryParts(categories,'root'),{root:'생활',child:'소분류 없음'});
 assert.deepEqual(categoryParts(categories,'child'),{root:'생활',child:'생활용품'});
 assert.deepEqual(categoryParts(categories,null),{root:'미분류',child:'—'});
 assert.deepEqual(categoryParts([], 'currently-unavailable'),{root:'분류 정보 확인 필요',child:'—'});
});
test('change review resolves actual account/type conditions and hides unavailable internal IDs',()=>{
 const id='a2a06e63-6b55-40af-8bfd-4706974d289e';
 assert.equal(conditionText({field:'accountId',operator:'EXACT',value:id},[{id,displayName:'생활비 계좌'}]),'계좌 · 생활비 계좌 · 일치');
 assert.ok(!conditionText({field:'accountId',operator:'EXACT',value:id},[]).includes(id));
 assert.equal(conditionText({field:'type',operator:'EXACT',value:'EXPENSE'},[]),'거래 유형 · 지출 · 일치');
 assert.equal(ruleState('ACTIVE'),'사용 중');
});

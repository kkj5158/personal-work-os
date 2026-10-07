import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reviewCounterparty,reviewReason,eventPrevious,type ClassificationEvent} from './classificationPresentation';

test('RAW source namespaces never masquerade as known merchants',()=>{
 assert.equal(reviewCounterparty({merchant:'com.ibk.android.ionebank',title:null,kind:'RAW'}),'기업은행 알림');
 assert.equal(reviewCounterparty({merchant:'com.unknown.bank',title:null,kind:'RAW'}),'거래처 미확인 · 은행 알림');
 assert.equal(reviewCounterparty({merchant:'com.unknown.bank',title:'거래 알림',kind:'RAW'}),'거래 알림');
 assert.equal(reviewCounterparty({merchant:'동네 카페',title:'업무 간식',kind:'TRANSACTION'}),'동네 카페');
 assert.equal(reviewCounterparty({merchant:'amazon.co.jp',title:null,kind:'TRANSACTION'}),'amazon.co.jp');
});
test('financial uncertainty remains specific, with no invented currency review reason',()=>{
 assert.equal(reviewReason({reason:'ACCOUNT_RESOLUTION_REQUIRED',reviewType:'CLASSIFICATION',kind:'RAW',proposal:{categoryId:null,basis:'NONE',reason:''}}),'등록된 계좌와 연결되지 않음');
 assert.equal(reviewReason({reason:'POSSIBLE_ALREADY_POSTED_ROUTE',reviewType:'TRANSFER',kind:'TRANSACTION',proposal:{categoryId:null,basis:'NONE',reason:''}}),'이미 기록된 이체와 중복 의심');
 assert.equal(reviewReason({reason:'CATEGORY_UNCONFIRMED',reviewType:'CLASSIFICATION',kind:'TRANSACTION',proposal:{categoryId:'child',basis:'CONFIRMED_HISTORY',reason:'이력'}}),'분류 제안 있음');
});
test('previous classification comes only from the current event, including valid unclassified state',()=>{
 const events=[{id:'older',previousValue:{categoryId:'old'}},{id:'current',previousValue:{categoryId:null}}] as ClassificationEvent[];
 assert.equal(eventPrevious(events,'current'),null);
 assert.equal(eventPrevious(events,'missing'),undefined);
});

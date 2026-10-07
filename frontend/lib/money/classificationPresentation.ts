import type {AiItem} from './ai';
import {reviewReasons} from './meaning';

const packageName=/^(?:com|net|org|kr|jp|io|app)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i;
const sourceNames:Record<string,string>={
 'com.ibk.android.ionebank':'기업은행 알림',
 'com.wooribank.smart.npib':'우리은행 알림',
 'com.shinhan.sbanking':'신한은행 알림',
 'com.kbstar.kbbank':'국민은행 알림',
};
/** A package is provenance, never a merchant identity. Unknowns stay unknown. */
export function reviewCounterparty(row:Pick<AiItem,'merchant'|'title'|'kind'>){
 if(row.merchant?.trim()&&!packageName.test(row.merchant.trim()))return row.merchant;
 if(row.title?.trim()&&!packageName.test(row.title.trim()))return row.title;
 return sourceNames[row.merchant??'']??(row.kind==='RAW'?'거래처 미확인 · 은행 알림':'거래처 정보 없음');
}
export function reviewReason(row:Pick<AiItem,'reason'|'reviewType'|'kind'|'proposal'>){
 if(row.reason==='CATEGORY_UNCONFIRMED')return row.proposal?.categoryId?'분류 제안 있음':'직접 분류 확인';
 return reviewReasons[row.reason]??(row.reviewType==='TRANSFER'?'이체 연결 확인':row.reviewType==='NOISE'?'거래·안내 알림 구분':row.kind==='RAW'?'알림의 금융 정보 확인':'거래 정보 확인');
}
export type ClassificationEvent={
 id:string;transactionId:string;bundleId:string;origin:string;categoryId:string|null;active:boolean;createdAt:string;
 previousValue:{categoryId?:string|null};nextValue?:{categoryId?:string|null};evidence:{reason?:string;retention?:string};
 title?:string;merchant?:string|null;accountId?:string;occurredAt?:string;reason?:string;
};
export type ClassificationUndoPreview={eligibleEventIds:string[];excluded:{eventId:string;reason:string}[];fingerprint:string};
export function eventPrevious(events:ClassificationEvent[],eventId?:string|null){
 return events.find(event=>event.id===eventId)?.previousValue.categoryId;
}

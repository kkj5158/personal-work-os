import type {Account, Category} from './model';
import {categoryIndex} from './categories';

export type DisplayCondition={field:string;operator:string;value:string};
export function conditionText(condition:DisplayCondition,accounts:Pick<Account,'id'|'displayName'>[]):string {
 const field:Record<string,string>={type:'거래 유형',accountId:'계좌',merchant:'거래처',title:'구매 맥락·제목'};
 const operator:Record<string,string>={EXACT:'일치',CONTAINS:'포함',STARTS_WITH:'시작'};
 const value=condition.field==='accountId'?(accounts.find(a=>a.id===condition.value)?.displayName??'현재 확인할 수 없는 계좌'):condition.field==='type'?({EXPENSE:'지출',INCOME:'수입'}[condition.value]??'거래 유형 확인 필요'):condition.value;
 return `${field[condition.field]??'지원 조건 확인 필요'} · ${value} · ${operator[condition.operator]??'비교 방식 확인 필요'}`;
}
export function categoryParts(categories:Category[],id?:string|null){
 const index=categoryIndex(categories),value=id?index.byId.get(id):undefined;
 return {root:value?(value.parentId?(index.byId.get(value.parentId)?.name??'보관 분류'):value.name):id?'분류 정보 확인 필요':'미분류',child:value?(value.parentId?value.name:'소분류 없음'):'—'};
}
export const ruleState=(status?:string|null)=>({ACTIVE:'사용 중',PAUSED:'일시 정지',INACTIVE:'사용 안 함'}[status??'']??'현재 상태 확인 필요');

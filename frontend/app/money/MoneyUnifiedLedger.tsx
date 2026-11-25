"use client";
import {Fragment,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {moneyApi as api,seoul,type Account} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {UNIFIED,type UnifiedRow} from '@/lib/money/unified';
import {useMoneyCache,useMoneyViewState,useMoneyRows} from './MoneyDataProvider';
import {LoadState,useMoneyData,type BookFields,type BookRow} from './MoneyWebData';
import {GroupedAccountFilter} from './MoneyGroupedAccountFilter';
import {CategoryFilters} from './MoneyCategoryPicker';
import type {LoanFilter} from '@/lib/money/monthly';
import {reviewLedgerHref} from '@/lib/money/reviewWorkflow';
import {useLedgerCategories} from './MoneyLedgerCategory';
import {MoneyFinancialEngine} from './MoneyFinancialEngine';
import {categoryEligible,type LedgerRow} from '@/lib/money/accountLedger';
import {AccountLedgerEditor} from './MoneyAccountLedgerEditor';
import {FinancialTypePicker,useFinancialDecisions,DecisionStatus} from './MoneyLedgerFinancialType';
import type {LedgerOperation} from '@/lib/money/accountLedger';
import {useMoneyProcessing} from './MoneyProcessingRows';
import {processingPath} from '@/lib/money/processing';
export {UnifiedFinancialAction} from './MoneyFinancialEditor';
import {RecommendationProvider,RecommendationCategory} from './MoneyBookkeepingRecommendations';
import {RegistrationAction,CancellationHistory} from './MoneyRegistration';
import {AccountLabel,Pagination,type Props} from './MoneyWebViews';
import {InlineText,BookkeepingCharts,type CurrencyBookPage} from './MoneyBookkeeping';
import './money-unified.css';

type RepaymentDrilldown = {filter:LoanFilter;accounts:string[]|null;availableAccounts:Account[];onAccounts:(ids:string[]|null)=>void;scroll:number};
export function UnifiedLedger(p:Props&{repayment?:RepaymentDrilldown}){
 const {repayment}=p;
 const financialCategories=useLedgerCategories();
 const decisions=useFinancialDecisions();
 const [engineOpen,setEngineOpen]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [pending,setPending]=useMoneyViewState<Record<string,LedgerOperation|null>>('book-confirmed-detail-operations',()=>({}));
 const tableHeading=useRef<HTMLElement>(null);
 const scroll=repayment?.scroll;
 useEffect(()=>{
  if(scroll){
   tableHeading.current?.focus({preventScroll:true});
   tableHeading.current?.scrollIntoView?.({block:'start'});
  }
 },[scroll]);
 const incoming=useSearchParams();
 const linkedAccount=incoming.get('accountId')??incoming.get('account');
 const [search,setSearch]=useMoneyViewState('unified-search-false',()=>incoming.get('search')??'');
 const [accounts,setAccounts]=useMoneyViewState<string[]|null>('unified-accounts-false',()=>incoming.get('accountIds')?.split(',')??(linkedAccount?[linkedAccount]:null));
 const [offset,setOffset]=useState(0),[history,setHistory]=useState(false);
 const [categoryIds,setCategoryIds]=useMoneyViewState<string[]|null>('unified-categories',()=>incoming.get('categoryId')?[incoming.get('categoryId')!]:null);
 const [typeFilter,setTypeFilter]=useMoneyViewState('book-confirmed-base-direction',()=>{
  const value=incoming.get('type')??'';return ['INCOME','EXPENSE','TRANSFER'].includes(value)?value:'';
 });
 const [amountRange,setAmountRange]=useMoneyViewState('unified-amount-range',()=>({min:'',max:''}));
 const [repaymentSearch,setRepaymentSearch]=useState('');
 const deepLink=repayment?null:incoming.get('transactionId');
 const focused=useMoneyData<UnifiedRow>(deepLink?UNIFIED+'/rows/'+encodeURIComponent(deepLink):null);
 const query=new URLSearchParams({from:p.period.from,to:p.period.to,search:repayment?repaymentSearch:search,offset:String(offset),limit:'50'});
 const selectedAccounts=repayment?repayment.accounts:accounts;
 if(!repayment&&selectedAccounts)query.set('accountIds',selectedAccounts.join(',')||'none');
 if(repayment){
  query.set('type','LOAN_PAYMENT');
  query.set('bookkeepingScope','true');
  query.set('accountIds',repayment.accounts?.join(',')||'none');
  if(repayment.filter.part)query.set('repaymentPart',repayment.filter.part);
  else query.set('repaymentGroup',repayment.filter.loanId??'unlinked');
 }else{
  const classes=categoryIds?.filter(id=>id!=='uncategorized');
  if(classes?.length)query.set('categoryIds',classes.join(','));
  if(categoryIds?.includes('uncategorized'))query.set('uncategorized','true');
  if(['INCOME','EXPENSE','TRANSFER'].includes(typeFilter))query.set('baseDirection',typeFilter);
  if(amountRange.min)query.set('minAmount',amountRange.min);
  if(amountRange.max)query.set('maxAmount',amountRange.max);
 }
 const chart=useMoneyData<CurrencyBookPage>(repayment?null:'/bookkeeping?'+new URLSearchParams({from:p.period.from,to:p.period.to,kind:'EXPENSE',limit:'1',offset:'0',bookkeepingScope:'true'}));
 const listPath=UNIFIED+(repayment?'':'/confirmed')+'?'+query;
 useMoneyProcessing(repayment?null:processingPath(p.period.from,p.period.to),listPath);
 const result=useMoneyData<{items:LedgerRow[];total:number}>(repayment&&repayment.accounts===null?null:listPath),cache=useMoneyCache(),coordinator=useMoneyRows();
 useEffect(()=>{
  if(!result.loading&&result.data&&offset>=result.data.total&&offset>0)setOffset(Math.max(0,Math.floor((result.data.total-1)/50)*50));
 },[offset,result.data,result.loading]);
 const previousLink=useRef('');
 useEffect(()=>{
  const linkedIds=incoming.get('accountIds')??linkedAccount;
  const signature=JSON.stringify([linkedIds,incoming.get('search'),incoming.get('categoryId'),incoming.get('type')]);
  if(previousLink.current===signature)return;
  previousLink.current=signature;
  if(linkedIds)setAccounts(linkedIds.split(','));
  if(incoming.has('search'))setSearch(incoming.get('search')??'');
  if(incoming.has('categoryId'))setCategoryIds([incoming.get('categoryId')!]);
  const type=incoming.get('type');
  if(type&&['INCOME','EXPENSE','TRANSFER'].includes(type))setTypeFilter(type);
  setOffset(0);
 },[incoming,linkedAccount,setAccounts,setSearch,setCategoryIds,setTypeFilter]);
 const rows=deepLink?(focused.data?[focused.data]:[]):result.data?.items??[];
 async function save(book:BookRow,patch:Partial<BookFields>){await coordinator.edit(book,patch,[],'unified-inline');cache.mutate('transaction');}
 return <RecommendationProvider filters={{}} selected={[]} visible={[]} categories={p.categories} accounts={p.accounts} workbench={false}><section className="money-approved-workbench" aria-label={repayment?"대출상환 거래":"전체 거래 가계부"} tabIndex={repayment?-1:undefined} ref={tableHeading}><div className="money-toolbar money-book-toolbar"><strong>{repayment?`대출상환 거래 · ${repayment.filter.label}`:'전체 거래'}</strong>{!repayment&&<button onClick={()=>p.select({kind:"transaction",value:null})}>+ 거래 추가</button>}{deepLink&&<small>직접 연결된 거래 · 현재 월 필터와 별도로 표시</small>}<input aria-label={repayment?"대출상환 거래 검색":"전체 거래 검색"} value={repayment?repaymentSearch:search} placeholder="제목, 메모, 거래처 검색" onChange={e=>{(repayment?setRepaymentSearch:setSearch)(e.target.value);setOffset(0);}}/><span>{result.data?.total??0}건</span>{!repayment&&<button onClick={()=>setHistory(v=>!v)}>등록 취소 내역</button>}</div><GroupedAccountFilter accounts={repayment?.availableAccounts??p.accounts} value={selectedAccounts} onChange={ids=>{(repayment?repayment.onAccounts:setAccounts)(ids);setOffset(0);}}/>{!repayment&&<div className="money-filter-rows"><CategoryFilters categories={p.categories} value={categoryIds} onChange={v=>{setCategoryIds(v);setOffset(0);}}/><label>금융 유형 필터<select aria-label="전체 거래 금융 유형 필터" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setOffset(0);}}><option value="">모든 금융 유형</option>{([["INCOME","입금"],["EXPENSE","출금"],["TRANSFER","이체"]] as const).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>최소 금액<input aria-label="전체 거래 최소 금액" type="number" min="0" value={amountRange.min} onChange={e=>{setAmountRange({...amountRange,min:e.target.value});setOffset(0);}}/></label><label>최대 금액<input aria-label="전체 거래 최대 금액" type="number" min="0" value={amountRange.max} onChange={e=>{setAmountRange({...amountRange,max:e.target.value});setOffset(0);}}/></label></div>}<LoadState loading={result.loading} error={result.error||focused.error}/>
 {!repayment&&<div><button type="button" aria-expanded={engineOpen} onClick={()=>setEngineOpen(value=>!value)}>금융유형 자동분류</button>
 {engineOpen&&<MoneyFinancialEngine rows={result.data?.items??[]}/>}</div>}
 {!repayment&&history&&<CancellationHistory accounts={p.accounts} categories={p.categories}/>}
 <div className="money-table-wrap"><table className="money-table meaning-ledger money-book-ledger"><thead><tr><th>일시</th><th>거래처·원본</th><th>금액·계좌</th><th>제목</th><th>메모</th><th scope="col">금융 유형</th><th>카테고리</th><th>금융 행동</th></tr></thead><tbody>{rows.map(row=><Fragment key={row.id}><tr data-transaction-id={row.id}><td><time dateTime={row.occurrence_precision==='DAY'?row.occurred_at.slice(0,10):row.occurred_at}>{seoul(row.occurred_at,row.occurrence_precision)}</time></td><td><strong>{row.counterparty_text??'거래처 미확인'}</strong><small>원본 {row.sourceCount}건{row.type==='TRANSFER'&&!row.to_account_id?row.transfer_destination_status==='UNTRACKED_OWNED'?' · 과거 본인 계좌 · 관리 제외':' · 받는 계좌 미확정':''}</small></td><td>{moneyAmount(row.amount,row.currency)}<AccountLabel id={row.from_account_id??row.to_account_id??''} accounts={p.accounts}/>{row.from_account_id&&row.to_account_id&&<>→<AccountLabel id={row.to_account_id} accounts={p.accounts}/></>}</td><td>{row.book?<InlineText id={row.id} field="title" label={(row.title??'거래')+' 제목'} value={row.book.title} required onSave={v=>save(row.book!,{title:v??''})}/>:row.title??'—'}</td><td>{row.book?<InlineText id={row.id} field="memo" label={(row.title??'거래')+' 메모'} value={row.book.memo??''} onSave={v=>save(row.book!,{memo:v})}/>:row.memo??'—'}</td><td>{repayment?<span>대출 상환</span>:<><FinancialTypePicker row={row} disabled={decisions.entries[row.id]?.phase==='saving'||decisions.entries[row.id]?.phase==='unknown'||!!pending[row.id]} onChoose={type=>void decisions.save(row,type)}/>{decisions.entries[row.id]&&<DecisionStatus row={row} entry={decisions.entries[row.id]} retry={decisions.retry} undo={decisions.undo}/>}</>}{row.book?.interpretationStatus==='PROVISIONAL'&&<small>입출금 등록 · 금융 의미 잠정</small>}{!repayment&&row.declaredFinancialType&&row.relationStatus&&row.relationStatus!=='NONE'&&<small>세부정보 확인 필요</small>}{(repayment||row.type==='LOAN_PAYMENT')&&(row.principal===null||row.interest===null||row.fee===null)&&<small>상환 배분 미확정</small>}</td><td>{row.book&&(categoryEligible(row)||row.book.interpretationStatus==='PROVISIONAL'||row.book.financialType==='LOAN_PAYMENT')?<RecommendationCategory row={row.book} categories={p.categories.filter(c=>c.kind===row.book!.type)} onFinancial={financialCategories.saveBook} compact/>:row.type==='REFUND'&&row.meaning_state==='CONFIRMED'?<span title="환불은 원소비 카테고리로 차감하며 독립적으로 분류하지 않습니다.">{p.categories.find(c=>c.id===row.book?.categoryId)?.name??'—'}<small>원소비 분류</small></span>:'—'}</td><td>{repayment?(row.type==='LOAN_PAYMENT'?<button onClick={()=>p.select({kind:'transaction',value:{id:row.id,type:'LOAN_PAYMENT'}})}>대출 금융 상세</button>:<a href={reviewLedgerHref(row.id)}>거래 상세에서 분할 확인</a>):<><button type="button" aria-expanded={expanded===row.id||!!deepLink&&expanded!==''} onClick={()=>setExpanded(expanded===row.id||!!deepLink&&expanded!==''?'':row.id)}>상세 편집</button><details><summary>⋯</summary><RegistrationAction id={row.id} version={row.version}/>{row.loan_id&&<button onClick={()=>p.select({kind:'transaction',value:{id:row.id,type:row.type as 'LOAN_PAYMENT'}})}>대출 금융 상세</button>}<button onClick={async()=>p.select({kind:'transaction',value:await api.get('/transactions/'+row.id)})}>원본·정정 이력</button></details></>}</td></tr>
 {(expanded===row.id||deepLink===row.id&&expanded!=='')&&<tr><td colSpan={8}><AccountLedgerEditor id={row.id} accounts={p.accounts} categories={p.categories} pending={pending[row.id]??null} onPending={operation=>setPending(old=>({...old,[row.id]:operation}))} onClose={()=>setExpanded('')}/></td></tr>}
 </Fragment>)}</tbody></table>{!rows.length&&!result.loading&&<p className="money-empty">조건에 맞는 거래가 없습니다.</p>}</div>{!deepLink&&<Pagination total={result.data?.total??0} offset={offset} onChange={setOffset}/>}{!repayment&&<><small className="money-muted">선택 기간의 확정 소비 기준</small><BookkeepingCharts data={chart.data} categories={p.categories.filter(c=>c.kind==='EXPENSE')} amountClass="meaning-expense"/></>}</section></RecommendationProvider>;
}

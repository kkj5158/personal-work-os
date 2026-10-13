"use client";
import {useDurableMoneySelection} from "./MoneyDurableSelection";
import {CancellationHistory,RegistrationAction} from "./MoneyRegistration";
import { CategoryFilters } from "./MoneyCategoryPicker";
import { amountPresets, validateAmountRange } from "@/lib/money/bookkeepingRange";
import { moneyAmount } from "@/lib/money/accounts";
import "./money-bookkeeping.css";
import { categoryTotals } from "@/lib/money/categories";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {useSearchParams} from 'next/navigation';
import { type Account,type Transaction, moneyApi as api, seoul, won } from "@/lib/money/model";
import { type MeaningKind, type Tracking } from "@/lib/money/meaning";
import { useMoneyCache, useMoneyViewState, useMoneyRows } from "./MoneyDataProvider";
import { useMoneyData, LoadState, type BookPage, type BookRow, type BookFields } from "./MoneyWebData";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
import {RecommendationProvider,RecommendationControls,RecommendationCategory,RecommendationAction,RecommendationPanel,RecommendationLedger} from './MoneyBookkeepingRecommendations';
import {classificationLabels} from './MoneyClassificationActions';
import {ClassificationUndoNotice,useClassificationUndo} from './MoneyClassificationUndo';
import './money-classification-workbench.css';
import './money-ai.css';
import { AccountLabel, Pagination, type Props } from "./MoneyWebViews";
import { MoneyMonthlySummary } from "./MoneyMonthlySummary";
import { savingsPath,type MonthlyFilter,type SavingsPage } from "@/lib/money/monthly";
type CurrencyBookPage = Omit<BookPage, "items" | "summary"> & {
  items: (BookRow & { currency?: string })[];
  summary: { total: number | null; count: number };
  currencies?: string[]; hasMixedCurrencies?: boolean; analyticsUnavailable?: boolean;
};

export function Bookkeeping(p: Props & { mode?: "monthly" | "workbench" }) {
  const mode=p.mode??"monthly";
  const [tab,setTab]=useMoneyViewState("book-workbench-tab",()=>"classification");
  const [monthFilter,setMonthFilter]=useMoneyViewState<MonthlyFilter|null>("book-month-filter-"+p.period.from+":"+p.period.to,()=>null);
  const [kind, setKind] = useMoneyViewState<MeaningKind>(
    "book-kind-"+mode,
    () => "EXPENSE",
  );
  const [open, setOpen] = useState(false);
  const tracking = useMoneyData<Tracking>("/tracking");
  return (
    <>
      {mode==="workbench"&&<nav className="money-actions" aria-label="AI 작업대 내부 탭"><button aria-pressed={tab==="classification"} onClick={()=>setTab("classification")}>AI 분류 작업대</button><button aria-pressed={tab==="cancelled"} onClick={()=>setTab("cancelled")}>등록 취소 내역</button></nav>}
      {mode==="monthly"&&<MoneyMonthlySummary key={p.period.from+":"+p.period.to} from={p.period.from} to={p.period.to} categories={p.categories} filter={monthFilter} onFilter={filter=>{if(p.changeContext?.()===false)return;setMonthFilter(filter);if(filter&&filter.kind!=="SAVINGS")setKind(filter.kind);}}/>}
      <LoadState error={tracking.error} loading={tracking.loading} />
      {mode==="workbench"&&tab==="cancelled"?<CancellationHistory accounts={p.accounts} categories={p.categories}/>:mode==="monthly"&&monthFilter?.kind==="SAVINGS"?<SavingsLedger key={monthFilter.accountId+":"+p.period.from+":"+p.period.to} {...p} accountId={monthFilter.accountId}/>:<BookkeepingList
        key={`${mode}:${kind}:${p.period.from}:${p.period.to}:${monthFilter?.kind!=="SAVINGS"?monthFilter?.categoryId??"":""}`}
        {...p}
        kind={kind}
        mode={mode}
        monthFilter={mode==="monthly"?monthFilter:null}
        onClearMonthFilter={()=>setMonthFilter(null)}
        tracking={tracking.data}
        onTracking={() => setOpen(true)}
        onKind={k => { if (kind !== k && p.changeContext?.() !== false) {setMonthFilter(null);setKind(k);} }}
      />}
      {open && tracking.data && (
        <TrackingModal
          accounts={p.accounts}
          value={tracking.data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function SavingsLedger(p:Props&{accountId:string}){
 const [search,setSearch]=useState(""),[offset,setOffset]=useState(0),[error,setError]=useState("");
 const result=useMoneyData<SavingsPage>(savingsPath(p.period.from,p.period.to,p.accountId,search,offset));
 return <section aria-label="저축 입금 거래" className="money-approved-workbench"><div className="money-toolbar money-book-toolbar"><h3>저축 입금 거래</h3><input aria-label="저축 입금 거래 검색" value={search} placeholder="제목, 메모, 계좌 검색" onChange={e=>{setSearch(e.target.value);setOffset(0);}}/><span>{result.data?.total??0}건</span></div><LoadState error={error||result.error} loading={result.loading} lastSuccessAt={result.lastSuccessAt}/><div className="money-table-wrap"><table className="money-table meaning-ledger money-book-ledger"><thead><tr><th>#</th><th>일시</th><th>거래처·상대방</th><th>금액·계좌</th><th>제목</th><th>메모</th><th>카테고리</th><th>거래 상세</th></tr></thead><tbody>{result.data?.items.map((row,index)=><tr key={row.id}><td>{offset+index+1}</td><td><time dateTime={row.occurredAt}>{seoul(row.occurredAt)}</time><small>저축 입금</small></td><td>{row.counterpartyText||row.fromName}</td><td className="number"><strong className="meaning-income">+{moneyAmount(row.amount,row.currency)}</strong><AccountLabel id={row.toAccountId} accounts={p.accounts}/></td><td>{row.title||`${row.fromName} → ${row.toName}`}</td><td>{row.memo||"—"}</td><td>계좌 간 이체</td><td>{row.transactionVersion!==undefined&&<details><summary aria-label="저축 이체 금융 거래 행동">⋯</summary><RegistrationAction id={row.id} version={row.transactionVersion}/></details>}<button disabled={result.loading} onClick={async()=>{if(p.changeContext?.()===false)return;try{const transaction=await api.get<Transaction>('/transactions/'+row.id);p.select({kind:'transaction',value:transaction});}catch(e){setError(e instanceof Error?e.message:'거래를 불러오지 못했습니다.');}}}>상세 보기</button></td></tr>)}</tbody></table>{result.data&&!result.data.items.length&&<p className="money-empty">조건에 맞는 저축 입금 거래가 없습니다.</p>}</div><Pagination total={result.data?.total??0} offset={offset} onChange={setOffset}/></section>;
}
function BookkeepingList(
  p: Props & { mode:"monthly"|"workbench";monthFilter:MonthlyFilter|null;onClearMonthFilter:()=>void;kind: MeaningKind; tracking: Tracking | null; onTracking: () => void; onKind: (kind: MeaningKind) => void },
) {
  const scope = "book-"+p.mode+"-" + p.kind;
  const [search, setSearch] = useMoneyViewState(scope + "-search", () => "");
  const [debounced, setDebounced] = useState(search);
  const [accountIds, setAccounts] = useMoneyViewState<string[] | null>(
      scope + "-accounts",
      () => null,
    ),
    [categoryIds, setCategories] = useMoneyViewState<string[] | null>(
      scope + "-categories",
      () => null,
    );
  const [range, setRange] = useMoneyViewState(scope + "-range", () => "all");
  const [custom, setCustom] = useMoneyViewState(scope + "-custom", () => ({ min: "", max: "" }));
  const [amountDraft, setAmountDraft] = useState(custom);
  const [rangeError, setRangeError] = useState("");
  const [offset, setOffset] = useState(0);
  const queryPeriod=p.period.from+':'+p.period.to+':'+(p.monthFilter&&p.monthFilter.kind!=="SAVINGS"?p.monthFilter.categoryId:'');
  const {selected,setSelected,error:selectionError,loading:selectionLoading,saving:selectionSaving,retry:retrySelection}=useDurableMoneySelection(scope);
  const linkedId=useSearchParams().get('transactionId');
  const [focused,setFocused]=useMoneyViewState<string>(scope+'-focused-'+queryPeriod+'-'+(linkedId??''),()=>linkedId??'');
  const [classificationState,setClassificationState]=useMoneyViewState<string>(scope+'-classification-state',()=> p.mode==='workbench'?'WORK_NEEDED':'ALL');
  const [classificationOrigin,setClassificationOrigin]=useMoneyViewState(scope+'-classification-origin',()=> '');
  const {remember}=useClassificationUndo();
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setOffset(0);
    }, 225);
    return () => clearTimeout(timer);
  }, [search]);
  const ranges = amountPresets;
  const amount = range === "custom" ? custom : ranges.find((r) => r.id === range) ?? ranges[0];
  const query = new URLSearchParams({
    from: p.period.from,
    to: p.period.to,
    kind: p.kind,
    search: debounced,
    limit: "50",
    offset: String(offset),
    classificationState,
  });
  if(classificationOrigin)query.set('classificationOrigin',classificationOrigin);
  if (accountIds) query.set("accountIds", accountIds.join(",") || "none");
  if (p.monthFilter&&p.monthFilter.kind!=="SAVINGS"&&p.monthFilter.kind===p.kind) query.set("categoryIds",p.monthFilter.categoryId);
  else if (categoryIds) query.set("categoryIds", categoryIds.join(",") || "none");
  if (amount.min) query.set("minAmount", amount.min);
  if (amount.max) query.set("maxAmount", amount.max);
  const result = useMoneyData<CurrencyBookPage>("/bookkeeping?" + query);
  const data = result.data;
  const cache = useMoneyCache();
  const coordinator=useMoneyRows();
  const detail=useMoneyData<BookRow>(focused?'/bookkeeping/'+focused:null);
  // Latest server versions from inline saves, so consecutive edits on one row never reuse a stale version.
  const [, setFresh] = useState<Record<string, BookRow>>({});
  const latest = (row: BookRow) => {
    return coordinator.latest(row);
  };
  const focusedRow=detail.data?.id===focused?latest(detail.data):data?.items.find(row=>row.id===focused)??null;
  // A row clicked while the list refreshes carries stale versions. Instead of dropping the click,
  // open it as soon as the fresh row arrives.
  const pendingOpen = useRef<string | null>(null);
  const openRow = (row: BookRow) => {
    if(search!==debounced)return;
    if(p.changeContext?.()===false)return;
    if (result.loading) pendingOpen.current = row.id;
    else setFocused(row.id);
  };
  useEffect(() => {
    if (!pendingOpen.current || result.loading) return;
    const row = data?.items.find((r) => r.id === pendingOpen.current);
    pendingOpen.current = null;
    if (row) setFocused(row.id);
  }, [result.loading, data, setFocused]);
  async function saveInline(row:BookRow,patch:Partial<BookFields>){
    try{const source='categoryId' in patch?'classification-stage':'title' in patch?'inline:title':'inline:memo';const saved=await coordinator.edit(latest(row),patch,[],source);setFresh(old=>({...old,[row.id]:saved}));if('categoryId' in patch&&saved.classificationEventId)remember([saved.classificationEventId],'분류를 저장했습니다.',[row.id]);cache.patchBooks([saved]);cache.mutate("book");}
    catch(error){try{const current=await api.get<BookRow>("/bookkeeping/"+row.id);setFresh(old=>({...old,[row.id]:current}));try{coordinator.acknowledge(current);}catch{/* Unresolved mutations must use outcome lookup first. */}cache.mutate("book");}catch{/* Preserve the original error and caller-owned draft. */}throw error;}
  }
  const ids = p.tracking?.[p.kind === "EXPENSE" ? "expense" : "income"] ?? [];
  const tracked = p.accounts.filter((a) => ids.includes(a.id) && !a.archived);
  const categories = p.categories.filter((c) => c.kind === p.kind);
  const amountClass =
    p.kind === "EXPENSE" ? "meaning-expense" : "meaning-income";
  if (!p.ready) return <LoadState loading={true} error="" />;
  return (<>
    {selectionError&&<p role="alert">{selectionError} <button onClick={retrySelection}>원래 선택 보관 확인</button></p>}{selectionSaving&&<p role="status">선택 보관 중…</p>}{selectionLoading&&<p role="status">보관된 선택 조회 중…</p>}
    <RecommendationProvider workbench={p.mode==='workbench'} rows={data?.items??[]} total={data?.total??0} onFilterState={(value:string)=>{if(p.changeContext?.()!==false){setClassificationState(value);setOffset(0);setFocused('');}}} onClearSelection={()=>setSelected([])} onSavedSelection={(ids:string[])=>setSelected(selected=>selected.filter(id=>!ids.includes(id)))} onSelectPage={()=>setSelected(ids=>[...new Set([...ids,...(data?.items.map(row=>row.id)??[])])])} onSelectFilter={async()=>{const full=new URLSearchParams(query);full.set('limit','200');const ids:string[]=[];for(let start=0;;){full.set('offset',String(start));const page=await api.get<CurrencyBookPage>('/bookkeeping?'+full);ids.push(...page.items.map(row=>row.id));start+=page.items.length;if(start>=page.total||!page.items.length)break;}setSelected(selected=>[...new Set([...selected,...ids])]);}} filters={Object.fromEntries([...query.entries()].filter(([key])=>!['limit','offset'].includes(key)))} selected={selected} visible={data?.items.map(row=>row.id)??[]} categories={p.categories} accounts={p.accounts}>
    <section className="money-approved-workbench" aria-label={p.kind === "EXPENSE" ? "지출 가계부" : "수입 가계부"}>
      <RecommendationLedger>{p.mode==='monthly'&&<div className="money-ai-tabs" role="tablist" aria-label="가계부 분류 상태">{[['ALL','전체'],['RECENT_AUTO','최근 자동 분류'],['UNCLASSIFIED','미분류']].map(([value,label])=><button key={value} role="tab" aria-selected={classificationState===value} onClick={()=>{if(p.changeContext?.()!==false){setClassificationState(value);setOffset(0);setFocused('');}}}>{label}</button>)}</div>}
      <div className="money-toolbar money-book-toolbar">
        <div className="meaning-tabs" role="tablist" aria-label="가계부 유형">{(["EXPENSE", "INCOME"] as const).map(k => <button key={k} role="tab" aria-selected={p.kind === k} className={p.kind === k ? "active" : ""} onClick={() => p.onKind(k)}>{k === "EXPENSE" ? "소비" : "수입"}</button>)}</div>
        <input aria-label="가계부 검색" placeholder="제목, 메모, 거래처 검색" value={search} onChange={e => {if(p.changeContext?.()!==false){setSearch(e.target.value);setFocused('');}}} />
        <select aria-label="분류 출처" value={classificationOrigin} onChange={e=>{if(p.changeContext?.()!==false){setClassificationOrigin(e.target.value);setOffset(0);setFocused('');}}}><option value="">전체 분류 출처</option>{['DIRECT','CONFIRMED','DIRECT_REFERENCE','APPROVED_RULE','AI'].map(value=><option key={value} value={value}>{classificationLabels[value]}</option>)}</select>
        <span>{data?.total ?? 0}건</span>
        <strong className={amountClass}>{p.kind === "EXPENSE" ? "순지출" : "수입 합계"} {data?.analyticsUnavailable || data?.summary.total === null ? "통화별 확인 필요" : data ? won(data.summary.total) : "—"}</strong>
        <button className="money-book-tracking" onClick={p.onTracking}>추적 계좌 설정</button>
      </div>
      <details className={p.mode==='workbench'?'money-workbench-compact-filters':'money-monthly-filters'} open={p.mode==='monthly'?true:undefined}><summary>상세 필터</summary><div className="money-filter-rows">
        <button className="money-book-reset" onClick={() => {if(p.changeContext?.()===false)return;p.onClearMonthFilter(); setSearch(""); setAccounts(null); setCategories(null); setClassificationState(p.mode==='workbench'?'WORK_NEEDED':'ALL');setClassificationOrigin('');setSelected([]);setFocused('');setRange("all"); setCustom({ min: "", max: "" }); setAmountDraft({ min: "", max: "" }); setRangeError(""); setOffset(0); }}>조건 초기화</button>
        <CategoryFilters categories={categories} value={p.monthFilter&&p.monthFilter.kind!=="SAVINGS"?[p.monthFilter.categoryId]:categoryIds} onChange={v=>{if(p.changeContext?.()!==false){p.onClearMonthFilter();setCategories(v);setOffset(0);setFocused('');}}} />
        <GroupedAccountFilter
          accounts={tracked}
          value={accountIds}
          onChange={(v) => {
            if(p.changeContext?.()===false)return;
            setAccounts(v);
            setOffset(0);
            setFocused('');
          }}
        />
        <div className="meaning-filter-row">
          <strong>금액 범위</strong>
          {ranges.map((r) => (
            <button
              key={r.id}
              aria-pressed={range === r.id}
              className={range === r.id ? "active" : ""}
              onClick={() => {
                if(p.changeContext?.()===false)return;
                setRange(r.id);
                setOffset(0);
                setFocused('');
              }}
            >
              {r.label}
            </button>
          ))}
          <form className="money-book-range" onSubmit={e => {
            e.preventDefault();
            const error = validateAmountRange(amountDraft.min, amountDraft.max);
            setRangeError(error);
            if (!error&&p.changeContext?.()!==false) { setCustom(amountDraft); setRange("custom"); setOffset(0);setFocused(''); }
          }}>
            <input aria-label="최소 금액" inputMode="numeric" placeholder="최소 금액" value={amountDraft.min} onChange={e => setAmountDraft({ ...amountDraft, min: e.target.value })} />
            <span>~</span>
            <input aria-label="최대 금액" inputMode="numeric" placeholder="최대 금액" value={amountDraft.max} onChange={e => setAmountDraft({ ...amountDraft, max: e.target.value })} />
            <button aria-pressed={range === "custom"} type="submit">{range === "custom" ? "사용자 범위" : "범위 적용"}</button>
          </form>
          {rangeError && <small role="alert">{rangeError}</small>}
          <small className="money-muted">절대 금액 · 사용자 범위 양끝 포함</small>
        </div>
      </div></details>
      </RecommendationLedger>{p.mode==='workbench'&&<RecommendationControls/>}
      <LoadState error={result.error} loading={result.loading||search!==debounced} lastSuccessAt={result.lastSuccessAt} />
      {data?.analyticsUnavailable && <p className="meaning-notice">{data.hasMixedCurrencies ? "여러 통화의 거래가 함께 있습니다." : "KRW 이외 통화의 거래가 있습니다."} 환율 정보가 없어 합계와 기간 분석을 표시하지 않습니다. 금액 범위는 KRW 거래 기준입니다. {data.currencies?.join(" · ")}</p>}
      {p.tracking && !tracked.length && (
        <p className="meaning-notice">
          추적 계좌 설정에서 {p.kind === "EXPENSE" ? "지출" : "수입"} 계좌를
          선택하세요. 새 계좌는 자동 선택되지 않습니다.
          <button onClick={p.onTracking}>추적 계좌 설정</button>
        </p>
      )}
      <p className="money-muted">추천은 미확정 초안입니다. 최종 분류 저장 시 독립 금융 확인 상태를 보존합니다. 제목·메모 저장은 분류 확정과 별개입니다. 직접 수정 참고는 같은 계좌·유형·구매 맥락으로 제한합니다.</p>
      <ClassificationUndoNotice/>
      <RecommendationLedger><div className="bk-v2-split"><div className="money-classification-list">
      <div className="money-table-wrap">
        <table className="money-table meaning-ledger money-book-ledger">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="현재 페이지 선택" checked={!!data?.items.length&&data.items.every(row=>selected.includes(row.id))} onChange={e=>setSelected(selected=>e.target.checked?[...new Set([...selected,...(data?.items.map(row=>row.id)??[])])]:selected.filter(id=>!data?.items.some(row=>row.id===id)))}/></th>
              <th>일시</th>
              <th>거래처·상대방</th><th>금액·계좌</th>
              <th>제목</th><th>메모</th><th>카테고리</th><th>AI 작업</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr
                key={row.id}
                tabIndex={result.loading ? -1 : 0}
                aria-disabled={result.loading}
                aria-selected={focused === row.id}

              >
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`${row.title} 선택`} checked={selected.includes(row.id)} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,row.id])]:selected.filter(id=>id!==row.id))}/></td>
                <td><time dateTime={row.occurredAt}>{seoul(row.occurredAt)}</time><small className="money-muted">{row.type === "REFUND" ? "환불" : p.kind === "EXPENSE" ? "소비" : "수입"}{row.excluded && " · 통계 제외"}</small></td>
                <td><strong>{row.counterpartyText || "거래처 정보 없음"}</strong></td><td><div className={"number "+amountClass}>{p.kind==="EXPENSE"?(row.type==="REFUND"?"+":"−"):"+"}{moneyAmount(row.amount,row.currency||"KRW")}</div><AccountLabel id={row.accountId} accounts={p.accounts}/></td>
                  <>
                    <td onClick={(e) => e.stopPropagation()}>
                      <InlineText id={row.id} field="title" label={`${latest(row).title} 제목`} value={latest(row).title} required onSave={(v) => saveInline(row, { title: v ?? "" })} />
                    </td>
                    <td className="money-muted" onClick={(e) => e.stopPropagation()}>
                      <InlineText id={row.id} field="memo" label={`${latest(row).title} 메모`} value={latest(row).memo ?? ""} onSave={(v) => saveInline(row, { memo: v })} />
                    </td>
                    <td onClick={e=>e.stopPropagation()}><RecommendationCategory row={latest(row)} categories={categories} compact={p.mode==='monthly'} disabled={row.type==='REFUND'||result.loading||search!==debounced}/></td>
                  </>
                <td onClick={e=>e.stopPropagation()}><RecommendationAction row={latest(row)} onOpen={()=>openRow(row)}/><details><summary aria-label={`${row.title} 금융 거래 행동`}>⋯</summary><RegistrationAction id={row.id} version={latest(row).transactionVersion}/></details></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && (
          <p className="money-empty">조건에 맞는 가계부 기록이 없습니다.</p>
        )}
      </div>
      <Pagination
        total={data?.total ?? 0}
        offset={offset}
        onChange={value=>{if(p.changeContext?.()!==false){setOffset(value);setFocused('');}}}
      />
      </div><RecommendationPanel row={focusedRow} categories={p.categories} accounts={p.accounts} onClose={()=>setFocused('')}/></div>
      {!data?.analyticsUnavailable && <div className="meaning-analysis">
        <section>
          <h3>카테고리 구성</h3>
          {categoryTotals(categories,data?.composition ?? []).map(group => (
            <div className="meaning-composition" key={group.id}>
              <span>{group.label}</span>
              <span className={amountClass}>{won(group.amount)}</span>
            </div>
          ))}
        </section>
        <section>
          <h3>기간 추이</h3>
          <div className="meaning-trend">
            {data?.trend.map((day) => (
              <div key={day.day} title={day.day + " · " + won(day.amount)}>
                <i
                  style={{
                    height: Math.max(
                      3,
                      (Math.abs(day.amount) /
                        Math.max(
                          1,
                          ...data.trend.map((d) => Math.abs(d.amount)),
                        )) *
                        80,
                    ),
                  }}
                />
                <small>{day.day.slice(5)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>}</RecommendationLedger>
    </section>
    </RecommendationProvider></>
  );
}
function TrackingModal({
  accounts,
  value,
  onClose,
}: {
  accounts: Account[];
  value: Tracking;
  onClose: () => void;
}) {
  const cache = useMoneyCache();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const close = () => {
    if (!busy && (!dirty || window.confirm("추적 계좌 변경을 취소할까요?")))
      onClose();
  };
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="meaning-tracking"
      aria-label="가계부 추적 계좌 설정"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2>가계부 추적 계좌 설정</h2>
      <p className="money-muted">
        생활 기록에 포함할 계좌를 유형별 최대 5개 선택하세요. 금융 원장과 계좌
        잔액은 바뀌지 않습니다.
      </p>
      <div className="meaning-tracking-columns">
        {(["expense", "income"] as const).map((kind) => (
          <section key={kind}>
            <h3>
              {kind === "expense" ? "지출" : "수입"} 추적 계좌{" "}
              <small>{draft[kind].length} / 5</small>
            </h3>
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={draft[kind].includes(a.id)}
                    disabled={
                      !draft[kind].includes(a.id) && draft[kind].length >= 5
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [kind]: e.target.checked
                          ? [...draft[kind], a.id]
                          : draft[kind].filter((id) => id !== a.id),
                      })
                    }
                  />
                  <span>
                    <strong>
                      {a.emoji} {a.displayName}
                    </strong>
                    <small>
                      {a.provider} · {a.suffix || "계좌"}
                    </small>
                  </span>
                </label>
              ))}
          </section>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button disabled={busy} onClick={close}>
          취소
        </button>
        <button
          className="money-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.put("/tracking", {
                ...draft,
                expectedVersion: value.version,
              });
              cache.mutate("tracking");
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "저장 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          저장
        </button>
      </footer>
    </dialog>
  );
}

/** Moves spreadsheet-style focus to the next/previous inline cell in document order and opens it. */
function moveInline(from: HTMLElement | null, step: 1 | -1) {
  const cells = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-inline-cell] > button.money-inline-view"));
  const current = from?.closest("[data-inline-cell]");
  const at = cells.findIndex((c) => c.parentElement === current);
  const next = cells[at + step];
  if (next) {
    next.focus();
    next.click();
  }
}
export function InlineText({ id,field,value, label, required, onSave }: { id:string;field:'title'|'memo';value: string; label: string; required?: boolean; onSave: (v: string | null) => Promise<void> }) {
  const coordinator=useMoneyRows();
  const [editing, setEditing] = useState(()=>coordinator.draft<string>(id,field)!==undefined),
    [draft, setDraft] = useState(()=>coordinator.draft<string>(id,field)??value),
    [state, setState] = useState<"idle" | "saving" | "error">("idle"),
    [error, setError] = useState("");
  const cell = useRef<HTMLDivElement>(null);
  // Disabling the input while saving blurs it; the blur must not start a second save.
  const busy = useRef(false);
  const input=useRef(draft),running=useRef<Promise<void>|null>(null),flush=useRef<()=>Promise<void>>(async()=>{}),savedValue=useRef(value.trim()),failed=useRef('');

  useLayoutEffect(()=>{flush.current=async()=>{await running.current;await commit();if(failed.current)throw Error(failed.current);if(input.current.trim()!==savedValue.current){await commit();if(failed.current)throw Error(failed.current);}};});
  useEffect(()=>coordinator.registerDraft(id,'inline:'+field,async()=>flush.current()),[coordinator,id,field]);
  useEffect(()=>{savedValue.current=value.trim();if(!editing&&coordinator.draft(id,field)===undefined){input.current=value;}},[value,editing,coordinator,id,field]);
  const shown = editing || state === "error" ? draft : value;
  async function commit(step?: 1 | -1) {
    if (busy.current) {await running.current;return;}
    const next = input.current.trim();
    if (next === savedValue.current) {
      setEditing(false);
      setState("idle");
      if (step) setTimeout(() => moveInline(cell.current, step));
      return;
    }
    if (required && !next) {
      setState("error");
      setError("필수 항목입니다.");
      failed.current='필수 항목입니다.';
      return;
    }
    busy.current = true;
    setState("saving");
    try {
      running.current=onSave(next || null);
      await running.current;
      savedValue.current=next;failed.current='';
      setState("idle");
      setError("");
      if(input.current.trim()===next){coordinator.discardDraft(id,field);setEditing(false);if(step)setTimeout(()=>moveInline(cell.current,step));}
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "저장 실패");
      failed.current=e instanceof Error?e.message:'저장 실패';
    } finally {
      busy.current = false;
      running.current=null;
    }
  }
  return (
    <div className="money-inline-cell" data-inline-cell="" data-state={state} ref={cell} title={error || undefined}>
      {editing ? (
        <input
          aria-label={label}
          autoFocus
          value={draft}
          maxLength={label.endsWith("메모") ? 2000 : 240}
          aria-invalid={state === "error"}
          onChange={(e) => {input.current=e.target.value;coordinator.keepDraft(id,field,e.target.value);setDraft(e.target.value);}}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Tab") {
              e.preventDefault();
              void commit(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              coordinator.discardDraft(id,field);
              e.preventDefault();
              setDraft(value);
              setState("idle");
              failed.current='';input.current=value;
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="money-inline-view"
          aria-label={`${label} 편집`}
          onClick={() => {
            const next=state==="error"?draft:value;input.current=next;setDraft(next);
            setEditing(true);
          }}
        >
          {shown || "—"}
        </button>
      )}
      {state === "error" && !editing && <small role="alert">{error}</small>}
    </div>
  );
}

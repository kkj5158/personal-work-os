"use client";
import { CategoryFilters } from "./MoneyCategoryPicker";
import { amountPresets, validateAmountRange } from "@/lib/money/bookkeepingRange";
import { moneyAmount } from "@/lib/money/accounts";
import "./money-bookkeeping.css";
import { categoryTotals } from "@/lib/money/categories";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {useSearchParams} from 'next/navigation';
import { type Account, moneyApi as api, seoul, won } from "@/lib/money/model";
import { type MeaningKind, type Tracking } from "@/lib/money/meaning";
import { useMoneyCache, useMoneyViewState, useMoneyRows } from "./MoneyDataProvider";
import { useMoneyData, LoadState, type BookPage, type BookRow, type BookFields } from "./MoneyWebData";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
import {ClassificationCells} from './MoneyClassificationCells';
import {ClassificationBatch,classificationLabels} from './MoneyClassificationActions';
import {ClassificationRail} from './MoneyClassificationRail';
import {ClassificationUndoNotice,useClassificationUndo} from './MoneyClassificationUndo';
import './money-classification-workbench.css';
import './money-ai.css';
import { AccountLabel, Pagination, type Props } from "./MoneyWebViews";
type CurrencyBookPage = Omit<BookPage, "items" | "summary"> & {
  items: (BookRow & { currency?: string })[];
  summary: { total: number | null; count: number };
  currencies?: string[]; hasMixedCurrencies?: boolean; analyticsUnavailable?: boolean;
};

export function Bookkeeping(p: Props) {
  const [kind, setKind] = useMoneyViewState<MeaningKind>(
    "book-kind",
    () => "EXPENSE",
  );
  const [open, setOpen] = useState(false);
  const tracking = useMoneyData<Tracking>("/tracking");
  return (
    <>
      <LoadState error={tracking.error} loading={tracking.loading} />
      <BookkeepingList
        key={`${kind}:${p.period.from}:${p.period.to}`}
        {...p}
        kind={kind}
        tracking={tracking.data}
        onTracking={() => setOpen(true)}
        onKind={k => { if (kind !== k && p.changeContext?.() !== false) setKind(k); }}
      />
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
function BookkeepingList(
  p: Props & { kind: MeaningKind; tracking: Tracking | null; onTracking: () => void; onKind: (kind: MeaningKind) => void },
) {
  const scope = "book-" + p.kind;
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
  const queryPeriod=p.period.from+':'+p.period.to;
  const [selected,setSelected]=useMoneyViewState<string[]>(scope+'-selected-'+queryPeriod,()=>[]);
  const linkedId=useSearchParams().get('transactionId');
  const [focused,setFocused]=useMoneyViewState<string>(scope+'-focused-'+queryPeriod+'-'+(linkedId??''),()=>linkedId??'');
  const [classificationState,setClassificationState]=useMoneyViewState(scope+'-classification-state',()=> 'ALL');
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
  if (categoryIds) query.set("categoryIds", categoryIds.join(",") || "none");
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
    try{const source='categoryId' in patch?'classification-stage':'title' in patch?'inline:title':'inline:memo';const saved=await coordinator.edit(latest(row),patch,[],source);setFresh(old=>({...old,[row.id]:saved}));if('categoryId' in patch&&saved.classificationEventId)remember([saved.classificationEventId],'분류를 저장했습니다.',[row.id]);cache.mutate("book");cache.mutate('ai');}
    catch(error){try{const current=await api.get<BookRow>("/bookkeeping/"+row.id);setFresh(old=>({...old,[row.id]:current}));try{coordinator.acknowledge(current);}catch{/* Unresolved mutations must use outcome lookup first. */}cache.mutate("book");}catch{/* Preserve the original error and caller-owned draft. */}throw error;}
  }
  const ids = p.tracking?.[p.kind === "EXPENSE" ? "expense" : "income"] ?? [];
  const tracked = p.accounts.filter((a) => ids.includes(a.id) && !a.archived);
  const categories = p.categories.filter((c) => c.kind === p.kind);
  const amountClass =
    p.kind === "EXPENSE" ? "meaning-expense" : "meaning-income";
  if (!p.ready) return <LoadState loading={true} error="" />;
  return (
    <section className="money-approved-workbench" aria-label={p.kind === "EXPENSE" ? "지출 가계부" : "수입 가계부"}>
      <div className="money-ai-tabs" role="tablist" aria-label="가계부 분류 상태">{[['ALL','전체'],['RECENT_AUTO','최근 자동 분류'],['UNCLASSIFIED','미분류']].map(([value,label])=><button key={value} role="tab" aria-selected={classificationState===value} onClick={()=>{if(p.changeContext?.()!==false){setClassificationState(value);setOffset(0);setSelected([]);setFocused('');}}}>{label}</button>)}</div>
      <div className="money-toolbar money-book-toolbar">
        <div className="meaning-tabs" role="tablist" aria-label="가계부 유형">{(["EXPENSE", "INCOME"] as const).map(k => <button key={k} role="tab" aria-selected={p.kind === k} className={p.kind === k ? "active" : ""} onClick={() => p.onKind(k)}>{k === "EXPENSE" ? "소비" : "수입"}</button>)}</div>
        <input aria-label="가계부 검색" placeholder="제목, 메모, 거래처 검색" value={search} onChange={e => {if(p.changeContext?.()!==false){setSearch(e.target.value);setSelected([]);setFocused('');}}} />
        <select aria-label="분류 출처" value={classificationOrigin} onChange={e=>{if(p.changeContext?.()!==false){setClassificationOrigin(e.target.value);setOffset(0);setSelected([]);setFocused('');}}}><option value="">전체 분류 출처</option>{['DIRECT','CONFIRMED','DIRECT_REFERENCE','APPROVED_RULE','AI'].map(value=><option key={value} value={value}>{classificationLabels[value]}</option>)}</select>
        <span>{data?.total ?? 0}건</span>
        <strong className={amountClass}>{p.kind === "EXPENSE" ? "순지출" : "수입 합계"} {data?.analyticsUnavailable || data?.summary.total === null ? "통화별 확인 필요" : data ? won(data.summary.total) : "—"}</strong>
        <button className="money-book-tracking" onClick={p.onTracking}>추적 계좌 설정</button>
      </div>
      <div className="money-filter-rows">
        <button className="money-book-reset" onClick={() => {if(p.changeContext?.()===false)return; setSearch(""); setAccounts(null); setCategories(null); setClassificationState('ALL');setClassificationOrigin('');setSelected([]);setFocused('');setRange("all"); setCustom({ min: "", max: "" }); setAmountDraft({ min: "", max: "" }); setRangeError(""); setOffset(0); }}>조건 초기화</button>
        <CategoryFilters categories={categories} value={categoryIds} onChange={v=>{if(p.changeContext?.()!==false){setCategories(v);setOffset(0);setSelected([]);setFocused('');}}} />
        <GroupedAccountFilter
          accounts={tracked}
          value={accountIds}
          onChange={(v) => {
            if(p.changeContext?.()===false)return;
            setAccounts(v);
            setOffset(0);
            setSelected([]);setFocused('');
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
                setSelected([]);setFocused('');
              }}
            >
              {r.label}
            </button>
          ))}
          <form className="money-book-range" onSubmit={e => {
            e.preventDefault();
            const error = validateAmountRange(amountDraft.min, amountDraft.max);
            setRangeError(error);
            if (!error&&p.changeContext?.()!==false) { setCustom(amountDraft); setRange("custom"); setOffset(0);setSelected([]);setFocused(''); }
          }}>
            <input aria-label="최소 금액" inputMode="numeric" placeholder="최소 금액" value={amountDraft.min} onChange={e => setAmountDraft({ ...amountDraft, min: e.target.value })} />
            <span>~</span>
            <input aria-label="최대 금액" inputMode="numeric" placeholder="최대 금액" value={amountDraft.max} onChange={e => setAmountDraft({ ...amountDraft, max: e.target.value })} />
            <button aria-pressed={range === "custom"} type="submit">{range === "custom" ? "사용자 범위" : "범위 적용"}</button>
          </form>
          {rangeError && <small role="alert">{rangeError}</small>}
          <small className="money-muted">절대 금액 · 사용자 범위 양끝 포함</small>
        </div>
      </div>
      <LoadState error={result.error} loading={result.loading||search!==debounced} lastSuccessAt={result.lastSuccessAt} />
      {data?.analyticsUnavailable && <p className="meaning-notice">{data.hasMixedCurrencies ? "여러 통화의 거래가 함께 있습니다." : "KRW 이외 통화의 거래가 있습니다."} 환율 정보가 없어 합계와 기간 분석을 표시하지 않습니다. 금액 범위는 KRW 거래 기준입니다. {data.currencies?.join(" · ")}</p>}
      {p.tracking && !tracked.length && (
        <p className="meaning-notice">
          추적 계좌 설정에서 {p.kind === "EXPENSE" ? "지출" : "수입"} 계좌를
          선택하세요. 새 계좌는 자동 선택되지 않습니다.
          <button onClick={p.onTracking}>추적 계좌 설정</button>
        </p>
      )}
      <p className="money-muted">분류의 최종 저장은 검토 완료로 반영합니다. 제목·메모만 저장하면 검토 상태를 바꾸지 않습니다. 직접 수정 참고는 같은 계좌·유형·구매 맥락으로 제한합니다.</p>
      <ClassificationUndoNotice/>
      {selected.length>0&&<ClassificationBatch rows={(data?.items??[]).map(latest)} selected={selected} onSelection={setSelected} categories={categories}/>}
      <div className="money-classification-split"><div className="money-classification-list">
      <div className="money-table-wrap">
        <table className="money-table meaning-ledger money-book-ledger">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="현재 페이지 선택" checked={!!data?.items.length&&data.items.every(row=>selected.includes(row.id))} onChange={e=>setSelected(e.target.checked?data?.items.map(row=>row.id)??[]:[])}/></th>
              <th>일시</th>
              <th>거래처·상대방</th><th>금액·계좌</th>
              <th>제목</th><th>메모</th><th>중분류</th><th>소분류</th>
              <th>분류 출처</th><th>작업</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr
                key={row.id}
                tabIndex={result.loading ? -1 : 0}
                aria-disabled={result.loading}
                aria-selected={focused === row.id}
                onClick={() => openRow(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) openRow(row);
                }}
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
                    <ClassificationCells id={row.id} value={latest(row).categoryId} categories={categories} disabled={row.type==='REFUND'} onSave={id=>saveInline(row,{categoryId:id})}/>
                  </>
                <td><small>{classificationLabels[latest(row).classificationOrigin??'']??(row.categoryId?'현재 분류':'미분류')}</small>{latest(row).futureReferenceExcluded&&<small>이번 거래만 반영</small>}</td>
                <td onClick={e=>e.stopPropagation()}><div className="money-workbench-row-actions"><button onClick={()=>openRow(row)}>{row.categoryId?'근거 보기':'AI 도움'}</button><details><summary aria-label={`${row.title} 추가 행동`}>⋯</summary><div><button onClick={()=>p.select({kind:'book',value:latest(row)})}>거래 상세 편집</button></div></details></div></td>
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
        onChange={value=>{if(p.changeContext?.()!==false){setOffset(value);setSelected([]);setFocused('');}}}
      />
      </div><ClassificationRail row={focusedRow} categories={p.categories} accounts={p.accounts} onClose={()=>setFocused('')} onEdit={row=>p.select({kind:'book',value:row})} loading={detail.loading} error={detail.error}/></div>
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
      </div>}
    </section>
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

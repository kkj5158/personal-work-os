"use client";
import { moneyAmount } from "@/lib/money/accounts";
import { CategoryFilters } from "./MoneyCategoryPicker";
import { useEffect, useRef, useState } from "react";
import {
  type Transaction,
  kinds,
  won,
  seoul,
} from "@/lib/money/model";
import {
  useMoneyData,
  LoadState,
  type OverviewData,
  type FlowSummary,
} from "./MoneyWebData";
import { RevisionOverview } from "./MoneyRevisionOverview";
import { RevisionAccounts, RevisionReconciliation, RevisionLoans } from "./MoneyAccountRevision";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
import { useMoneyViewState } from "./MoneyDataProvider";
import {
  AccountLabel,
  Pagination,
  txTitle,
  type Props,
} from "./MoneyWebViews";

export const relations: Record<
  string,
  { label: string; explanation: string; tone: string }
> = {
  INCOME: {
    label: "외부 → 일반 자금",
    explanation: "외부 수입만 포함합니다. 내 계좌 간 이동은 수입이 아닙니다.",
    tone: "income",
  },
  SPENDING_ALLOCATION: {
    label: "일반 자금 ↔ 소비 계좌",
    explanation:
      "생활비 계좌로 배분한 순자금입니다. 배분 자체는 소비가 아닙니다.",
    tone: "transfer",
  },
  CONSUMPTION: {
    label: "소비 자금 → 외부 소비",
    explanation:
      "외부 지출에서 환불을 차감합니다. 확인된 대출 이자·수수료만 소비에 포함합니다.",
    tone: "expense",
  },
  SAVINGS: {
    label: "일반·소비 자금 ↔ 저축",
    explanation:
      "저축 영역 경계를 넘은 순증감입니다. 저축 계좌 사이의 반복 이동은 제외하며 회수는 음수입니다.",
    tone: "saving",
  },
  LOAN_PRINCIPAL: {
    label: "자금 → 대출 원금 상환",
    explanation:
      "확인된 상환 원금만 포함합니다. 저축이나 소비로 합산하지 않습니다.",
    tone: "loan",
  },
  UNRESOLVED_LOAN: {
    label: "대출 상환 · 구성 미확인",
    explanation:
      "총 납부액만 확인되었습니다. 원금·이자·수수료는 확인 전까지 배분하지 않습니다.",
    tone: "loan",
  },
};
const dates = (p: Props["period"]) =>
  new URLSearchParams({ from: p.from, to: p.to }).toString();
export function FilterButtons({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string[]>([]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = [];
  };
  const flush = () => {
    const selected = new Set(value ?? options.map((o) => o.id));
    for (const id of pending.current) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    }
    cancel();
    onChange([...selected].sort());
  };
  return (
    <div className="money-filter-row" role="group" aria-label={label}>
      <strong>{label}</strong>
      <div className="money-filter-options">
        {options.map((o) => (
          <button
            key={o.id}
            aria-pressed={value === null || value.includes(o.id)}
            onClick={(e) => {
              if (timer.current) clearTimeout(timer.current);
              pending.current.push(o.id);
              if (e.detail === 0) flush();
              else timer.current = setTimeout(flush, 225);
            }}
            onDoubleClick={() => {
              cancel();
              onChange([o.id]);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="money-filter-all">
        <button
          onClick={() => {
            cancel();
            onChange(null);
          }}
        >
          전체 선택
        </button>
        <button
          onClick={() => {
            cancel();
            onChange([]);
          }}
        >
          전체 해제
        </button>
      </div>
    </div>
  );
}

function FlowMap({
  data,
  selected,
  onSelect,
  large = false,
}: {
  data: OverviewData;
  selected?: string;
  onSelect: (relation: string) => void;
  large?: boolean;
}) {
  const amount = (key: string) =>
    data.relationships.find((r) => r.relation === key)?.net ?? 0;
  const branch = (key: string, subtitle?: string) => (
    <button
      aria-pressed={selected === key}
      className={`money-flow-node ${relations[key].tone}`}
      onClick={() => onSelect(key)}
    >
      <span>{subtitle || relations[key].label}</span>
      <strong>{won(amount(key))}</strong>
    </button>
  );
  return (
    <div
      className={`money-pool-map ${large ? "large" : ""}`}
      aria-label="계좌 그룹별 순자금 흐름"
    >
      <div className="money-flow-origin">
        {branch("INCOME", "외부 수입")}
        <span className="money-flow-arrow">→</span>
        <div className="money-flow-pool">
          <span>내 계좌</span>
          <strong>수입 · 일반 자금</strong>
          <small>중간 이동은 중복 합산하지 않음</small>
        </div>
      </div>
      <div className="money-flow-branches">
        <div>
          {branch("SPENDING_ALLOCATION", "소비 계좌 배분")}
          <span>→</span>
          {branch("CONSUMPTION", "외부 소비 · 환불 차감")}
        </div>
        <div>
          {branch("SAVINGS", "저축 · 적금 순증감")}
          <small>← 회수는 음수</small>
        </div>
        <div>
          {branch("LOAN_PRINCIPAL", "대출 원금 감소")}
          <small>저축과 분리</small>
        </div>
      </div>
      {data.kpis.unresolvedLoanPayments > 0 && (
        <div className="money-flow-unresolved">{branch("UNRESOLVED_LOAN")}</div>
      )}
    </div>
  );
}

export function FinancialOverview(p: Props) { return <RevisionOverview {...p}/>; }
export function FinancialAccounts(p: Props) { return <RevisionAccounts {...p}/>; }
export function FinancialReconciliation(p: Props) { return <RevisionReconciliation {...p}/>; }
export function FinancialLoans(p: Props) { return <RevisionLoans {...p}/>; }

export type LedgerState = {
  accounts: string[] | null;
  types: string[] | null;
  categories: string[] | null;
  search: string;
  offset: number;
  period: string;
  excluded: boolean;
  flowRelation: string | null;
};
export const emptyLedger = (): LedgerState => ({
  accounts: null,
  types: null,
  categories: null,
  search: "",
  offset: 0,
  period: "",
  excluded: false,
  flowRelation: null,
});
export function FinancialTransactions(p: Props) {
  const [state, set] = useMoneyViewState("ledger", emptyLedger);
  const [search, setSearch] = useState(state.search),
    [debounced, setDebounced] = useState(state.search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 225);
    return () => clearTimeout(timer);
  }, [search]);
  const period = dates(p.period),
    offset = state.period === period ? state.offset : 0;
  const query = new URLSearchParams({
    from: p.period.from,
    to: p.period.to,
    limit: "50",
    offset: String(offset),
    includeExcluded: String(state.excluded),
  });
  for (const [key, value] of [
    ["accountIds", state.accounts],
    ["types", state.types],
    ["categoryIds", state.categories],
  ] as const)
    if (value !== null)
      query.set(key, value.length ? [...value].sort().join(",") : "none");
  if (debounced) query.set("search", debounced);
  if (state.flowRelation) query.set("flowRelation", state.flowRelation);
  const { data, error, loading } = useMoneyData<{
    items: Transaction[];
    total: number;
  }>("/transactions?" + query);
  const change = (value: Partial<LedgerState>) =>
    set((old) => ({ ...old, ...value, offset: 0, period }));
  useEffect(()=>{ if(data && !loading && p.selected && !data.items.some(t=>t.id===p.selected))p.clearSelection?.(); },[data,loading,p.selected,p.clearSelection]);
  if (!p.ready) return null;
  return (
    <section className="money-card money-ledger">
      <div className="money-section-heading">
        <h2>금융 원장</h2>
        <input
          aria-label="거래 검색"
          placeholder="제목, 메모, 거래처 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            change({ search: e.target.value });
          }}
        />
      </div>
      <GroupedAccountFilter accounts={p.accounts} value={state.accounts} onChange={accounts=>change({accounts})}/>
      <FilterButtons
        label="거래 유형"
        options={Object.entries(kinds).map(([id, label]) => ({ id, label }))}
        value={state.types}
        onChange={(types) => change({ types })}
      />
      <CategoryFilters categories={p.categories} value={state.categories} onChange={categories=>change({categories})} />
      <div className="money-ledger-meta">
        <span>클릭: 포함/제외 · 더블클릭: 단독 선택</span>
        <label>
          <input
            type="checkbox"
            checked={state.excluded}
            onChange={(e) => change({ excluded: e.target.checked })}
          />{" "}
          제외된 거래 포함
        </label>
      </div>
      {state.flowRelation && (
        <p className="money-flow-context">
          흐름 근거: {relations[state.flowRelation]?.label}
          <button onClick={() => change({ flowRelation: null })}>
            흐름 필터 해제
          </button>
        </p>
      )}
      <LoadState error={error} loading={loading} />
      <LedgerTable items={data?.items || []} {...p} />
      {data && !data.total && (
        <p className="money-empty">선택한 조건의 거래가 없습니다.</p>
      )}
      <Pagination
        offset={offset}
        total={data?.total || 0}
        onChange={(offset) => set((old) => ({ ...old, offset, period }))}
      />
    </section>
  );
}

export function LedgerTable({items,...p}:Props & {items:(Transaction & {contribution?:number})[]}) {
  return <div className="money-table-scroll money-dense-table"><table aria-label="Transactions"><thead><tr>{["날짜","거래","종류","계좌","분류","금액"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{items.map(t=><tr key={t.id} aria-selected={p.selected===t.id} className={p.selected===t.id?"selected":""} onClick={()=>p.select({kind:"transaction",value:t})}><td>{seoul(t.occurredAt).slice(5,10)}<small>{seoul(t.occurredAt).slice(11)}</small></td><td><button className="money-row-button" onClick={e=>{e.stopPropagation();p.select({kind:"transaction",value:t});}}>{txTitle(t,p.accounts)}</button><small>{t.sources.length?`원문 ${t.sources.length}개`:"수동 금융 기록"}{t.refundOf?" · 원거래 연결됨":""}{t.excluded?" · 제외됨":""}</small></td><td><span className={"money-type "+t.type.toLowerCase()}>{kinds[t.type]}</span></td><td><AccountLabel id={t.fromAccountId??t.toAccountId} accounts={p.accounts} fallback={t.counterpartyText}/>{t.fromAccountId&&t.toAccountId&&<small>→ {p.accounts.find(a=>a.id===t.toAccountId)?.displayName??"—"}</small>}</td><td>{p.categories.find(c=>c.id===t.categoryId)?.name??(["BALANCE_ADJUSTMENT","INITIAL_BALANCE"].includes(t.type)?"분류 대상 아님":"미분류")}</td><td className="money-number">{t.contribution==null&&["EXPENSE","LOAN_PAYMENT"].includes(t.type)?"−":t.contribution==null&&["INCOME","REFUND"].includes(t.type)?"+":""}{moneyAmount(t.contribution??t.amount,t.currency)}</td></tr>)}</tbody></table></div>;
}

type FlowDetail = {
  relation: string;
  summary: FlowSummary;
  contributions: {
    fromAccountId: string | null;
    toAccountId: string | null;
    net: number;
    gross: number;
    count: number;
  }[];
  items: (Transaction & { contribution: number })[];
  total: number;
};
export function FlowExplorer(p: Props) {
  const overview = useMoneyData<OverviewData>("/overview?" + dates(p.period));
  const [selected, setSelected] = useMoneyViewState(
    "flow-relation",
    () => "SAVINGS",
  );
  const [, setLedger] = useMoneyViewState("ledger", emptyLedger);
  const [paging, setPaging] = useState({ period: "", offset: 0 });
  const offset = paging.period === dates(p.period) ? paging.offset : 0;
  const setOffset = (offset: number) =>
    setPaging({ period: dates(p.period), offset });
  const [pair, setPair] = useState<string | null>(null);
  const detail = useMoneyData<FlowDetail>(
    "/flow?" +
      dates(p.period) +
      "&relation=" +
      selected +
      "&limit=50&offset=" +
      offset +
      (pair ? "&pair=" + encodeURIComponent(pair) : ""),
  );
  if (!p.ready) return null;
  const contribution = pair
    ? detail.data?.contributions.find(
        (c) =>
          (c.fromAccountId || "external") +
            ":" +
            (c.toAccountId || "external") ===
          pair,
      )
    : null;
  const summary = contribution
    ? {
        ...contribution,
        average: contribution.count
          ? contribution.gross / contribution.count
          : 0,
      }
    : detail.data?.summary;
  return (
    <>
      <button className="money-link" onClick={() => p.navigate?.("/money")}>
        ← Overview
      </button>
      <div className="money-flow-explorer">
        <section className="money-card">
          <h2>Money Flow Explorer</h2>
          <p className="money-muted">
            계좌 그룹 관계 → 개별 계좌 관계 → 금융 근거
          </p>
          <LoadState
            error={overview.error}
            loading={!overview.data && overview.loading}
          />
          {overview.data && (
            <FlowMap
              large
              data={overview.data}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setOffset(0);
                setPair(null);
              }}
            />
          )}
        </section>
        <aside
          className="money-card money-flow-detail"
          aria-label="선택한 흐름"
        >
          <h2>{relations[selected].label}</h2>
          <p>{relations[selected].explanation}</p>
          <LoadState error={detail.error} loading={detail.loading} />
          {summary && (
            <>
              <span>순이동</span>
              <strong className="money-flow-total">{won(summary.net)}</strong>
              <dl>
                <dt>총이동 · 참고</dt>
                <dd>{won(summary.gross)}</dd>
                <dt>거래 수</dt>
                <dd>{summary.count}건</dd>
                <dt>평균 이동</dt>
                <dd>{won(summary.average)}</dd>
                <dt>총이동 대비 순이동</dt>
                <dd>
                  {summary.gross
                    ? `${((summary.net / summary.gross) * 100).toFixed(1)}%`
                    : "—"}
                </dd>
              </dl>
            </>
          )}
          <h3>개별 계좌 관계</h3>
          <button
            aria-pressed={!pair}
            onClick={() => {
              setPair(null);
              setOffset(0);
            }}
          >
            관계 전체
          </button>
          {detail.data?.contributions.map((c, i) => {
            const key =
              (c.fromAccountId || "external") +
              ":" +
              (c.toAccountId || "external");
            return (
              <button
                className="money-flow-contribution"
                aria-pressed={pair === key}
                key={i}
                onClick={() => {
                  setPair(key);
                  setOffset(0);
                }}
              >
                <span>
                  {p.accounts.find((a) => a.id === c.fromAccountId)
                    ?.displayName || "외부"}{" "}
                  →{" "}
                  {p.accounts.find((a) => a.id === c.toAccountId)
                    ?.displayName || "외부"}
                </span>
                <strong>{won(c.net)}</strong>
              </button>
            );
          })}
        </aside>
      </div>
      <section className="money-card">
        <div className="money-section-heading">
          <div>
            <h2>선택 흐름의 거래 근거</h2>
            <p className="money-muted">
              금액은 이 관계에 기여한 금액입니다. 대출은 확인 원금과 비용을
              구분합니다.
            </p>
          </div>
          <button
            onClick={() => {
              setLedger({ ...emptyLedger(), flowRelation: selected });
              p.navigate?.("/money/transactions");
            }}
          >
            Transactions에서 보기 →
          </button>
        </div>
        <LedgerTable {...p} items={detail.data?.items || []} />
        <Pagination
          offset={offset}
          total={detail.data?.total || 0}
          onChange={setOffset}
        />
      </section>
    </>
  );
}


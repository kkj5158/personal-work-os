"use client";
import { categoryTotals } from "@/lib/money/categories";
import { CategoryFilters } from "./MoneyCategoryPicker";
import { useEffect, useRef, useState } from "react";
import {
  type AccountBalance,
  type Transaction,
  kinds,
  roles,
  providers,
  won,
  seoul,
  provenance,
} from "@/lib/money/model";
import {
  useMoneyData,
  LoadState,
  type OverviewData,
  type FlowSummary,
  type Loan,
} from "./MoneyWebData";
import { LoanHistory } from "./MoneyLoanHistory";
import { useMoneyViewState } from "./MoneyDataProvider";
import {
  AccountIcon,
  AccountLabel,
  Metric,
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
const accountGroups = [
  { label: "수입 계좌", roles: ["INCOME_HUB"] },
  { label: "소비 계좌", roles: ["SPENDING", "FIXED_SPENDING"] },
  {
    label: "저축 · 적금",
    roles: [
      "SAVINGS_GATEWAY",
      "SAVINGS",
      "PURPOSE_SAVINGS",
      "PURPOSE_INSTALLMENT",
    ],
  },
  { label: "기타", roles: ["CASH"] },
];
const palette = [
  "#6785aa",
  "#8eabc4",
  "#aac3c9",
  "#bcb5cd",
  "#c8c2ae",
  "#a0bba6",
  "#d3b4b6",
  "#d7dde5",
];

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

function Donut({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: { label: string; amount: number }[];
  onSelect?: (label:string)=>void;
}) {
  const nonzero = items
    .filter((i) => i.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const positive = nonzero.filter((i) => i.amount > 0),
    total = nonzero.reduce((s, i) => s + i.amount, 0),
    denominator = positive.reduce((s, i) => s + i.amount, 0);
  const segments = positive.map((i, n) => {
    const start =
      (positive.slice(0, n).reduce((sum, row) => sum + row.amount, 0) /
        denominator) *
      100;
    return `${palette[n % palette.length]} ${start}% ${start + (i.amount / denominator) * 100}%`;
  });
  return (
    <section className="money-card money-donut-card">
      <h2>{title}</h2>
      <div className="money-donut-layout">
        <div
          className="money-donut"
          role="img"
          aria-label={`${title} 합계 ${won(total)}`}
          style={{
            background: segments.length
              ? `conic-gradient(${segments.join(",")})`
              : "#edf0f4",
          }}
        >
          <div>
            <span>기간 합계</span>
            <strong>{won(total)}</strong>
          </div>
        </div>
        <div className="money-legend">
          {nonzero.length ? (
            nonzero.map((i, n) => (
              <div key={i.label}>
                <span>
                  <i style={{ background: palette[n % palette.length] }} />
                  {onSelect ? <button className="meaning-text-button" onClick={()=>onSelect(i.label)}>{i.label}</button> : i.label}
                </span>
                <strong>{won(i.amount)}</strong>
                <small>
                  {total === 0
                    ? "—"
                    : `${((i.amount / total) * 100).toFixed(1)}%`}
                </small>
              </div>
            ))
          ) : (
            <p className="money-muted">해당 기간 기록 없음</p>
          )}
        </div>
      </div>
      {nonzero.some((i) => i.amount < 0) && (
        <p className="money-muted">
          환불 초과 등 음수 구성은 목록에 부호로 표시합니다. 원형 면적은 양수
          구성 기준입니다.
        </p>
      )}
    </section>
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

function TrendChart({ rows }: { rows: OverviewData["trend"] }) {
  const values = rows.flatMap((r) => [r.income, r.consumption, r.savings]);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min;
  const x = (i: number) =>
    20 + (rows.length < 2 ? 270 : (i / (rows.length - 1)) * 540);
  const y = (amount: number) => 145 - ((amount - min) / span) * 125;
  return (
    <div className="money-trend-chart">
      <svg
        viewBox="0 0 580 170"
        role="img"
        aria-label="수입 소비 순저축 기간 추이"
      >
        <line x1="20" x2="560" y1={y(0)} y2={y(0)} stroke="#dfe5ee" />
        {(
          [
            ["income", "#4FAF83"],
            ["consumption", "#D86F72"],
            ["savings", "#678eae"],
          ] as const
        ).map(([key, color]) => (
          <g key={key}>
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2"
              points={rows.map((r, i) => `${x(i)},${y(r[key])}`).join(" ")}
            />
            {rows.length === 1 && (
              <circle cx={x(0)} cy={y(rows[0][key])} r="3" fill={color} />
            )}
          </g>
        ))}
      </svg>
      <div className="money-trend-axis">
        <span>{rows[0]?.day}</span>
        <span>{rows.at(-1)?.day}</span>
      </div>
    </div>
  );
}

function CategoryComposition(p: Props & {data:OverviewData;kind:"income"|"consumption"}) {
  const [selected,setSelected]=useState<string|null>(null);
  const [,setLedger]=useMoneyViewState("ledger",emptyLedger);
  const groups=categoryTotals(p.categories,p.data.composition.filter(r=>r[p.kind]!==0 && r.type!=="LOAN_PAYMENT").map(r=>({categoryId:r.categoryId,amount:r[p.kind]})));
  const loanCost=p.kind==="consumption"?p.data.composition.filter(r=>r.type==="LOAN_PAYMENT").reduce((n,r)=>n+r.consumption,0):0;
  const group=groups.find(g=>g.id===selected);
  const evidence=(id:string)=>{setLedger({...emptyLedger(),categories:[id],types:p.kind==="income"?["INCOME"]:["EXPENSE","REFUND"],period:dates(p.period)});p.navigate?.("/money/transactions");};
  return <div className={"category-composition"+(group?" category-composition-selected":"")}><Donut title={p.kind==="income"?"수입 구성":"소비 구성"} items={[...groups,...(loanCost?[{label:"대출 이자 · 수수료",amount:loanCost}]:[])]} onSelect={label=>setSelected(groups.find(g=>g.label===label)?.id??null)} />
    {group && <section className="money-card category-drilldown" aria-label={`${group.label} 상세 분석`}><div className="money-section-heading"><h3>{group.label} 상세 분석</h3><strong>{won(group.amount)}</strong><button onClick={()=>setSelected(null)} aria-label="분류 상세 닫기">×</button></div><p className="meaning-notice">대분류 직접 지정 + 모든 세부분류의 합계 · 금융 원장 기준</p>
      {group.children.map(c=><button className="category-drill-row" key={c.id} onClick={()=>evidence(c.id)}><span>{c.label}</span><strong>{won(c.amount)}</strong><small>{group.amount?`${(c.amount/group.amount*100).toFixed(1)}%`:"—"}</small><i style={{width:`${Math.min(100,Math.abs(c.amount/(group.amount||1))*100)}%`}} /></button>)}
      <small>항목을 선택하면 같은 기간의 구성 금융 원장으로 이동합니다.</small></section>}
  </div>;
}

export function FinancialOverview(p: Props) {
  const { data, error, loading } = useMoneyData<OverviewData>(
    "/overview?" + dates(p.period),
  );
  const [, setRelation] = useMoneyViewState("flow-relation", () => "SAVINGS");
  if (!p.ready) return null;
  if (!data) return <LoadState error={error} loading={loading} />;
  const sums = (kind: "income" | "consumption" | "savings") => {
    const grouped = new Map<string, number>();
    for (const row of data.composition) {
      const label =
        kind === "income"
          ? p.categories.find((c) => c.id === row.categoryId)?.name ||
            row.counterpartyText ||
            "기타 수입"
          : kind === "consumption"
            ? row.type === "LOAN_PAYMENT"
              ? "대출 이자 · 수수료"
              : p.categories.find((c) => c.id === row.categoryId)?.name ||
                "미분류"
            : p.accounts.find((a) => a.id === row.toAccountId)?.displayName ||
              "저축 회수";
      grouped.set(label, (grouped.get(label) || 0) + row[kind]);
    }
    return [...grouped].map(([label, amount]) => ({ label, amount }));
  };
  const savings = sums("savings").filter((i) => i.amount !== 0),
    maximum = Math.max(1, ...savings.map((i) => Math.abs(i.amount)));
  return (
    <>
      <LoadState error={error} loading={false} />
      <div className="money-kpis">
        <Metric label="기간 수입" value={data.kpis.income} tone="income" />
        <Metric
          label="기간 소비"
          value={data.kpis.consumption}
          tone="expense"
        />
        <Metric label="기간 순저축" value={data.kpis.savings} tone="saving" />
        <Metric label="보유 자산" value={data.kpis.assets} />
        <Metric label="남은 대출금" value={data.kpis.loans} tone="loan" />
      </div>
      <p className="money-asof">
        기간 지표 {data.from} — {data.to} · 자산{" "}
        {data.balanceBasis === "PERIOD_END_CALCULATED"
          ? "기간 말"
          : "최신 확인 기준점 + 현재 장부"}{" "}
        기준 ({seoul(data.balanceAsOf).replace("T", " ")}) · 대출은 현재 확인
        원금 · 잔액 기준점 미확인 {data.unverifiedBalances}개
      </p>
      <section className="money-card">
        <div className="money-section-heading">
          <div>
            <h2>자금 흐름</h2>
            <p className="money-muted">
              계좌 그룹 사이의 순이동. 관계를 선택하면 근거 거래를 확인할 수
              있습니다.
            </p>
          </div>
          <button onClick={() => p.navigate?.("/money/flow")}>
            흐름 탐색 →
          </button>
        </div>
        <FlowMap
          data={data}
          onSelect={(r) => {
            setRelation(r);
            p.navigate?.("/money/flow");
          }}
        />
      </section>
      <div className="money-composition-row">
        <CategoryComposition {...p} data={data} kind="income" />
        <CategoryComposition {...p} data={data} kind="consumption" />
      </div>
      <div className="money-analysis-secondary">
        <section className="money-card">
          <h2>순저축 구성</h2>
          <p className="money-muted">적립 + / 회수 − · 대출 원금 상환 제외</p>
          <div className="money-signed-bars">
            {savings.map((i) => (
              <div key={i.label}>
                <span>{i.label}</span>
                <div>
                  <i
                    className={i.amount < 0 ? "negative" : "positive"}
                    style={{ width: `${(Math.abs(i.amount) / maximum) * 50}%` }}
                  />
                </div>
                <strong>
                  {i.amount > 0 ? "+" : ""}
                  {won(i.amount)}
                </strong>
              </div>
            ))}
            {!savings.length && <p>해당 기간 순저축 이동 없음</p>}
          </div>
        </section>
        <section className="money-card">
          <h2>기간 추이</h2>
          <TrendChart rows={data.trend} />
          <div className="money-trend">
            <div>
              <strong>기간</strong>
              <span>수입</span>
              <span>소비</span>
              <span>순저축</span>
            </div>
            {data.trend.map((t) => (
              <div key={t.day}>
                <span>{t.day}</span>
                <span className="income">{won(t.income)}</span>
                <span className="expense">{won(t.consumption)}</span>
                <span className="saving">{won(t.savings)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="money-card">
        <div className="money-section-heading">
          <h2>자산 현황</h2>
          <strong>총 자산 {won(data.kpis.assets)}</strong>
        </div>
        <p className="money-muted">
          자산 포함 계좌 기준 · 대출 부채를 차감하지 않습니다.
        </p>
        <div className="money-assets-grid">
          {accountGroups.map((g) => {
            const entries = data.balances.filter(
              (b) =>
                b.account.includeInAssets !== false &&
                g.roles.includes(b.account.role),
            );
            return (
              <div key={g.label}>
                <span>{g.label}</span>
                <strong>
                  {won(entries.reduce((s, b) => s + b.balance.amount, 0))}
                </strong>
                <small>{entries.length}개 계좌</small>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

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
      <FilterButtons
        label="계좌"
        options={p.accounts.map((a) => ({ id: a.id, label: a.displayName }))}
        value={state.accounts}
        onChange={(accounts) => change({ accounts })}
      />
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

export function LedgerTable({
  items,
  ...p
}: Props & { items: (Transaction & { contribution?: number })[] }) {
  return (
    <div className="money-table-scroll money-dense-table">
      <table aria-label="Transactions">
        <thead>
          <tr>
            {[
              "날짜 / 시각",
              "유형",
              "출발",
              "→",
              "도착 / 거래처",
              "제목",
              "카테고리",
              "금액",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              className={p.selected === t.id ? "selected" : ""}
              onClick={() => p.select({ kind: "transaction", value: t })}
            >
              <td>{seoul(t.occurredAt).replace("T", " ")}</td>
              <td>
                <span className={"money-type " + t.type.toLowerCase()}>
                  {kinds[t.type]}
                </span>
                {t.excluded && <small>제외됨</small>}
              </td>
              <td>
                <AccountLabel
                  id={t.fromAccountId}
                  accounts={p.accounts}
                  fallback={
                    t.type === "INITIAL_BALANCE" ||
                    t.type === "BALANCE_ADJUSTMENT"
                      ? "기준점"
                      : t.counterpartyText
                  }
                />
              </td>
              <td>→</td>
              <td>
                <AccountLabel
                  id={t.toAccountId}
                  accounts={p.accounts}
                  fallback={
                    t.type === "LOAN_PAYMENT" ? "대출 상환" : t.counterpartyText
                  }
                />
              </td>
              <td>
                <button
                  className="money-row-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.select({ kind: "transaction", value: t });
                  }}
                >
                  {txTitle(t, p.accounts)}
                </button>
              </td>
              <td>
                {p.categories.find((c) => c.id === t.categoryId)?.name || "—"}
              </td>
              <td className="money-number">
                {won(t.contribution ?? t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

export function FinancialAccounts(p: Props) {
  const { data, error, loading } =
    useMoneyData<AccountBalance[]>("/account-balances");
  const [search, setSearch] = useState("");
  if (!p.ready) return null;
  return (
    <>
      <div className="money-section-heading">
        <div>
          <h2>계좌별 자산</h2>
          <p className="money-muted">
            부채와 분리된 내 자산 · 별명으로 계좌를 관리합니다.
          </p>
        </div>
        <strong>
          총 자산{" "}
          {data
            ? won(
                data
                  .filter((b) => b.account.includeInAssets !== false)
                  .reduce((s, b) => s + b.balance.amount, 0),
              )
            : "확인 중…"}
        </strong>
      </div>
      <div className="money-toolbar">
        <input
          aria-label="계좌 검색"
          placeholder="계좌 별명, 은행 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="money-primary"
          onClick={() => p.select({ kind: "account", value: null })}
        >
          + 계좌 추가
        </button>
      </div>
      <LoadState error={error} loading={loading} />
      {accountGroups.map((g) => {
        const items = p.accounts.filter(
          (a) =>
            g.roles.includes(a.role) &&
            (a.displayName + (providers[a.provider] || a.provider)).includes(
              search,
            ),
        );
        return (
          <section className="money-card-group" key={g.label}>
            <h2>
              {g.label}
              <small>{items.length}개</small>
            </h2>
            <div className="money-account-cards">
              {items.map((a) => {
                const balance = data?.find(
                  (b) => b.account.id === a.id,
                )?.balance;
                return (
                  <button
                    key={a.id}
                    className={
                      "money-account-card " +
                      (p.selected === a.id ? "selected" : "")
                    }
                    onClick={() => p.select({ kind: "account", value: a })}
                  >
                    <div>
                      <AccountIcon account={a} />
                      <strong>{a.displayName}</strong>
                      {a.archived && <small>보관됨</small>}
                    </div>
                    <span>
                      {providers[a.provider] || a.provider} ·{" "}
                      {a.suffix
                        ? "•• " + a.suffix
                        : a.maskedReference || "현금 / 힌트 미설정"}
                    </span>
                    <b>{balance ? won(balance.amount) : "잔액 확인 중…"}</b>
                    <footer>
                      <span>{roles[a.role]}</span>
                      <small>
                        {a.includeInAssets === false
                          ? "자산 제외"
                          : "자산 포함"}
                      </small>
                    </footer>
                    <small>
                      {balance ? provenance(balance) : ""}
                      {balance?.asOf
                        ? " · " + seoul(balance.asOf).slice(0, 10)
                        : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            {!items.length && <p className="money-muted">등록된 계좌 없음</p>}
          </section>
        );
      })}
    </>
  );
}

export const loanStatuses = {
  ACTIVE: "상환 중",
  COMPLETED: "완료",
  PAUSED: "일시 중지",
  INACTIVE: "비활성",
};
export function FinancialLoans(p: Props) {
  const [historyId, setHistoryId] = useState<string | null>(null);
  const { data, error, loading } = useMoneyData<Loan[]>("/loans");
  const [status, setStatus] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  if (!p.ready) return null;
  const filtered =
    data?.filter(
      (l) =>
        (status === null || status.includes(l.status)) &&
        (l.name + l.lender).includes(search),
    ) || [];
  return (
    <>
      <div className="money-kpis bookkeeping">
        <Metric
          label="남은 원금 · 활성 대출"
          value={
            data
              ?.filter((l) => l.status === "ACTIVE")
              .reduce((s, l) => s + l.remainingPrincipal, 0) || 0
          }
          tone="loan"
        />
        <Metric
          label="등록된 월 납부액"
          value={
            data
              ?.filter((l) => l.status === "ACTIVE")
              .reduce((s, l) => s + (l.monthlyPayment || 0), 0) || 0
          }
        />
      </div>
      <div className="money-toolbar">
        <input
          aria-label="대출 검색"
          placeholder="대출명, 금융사"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="money-primary"
          onClick={() => p.select({ kind: "loan", value: null })}
        >
          + 대출 추가
        </button>
      </div>
      <FilterButtons
        label="대출 상태"
        options={Object.entries(loanStatuses).map(([id, label]) => ({
          id,
          label,
        }))}
        value={status}
        onChange={setStatus}
      />
      <LoadState error={error} loading={loading} />
      <div className="money-loan-cards">
        {filtered.map((l) => (
          <button
            className={
              "money-loan-card " + (p.selected === l.id ? "selected" : "")
            }
            key={l.id}
            onClick={() => {
              setHistoryId(l.id);
              p.select({ kind: "loan", value: l });
            }}
          >
            <div>
              <span>{l.lender}</span>
              <small>{loanStatuses[l.status]}</small>
            </div>
            <h2>{l.name}</h2>
            <span>남은 원금</span>
            <strong>{won(l.remainingPrincipal)}</strong>
            {l.originalPrincipal != null && l.originalPrincipal > 0 && (
              <progress
                aria-label="남은 원금 비율"
                max={l.originalPrincipal}
                value={Math.min(l.remainingPrincipal, l.originalPrincipal)}
              />
            )}
            <dl>
              <dt>금리</dt>
              <dd>
                {l.interestRate == null ? "미확인" : l.interestRate + "%"}
              </dd>
              <dt>정기 납부액</dt>
              <dd>
                {l.monthlyPayment == null ? "미설정" : won(l.monthlyPayment)}
              </dd>
              <dt>다음 납부일</dt>
              <dd>{l.nextDueDate || "미설정"}</dd>
            </dl>
          </button>
        ))}
      </div>
      {data?.find((l) => l.id === historyId) && (
        <LoanHistory
          loan={data.find((l) => l.id === historyId)!}
          accounts={p.accounts}
          select={p.select}
        />
      )}
      <p className="money-muted">
        대출은 부채입니다. 확인된 상환 원금만 잔여 원금에서 차감하며 미확인
        구성은 임의로 나누지 않습니다.
      </p>
    </>
  );
}

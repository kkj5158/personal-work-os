"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  type Account,
  type AccountBalance,
  type Category,
  type Transaction,
  type Rule,
  type Raw,
  roles,
  providers,
  kinds,
  won,
  seoul,
  provenance,
} from "@/lib/money/model";
import { type Period } from "@/lib/money/period";
import {
  useMoneyData,
  LoadState,
  type BookRow,
  type BookPage,
  type Loan,
  type OverviewData,
} from "./MoneyWebData";
import BridgeConnection from "./BridgeConnection";

export type Selection =
  | { kind: "account"; value: Account | null }
  | { kind: "transaction"; value: Partial<Transaction> | null }
  | { kind: "book"; value: BookRow }
  | { kind: "loan"; value: Loan | null }
  | { kind: "review"; value: Raw }
  | { kind: "rule"; value: Rule | null }
  | { kind: "category"; value: Category | null };
type Props = {
  accounts: Account[];
  categories: Category[];
  period: Period;
  select: (v: Selection) => void;
  selected?: string;
};
const dates = (p: Period) =>
  new URLSearchParams({ from: p.from, to: p.to }).toString();
export const txTitle = (t: Partial<Transaction>, accounts: Account[]) =>
  t.title ||
  `${accounts.find((a) => a.id === t.fromAccountId)?.displayName || t.counterpartyText || "외부"} → ${accounts.find((a) => a.id === t.toAccountId)?.displayName || t.counterpartyText || "외부"}`;
export function AccountIcon({ account }: { account: Account }) {
  return (
    <span className="money-account-icon">
      {account.imageData ? (
        <Image
          unoptimized
          src={account.imageData}
          width={32}
          height={32}
          alt=""
        />
      ) : (
        account.emoji || "🏦"
      )}
    </span>
  );
}
function AccountLabel({
  id,
  accounts,
  fallback = "외부",
}: {
  id: string | null | undefined;
  accounts: Account[];
  fallback?: string | null;
}) {
  const a = accounts.find((a) => a.id === id);
  return (
    <span>
      <strong>{a?.displayName || fallback || "외부"}</strong>
      {a && <small>{providers[a.provider] || a.provider}</small>}
    </span>
  );
}
export function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className={"money-metric " + tone}>
      <p>{label}</p>
      <strong>{won(value)}</strong>
    </div>
  );
}
function Composition({
  title,
  items,
}: {
  title: string;
  items: { label: string; amount: number }[];
}) {
  const sorted = items
    .filter((x) => x.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const max = Math.max(1, ...sorted.map((x) => Math.abs(x.amount)));
  return (
    <section className="money-card">
      <h2>{title}</h2>
      {!sorted.length && <p className="money-muted">해당 기간 기록 없음</p>}
      {sorted.slice(0, 8).map((item, i) => (
        <div className="money-composition" key={i}>
          <span>{item.label}</span>
          <strong>{won(item.amount)}</strong>
          <i style={{ width: `${(Math.abs(item.amount) / max) * 100}%` }} />
        </div>
      ))}
    </section>
  );
}
function Pagination({
  offset,
  total,
  onChange,
}: {
  offset: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="money-pagination">
      <button
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - 50))}
      >
        이전
      </button>
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + 50, total)} / {total}
      </span>
      <button
        disabled={offset + 50 >= total}
        onClick={() => onChange(offset + 50)}
      >
        다음
      </button>
    </div>
  );
}
export function OverviewView(p: Props) {
  const { data, error, loading } = useMoneyData<OverviewData>(
    "/overview?" + dates(p.period),
  );
  if (!data) return <LoadState error={error} loading={loading} />;
  const groups = [
    { label: "수익 허브", ids: ["INCOME_HUB"] },
    { label: "소비 축", ids: ["SPENDING", "FIXED_SPENDING", "CASH"] },
    {
      label: "저축 축",
      ids: [
        "SAVINGS_GATEWAY",
        "SAVINGS",
        "PURPOSE_SAVINGS",
        "PURPOSE_INSTALLMENT",
      ],
    },
  ];
  const sums = (kind: "income" | "consumption" | "savings") => {
    const map = new Map<string, number>();
    for (const row of data.composition) {
      const label =
        kind === "income"
          ? row.counterpartyText || "기타 수입"
          : kind === "consumption"
            ? p.categories.find((c) => c.id === row.categoryId)?.name ||
              "미분류"
            : p.accounts.find((a) => a.id === row.toAccountId)?.displayName ||
              "저축 회수";
      map.set(label, (map.get(label) || 0) + row[kind]);
    }
    return [...map].map(([label, amount]) => ({ label, amount }));
  };
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
        수입 · 소비 · 순저축: {data.from} — {data.to} · 자산:{" "}
        {data.balanceBasis === "PERIOD_END_CALCULATED"
          ? "기간 말 기준점 + 장부 계산값"
          : "최신 확인 기준점 + 현재 장부 계산값"}{" "}
        ({seoul(data.balanceAsOf).replace("T", " ")})
        {data.unverifiedBalances > 0
          ? ` · 잔액 기준점 미확인 ${data.unverifiedBalances}개 (장부만 계산)`
          : null}{" "}
        · 대출: 현재 수동 확인 원금
        {data.loanAsOf
          ? ` (최근 입력 ${seoul(data.loanAsOf).replace("T", " ")})`
          : null}{" "}
        · 순자산 {won(data.kpis.netWorth)}
      </p>
      <section className="money-card">
        <h2>자금 흐름 구조</h2>
        <p className="money-muted">
          내 계좌 간 이동은 수입·소비에서 제외합니다. 순저축은 저축 영역의
          경계에서 한 번 계산합니다.
        </p>
        <div className="money-structure" aria-label="왼쪽에서 오른쪽 자금 흐름">
          <div className="money-structure-node income">
            <strong>외부 수입</strong>
            <b>{won(data.kpis.income)}</b>
          </div>
          <span className="money-connector" aria-label="수입에서 허브로">
            →
          </span>
          <div className="money-structure-node income">
            <h3>{groups[0].label}</h3>
            {p.accounts
              .filter((a) => !a.archived && a.role === "INCOME_HUB")
              .map((a) => (
                <button
                  key={a.id}
                  className={p.selected === a.id ? "selected" : ""}
                  onClick={() => p.select({ kind: "account", value: a })}
                >
                  <AccountIcon account={a} />
                  {a.displayName}
                </button>
              ))}
          </div>
          <span className="money-connector">→</span>
          <div className="money-structure-axes">
            {groups.slice(1).map((g) => (
              <div
                className={
                  "money-structure-node " +
                  (g.label === "저축 축" ? "saving" : "expense")
                }
                key={g.label}
              >
                <h3>{g.label}</h3>
                {p.accounts
                  .filter((a) => !a.archived && g.ids.includes(a.role))
                  .map((a) => (
                    <button
                      key={a.id}
                      className={p.selected === a.id ? "selected" : ""}
                      onClick={() => p.select({ kind: "account", value: a })}
                    >
                      <AccountIcon account={a} />
                      {a.displayName}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <span className="money-connector">→</span>
          <div className="money-structure-axes">
            <div className="money-structure-node expense">
              <strong>외부 소비</strong>
              <b>{won(data.kpis.consumption)}</b>
            </div>
            <div className="money-structure-node saving">
              <strong>저축 영역 순증감</strong>
              <b>{won(data.kpis.savings)}</b>
            </div>
          </div>
        </div>
        <div className="money-liability">
          <span>별도 부채</span>
          <strong>남은 대출 {won(data.kpis.loans)}</strong>
          <small>현금 자산에 합산하지 않습니다.</small>
        </div>
      </section>
      <div className="money-analysis">
        <Composition title="수입 구성" items={sums("income")} />
        <Composition title="소비 구성" items={sums("consumption")} />
        <Composition title="순저축 구성" items={sums("savings")} />
      </div>
      <section className="money-card">
        <h2>기간 추이</h2>
        <div className="money-trend">
          {data.trend.length ? (
            data.trend.map((r) => (
              <div key={r.day}>
                <span>{r.day}</span>
                <span className="income">수입 {won(r.income)}</span>
                <span className="expense">소비 {won(r.consumption)}</span>
                <span className="saving">순저축 {won(r.savings)}</span>
              </div>
            ))
          ) : (
            <p className="money-muted">해당 기간 기록 없음</p>
          )}
        </div>
      </section>
      <section className="money-card">
        <h2>관계별 자금 흐름</h2>
        <p className="money-muted">
          순이동이 기준입니다. 총이동은 왕복 활동을 포함하는 참고값입니다.
        </p>
        <div className="money-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "유형",
                  "출발",
                  "도착",
                  "의미",
                  "순이동",
                  "총이동 (참고)",
                  "건수",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.flow.map((f, i) => (
                <tr key={i}>
                  <td>{kinds[f.type]}</td>
                  <td>
                    <AccountLabel
                      id={f.fromAccountId}
                      accounts={p.accounts}
                      fallback={f.counterpartyText}
                    />
                  </td>
                  <td>
                    <AccountLabel
                      id={f.toAccountId}
                      accounts={p.accounts}
                      fallback={f.counterpartyText}
                    />
                  </td>
                  <td>{f.meaning}</td>
                  <td>
                    <strong>{won(f.net)}</strong>
                  </td>
                  <td className="money-muted">{won(f.gross)}</td>
                  <td>{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function TransactionsView(p: Props) {
  const [type, setType] = useState(""),
    [account, setAccount] = useState(""),
    [cat, setCat] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [offset, setOffset] = useState(0),
    [excluded, setExcluded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  const query = new URLSearchParams({
    from: p.period.from,
    to: p.period.to,
    limit: "50",
    offset: String(offset),
    includeExcluded: String(excluded),
  });
  if (type) query.set("type", type);
  if (account) query.set("accountId", account);
  if (cat) query.set("categoryId", cat);
  if (debounced) query.set("search", debounced);
  const { data, error, loading } = useMoneyData<{
    items: Transaction[];
    total: number;
  }>("/transactions?" + query);
  return (
    <section className="money-card">
      <div className="money-toolbar">
        <input
          aria-label="거래 검색"
          placeholder="제목, 메모, 거래처 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <select
          aria-label="거래 유형"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">전체 유형</option>
          {Object.entries(kinds).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="거래 계좌"
          value={account}
          onChange={(e) => {
            setAccount(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">전체 계좌</option>
          {p.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </select>
        <select
          aria-label="거래 카테고리"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">전체 카테고리</option>
          {p.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="money-primary"
          onClick={() => p.select({ kind: "transaction", value: null })}
        >
          + 거래 추가
        </button>
      </div>
      <label className="money-check">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => {
            setExcluded(e.target.checked);
            setOffset(0);
          }}
        />
        제외된 거래 포함
      </label>
      <LoadState error={error} loading={loading && !data} />
      <div className="money-table-scroll">
        <table aria-label="Transactions">
          <thead>
            <tr>
              {[
                "날짜 / 시각",
                "유형",
                "출발",
                "→",
                "도착 / 거래처",
                "제목 · 메모",
                "카테고리",
                "금액",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
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
                    fallback={t.counterpartyText}
                  />
                </td>
                <td>→</td>
                <td>
                  <AccountLabel
                    id={t.toAccountId}
                    accounts={p.accounts}
                    fallback={t.counterpartyText}
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
                  {t.memo && <small>{t.memo}</small>}
                </td>
                <td>
                  {p.categories.find((c) => c.id === t.categoryId)?.name || "—"}
                </td>
                <td className="money-number">{won(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.total && (
        <p className="money-empty">이 기간의 거래가 없습니다.</p>
      )}
      <Pagination
        offset={offset}
        total={data?.total || 0}
        onChange={setOffset}
      />
    </section>
  );
}
export function BookkeepingView(p: Props) {
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [includeExcluded, setIncludeExcluded] = useState(false);
  const { data, error, loading } = useMoneyData<BookPage>(
    "/bookkeeping?" +
      dates(p.period) +
      `&kind=${kind}&search=${encodeURIComponent(search)}&limit=50&offset=${offset}&includeExcluded=${includeExcluded}`,
  );
  const composition = new Map<string, number>();
  data?.composition.forEach((r) => {
    const key =
      kind === "INCOME"
        ? r.counterpartyText || "기타 수입"
        : p.categories.find((c) => c.id === r.categoryId)?.name || "미분류";
    composition.set(key, (composition.get(key) || 0) + r.amount);
  });
  return (
    <>
      <div className="money-tabs">
        <button
          aria-pressed={kind === "EXPENSE"}
          onClick={() => {
            setKind("EXPENSE");
            setOffset(0);
          }}
        >
          지출
        </button>
        <button
          aria-pressed={kind === "INCOME"}
          onClick={() => {
            setKind("INCOME");
            setOffset(0);
          }}
        >
          수입
        </button>
      </div>
      <LoadState error={error} loading={loading && !data} />
      <div className="money-kpis bookkeeping">
        <Metric
          label={kind === "EXPENSE" ? "순지출 합계" : "수입 합계"}
          value={data?.summary.total || 0}
          tone={kind === "EXPENSE" ? "expense" : "income"}
        />
        <div className="money-metric">
          <p>기록 수</p>
          <strong>{data?.total || 0}건</strong>
        </div>
        <Metric
          label="하루 평균"
          value={
            (data?.summary.total || 0) /
            (Math.round(
              (Date.parse(p.period.to) - Date.parse(p.period.from)) / 86400000,
            ) +
              1)
          }
        />
      </div>
      <div className="money-analysis">
        <Composition
          title={kind === "EXPENSE" ? "카테고리 구성" : "수입원 구성"}
          items={[...composition].map(([label, amount]) => ({ label, amount }))}
        />
        <section className="money-card">
          <h2>기간 추이</h2>
          <div className="money-trend">
            {data?.trend.map((r) => (
              <div key={r.day}>
                <span>{r.day}</span>
                <strong>{won(r.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="money-card">
        <div className="money-toolbar">
          <h2>가계부 · {kind === "EXPENSE" ? "지출" : "수입"}</h2>
          <input
            aria-label="가계부 검색"
            placeholder="제목, 메모 검색"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
          <label className="money-check">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => {
                setIncludeExcluded(e.target.checked);
                setOffset(0);
              }}
            />
            가계부 제외 항목 포함
          </label>
        </div>
        <div className="money-table-scroll">
          <table aria-label="가계부">
            <thead>
              <tr>
                {[
                  "날짜",
                  "제목 · 메모",
                  "카테고리",
                  "계좌 / 수입원",
                  "금액",
                  "상태",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr
                  key={r.id}
                  className={p.selected === r.id ? "selected" : ""}
                  onClick={() => p.select({ kind: "book", value: r })}
                >
                  <td>{seoul(r.occurredAt).slice(0, 10)}</td>
                  <td>
                    <button
                      className="money-row-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.select({ kind: "book", value: r });
                      }}
                    >
                      {r.title}
                    </button>
                    {r.memo && <small>{r.memo}</small>}
                  </td>
                  <td>
                    {p.categories.find((c) => c.id === r.categoryId)?.name ||
                      "미분류"}
                  </td>
                  <td>
                    <AccountLabel id={r.accountId} accounts={p.accounts} />
                    {kind === "INCOME" && r.counterpartyText && (
                      <small>{r.counterpartyText}</small>
                    )}
                  </td>
                  <td className="money-number">
                    {won(r.type === "REFUND" ? -r.amount : r.amount)}
                  </td>
                  <td>
                    {r.excluded
                      ? "제외됨"
                      : Object.keys(r.overrides).length
                        ? "가계부 수정"
                        : "원거래 상속"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.total && !loading && (
          <p className="money-empty">
            내 계좌 간 이체는 가계부 수입·지출에 포함되지 않습니다.
          </p>
        )}
        <Pagination
          offset={offset}
          total={data?.total || 0}
          onChange={setOffset}
        />
      </section>
    </>
  );
}
export function AccountsView(p: Props) {
  const { data, error, loading } =
    useMoneyData<AccountBalance[]>("/account-balances");
  const [search, setSearch] = useState("");
  return (
    <>
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
      <LoadState error={error} loading={false} />
      {Object.entries(roles).map(([role, label]) => {
        const accounts = p.accounts.filter(
          (a) =>
            a.role === role &&
            (a.displayName + (providers[a.provider] || a.provider)).includes(
              search,
            ),
        );
        return accounts.length ? (
          <section className="money-card money-account-group" key={role}>
            <h2>
              {label}
              <small>{accounts.length}개 계좌</small>
            </h2>
            {accounts.map((a) => {
              const b = data?.find((b) => b.account.id === a.id)?.balance;
              return (
                <button
                  key={a.id}
                  className={
                    "money-account-row " +
                    (p.selected === a.id ? "selected" : "")
                  }
                  onClick={() => p.select({ kind: "account", value: a })}
                >
                  <AccountIcon account={a} />
                  <span>
                    <strong>{a.displayName}</strong>
                    <small>
                      {providers[a.provider] || a.provider} ·{" "}
                      {a.suffix
                        ? "•• " + a.suffix
                        : a.maskedReference || "현금 / 힌트 미설정"}
                      {a.archived ? " · 보관됨" : ""}
                    </small>
                  </span>
                  <span className="money-number">
                    <strong>
                      {b
                        ? won(b.amount)
                        : loading
                          ? "잔액 확인 중…"
                          : "확인 필요"}
                    </strong>
                    {b && (
                      <small>
                        {provenance(b)}
                        {b.asOf ? " · " + seoul(b.asOf).slice(0, 10) : ""}
                      </small>
                    )}
                  </span>
                  <span>
                    {a.includeInAssets === false ? "자산 제외" : "자산 포함"}
                    <small>
                      {a.includeInStatistics === false
                        ? "통계 제외"
                        : "통계 포함"}
                    </small>
                  </span>
                  <span>›</span>
                </button>
              );
            })}
          </section>
        ) : null;
      })}
    </>
  );
}
export function LoansView(p: Props) {
  const { data, error, loading } = useMoneyData<Loan[]>("/loans");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const filtered =
    data?.filter(
      (l) =>
        (!status || l.status === status) &&
        (l.name + l.lender).includes(search),
    ) || [];
  return (
    <>
      <div className="money-kpis bookkeeping">
        <Metric
          label="남은 원금 · 현재 수동 확인"
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
      <section className="money-card">
        <div className="money-toolbar">
          <input
            aria-label="대출 검색"
            value={search}
            placeholder="대출명, 금융사 검색"
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="대출 상태"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">전체 상태</option>
            <option value="ACTIVE">상환 중</option>
            <option value="COMPLETED">완료</option>
          </select>
          <button
            className="money-primary"
            onClick={() => p.select({ kind: "loan", value: null })}
          >
            + 대출 추가
          </button>
        </div>
        <LoadState error={error} loading={loading && !data} />
        <div className="money-table-scroll">
          <table aria-label="Loans">
            <thead>
              <tr>
                {[
                  "금융사",
                  "대출명",
                  "남은 원금",
                  "월 납부액",
                  "금리",
                  "다음 납부일",
                  "상태",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  className={p.selected === l.id ? "selected" : ""}
                  onClick={() => p.select({ kind: "loan", value: l })}
                >
                  <td>{l.lender}</td>
                  <td>
                    <button
                      className="money-row-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.select({ kind: "loan", value: l });
                      }}
                    >
                      {l.name}
                    </button>
                    <small>
                      {l.type} · 확인 {seoul(l.updatedAt).slice(0, 10)}
                    </small>
                  </td>
                  <td>{won(l.remainingPrincipal)}</td>
                  <td>
                    {l.monthlyPayment == null
                      ? "미설정"
                      : won(l.monthlyPayment)}
                  </td>
                  <td>
                    {l.interestRate == null ? "미설정" : l.interestRate + "%"}
                  </td>
                  <td>{l.nextDueDate || "미설정"}</td>
                  <td>{l.status === "ACTIVE" ? "상환 중" : "완료"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="money-muted">
          대출은 자산 계좌와 별도로 관리합니다. 은행 거래에서 원금·이자를 임의
          배분하지 않습니다.
        </p>
      </section>
    </>
  );
}
type ReviewData = {
  raw: Raw[];
  uncategorized: Transaction[];
  balanceIssues: { accountId: string; difference: number }[];
  total: number;
  deferredIds: string[];
};
export function ReviewView(p: Props) {
  const [offset, setOffset] = useState(0);
  const { data, error, loading } = useMoneyData<ReviewData>(
    "/review?limit=50&offset=" + offset,
  );
  return (
    <section className="money-card">
      <h2>검토 대기</h2>
      <LoadState error={error} loading={loading && !data} />
      <div className="money-table-scroll">
        <table aria-label="Review Required">
          <thead>
            <tr>
              <th>수신 시각</th>
              <th>은행</th>
              <th>검토 항목</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {data?.raw.map((r) => (
              <tr
                key={r.id}
                className={p.selected === r.id ? "selected" : ""}
                onClick={() => p.select({ kind: "review", value: r })}
              >
                <td>{seoul(r.receivedAt).replace("T", " ")}</td>
                <td>{r.sourcePackage}</td>
                <td>
                  <button
                    className="money-row-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.select({ kind: "review", value: r });
                    }}
                  >
                    {r.title || "해석 확인 필요"}
                  </button>
                  <small>{r.processingReason}</small>
                </td>
                <td>
                  {data.deferredIds?.includes(r.id)
                    ? "보류"
                    : r.state === "FAILED"
                      ? "처리 재시도 필요"
                      : "새 항목"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.uncategorized.map((t) => (
        <button
          className="money-review-item"
          key={t.id}
          onClick={() => p.select({ kind: "transaction", value: t })}
        >
          카테고리 확인 · {txTitle(t, p.accounts)} · {won(t.amount)}
        </button>
      ))}
      {data?.balanceIssues.map((b) => (
        <button
          className="money-review-item"
          key={b.accountId}
          onClick={() => {
            const a = p.accounts.find((a) => a.id === b.accountId);
            if (a) p.select({ kind: "account", value: a });
          }}
        >
          잔액 확인 ·{" "}
          {p.accounts.find((a) => a.id === b.accountId)?.displayName} · 차이{" "}
          {won(b.difference)}
        </button>
      ))}
      {data && !data.total && (
        <p className="money-empty">검토할 항목이 없습니다.</p>
      )}
      <Pagination
        offset={offset}
        total={data?.total || 0}
        onChange={setOffset}
      />
    </section>
  );
}
export function SettingsView(p: Props) {
  const { data, error, loading } = useMoneyData<Rule[]>("/category-rules");
  return (
    <>
      <section className="money-card">
        <h2>연결 및 수집</h2>
        <details>
          <summary>Android Bridge 연결 · 기기 상태</summary>
          <BridgeConnection />
        </details>
        <p className="money-muted">
          은행 허용 목록은 휴대폰 MONEY Bridge에서 직접 선택합니다. 현재 지원:
          신한 · 기업 · 우리 · 카카오뱅크.
        </p>
      </section>
      <section className="money-card">
        <div className="money-toolbar">
          <h2>카테고리 · 제목 / 메모 기본값</h2>
          <button
            className="money-primary"
            onClick={() => p.select({ kind: "rule", value: null })}
          >
            + 규칙 추가
          </button>
        </div>
        <p className="money-muted">
          정확히 일치하는 거래처에 새 소비 거래의 기본값을 적용합니다. 기존
          거래와 가계부 수정값은 덮어쓰지 않습니다.
        </p>
        <LoadState error={error} loading={loading && !data} />
        <div className="money-table-scroll">
          <table aria-label="카테고리 규칙">
            <thead>
              <tr>
                <th>거래처 조건</th>
                <th>카테고리</th>
                <th>기본 제목</th>
                <th>활성</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => (
                <tr
                  key={r.id}
                  className={p.selected === r.id ? "selected" : ""}
                  onClick={() => p.select({ kind: "rule", value: r })}
                >
                  <td>
                    <button
                      className="money-row-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.select({ kind: "rule", value: r });
                      }}
                    >
                      {r.merchant}
                    </button>
                  </td>
                  <td>
                    {p.categories.find((c) => c.id === r.categoryId)?.name}
                  </td>
                  <td>{r.titleDefault || "자동 제목"}</td>
                  <td>{r.enabled === false ? "꺼짐" : "사용 중"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="money-card">
        <div className="money-toolbar">
          <h2>카테고리</h2>
          <button onClick={() => p.select({ kind: "category", value: null })}>
            + 카테고리 추가
          </button>
        </div>
        <div className="money-category-list">
          {p.categories.map((c) => (
            <button
              key={c.id}
              className={p.selected === c.id ? "selected" : ""}
              onClick={() => p.select({ kind: "category", value: c })}
            >
              <i style={{ background: c.color }} />
              {c.name}
              {c.archived ? " · 보관됨" : ""}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  type Account,
  type Category,
  type Transaction,
  type Rule,
  type Raw,
  providers,
  won,
  seoul,
} from "@/lib/money/model";
import { type Period } from "@/lib/money/period";
import {
  useMoneyData,
  LoadState,
  type BookRow,
  type BookPage,
  type Loan,
} from "./MoneyWebData";
import BridgeConnection from "./BridgeConnection";

export type Selection =
  | { kind: "account"; value: Account | null; action?: "INITIAL_BALANCE" | "BALANCE_ADJUSTMENT" }
  | { kind: "transaction"; value: Partial<Transaction> | null }
  | { kind: "book"; value: BookRow }
  | { kind: "loan"; value: Loan | null }
  | { kind: "review"; value: Raw }
  | { kind: "rule"; value: Rule | null }
  | { kind: "category"; value: Category | null };
export type Props = {
  ready?: boolean;
  navigate?: (url: string) => void;
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
export function AccountLabel({
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
export function Pagination({
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
export function BookkeepingView(p: Props) {
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [includeExcluded, setIncludeExcluded] = useState(false);
  const periodKey = dates(p.period);
  const [lastPeriod, setLastPeriod] = useState(periodKey);
  if (lastPeriod !== periodKey) { setLastPeriod(periodKey); setOffset(0); }
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (search === query) return;
    const timer = window.setTimeout(() => { setQuery(search); setOffset(0); }, 225);
    return () => window.clearTimeout(timer);
  }, [search, query]);
  // Commit query + page together. Typing on page 2 must not request page 1 of the old search.
  const { data, error, loading } = useMoneyData<BookPage>(
    "/bookkeeping?" +
      dates(p.period) +
      `&kind=${kind}&search=${encodeURIComponent(query)}&limit=50&offset=${offset}&includeExcluded=${includeExcluded}`,
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
      <LoadState error={error} loading={loading} />
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
      <LoadState error={error} loading={loading} />
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
        <LoadState error={error} loading={loading} />
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

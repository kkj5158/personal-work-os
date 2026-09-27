"use client";
import { useEffect, useRef, useState } from "react";
import { type Account, moneyApi as api, seoul, won } from "@/lib/money/model";
import { type MeaningKind, type Tracking } from "@/lib/money/meaning";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { useMoneyData, LoadState, type BookPage } from "./MoneyWebData";
import { FilterButtons } from "./MoneyFinancialViews";
import { AccountLabel, Pagination, type Props } from "./MoneyWebViews";

export function Bookkeeping(p: Props) {
  const [kind, setKind] = useMoneyViewState<MeaningKind>(
    "book-kind",
    () => "EXPENSE",
  );
  const [open, setOpen] = useState(false);
  const tracking = useMoneyData<Tracking>("/tracking");
  return (
    <>
      <div className="money-toolbar">
        <div className="meaning-tabs" role="tablist" aria-label="가계부 유형">
          {(["EXPENSE", "INCOME"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {k === "EXPENSE" ? "지출" : "수입"}
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(true)}>추적 계좌 설정</button>
        <span className="money-muted">
          선택한 계좌의 생활 기록 · 원장은 유지됩니다
        </span>
      </div>
      <LoadState error={tracking.error} loading={tracking.loading} />
      <BookkeepingList key={kind} {...p} kind={kind} tracking={tracking.data} />
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
  p: Props & { kind: MeaningKind; tracking: Tracking | null },
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
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setOffset(0);
    }, 225);
    return () => clearTimeout(timer);
  }, [search]);
  const ranges = [
    { id: "all", label: "전체 금액", min: "", max: "" },
    { id: "small", label: "1만원 미만", min: "", max: "9999.99" },
    { id: "medium", label: "1–5만원", min: "10000", max: "49999.99" },
    { id: "large", label: "5만원 이상", min: "50000", max: "" },
  ];
  const amount = ranges.find((r) => r.id === range) ?? ranges[0];
  const query = new URLSearchParams({
    from: p.period.from,
    to: p.period.to,
    kind: p.kind,
    search: debounced,
    limit: "50",
    offset: String(offset),
  });
  if (accountIds) query.set("accountIds", accountIds.join(",") || "none");
  if (categoryIds) query.set("categoryIds", categoryIds.join(",") || "none");
  if (amount.min) query.set("minAmount", amount.min);
  if (amount.max) query.set("maxAmount", amount.max);
  const result = useMoneyData<BookPage>("/bookkeeping?" + query);
  const data = result.data;
  const ids = p.tracking?.[p.kind === "EXPENSE" ? "expense" : "income"] ?? [];
  const tracked = p.accounts.filter((a) => ids.includes(a.id) && !a.archived);
  const categories = p.categories.filter((c) => c.kind === p.kind);
  const categoryOptions = [
    { id: "uncategorized", label: "미분류" },
    ...categories.map((c) => ({
      id: c.id,
      label: (c.emoji ? c.emoji + " " : "") + c.name,
    })),
  ];
  const amountClass =
    p.kind === "EXPENSE" ? "meaning-expense" : "meaning-income";
  if (!p.ready) return <LoadState loading={true} error="" />;
  return (
    <section aria-label={p.kind === "EXPENSE" ? "지출 가계부" : "수입 가계부"}>
      <div className="money-filter-rows">
        <FilterButtons
          label="카테고리"
          options={categoryOptions}
          value={categoryIds}
          onChange={(v) => {
            setCategories(v);
            setOffset(0);
          }}
        />
        <FilterButtons
          label="추적 계좌"
          options={tracked.map((a) => ({ id: a.id, label: a.displayName }))}
          value={accountIds}
          onChange={(v) => {
            setAccounts(v);
            setOffset(0);
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
                setRange(r.id);
                setOffset(0);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="money-toolbar">
        <input
          aria-label="가계부 검색"
          placeholder="제목, 메모, 거래처 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{data?.total ?? 0}건</span>
        <strong className={amountClass}>
          {p.kind === "EXPENSE" ? "순지출" : "수입 합계"}{" "}
          {won(data?.summary.total ?? 0)}
        </strong>
      </div>
      <LoadState error={result.error} loading={result.loading} />
      {p.tracking && !tracked.length && (
        <p className="meaning-notice">
          추적 계좌 설정에서 {p.kind === "EXPENSE" ? "지출" : "수입"} 계좌를
          선택하세요. 새 계좌는 자동 선택되지 않습니다.
        </p>
      )}
      <div className="money-table-wrap">
        <table className="money-table meaning-ledger">
          <thead>
            <tr>
              <th>날짜</th>
              <th>제목</th>
              <th>메모</th>
              <th>카테고리</th>
              <th>{p.kind === "EXPENSE" ? "결제 계좌" : "입금 계좌"}</th>
              <th>{p.kind === "EXPENSE" ? "거래처" : "수입원"}</th>
              <th className="number">금액</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                aria-selected={p.selected === row.id}
                onClick={() => p.select({ kind: "book", value: row })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") p.select({ kind: "book", value: row });
                }}
              >
                <td>{seoul(row.occurredAt).slice(0, 10)}</td>
                <td>{row.title}</td>
                <td className="money-muted">{row.memo || "—"}</td>
                <td>
                  {categories.find((c) => c.id === row.categoryId)?.name ||
                    "미분류"}
                </td>
                <td>
                  <AccountLabel id={row.accountId} accounts={p.accounts} />
                </td>
                <td>{row.counterpartyText || "—"}</td>
                <td className={"number " + amountClass}>
                  {p.kind === "EXPENSE"
                    ? row.type === "REFUND"
                      ? "+"
                      : "−"
                    : "+"}
                  {won(row.amount)}
                </td>
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
        onChange={setOffset}
      />
      <div className="meaning-analysis">
        <section>
          <h3>카테고리 구성</h3>
          {Object.entries(
            (data?.composition ?? []).reduce<Record<string, number>>((m, r) => {
              const key = r.categoryId || "uncategorized";
              m[key] = (m[key] || 0) + r.amount;
              return m;
            }, {}),
          ).map(([id, value]) => (
            <div className="meaning-composition" key={id}>
              <span>
                {categories.find((c) => c.id === id)?.name || "미분류"}
              </span>
              <span className={amountClass}>{won(value)}</span>
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
      </div>
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

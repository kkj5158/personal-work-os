"use client";
import { CategoryFilters, CategoryPicker } from "./MoneyCategoryPicker";
import { categoryIndex, categoryTotals } from "@/lib/money/categories";
import { useEffect, useRef, useState } from "react";
import { type Account, type Category, moneyApi as api, seoul, won } from "@/lib/money/model";
import { type MeaningKind, type Tracking } from "@/lib/money/meaning";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { useMoneyData, LoadState, type BookPage, type BookRow, type BookFields } from "./MoneyWebData";
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
              onClick={() => {
                if (kind !== k && p.changeContext?.() !== false) setKind(k);
              }}
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
      <BookkeepingList
        key={`${kind}:${p.period.from}:${p.period.to}`}
        {...p}
        kind={kind}
        tracking={tracking.data}
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
  const cache = useMoneyCache();
  // Latest server versions from inline saves, so consecutive edits on one row never reuse a stale version.
  const [fresh, setFresh] = useState<Record<string, BookRow>>({});
  const latest = (row: BookRow) => {
    const known = fresh[row.id];
    return known && known.version >= row.version ? known : row;
  };
  // A row clicked while the list refreshes carries stale versions. Instead of dropping the click,
  // open it as soon as the fresh row arrives.
  const pendingOpen = useRef<string | null>(null);
  const select = p.select;
  const openRow = (row: BookRow) => {
    if (result.loading) pendingOpen.current = row.id;
    else select({ kind: "book", value: row });
  };
  useEffect(() => {
    if (!pendingOpen.current || result.loading) return;
    const row = data?.items.find((r) => r.id === pendingOpen.current);
    pendingOpen.current = null;
    if (row) select({ kind: "book", value: row });
  }, [result.loading, data, select]);
  async function saveInline(row: BookRow, patch: Partial<BookFields>) {
    const base = latest(row);
    const saved = await api.put<BookRow>("/bookkeeping/" + row.id, {
      expectedVersion: base.version,
      expectedTransactionVersion: base.transactionVersion,
      expectedProjectionVersion: base.projectionVersion,
      overrides: { ...base.overrides, ...patch },
    });
    setFresh((old) => ({ ...old, [row.id]: saved }));
    cache.mutate("book");
  }
  const ids = p.tracking?.[p.kind === "EXPENSE" ? "expense" : "income"] ?? [];
  const tracked = p.accounts.filter((a) => ids.includes(a.id) && !a.archived);
  const categories = p.categories.filter((c) => c.kind === p.kind);
  const categoryTree = categoryIndex(categories);
  const amountClass =
    p.kind === "EXPENSE" ? "meaning-expense" : "meaning-income";
  if (!p.ready) return <LoadState loading={true} error="" />;
  return (
    <section aria-label={p.kind === "EXPENSE" ? "지출 가계부" : "수입 가계부"}>
      <div className="money-filter-rows">
        <CategoryFilters categories={categories} value={categoryIds} onChange={v=>{setCategories(v);setOffset(0);}} />
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
                tabIndex={result.loading ? -1 : 0}
                aria-disabled={result.loading}
                aria-selected={p.selected === row.id}
                onClick={() => openRow(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openRow(row);
                }}
              >
                <td>{seoul(row.occurredAt).slice(0, 10)}</td>
                {p.selected === row.id ? (
                  <>
                    <td>{row.title}</td>
                    <td className="money-muted">{row.memo || "—"}</td>
                    <td>{categoryTree.path(row.categoryId)}</td>
                  </>
                ) : (
                  <>
                    <td onClick={(e) => e.stopPropagation()}>
                      <InlineText label={`${latest(row).title} 제목`} value={latest(row).title} required onSave={(v) => saveInline(row, { title: v ?? "" })} />
                    </td>
                    <td className="money-muted" onClick={(e) => e.stopPropagation()}>
                      <InlineText label={`${latest(row).title} 메모`} value={latest(row).memo ?? ""} onSave={(v) => saveInline(row, { memo: v })} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <InlineCategory
                        label={`${row.title} 카테고리`}
                        value={latest(row).categoryId}
                        categories={categories}
                        onSave={(id) => saveInline(row, { categoryId: id })}
                      />
                    </td>
                  </>
                )}
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
function InlineText({ value, label, required, onSave }: { value: string; label: string; required?: boolean; onSave: (v: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [state, setState] = useState<"idle" | "saving" | "error">("idle"),
    [error, setError] = useState("");
  const cell = useRef<HTMLDivElement>(null);
  // Disabling the input while saving blurs it; the blur must not start a second save.
  const busy = useRef(false);
  const shown = editing || state === "error" ? draft : value;
  async function commit(step?: 1 | -1) {
    if (busy.current) return;
    const next = draft.trim();
    if (next === (value ?? "").trim()) {
      setEditing(false);
      setState("idle");
      if (step) setTimeout(() => moveInline(cell.current, step));
      return;
    }
    if (required && !next) {
      setState("error");
      setError("필수 항목입니다.");
      return;
    }
    busy.current = true;
    setState("saving");
    try {
      await onSave(next || null);
      setState("idle");
      setError("");
      setEditing(false);
      if (step) setTimeout(() => moveInline(cell.current, step));
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      busy.current = false;
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
          disabled={state === "saving"}
          aria-invalid={state === "error"}
          onChange={(e) => setDraft(e.target.value)}
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
              e.preventDefault();
              setDraft(value);
              setState("idle");
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
            setDraft(value);
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
function InlineCategory({ value, label, categories, onSave }: { value: string | null; label: string; categories: Category[]; onSave: (id: string | null) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle"),
    [error, setError] = useState(""),
    [pending, setPending] = useState<string | null | undefined>(undefined);
  return (
    <div className="money-inline-cell" data-state={state} title={error || undefined}>
      <CategoryPicker
        label={label}
        value={(pending === undefined ? value : pending) ?? ""}
        categories={categories}
        onChange={async (id) => {
          const next = id || null;
          if (next === value) return;
          setPending(next);
          setState("saving");
          try {
            await onSave(next);
            setPending(undefined);
            setState("idle");
            setError("");
          } catch (e) {
            setPending(undefined);
            setState("error");
            setError(e instanceof Error ? e.message : "저장 실패");
          }
        }}
      />
      {state === "error" && <small role="alert">{error}</small>}
    </div>
  );
}

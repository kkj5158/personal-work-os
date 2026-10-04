"use client";
import { CategoryFilters, CategoryPicker } from "./MoneyCategoryPicker";
import { amountPresets, validateAmountRange } from "@/lib/money/bookkeepingRange";
import { moneyAmount } from "@/lib/money/accounts";
import "./money-bookkeeping.css";
import { categoryIndex, categoryTotals } from "@/lib/money/categories";
import { useEffect, useRef, useState } from "react";
import { type Account, type Category, moneyApi as api, seoul, won } from "@/lib/money/model";
import { type MeaningKind, type Tracking } from "@/lib/money/meaning";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { useMoneyData, LoadState, type BookPage, type BookRow, type BookFields } from "./MoneyWebData";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
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
  });
  if (accountIds) query.set("accountIds", accountIds.join(",") || "none");
  if (categoryIds) query.set("categoryIds", categoryIds.join(",") || "none");
  if (amount.min) query.set("minAmount", amount.min);
  if (amount.max) query.set("maxAmount", amount.max);
  const result = useMoneyData<CurrencyBookPage>("/bookkeeping?" + query);
  const data = result.data;
  const cache = useMoneyCache();
  // Latest server versions from inline saves, so consecutive edits on one row never reuse a stale version.
  const [fresh, setFresh] = useState<Record<string, BookRow>>({});
  const needsRefresh = useRef(new Set<string>());
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
    let base = latest(row);
    if (needsRefresh.current.has(row.id)) {
      base = await api.get<BookRow>("/bookkeeping/" + row.id);
      setFresh(old => ({ ...old, [row.id]: base }));
      needsRefresh.current.delete(row.id);
    }
    try {
    const saved = await api.put<BookRow>("/bookkeeping/" + base.id, {
      expectedVersion: base.version,
      expectedTransactionVersion: base.transactionVersion,
      expectedProjectionVersion: base.projectionVersion,
      overrides: { ...base.overrides, ...patch },
    });
    setFresh((old) => ({ ...old, [row.id]: saved }));
    cache.mutate("book");
    } catch (error) {
      // Re-read the bound entity after conflicts or unknown network outcomes before another save.
      needsRefresh.current.add(base.id);
      try {
        const current = await api.get<BookRow>("/bookkeeping/" + base.id);
        setFresh(old => ({ ...old, [base.id]: current }));
        cache.mutate("book");
        needsRefresh.current.delete(base.id);
        if (Object.entries(patch).every(([key, value]) => current[key as keyof BookFields] === value)) return;
      } catch { /* The original failure remains visible and the draft is retained. */ }
      throw error;
    }
  }
  const ids = p.tracking?.[p.kind === "EXPENSE" ? "expense" : "income"] ?? [];
  const tracked = p.accounts.filter((a) => ids.includes(a.id) && !a.archived);
  const categories = p.categories.filter((c) => c.kind === p.kind);
  const amountClass =
    p.kind === "EXPENSE" ? "meaning-expense" : "meaning-income";
  if (!p.ready) return <LoadState loading={true} error="" />;
  return (
    <section aria-label={p.kind === "EXPENSE" ? "지출 가계부" : "수입 가계부"}>
      <div className="money-toolbar money-book-toolbar">
        <div className="meaning-tabs" role="tablist" aria-label="가계부 유형">{(["EXPENSE", "INCOME"] as const).map(k => <button key={k} role="tab" aria-selected={p.kind === k} className={p.kind === k ? "active" : ""} onClick={() => p.onKind(k)}>{k === "EXPENSE" ? "소비" : "수입"}</button>)}</div>
        <input aria-label="가계부 검색" placeholder="제목, 메모, 거래처 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <span>{data?.total ?? 0}건</span>
        <strong className={amountClass}>{p.kind === "EXPENSE" ? "순지출" : "수입 합계"} {data?.analyticsUnavailable || data?.summary.total === null ? "통화별 확인 필요" : data ? won(data.summary.total) : "—"}</strong>
        <button className="money-book-tracking" onClick={p.onTracking}>추적 계좌 설정</button>
      </div>
      <div className="money-filter-rows">
        <button className="money-book-reset" onClick={() => { setSearch(""); setAccounts(null); setCategories(null); setRange("all"); setCustom({ min: "", max: "" }); setAmountDraft({ min: "", max: "" }); setRangeError(""); setOffset(0); }}>조건 초기화</button>
        <CategoryFilters categories={categories} value={categoryIds} onChange={v=>{setCategories(v);setOffset(0);}} />
        <GroupedAccountFilter
          accounts={tracked}
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
          <form className="money-book-range" onSubmit={e => {
            e.preventDefault();
            const error = validateAmountRange(amountDraft.min, amountDraft.max);
            setRangeError(error);
            if (!error) { setCustom(amountDraft); setRange("custom"); setOffset(0); }
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
      <LoadState error={result.error} loading={result.loading} />
      {data?.analyticsUnavailable && <p className="meaning-notice">{data.hasMixedCurrencies ? "여러 통화의 거래가 함께 있습니다." : "KRW 이외 통화의 거래가 있습니다."} 환율 정보가 없어 합계와 기간 분석을 표시하지 않습니다. 금액 범위는 KRW 거래 기준입니다. {data.currencies?.join(" · ")}</p>}
      {p.tracking && !tracked.length && (
        <p className="meaning-notice">
          추적 계좌 설정에서 {p.kind === "EXPENSE" ? "지출" : "수입"} 계좌를
          선택하세요. 새 계좌는 자동 선택되지 않습니다.
          <button onClick={p.onTracking}>추적 계좌 설정</button>
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
                  if (e.key === "Enter" && e.target === e.currentTarget) openRow(row);
                }}
              >
                <td>{seoul(row.occurredAt).slice(0, 10)}<small className="money-muted">{row.type === "REFUND" ? "환불" : p.kind === "EXPENSE" ? "소비" : "수입"}{row.excluded && " · 통계 제외"}</small></td>
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
                  {moneyAmount(row.amount, row.currency || "KRW")}
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
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle"),
    [error, setError] = useState(""),
    [pending, setPending] = useState<string | null | undefined>(undefined),
    [draft, setDraft] = useState<string | null | undefined>(undefined);
  const busy = useRef(false);
  async function commit(next: string | null) {
    if (busy.current || next === value) return;
    busy.current = true;
    setDraft(next); setPending(next); setState("saving"); setError("");
    try { await onSave(next); setPending(undefined); setDraft(undefined); setState("saved"); }
    catch (e) { setPending(undefined); setState("error"); setError(e instanceof Error ? e.message : "저장 실패"); }
    finally { busy.current = false; }
  }
  return (
    <div className="money-inline-cell" data-state={state} title={error || undefined}>
      <fieldset disabled={state === "saving"} className="money-book-category-field">
      <CategoryPicker
        label={label}
        value={(pending === undefined ? value : pending) ?? ""}
        categories={categories}
        onChange={id => void commit(id || null)}
      />
      <p className="money-muted">가계부 수정은 감사 이력에 남습니다. AI의 확정 학습은 검토 화면의 분류 확정으로 저장합니다.</p>
      </fieldset>
      {state === "saving" && <small role="status">저장 중…</small>}
      {state === "saved" && <small role="status">저장됨</small>}
      {state === "error" && <><small role="alert">{error} 현재: {categoryIndex(categories).path(value)} · 선택 초안: {categoryIndex(categories).path(draft)}</small><button onClick={() => draft !== undefined && void commit(draft)}>최신값으로 재시도</button><button onClick={() => { setDraft(undefined); setState("idle"); setError(""); }}>초안 취소</button></>}
    </div>
  );
}

"use client";
import { CategoryPicker } from "./MoneyCategoryPicker";
import { useContext, useEffect, useRef, useState } from "react";
import {
  moneyApi as api,
  kinds,
  seoul,
  won,
  accountName,
  type Transaction,
  type Attempt,
  type Raw,
} from "@/lib/money/model";
import {
  type ReviewItem,
  type ReviewLane,
  reviewReasons,
  ignoredReasons,
  reviewStages,
  resolveAccountHint,
  rangeSelection,
  draftRule,
} from "@/lib/money/meaning";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { FilterButtons } from "./MoneyFinancialViews";
import { AccountLabel, Pagination, type Props } from "./MoneyWebViews";
import {
  EditorForm,
  RawEvidence,
  type Props as EditorProps,
} from "./MoneyEditors";
import { Field, EntryForm, AccountOptions } from "./MoneyForms";
import { MoneyPanel, PanelContext } from "./MoneyPanel";
import { useSearchParams } from "next/navigation";
import { AiWorkbench, AiTransfers } from "./MoneyAiWorkspace";
type Draft = {
  title?: string;
  memo?: string | null;
  categoryId?: string | null;
};
type Lane = ReviewLane | "IGNORED";
const laneLabels: Record<Lane, string> = {
  DECISION: "판단 필요",
  FORMAT: "알림 형식 확인",
  IGNORED: "무시된 알림",
};
export function ReviewWorkbench(p: Props) {
  const query = useSearchParams();
  const [mode, setMode] = useMoneyViewState("review-workspace-mode", () => "ai");
  const active = query.get("legacy") === "1" ? "legacy" : query.get("ai") === "transfers" ? "transfers" : mode;
  return <><div className="money-toolbar meaning-tabs" role="tablist" aria-label="검토 작업대"><button role="tab" aria-selected={active === "ai"} onClick={() => { if (p.changeContext?.() !== false) { setMode("ai"); if (query.size) p.navigate?.("/money/review"); } }}>AI 검토 워크벤치</button><button role="tab" aria-selected={active === "transfers"} onClick={() => { if (p.changeContext?.() !== false) { setMode("transfers"); if (query.size) p.navigate?.("/money/review"); } }}>이체 매칭</button><button role="tab" aria-selected={active === "legacy"} onClick={() => { if (p.changeContext?.() !== false) { setMode("legacy"); if (query.size) p.navigate?.("/money/review"); } }}>기존 작업대 · 일괄 처리 / 진단</button></div>{active === "legacy" ? <LegacyReviewWorkbench {...p} /> : active === "transfers" ? <AiTransfers {...p} /> : <AiWorkbench {...p} />}</>;
}
function LegacyReviewWorkbench(p: Props) {
  const cache = useMoneyCache();
  const [lane, setLane] = useMoneyViewState<Lane>("review-lane", () => "DECISION");
  const [filters, setFilters] = useMoneyViewState<{
    reasons: string[] | null;
    accountIds: string[] | null;
    types: string[] | null;
    states: string[] | null;
    minAmount: string;
    maxAmount: string;
  }>("review-filters", () => ({
    reasons: null,
    accountIds: null,
    types: null,
    states: ["PENDING", "DEFERRED"],
    minAmount: "",
    maxAmount: "",
  }));
  const [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const anchor = useRef<string | null>(null);
  const draftBases = useRef<Record<string, ReviewItem>>({});
  const query = new URLSearchParams({ limit: "50", offset: String(offset) });
  if (lane !== "IGNORED") query.set("lane", lane);
  for (const [key, value] of Object.entries(filters)) {
    if (lane === "FORMAT" && key !== "states") continue;
    if (Array.isArray(value)) query.set(key, value.join(",") || "none");
    else if (value) query.set(key, value);
  }
  const result = useMoneyData<{
    items: ReviewItem[];
    total: number;
    reasons?: string[];
    lanes?: Record<ReviewLane, number>;
  }>(lane === "IGNORED" ? null : "/review/queue?" + query);
  const counts = useMoneyData<{ lanes?: Record<ReviewLane, number> }>(
    lane === "IGNORED" ? "/review/queue?limit=1&offset=0" : null,
  );
  const lanes = result.data?.lanes ?? counts.data?.lanes;
  const rows = lane === "IGNORED" ? [] : (result.data?.items ?? []);
  // Keep the working position: after a save, the next row at the same position is selected.
  const position = useRef(0);
  const selectedIndex = rows.findIndex((r) => r.id === p.selected);
  useEffect(() => {
    if (selectedIndex >= 0) position.current = selectedIndex;
  }, [selectedIndex]);
  const advanceRequest = useRef<{ token: number; data: unknown } | null>(null);
  useEffect(() => {
    if (p.advance) advanceRequest.current = { token: p.advance, data: result.data };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.advance]);
  useEffect(() => {
    const request = advanceRequest.current;
    if (!request || result.loading || result.data === request.data) return;
    advanceRequest.current = null;
    const next = rows[Math.min(position.current, rows.length - 1)];
    if (next) p.select({ kind: "reviewItem", value: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data, result.loading]);
  const reasonOptions = [
    ...new Set([...(result.data?.reasons ?? []), ...rows.map((r) => r.reason)]),
  ].map((id) => ({ id, label: reviewReasons[id] || id }));
  const eligible = rows.filter((r) =>
    lane === "FORMAT"
      ? r.kind === "RAW"
      : r.kind === "TRANSACTION" && r.reason === "CATEGORY_UNCONFIRMED" && r.state !== "COMPLETED",
  );
  function filter(key: keyof typeof filters, value: string[] | null | string) {
    setFilters({ ...filters, [key]: value });
    setOffset(0);
    setSelected([]);
  }
  function switchLane(next: Lane) {
    if (next === lane || p.changeContext?.() === false) return;
    setLane(next);
    setOffset(0);
    setSelected([]);
  }
  async function complete(items: ReviewItem[]) {
    if (
      !items.length ||
      !window.confirm(
        `현재 표시한 값 그대로 ${items.length}건을 검토 완료할까요? 규칙은 생성되지 않습니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.post("/review/complete", {
        items: items.map((r) => ({
          id: r.id,
          transactionVersion: (draftBases.current[r.id] ?? r).version,
          overrideVersion: (draftBases.current[r.id] ?? r).overrideVersion,
          projectionVersion: (draftBases.current[r.id] ?? r).projectionVersion,
          overrides: drafts[r.id] ?? {},
        })),
      });
      cache.mutate("reviewMeaning");
      setSelected([]);
      const completed = new Set(items.map((r) => r.id));
      setDrafts((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([id]) => !completed.has(id)),
        ),
      );
      for (const id of completed) delete draftBases.current[id];
    } catch (e) {
      setError(e instanceof Error ? e.message : "완료 실패");
    } finally {
      setBusy(false);
    }
  }
  async function ignore(items: ReviewItem[]) {
    if (
      !items.length ||
      !window.confirm(
        `${items.length}건을 거래가 아닌 알림으로 처리할까요? 원본은 보존되며 '무시된 알림'에서 되돌릴 수 있습니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.post("/review/ignore", {
        items: items.map((r) => ({ id: r.id, expectedVersion: r.version })),
      });
      cache.mutate("review");
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  const patch = (r: ReviewItem, next: Draft) => {
    draftBases.current[r.id] ??= r;
    setDrafts((old) => ({ ...old, [r.id]: { ...old[r.id], ...next } }));
  };
  if (!p.ready) return <LoadState loading={true} error="" />;
  const selectedRows = eligible.filter((r) => selected.includes(r.id));
  return (
    <section className="money-card meaning-review">
      <div className="money-section-heading">
        <h2>검토 대기 작업대</h2>
        <span>{lane === "IGNORED" ? "" : `${result.data?.total ?? 0}건`}</span>
      </div>
      <div className="money-lane-tabs" role="tablist" aria-label="검토 구분">
        {(["DECISION", "FORMAT", "IGNORED"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={lane === id}
            onClick={() => switchLane(id)}
          >
            {laneLabels[id]}
            {id !== "IGNORED" && lanes ? ` ${lanes[id] ?? 0}` : ""}
          </button>
        ))}
      </div>
      <p className="money-muted">
        {lane === "DECISION"
          ? "실제 금융 거래일 가능성이 높지만 계좌·이체 여부·분류를 사람이 판단해야 하는 항목입니다."
          : lane === "FORMAT"
            ? "거래 형식으로 읽지 못한 알림입니다. 거래가 아니면 무시하고, 거래라면 상세에서 직접 확인하세요. 원본은 항상 보존됩니다."
            : "자동 또는 직접 무시한 알림입니다. 금융 원장에는 반영되지 않았으며 언제든 검토로 되돌릴 수 있습니다."}
      </p>
      {lane === "IGNORED" ? (
        <IgnoredNotifications />
      ) : (
        <>
          {lane === "DECISION" && (
            <>
              <FilterButtons
                label="검토 사유"
                options={reasonOptions}
                value={filters.reasons}
                onChange={(v) => filter("reasons", v)}
              />
              <FilterButtons
                label="계좌"
                options={p.accounts
                  .filter((a) => !a.archived || filters.accountIds?.includes(a.id))
                  .map((a) => ({ id: a.id, label: a.displayName }))}
                value={filters.accountIds}
                onChange={(v) => filter("accountIds", v)}
              />
              <FilterButtons
                label="거래 유형"
                options={Object.entries(kinds).map(([id, label]) => ({ id, label }))}
                value={filters.types}
                onChange={(v) => filter("types", v)}
              />
            </>
          )}
          <FilterButtons
            label="상태"
            options={[
              { id: "PENDING", label: "대기" },
              { id: "DEFERRED", label: "보류" },
              { id: "COMPLETED", label: "완료" },
            ]}
            value={filters.states}
            onChange={(v) => filter("states", v)}
          />
          {lane === "DECISION" && (
            <div className="meaning-filter-row">
              <strong>금액 범위</strong>
              <input
                type="number"
                min="0"
                aria-label="검토 최소 금액"
                placeholder="최소"
                value={filters.minAmount}
                onChange={(e) => filter("minAmount", e.target.value)}
              />
              <span>~</span>
              <input
                type="number"
                min="0"
                aria-label="검토 최대 금액"
                placeholder="최대"
                value={filters.maxAmount}
                onChange={(e) => filter("maxAmount", e.target.value)}
              />
              <button
                onClick={() =>
                  setFilters({ ...filters, minAmount: "", maxAmount: "" })
                }
              >
                전체 금액
              </button>
            </div>
          )}
          <div className="money-toolbar">
            {lane === "DECISION" ? (
              <button
                disabled={busy || !selectedRows.length}
                className="money-primary"
                onClick={() => void complete(selectedRows)}
              >
                선택 {selectedRows.length}건 검토 완료
              </button>
            ) : (
              <>
                <button
                  disabled={busy || !selectedRows.length}
                  className="money-primary"
                  onClick={() => void ignore(selectedRows)}
                >
                  선택 {selectedRows.length}건 거래 아님으로 처리
                </button>
                <button
                  disabled={!rows.some((r) => r.noiseSuspected)}
                  onClick={() =>
                    setSelected(rows.filter((r) => r.noiseSuspected).map((r) => r.id))
                  }
                >
                  이 페이지의 비거래 의심 선택
                </button>
              </>
            )}
            <button disabled={!selected.length} onClick={() => setSelected([])}>
              선택 해제
            </button>
            <span className="money-muted">
              선택 {selectedRows.length}건 · 현재 페이지 기준 · Shift: 범위 · 체크: 개별 추가 · ↑↓: 항목 이동
            </span>
          </div>
          <LoadState error={error || result.error} loading={result.loading} />
          <div className="money-table-wrap">
            <table className="money-table meaning-ledger">
              <thead>
                <tr>
                  <th className="meaning-check-cell">
                    <input
                      aria-label="현재 페이지 선택"
                      type="checkbox"
                      checked={!!eligible.length && eligible.every((r) => selected.includes(r.id))}
                      onChange={(e) => setSelected(e.target.checked ? eligible.map((r) => r.id) : [])}
                    />
                  </th>
                  <th>일시</th>
                  <th>검토 사유</th>
                  <th>계좌 / 출처</th>
                  <th>제목</th>
                  <th>카테고리</th>
                  <th className="number">금액</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const allowed = eligible.some((e) => e.id === r.id);
                  const inlineMeaning = lane === "DECISION" && allowed;
                  const draft = drafts[r.id] ?? {};
                  const open = () => p.select({ kind: "reviewItem", value: { ...r, ...draft } });
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-selected={p.selected === r.id || selected.includes(r.id)}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter") open();
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          const sibling = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLTableRowElement | null;
                          if (sibling) {
                            sibling.focus();
                            sibling.click();
                          }
                        }
                      }}
                    >
                      <td
                        className="meaning-check-cell"
                        onClick={(e) => e.stopPropagation()}
                        onPointerEnter={(e) => {
                          if (e.buttons === 1 && allowed && anchor.current)
                            setSelected((old) => rangeSelection(old, eligible.map((x) => x.id), anchor.current, r.id));
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${r.title || r.reason} 선택`}
                          disabled={!allowed}
                          checked={selected.includes(r.id)}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              const start = anchor.current;
                              setSelected((old) => rangeSelection(old, eligible.map((x) => x.id), start, r.id));
                            }
                            anchor.current = r.id;
                          }}
                          onChange={(e) => {
                            if ((e.nativeEvent as MouseEvent).shiftKey) return;
                            const checked = e.target.checked;
                            setSelected((old) => (checked ? [...new Set([...old, r.id])] : old.filter((id) => id !== r.id)));
                          }}
                        />
                      </td>
                      <td>{seoul(r.occurredAt)}</td>
                      <td>
                        {reviewReasons[r.reason] || r.reason}
                        {r.transferPartnerId && <span className="money-reason-badge">이체 짝 후보</span>}
                        {r.noiseSuspected && <span className="money-reason-badge warn">비거래 의심</span>}
                        <small>
                          {r.state === "COMPLETED" ? "완료" : r.state === "DEFERRED" ? "보류" : "검토 대기"}
                        </small>
                      </td>
                      <td>
                        <AccountLabel id={r.accountId} accounts={p.accounts} fallback={r.merchant || "확인 필요"} />
                      </td>
                      <td onClick={(e) => inlineMeaning && e.stopPropagation()}>
                        {inlineMeaning ? (
                          <input
                            aria-label={`${r.id} 검토 제목`}
                            maxLength={240}
                            value={draft.title ?? r.title ?? ""}
                            onChange={(e) => patch(r, { title: e.target.value })}
                          />
                        ) : (
                          r.title || "제목 확인 필요"
                        )}
                      </td>
                      <td onClick={(e) => inlineMeaning && e.stopPropagation()}>
                        {inlineMeaning ? (
                          <CategoryPicker label={`${r.id} 검토 카테고리`} value={"categoryId" in draft ? draft.categoryId ?? "" : r.categoryId ?? ""} onChange={(id) => patch(r, { categoryId: id || null })} categories={p.categories.filter((c) => c.kind === r.type)} />
                        ) : (
                          p.categories.find((c) => c.id === r.categoryId)?.name || "—"
                        )}
                      </td>
                      <td className="number">{r.amount === null ? "미확인" : won(r.amount)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {inlineMeaning ? (
                          <button disabled={busy} onClick={() => void complete([r])}>
                            검토 완료
                          </button>
                        ) : (
                          <button onClick={open}>상세 확인</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && !result.loading && (
              <p className="money-empty">현재 조건에 검토 항목이 없습니다.</p>
            )}
          </div>
          <Pagination
            total={result.data?.total ?? 0}
            offset={offset}
            onChange={(value) => {
              setOffset(value);
              setSelected([]);
            }}
          />
          {lane === "DECISION" && <ReviewDiagnostics {...p} />}
        </>
      )}
    </section>
  );
}
function IgnoredNotifications() {
  const cache = useMoneyCache();
  const [offset, setOffset] = useState(0),
    [error, setError] = useState("");
  const data = useMoneyData<{
    items: { id: string; title: string | null; merchant: string | null; occurredAt: string; reason: string; version: number }[];
    total: number;
  }>(`/review/ignored?limit=50&offset=${offset}`);
  return (
    <>
      <LoadState error={error || data.error} loading={data.loading} />
      <div className="money-table-wrap">
        <table className="money-table meaning-ledger">
          <thead>
            <tr>
              <th>일시</th>
              <th>출처</th>
              <th>제목</th>
              <th>처리 근거</th>
              <th>처리</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.items.map((r) => (
              <tr key={r.id}>
                <td>{seoul(r.occurredAt)}</td>
                <td>{r.merchant || "—"}</td>
                <td>{r.title || "—"}</td>
                <td>{ignoredReasons[r.reason] || r.reason}</td>
                <td>
                  <button
                    onClick={async () => {
                      setError("");
                      try {
                        await api.post("/notifications/" + r.id + "/restore", { expectedVersion: r.version });
                        cache.mutate("review");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "복원 실패");
                      }
                    }}
                  >
                    검토로 되돌리기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.data && !data.data.items.length && <p className="money-empty">무시된 알림이 없습니다.</p>}
      </div>
      <Pagination total={data.data?.total ?? 0} offset={offset} onChange={setOffset} />
    </>
  );
}
function ReviewDiagnostics(p: Props) {
  const [open, setOpen] = useState(false);
  const data = useMoneyData<{
    balanceIssues: {
      accountId: string;
      expectedBalance: number;
      observedBalance: number;
      difference: number;
    }[];
  }>(open ? "/review/diagnostics" : null);
  return (
    <details
      className="meaning-history"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>잔액 불일치 진단 · 별도로 확인</summary>
      <p className="money-muted">
        은행이 알려준 잔액과 원장만으로 계산한 잔액이 다른 계좌입니다. 누락·중복 거래를 먼저 찾고, 설명되지 않는 차이만 Accounts의 잔액 대조에서 맞추세요.
      </p>
      <LoadState error={data.error} loading={data.loading} />
      {data.data?.balanceIssues.map((i) => (
        <button
          key={i.accountId}
          onClick={() => p.navigate?.("/money/accounts")}
        >
          {p.accounts.find((a) => a.id === i.accountId)?.displayName} · 원장{" "}
          {won(i.expectedBalance)} / 은행 {won(i.observedBalance)} · 차이{" "}
          {won(i.difference)}
        </button>
      ))}
      {data.data && !data.data.balanceIssues.length && (
        <p>현재 비교 가능한 잔액 불일치가 없습니다.</p>
      )}
    </details>
  );
}
function Stages({ item }: { item: ReviewItem }) {
  return (
    <ul className="money-review-stages" aria-label="처리 단계">
      {reviewStages(item).map((s) => (
        <li key={s.label} data-status={s.status}>
          <span>{s.label}</span>
          <strong>{s.detail}</strong>
        </li>
      ))}
    </ul>
  );
}
function SystemReason({ item }: { item: ReviewItem }) {
  return (
    <details>
      <summary>System Information</summary>
      <p>
        내부 사유 코드: <code>{item.reason}</code> · 구분 {item.lane ?? "—"} · 버전 {item.version}
      </p>
    </details>
  );
}
export function ReviewPanel(p: EditorProps & { value: ReviewItem }) {
  const r = p.value;
  if (r.kind === "RAW") return <RawReviewPanel {...p} />;
  if (r.reason === "POSSIBLE_INTERNAL_TRANSFER" && r.transferPartnerId)
    return <PostedPairPanel {...p} />;
  return <MeaningReviewPanel {...p} />;
}
function MeaningReviewPanel(p: EditorProps & { value: ReviewItem }) {
  const { setDirty } = useContext(PanelContext);
  const r = p.value;
  const [title, setTitle] = useState(r.title || ""),
    [memo, setMemo] = useState(r.memo || ""),
    [categoryId, setCategory] = useState(r.categoryId || "");
  const [error, setError] = useState("");
  if (r.reason !== "CATEGORY_UNCONFIRMED")
    return (
      <MoneyPanel title="금융 사실 확인" onClose={p.onClose}>
        <Stages item={r} />
        <p>
          연결 대상이나 상환 구성을 추정하지 않습니다. 원장의 전용 상세에서
          근거를 확인하세요.
        </p>
        <button
          onClick={async () => {
            try {
              const tx = await api.get<Transaction>("/transactions/" + r.id);
              p.select({ kind: "transaction", value: tx });
            } catch (e) {
              setError(e instanceof Error ? e.message : "불러오기 실패");
            }
          }}
        >
          거래 상세에서 확인
        </button>
        {error && <p role="alert">{error}</p>}
        <SystemReason item={r} />
      </MoneyPanel>
    );
  return (
    <EditorForm
      title="검토 항목 확인"
      onClose={p.onClose}
      onSave={async () => {
        await api.post("/review/complete", {
          items: [
            {
              id: r.id,
              transactionVersion: r.version,
              overrideVersion: r.overrideVersion,
              projectionVersion: r.projectionVersion,
              overrides: {
                title,
                memo: memo || null,
                categoryId: categoryId || null,
              },
            },
          ],
        });
        p.onSaved();
      }}
    >
      <p className="meaning-notice">
        표시한 가계부 값으로 검토를 완료합니다. 금융 원장 변경과 규칙 생성은
        하지 않습니다.
      </p>
      <strong>{r.amount === null ? "미확인" : won(r.amount)}</strong>
      <Field label="검토 제목">
        <input
          required
          maxLength={240}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="검토 카테고리">
        <CategoryPicker label="검토 카테고리" value={categoryId} onChange={(id) => { setCategory(id); setDirty(true); }} categories={p.categories.filter((c) => c.kind === r.type)} />
      </Field>
      <Field label="검토 메모">
        <textarea
          maxLength={2000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>
      <button
        type="button"
        onClick={() =>
          p.select({
            kind: "classificationRule",
            value: draftRule({
              ...r,
              title,
              memo,
              categoryId: categoryId || null,
            }),
          })
        }
      >
        이 분류를 규칙으로 저장
      </button>
      <MeaningHistory id={r.id} />
    </EditorForm>
  );
}
/** Posted expense + income that look like one owned-account transfer. Nothing changes until the owner decides. */
function PostedPairPanel(p: EditorProps & { value: ReviewItem }) {
  const cache = useMoneyCache();
  const r = p.value;
  const a = useMoneyData<Transaction>("/transactions/" + r.id);
  const b = useMoneyData<Transaction>("/transactions/" + r.transferPartnerId);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const out = a.data?.type === "EXPENSE" ? a.data : b.data;
  const inn = a.data?.type === "INCOME" ? a.data : b.data;
  const name = (id: string | null | undefined) => {
    const acc = p.accounts.find((x) => x.id === id);
    return acc ? accountName(acc) + (acc.archived ? " (보관됨)" : "") : "—";
  };
  const gap = out && inn ? Math.round(Math.abs(new Date(inn.occurredAt).getTime() - new Date(out.occurredAt).getTime()) / 1000) : null;
  async function run(action: () => Promise<unknown>, mutation: "transaction" | "reviewMeaning") {
    setBusy(true);
    setError("");
    try {
      await action();
      cache.mutate(mutation);
      p.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <MoneyPanel title="내 계좌 간 이체 확인" onClose={p.onClose}>
      <Stages item={r} />
      <LoadState error={a.error || b.error} loading={a.loading || b.loading} />
      {out && inn && (
        <div className="money-pair-card">
          <strong>{won(out.amount)}</strong>
          <dl>
            <dt>출금 (지출로 기록됨)</dt>
            <dd>{name(out.fromAccountId)} · {seoul(out.occurredAt).replace("T", " ")}</dd>
            <dt>입금 (수입으로 기록됨)</dt>
            <dd>{name(inn.toAccountId)} · {seoul(inn.occurredAt).replace("T", " ")}</dd>
            <dt>시간 차이</dt>
            <dd>{gap}초</dd>
          </dl>
          <p className="money-muted">
            내 계좌 사이의 이동이라면 지출과 수입이 각각 부풀려져 통계가 틀어집니다. 하나의 이체로 묶으면 두 기록의 원본 근거와 이전 상태가 정정 이력에 보존됩니다.
          </p>
        </div>
      )}
      <div className="money-save-actions">
        <button
          className="money-primary"
          disabled={busy || !out || !inn}
          onClick={() =>
            out && inn &&
            void run(
              () =>
                api.post("/transactions/" + out.id + "/link-transfer", {
                  otherId: inn.id,
                  expectedVersion: out.version,
                  otherVersion: inn.version,
                }),
              "transaction",
            )
          }
        >
          하나의 이체로 묶기
        </button>
        <button
          disabled={busy || !out || !inn}
          onClick={() =>
            out && inn &&
            window.confirm("이체가 아니라 실제 지출과 수입인가요? 두 기록은 그대로 유지되고 이 제안만 사라집니다.") &&
            void run(() => api.post("/review/transfer-pairs/dismiss", { expenseId: out.id, incomeId: inn.id }), "reviewMeaning")
          }
        >
          이체 아님 · 각각 유지
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <SystemReason item={r} />
    </MoneyPanel>
  );
}
type PartnerRaw = { raw: Raw; candidate: ReviewItem["candidate"] };
function useRawPartner(id: string | null | undefined) {
  const raw = useMoneyData<Raw>(id ? "/notifications/" + id : null);
  const attempts = useMoneyData<Attempt[]>(id ? "/notifications/" + id + "/parse-attempts" : null);
  const latest = attempts.data?.[attempts.data.length - 1];
  const partner: PartnerRaw | null =
    raw.data && latest ? { raw: raw.data, candidate: (latest.candidate as ReviewItem["candidate"]) ?? null } : null;
  return { partner, loading: raw.loading || attempts.loading, error: raw.error || attempts.error };
}
function RawReviewPanel(p: EditorProps & { value: ReviewItem }) {
  const r = p.value,
    c = r.candidate;
  const [error, setError] = useState("");
  const [asPair, setAsPair] = useState(!!r.transferPartnerId);
  const resolve = (hint?: string | null) => resolveAccountHint(p.accounts, c?.provider, hint);
  if (asPair && r.transferPartnerId)
    return <RawPairPanel {...p} onSingle={() => setAsPair(false)} />;
  const type =
    c?.sourceAccountHint && c.destinationAccountHint
      ? "TRANSFER"
      : c?.direction === "IN"
        ? "INCOME"
        : "EXPENSE";
  const value: Partial<Transaction> = {
    type,
    fromAccountId: resolve(c?.sourceAccountHint),
    toAccountId: resolve(c?.destinationAccountHint),
    amount: c?.amount,
    occurredAt: c?.occurredAt || r.occurredAt,
    counterpartyText: c?.counterpartyText,
    title: r.title || undefined,
  };
  return (
    <EntryForm
      value={value}
      accounts={p.accounts}
      categories={p.categories}
      refunds={[]}
      title="알림 금융 사실 확인"
      onClose={p.onClose}
      onSave={async (input) => {
        await api.post("/review/confirm", {
          transaction: input,
          rawIds: [r.id],
          expectedVersions: [r.version],
        });
        p.onSaved();
      }}
    >
      <Stages item={r} />
      {(r.transferCandidates ?? 0) > 0 && (
        <div className="meaning-notice" role="note">
          같은 금액의 반대 방향 알림이 가까운 시각에 있습니다. 내 계좌 사이의 이동이라면 지출·수입으로 따로 확정하지 말고 이체로 확정하세요.
          {r.transferPartnerId && (
            <button type="button" onClick={() => setAsPair(true)}>
              두 알림을 이체 1건으로 확정
            </button>
          )}
        </div>
      )}
      <p className="meaning-notice">
        확인되지 않은 계좌·금액·유형은 직접 확인하세요. 표시한 값으로만 승인합니다.
      </p>
      <details>
        <summary>System Information</summary>
        <p>
          내부 사유 코드: <code>{r.reason}</code>
        </p>
        <RawEvidence id={r.id} />
      </details>
      <RawDecisionActions r={r} onDone={p.onSaved} setError={setError} />
      {error && <p role="alert">{error}</p>}
    </EntryForm>
  );
}
function RawDecisionActions({ r, onDone, setError }: { r: ReviewItem; onDone: () => void; setError: (v: string) => void }) {
  return (
    <div className="money-destructive">
      <button
        type="button"
        onClick={async () => {
          try {
            await api.post("/notifications/" + r.id + "/defer", { expectedVersion: r.version });
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "보류 실패");
          }
        }}
      >
        보류
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm("이 알림을 거래가 아닌 알림으로 처리할까요? 원본은 보존되며 되돌릴 수 있습니다.")) return;
          try {
            await api.post("/review/ignore", { items: [{ id: r.id, expectedVersion: r.version }] });
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "처리 실패");
          }
        }}
      >
        거래 아님
      </button>
    </div>
  );
}
/** Two opposite raw notifications confirmed together as one owned-account transfer (never as expense + income). */
function RawPairPanel(p: EditorProps & { value: ReviewItem; onSingle: () => void }) {
  const r = p.value;
  const { partner, loading, error: loadError } = useRawPartner(r.transferPartnerId);
  const mine = r.candidate;
  const other = partner?.candidate ?? null;
  const out = mine?.direction === "OUT" ? mine : other;
  const inn = mine?.direction === "IN" ? mine : other;
  const [from, setFrom] = useState<string | null>(null),
    [to, setTo] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fromId = from ?? resolveAccountHint(p.accounts, out?.provider, out?.sourceAccountHint) ?? "";
  const toId = to ?? resolveAccountHint(p.accounts, inn?.provider, inn?.destinationAccountHint) ?? "";
  const gap = out?.postedAt && inn?.postedAt ? Math.round(Math.abs(new Date(inn.postedAt).getTime() - new Date(out.postedAt).getTime()) / 1000) : null;
  return (
    <MoneyPanel title="내 계좌 간 이체로 확정" onClose={p.onClose}>
      <Stages item={r} />
      <LoadState error={loadError} loading={loading} />
      {partner && out && inn && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.post("/review/confirm", {
                transaction: {
                  type: "TRANSFER",
                  fromAccountId: fromId || null,
                  toAccountId: toId || null,
                  amount: out.amount,
                  occurredAt: out.occurredAt,
                  counterpartyText: null,
                  categoryId: null,
                  memo: null,
                  title: title || null,
                  excluded: false,
                  refundOf: null,
                },
                rawIds: [r.id, partner.raw.id],
                expectedVersions: [r.version, partner.raw.processingVersion],
              });
              p.onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : "확정 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="money-pair-card">
            <strong>{won(out.amount)}</strong>
            <dl>
              <dt>출금 알림</dt>
              <dd>{out.sourceAccountHint || "계좌 표기 없음"} · {out.postedAt ? seoul(out.postedAt).replace("T", " ") : ""}</dd>
              <dt>입금 알림</dt>
              <dd>{inn.destinationAccountHint || "계좌 표기 없음"} · {inn.postedAt ? seoul(inn.postedAt).replace("T", " ") : ""}</dd>
              {gap !== null && (
                <>
                  <dt>도착 간격</dt>
                  <dd>{gap}초</dd>
                </>
              )}
            </dl>
            <p className="money-muted">자동 매칭 기준(상대 표기 일치·10초 이내)을 충족하지 못해 확인이 필요합니다. 두 알림은 한 건의 이체 근거로 함께 보존됩니다.</p>
          </div>
          <Field label="출금 계좌">
            <select required value={fromId} onChange={(e) => setFrom(e.target.value)}>
              <AccountOptions accounts={p.accounts} />
            </select>
          </Field>
          <Field label="입금 계좌">
            <select required value={toId} onChange={(e) => setTo(e.target.value)}>
              <AccountOptions accounts={p.accounts} />
            </select>
          </Field>
          <Field label="제목 (선택)">
            <input maxLength={240} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비워 두면 출발 → 도착 자동 제목" />
          </Field>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button type="button" onClick={p.onSingle} disabled={busy}>
              이 알림만 따로 확인
            </button>
            <button className="money-primary" type="submit" disabled={busy || !fromId || !toId || fromId === toId}>
              {busy ? "확정 중…" : "이체 1건으로 확정"}
            </button>
          </footer>
        </form>
      )}
      <details>
        <summary>System Information</summary>
        <p>
          내부 사유 코드: <code>{r.reason}</code>
        </p>
        <RawEvidence id={r.id} />
      </details>
    </MoneyPanel>
  );
}
export function MeaningHistory({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const data = useMoneyData<{ action: string; createdAt: string }[]>(
    open ? "/meaning-history/" + id : null,
  );
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>System Information</summary>
      <LoadState error={data.error} loading={data.loading} />
      {data.data?.map((r, i) => (
        <p key={i}>
          {r.action} · {seoul(r.createdAt)}
        </p>
      ))}
    </details>
  );
}

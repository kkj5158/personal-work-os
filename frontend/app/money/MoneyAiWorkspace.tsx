"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, Sparkles, Undo2, ExternalLink, ShieldCheck } from "lucide-react";
import { moneyApi as api, won, seoul, type Category, type Transaction } from "@/lib/money/model";
import { categoryIndex } from "@/lib/money/categories";
import { moneyAmount } from "@/lib/money/accounts";
import { reviewReasons, ruleStatuses } from "@/lib/money/meaning";
import { aiTypeLabels, aiEventLabels, type AiItem, type AiEvent, type LookupResult, type MerchantIdentity, type Operations, type TransferPair } from "@/lib/money/ai";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { CategoryPicker } from "./MoneyCategoryPicker";
import { reviewCapabilities, reviewDecision, proposalBasis } from "@/lib/money/reviewCapabilities";
import { trapDialogFocus } from "@/lib/money/dialog-focus";
import { RawEvidence } from "./MoneyEditors";
import type { Props } from "./MoneyWebViews";
import { Pagination } from "./MoneyWebViews";
import "./money-ai.css";

const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다. 다시 확인해 주세요.";
const date = (v?: string | null) => v ? seoul(v).replace("T", " ") : "시각 정보 없음";
const sourceUrl = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
function AiHeading({ title, text }: { title: string; text: string }) { return <div className="money-ai-heading"><h2><Sparkles size={20} />{title}</h2><p className="money-muted">{text}</p></div>; }
function Events({ events, undo }: { events: AiEvent[]; undo?: (id: string) => void }) { return <div className="money-table-wrap"><table className="money-table"><thead><tr><th>시각</th><th>결정</th><th>상태</th><th /></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{date(e.createdAt)}</td><td>{aiEventLabels[e.kind] || e.kind}</td><td>{e.active ? "적용됨" : "취소 · 이력 보존"}</td><td>{undo && e.active && ["CONFIRM", "NON_TRANSACTION", "DEFER"].includes(e.kind) && <button onClick={() => undo(e.id)}>실행 취소</button>}</td></tr>)}</tbody></table>{!events.length && <p className="money-empty">아직 판정 이력이 없습니다.</p>}</div>; }
function Sources({ result }: { result?: LookupResult | null }) { return <>{(result?.reason || result?.message || result?.summary) && <p className="money-muted">{result.reason || result.message || result.summary}</p>}{result?.uncertainty && <p className="money-ai-note">{result.uncertainty}</p>}{result?.sources?.map((s, i) => <div className="money-ai-source" key={s.url + i}><a href={sourceUrl(s.url)} target="_blank" rel="noreferrer">{s.title}<ExternalLink size={12} /></a>{s.snippet && <p>{s.snippet}</p>}{s.retrievedAt && <small>조회 시각 {date(s.retrievedAt)}</small>}</div>)}</>; }

export function AiWorkbench(p: Props) {
  const [state, setState] = useMoneyViewState("ai-review-state", () => "PENDING");
  const [type, setType] = useMoneyViewState("ai-review-type", () => "");
  const [search, setSearch] = useMoneyViewState("ai-review-search", () => "");
  const [account, setAccount] = useMoneyViewState("ai-review-account", () => "");
  const [selected, setSelected] = useState<AiItem | null>(null);
  const [offset, setOffset] = useMoneyViewState("ai-review-offset", () => 0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ id?: string; text: string } | null>(null);
  const undoLock = useRef(false);
  const cache = useMoneyCache();
  const query = new URLSearchParams({ state, limit: "50", offset: String(offset) });
  if (type) query.set("type", type); if (search) query.set("search", search); if (account) query.set("accountId", account);
  const list = useMoneyData<{ items: AiItem[]; total: number; bounded?: boolean; maximumScanned?: number }>("/ai/workbench?" + query);
  const item = useMoneyData<AiItem>(selected ? `/ai/items/${selected.id}?kind=${selected.kind}` : null);
  const value = item.data?.id === selected?.id && item.data?.kind === selected?.kind ? item.data : selected;
  const rows = list.data?.items ?? [];
  const index = categoryIndex(p.categories);
  async function afterSave(row: AiItem, eventId: string, text: string) {
    cache.mutate("ai"); setToast({ text });
    // The server decides whether this particular current event is reversible.
    try { const current = await api.get<AiItem>(`/ai/items/${row.id}?kind=${row.kind}`); if (reviewCapabilities(current, p.categories).undo && current.eventId === eventId) setToast({ id: eventId, text }); }
    catch { /* Saving succeeded; unavailable undo eligibility is not guessed. */ }
  }
  async function undo(id: string) {
    if (undoLock.current) return;
    undoLock.current = true;
    setBusy(true); setError("");
    try { await api.post(`/ai/events/${id}/undo`, {}); cache.mutate("ai"); setToast(null); }
    catch (e) { cache.mutate("ai"); setToast(null); setError(errorText(e) + " 최신 상태를 다시 조회했습니다."); } finally { undoLock.current = false; setBusy(false); }
  }
  return <section className="money-ai money-ai-row-first" data-money-ai-screen="G">
    <AiHeading title="검토 필요" text="근거가 있는 제안은 행에서 바로 확정하고, 필요한 항목의 증거를 확인하세요." />
    <div className="money-ai-tabs" role="tablist" aria-label="검토 상태">{[["PENDING", "검토 대기"], ["DEFERRED", "보류"], ["COMPLETED", "처리 결과"]].map(([key, label]) => <button role="tab" aria-selected={state === key} className={state === key ? "active" : ""} key={key} onClick={() => { if (p.changeContext?.() !== false) { setState(key); setSelected(null); setOffset(0); } }}>{label}</button>)}</div>
    <div className="money-ai-filters"><select aria-label="검토 유형" value={type} onChange={e => { setType(e.target.value); setOffset(0); }}><option value="">전체 유형</option>{Object.entries(aiTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="money-ai-search"><Search size={15} /><input aria-label="거래·제안 검색" placeholder="거래·제안 검색" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></label><select aria-label="검토 계좌" value={account} onChange={e => { setAccount(e.target.value); setOffset(0); }}><option value="">전체 계좌</option>{p.accounts.map(a => <option value={a.id} key={a.id}>{a.displayName}</option>)}</select><button className="money-ai-refresh" onClick={() => cache.mutate("ai")}>조회 새로고침</button></div>
    <LoadState loading={list.loading} error={list.error || error} />
    <div className="money-ai-review-split"><div className="money-ai-main-column"><div className="money-table-wrap money-ai-list"><table className="money-table"><thead><tr><th>거래 · 금융 상태</th><th>금액</th><th>제안 · 근거</th><th>검토 행동</th></tr></thead><tbody>{rows.map(r => <tr key={r.kind + r.id} aria-selected={r.id === selected?.id && r.kind === selected?.kind}><td><button className="money-ai-row-button" onClick={() => { if (p.changeContext?.() !== false) setSelected(r); }}><span><strong>{r.title || r.merchant || "은행 알림"}</strong><small>{date(r.occurredAt)} · {p.accounts.find(a => a.id === r.accountId)?.displayName || "계좌 확인 필요"}</small><small>{r.kind === "RAW" ? "RAW · 금융 정보 확인 필요" : r.kind === "TRANSACTION" ? "금융 확인됨" : "확인되지 않은 항목"} · {reviewReasons[r.reason] || "직접 검토"}</small></span></button></td><td className="money-ai-amount">{moneyAmount(r.amount, r.currency || "통화 미확인")}</td><td><strong>{r.proposal?.categoryId ? index.path(r.proposal.categoryId) : "분류 제안 없음"}</strong><small>{proposalBasis[r.proposal?.basis] || "근거 확인 필요"} · {r.proposal?.reason}</small><small>현재: {index.path(r.categoryId)}</small></td><td><ReviewRowActions key={`${r.kind}:${r.id}`} item={r} p={p} undo={undo} onSaved={afterSave} inspect={() => setSelected(r)} /></td></tr>)}</tbody></table>{!rows.length && !list.loading && <p className="money-empty">{state === "PENDING" ? "이 조회 범위의 검토가 완료되었습니다. 보류 항목도 확인할 수 있습니다." : "이 조건의 검토 항목이 없습니다."}</p>}<p className="money-muted money-ai-list-count">조회 범위 내 {list.data?.total ?? 0}건{list.data?.bounded && ` · 최근 최대 ${list.data.maximumScanned || 500}건에서 조회`} · 보류는 장부·통계 제외가 아닙니다.</p><Pagination offset={offset} total={list.data?.total ?? 0} onChange={next => { setOffset(next); setSelected(null); }} /></div></div>
      <ReviewEvidenceRail item={value} categories={p.categories} loading={item.loading} error={item.error} onClose={() => setSelected(null)} />
    </div>
    {toast && <div role="status" className="money-ai-toast"><span>{toast.text}</span>{toast.id && <button disabled={busy} onClick={() => undo(toast.id!)}><Undo2 size={14} />실행 취소</button>}<button aria-label="알림 닫기" onClick={() => setToast(null)}>×</button></div>}
  </section>;
}
function ReviewEvidenceRail({ item, categories, loading, error, onClose }: { item: AiItem | null; categories: Category[]; loading: boolean; error: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [narrow, setNarrow] = useState(false);
  const itemId = item?.id, itemKind = item?.kind;
  useEffect(() => { const parent = host.current?.closest(".money-ai-row-first"); if (!parent) return; const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 1280)); observer.observe(parent); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!narrow || !itemId) return; const origin = document.activeElement as HTMLElement | null; const old = document.body.style.overflow; const node = dialog.current; document.body.style.overflow = "hidden"; node?.showModal(); return () => { node?.close(); document.body.style.overflow = old; origin?.focus(); }; }, [narrow, itemId, itemKind]);
  const contents = <><div className="money-ai-section-heading"><h3>판단 근거</h3>{item && <button onClick={onClose} aria-label="판단 근거 닫기">닫기</button>}</div><LoadState loading={loading} error={error} />{item ? <Evidence item={item} categories={categories} /> : <div className="money-ai-idle"><ShieldCheck size={28} /><p>행의 제목을 선택하면 원문과 제안 근거를 확인할 수 있습니다.</p><p>확인·변경은 행에서 바로 처리합니다.</p></div>}</>;
  return <div ref={host} className="money-ai-evidence-host">{narrow ? item && <dialog className="money-ai-evidence-dialog" ref={dialog} tabIndex={-1} onKeyDown={e => trapDialogFocus(e.currentTarget, e)} aria-label="판단 근거" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const b = e.currentTarget.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose(); } }}>{contents}</dialog> : <aside className="money-ai-evidence-rail">{contents}</aside>}</div>;
}
function ReviewRowActions({ item: initial, p, onSaved, undo, inspect }: { item: AiItem; p: Props; onSaved: (row: AiItem, eventId: string, text: string) => void; undo: (id: string) => void; inspect: () => void }) {
  const [recovered, setRow] = useState<AiItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [needsRefresh, setNeedsRefresh] = useState(false), [draft, setDraft] = useState<string | undefined>();
  const [noise, setNoise] = useState(false), [reasonDraft, setReasonDraft] = useState("");
  const row = recovered && recovered.version >= initial.version && recovered.overrideVersion >= initial.overrideVersion && recovered.projectionVersion >= initial.projectionVersion ? recovered : initial;
  const lock = useRef(false);
  const cap = reviewCapabilities(row, p.categories);
  const cache = useMoneyCache();
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const current = await api.get<AiItem>(`/ai/items/${row.id}?kind=${row.kind}`); setRow(current); setNeedsRefresh(false); setError("최신값을 불러왔습니다. 선택 초안을 확인한 후 다시 선택하세요."); cache.mutate("ai"); }
    catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function act(action: string, categoryId?: string | null, extra?: Record<string, unknown>) {
    if (lock.current || needsRefresh) return;
    if (action === "CONFIRM") { const c = categoryId ? categoryIndex(p.categories).byId.get(categoryId) : undefined; if (!cap.classify || !c || !categoryIndex(p.categories).active(c) || c.kind !== row.type) return; setDraft(categoryId!); }
    lock.current = true; setBusy(true); setError("");
    try { const result = await api.post<{ eventId: string }>("/ai/decisions", { ...reviewDecision(row, action, categoryId), ...extra }); setNoise(false); setDraft(undefined); if (action === "REVIEW_TRANSACTION" && row.kind === "RAW") { const current = await api.get<AiItem>(`/ai/items/${row.id}?kind=RAW`); p.select({ kind: "reviewItem", value: current }); } onSaved(row, result.eventId, action === "DEFER" ? "보류했습니다. 금융 값은 유지됩니다." : action === "CONFIRM" ? "이번 거래의 분류를 확정했습니다." : "결정을 저장했습니다."); setNeedsRefresh(true); }
    catch (e) { setNoise(false); setError(errorText(e)); setNeedsRefresh(true); try { const current = await api.get<AiItem>(`/ai/items/${row.id}?kind=${row.kind}`); setRow(current); cache.mutate("ai"); setError(errorText(e) + " 최신 상태를 확인했습니다. 초안을 다시 확인하세요."); } catch { setError(errorText(e) + " 결과를 확인하지 못했습니다. 최신 상태 조회가 필요합니다."); } }
    finally { lock.current = false; setBusy(false); }
  }
  async function financial() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { if (row.kind === "RAW") p.select({ kind: "reviewItem", value: row }); else { const current = await api.get<Transaction>(`/transactions/${row.id}`); p.select({ kind: "transaction", value: current }); } }
    catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  return <div className="money-ai-row-actions" aria-busy={busy}><fieldset disabled={busy || needsRefresh}>
    {cap.validProposal && <button className="money-primary" onClick={() => act("CONFIRM", row.proposal.categoryId)}>확인</button>}
    {cap.classify && <CategoryPicker triggerLabel={cap.validProposal ? "변경" : "분류 선택"} label={cap.validProposal ? "변경" : "분류 선택"} value={row.categoryId || ""} categories={p.categories.filter(c => c.kind === row.type)} onChange={id => void act("CONFIRM", id)} />}
    {cap.financialEditor && <button className="money-primary" onClick={financial}>금융 확인</button>}
    {cap.transfer && <button className="money-primary" onClick={() => p.navigate?.("/money/review?ai=transfers")}>이체 확인</button>}
    {cap.nonTransaction && row.kind === "RAW" && row.reviewType === "NOISE" && <button onClick={() => { if (window.confirm("거래가 아닌 알림으로 처리할까요? 원본은 보존되며 원장은 생성하지 않습니다.")) void act("NON_TRANSACTION"); }}>비거래로 처리</button>}
    {row.kind === "RAW" && row.reviewType === "NOISE" && row.state !== "COMPLETED" && <details className="money-ai-row-more"><summary aria-label="추가 행동">⋯</summary><button onClick={financial}>금융 확인</button></details>}
    {cap.defer && <button onClick={() => act("DEFER")}>보류</button>}
    {cap.undo && <button onClick={() => undo(row.eventId!)}>실행 취소</button>}
    {row.state === "DEFERRED" && cap.known && <button onClick={() => act("REOPEN")}>다시 검토</button>}
    {row.state === "COMPLETED" && cap.known && row.reviewType !== "TRANSFER" && !row.excluded && <button onClick={() => act(row.kind === "RAW" ? "REVIEW_TRANSACTION" : "REOPEN")}>{row.kind === "RAW" ? "거래로 검토" : "다시 검토"}</button>}
    {cap.nonTransaction && row.kind === "TRANSACTION" && <details className="money-ai-row-more"><summary aria-label="추가 행동">⋯</summary><button onClick={() => setNoise(true)}>비거래 검토</button></details>}
    {!cap.known && <button onClick={inspect}>상세 확인</button>}
  </fieldset>{busy && <small role="status">처리 중…</small>}{error && <small role="alert">{error}{draft && <> · 선택 초안: {categoryIndex(p.categories).path(draft)}</>}</small>}{needsRefresh && <button disabled={busy} onClick={refresh}>최신 상태 확인</button>}{noise && <NonTransactionDialog row={row} p={p} initialReason={reasonDraft} onClose={() => setNoise(false)} onConfirm={(extra) => { setReasonDraft(String(extra.reason)); return act("NON_TRANSACTION", null, extra); }} busy={busy} />}</div>;
}
type NonTransactionImpact = {
  fingerprint: string; canConfirm: boolean; warnings?: string[];
  accountImpacts: { accountId: string; beforeBalance: number | null; afterBalance: number | null; delta: number | null; currency: string }[];
  statisticsImpact: { incomeDelta: number; consumptionDelta: number };
};
function NonTransactionDialog({ row, p, busy, initialReason, onClose, onConfirm }: { row: AiItem; p: Props; busy: boolean; initialReason: string; onClose: () => void; onConfirm: (extra: Record<string, unknown>) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<NonTransactionImpact | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [reason, setReason] = useState(initialReason);
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const node = dialog.current; document.body.style.overflow = "hidden"; node?.showModal();
    let alive = true;
    api.post<NonTransactionImpact>("/review/non-transaction/preview", { recordType: "TRANSACTION", recordId: row.id, expectedVersion: row.transactionVersion ?? row.version, expectedOverrideVersion: row.overrideVersion, expectedProjectionVersion: row.projectionVersion }).then(value => { if (alive) setPreview(value); }).catch(e => { if (alive) setError(errorText(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; node?.close(); document.body.style.overflow = overflow; origin?.focus(); };
  }, [row.id, row.version, row.transactionVersion, row.overrideVersion, row.projectionVersion]);
  return <dialog ref={dialog} tabIndex={-1} onKeyDown={e => trapDialogFocus(e.currentTarget, e)} className="money-ai-impact-dialog" aria-label="기록된 거래의 비거래 처리 영향" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><h2>기록된 거래를 비거래로 처리</h2><p>원본과 정정 이력은 보존합니다. 원장의 통계 포함 여부를 변경하므로 서버가 계산한 영향을 확인하세요.</p><LoadState loading={loading} error={error} />{preview && <><div className="money-ai-preview"><h3>계좌 잔액 영향</h3>{preview.accountImpacts.map(a => <p key={a.accountId}>{p.accounts.find(v => v.id === a.accountId)?.displayName || "계좌"} · {a.beforeBalance === null ? "미확인" : moneyAmount(a.beforeBalance, a.currency)} → {a.afterBalance === null ? "미확인" : moneyAmount(a.afterBalance, a.currency)} ({a.delta === null ? "차이 미확인" : moneyAmount(a.delta, a.currency)}) · {a.currency}</p>)}<p>수입 합계 변화 {won(preview.statisticsImpact.incomeDelta)}</p><p>순소비 변화 {won(preview.statisticsImpact.consumptionDelta)}</p><small>후속 잔액 기준점이 있으면 현재 잔액 영향은 0일 수 있습니다.</small></div>{preview.warnings?.map(w => <p role="note" key={w}>{w}</p>)}<label className="money-ai-field">처리 사유 (필수)<textarea disabled={busy} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label></>}<div className="money-ai-buttons"><button disabled={busy} onClick={onClose}>취소</button><button className="money-primary" disabled={busy || loading || !preview?.canConfirm || !preview.fingerprint || !reason.trim() || !!error} onClick={() => void onConfirm({ reason: reason.trim(), impactFingerprint: preview!.fingerprint })}>영향 확인 · 비거래로 처리</button></div></dialog>;
}
function Evidence({ item: r, categories }: { item: AiItem; categories: Category[] }) {
  const index = categoryIndex(categories);
  return <div className="money-ai-evidence"><section className="money-card"><h3>{r.title || r.merchant || "은행 알림"}</h3><strong className="money-ai-large-amount">{moneyAmount(r.amount, r.currency || "통화 미확인")}</strong><p>{date(r.occurredAt)}</p><div className="money-ai-preview">{index.path(r.categoryId)} <ArrowRight size={16} /> {r.proposal.categoryId ? index.path(r.proposal.categoryId) : "제안 없음"}</div></section>
    <section className="money-card"><h3>거래 원문</h3><p className="money-muted">원본 알림과 금융 사실을 보존합니다.</p>{r.rawSources?.length ? r.rawSources.map(s => <details key={s.id}><summary>{s.title || "은행 알림 원문 보기"} · {date(s.postedAt)}</summary><pre className="money-ai-raw">{s.bigText || s.text || "본문 없음"}</pre><small>{s.sourcePackage}</small></details>) : <p className="money-muted">연결된 은행 알림이 없습니다. 수동 입력 원장을 사용합니다.</p>}</section>
    <section className="money-card"><h3>외부 검색 근거</h3><p className="money-muted">후보와 확정된 거래처를 구분합니다.</p>{r.evidence.external.length ? r.evidence.external.map(l => <div key={l.id}><strong>{l.query}</strong><small>{date(l.createdAt)} · {l.status}</small>{l.errorCode && <p role="status">조회 오류: {l.errorCode}</p>}<Sources result={l.result} /></div>) : <p>외부 검색 근거가 없습니다. 검색하지 않은 정보를 근거로 제시하지 않습니다.</p>}</section>
    <section className="money-card"><h3>개인화 근거</h3>{r.evidence.confirmedDecisions.length ? <p>동일 결제명의 확정 이력 {r.evidence.confirmedDecisions.length}건</p> : <p>동일 결제명의 확정 이력이 없습니다.</p>}{r.evidence.rules.length ? r.evidence.rules.map(rule => <p key={rule.id}>{rule.name || rule.merchant} · {ruleStatuses[rule.status]} · {index.path(rule.categoryId)}</p>) : <p>적용 가능한 명시적 규칙이 없습니다.</p>}<p className="money-ai-note">{r.proposal.reason}</p></section>
    {!!r.history?.length && <section className="money-card"><h3>이 항목의 처리 이력</h3><Events events={r.history} /></section>}
    <details className="money-card"><summary>시스템 정보</summary><p>원본 종류 {r.kind} · 상태 {r.state}</p><p>항목 {r.id} · 버전 {r.version}</p><p>금융 {r.transactionVersion} · 의미 {r.overrideVersion} · 분류 기본값 {r.projectionVersion}</p><p>검토 사유 {r.reason}</p></details>
  </div>;
}
export function AiTransfers(p: Props) {
  const data = useMoneyData<{ items: TransferPair[] }>("/ai/transfers");
  const [selected, setSelected] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const cache = useMoneyCache(); const pairs = data.data?.items ?? [];
  const pair = pairs.find(v => `${v.expense.id}:${v.income.id}` === selected) ?? pairs[0];
  const key = useRef("");
  async function act(action: "confirm" | "unrelated") {
    if (!pair) return; setBusy(true); setError("");
    if (!key.current) key.current = crypto.randomUUID();
    try { await api.post(`/ai/transfers/${action}`, { expenseId: pair.expense.id, incomeId: pair.income.id, expenseVersion: pair.expense.version, incomeVersion: pair.income.version, idempotencyKey: key.current }); cache.mutate("ai"); setSelected(""); key.current = ""; }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="money-ai" data-money-ai-screen="S03"><AiHeading title="이체 매칭" text="기존 출금·입금 거래를 연결하기 전 계좌와 근거를 함께 확인하세요." /><LoadState loading={data.loading} error={data.error || error} /><div className="money-ai-transfer-layout"><section className="money-card"><h3>매칭 대기 {pairs.length}건</h3>{pairs.map(v => <button className="money-ai-pair" aria-pressed={pair === v} key={v.expense.id + v.income.id} onClick={() => { setSelected(`${v.expense.id}:${v.income.id}`); key.current = ""; }}><strong>{p.accounts.find(a => a.id === v.expense.fromAccountId)?.displayName} → {p.accounts.find(a => a.id === v.income.toAccountId)?.displayName}</strong><small>{moneyAmount(v.expense.amount, v.expense.currency)} · {date(v.expense.occurredAt)}</small></button>)}{!pairs.length && <p className="money-empty">소유 계좌·통화·시각과 추가 근거를 충족하는 후보가 없습니다. 동일 금액만으로 연결하지 않습니다.</p>}</section>{pair && <><section className="money-ai-evidence"><div className="money-ai-legs">{[pair.expense, pair.income].map((t, i) => <div className="money-card" key={t.id}><h3>{i ? "도착 거래" : "출발 거래"}</h3><p>{p.accounts.find(a => a.id === (i ? t.toAccountId : t.fromAccountId))?.displayName}</p><strong className="money-ai-large-amount">{moneyAmount(t.amount, t.currency)}</strong><p>{date(t.occurredAt)}</p><p>{t.counterpartyText || "거래처 정보 없음"}</p><small>{t.currency} · {i ? "입금" : "출금"}</small>{t.sources.map(s => <RawEvidence key={s.rawEventId} id={s.rawEventId} />)}</div>)}</div><section className="money-card"><h3>매칭 근거</h3><p>동일 금액 · 동일 통화 · 서로 다른 소유 계좌</p><p>거래 시각 차이 {Math.round(Math.abs(new Date(pair.expense.occurredAt).getTime() - new Date(pair.income.occurredAt).getTime()) / 1000)}초</p><p>소유 계좌·금액·통화·시각을 비교한 후보입니다.</p><p>{pair.evidence.identifierMatch ? "양쪽 상대방 식별자가 일치합니다." : "상대방 식별자 일치는 확인되지 않았습니다."} {pair.evidence.sourceEvidence ? "양쪽 은행 원문이 연결되어 있습니다. 원문을 확인한 후 승인하세요." : "양쪽 은행 원문 근거가 부족합니다. 소유 계좌와 실제 입출금을 추가 확인하세요."}</p><details><summary>저장된 매칭 근거 보기</summary><pre className="money-ai-raw">{JSON.stringify(pair.evidence, null, 2)}</pre></details></section><section className="money-card"><h3>다른 거래 선택</h3>{pairs.filter(v => v.expense.id === pair.expense.id && v.income.id !== pair.income.id).map(v => <button className="money-ai-pair" key={v.income.id} onClick={() => { setSelected(`${v.expense.id}:${v.income.id}`); key.current = ""; }}>{p.accounts.find(a => a.id === v.income.toAccountId)?.displayName} · {won(v.income.amount)} · {date(v.income.occurredAt)}</button>)}{pairs.filter(v => v.expense.id === pair.expense.id).length === 1 && <p className="money-muted">추가 검증을 충족하는 대체 후보가 없습니다.</p>}</section></section><aside className="money-ai-decision"><h3>이체로 변경</h3><div className="money-ai-preview"><strong>출금 + 입금 → 내 계좌 이체</strong><p>원금은 수입·지출 합계에서 제외하며 계좌별 입출금은 유지합니다.</p><p>기존 두 거래를 연결합니다. 별도의 세 번째 금융 이동을 만들지 않습니다.</p></div><p className="money-ai-note">수수료는 별도 실제 지출로 처리합니다. 원금을 조정하지 않습니다.</p><div className="money-ai-buttons"><button className="money-primary" disabled={busy} onClick={() => act("confirm")}>이체 확정</button><button disabled={busy} onClick={() => act("unrelated")}>서로 다른 거래</button><button disabled={busy} onClick={async () => { setBusy(true); try { const current = await api.get<AiItem>(`/ai/items/${pair.expense.id}?kind=TRANSACTION`); await api.post("/ai/decisions", { id: current.id, kind: "TRANSACTION", action: "DEFER", transactionVersion: current.transactionVersion, overrideVersion: current.overrideVersion, projectionVersion: current.projectionVersion, version: current.version, overrides: {} }); cache.mutate("ai"); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>보류</button></div></aside></>}</div></section>;
}

export function AiMerchants(p: Props) {
  const data = useMoneyData<{ items: MerchantIdentity[]; unresolved: { descriptor: string; count: number }[] }>("/ai/merchants");
  const provider = useMoneyData<{ configured: boolean; enabled: boolean; provider: string; model: string; dailyLimit: number; maxToolCalls: number; timeoutSeconds: number }>("/ai/provider");
  const [tab, setTab] = useState("unresolved"), [search, setSearch] = useState(""), [selected, setSelected] = useState("");
  const [name, setName] = useState(""), [region, setRegion] = useState(""), [aliases, setAliases] = useState(""), [candidate, setCandidate] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const cache = useMoneyCache();
  const rows = tab === "linked" ? (data.data?.items ?? []).map(i => ({ descriptor: i.descriptor, count: 0, identity: i })) : (data.data?.unresolved ?? []).map(i => ({ ...i, identity: undefined as MerchantIdentity | undefined }));
  const filtered = rows.filter(r => `${r.descriptor} ${r.identity?.name ?? ""}`.includes(search));
  const row = filtered.find(r => r.descriptor === selected) ?? filtered[0];
  const descriptor = row?.descriptor ?? "";
  function select(d: string) { const v = data.data?.items.find(i => i.descriptor === d); setSelected(d); setName(v?.name ?? ""); setRegion(v?.region ?? ""); setAliases(v?.aliases.join(", ") ?? ""); setCandidate(""); setLookup(null); setError(""); setNotice(""); }
  async function lookupMerchant() { if (!descriptor) return; setBusy(true); setError(""); try { const result = await api.post<LookupResult>("/ai/lookup", { descriptor, region: region || null }); setLookup(result); cache.invalidate(k => k.startsWith("/ai/operations")); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function save(candidateName?: string) { if (!descriptor) return; setBusy(true); setError(""); try { await api.post("/ai/merchants", { id: row?.identity?.id, descriptor, name: candidateName || name, region: region || null, aliases: aliases.split(",").map(s => s.trim()).filter(Boolean), expectedVersion: row?.identity?.version ?? 0 }); cache.mutate("ai"); setSelected(descriptor); setTab("linked"); setNotice("거래처 연결을 저장했습니다. 기존 거래 분류와 규칙은 유지됩니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <section className="money-ai" data-money-ai-screen="S04"><AiHeading title="거래처 확인" text="결제명과 실제 거래처·지점을 구분하고 확인한 정보만 연결하세요." /><LoadState loading={data.loading} error={data.error || error} /><div className="money-ai-split"><section><div className="money-ai-tabs" role="tablist" aria-label="거래처 연결 상태">{[["unresolved", "확인 필요"], ["linked", "연결 완료"]].map(([k, label]) => <button role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} key={k} disabled={busy} onClick={() => { setTab(k); setSelected(""); setLookup(null); setName(""); setRegion(""); setAliases(""); setCandidate(""); }}>{label}</button>)}</div><label className="money-ai-search"><Search size={15} /><input aria-label="결제명 또는 거래처 검색" disabled={busy} value={search} onChange={e => setSearch(e.target.value)} placeholder="결제명 또는 거래처 검색" /></label><div className="money-table-wrap"><table className="money-table"><thead><tr><th>결제명</th><th>연결된 거래처</th><th>상태</th></tr></thead><tbody>{filtered.map(r => <tr key={r.descriptor} aria-selected={descriptor === r.descriptor}><td><button className="money-ai-row-button" disabled={busy} onClick={() => select(r.descriptor)}><strong>{r.descriptor}</strong></button></td><td>{r.identity?.name || "미연결"}</td><td>{r.identity ? "연결 완료" : `${r.count}건 · 확인 필요`}</td></tr>)}</tbody></table>{!filtered.length && <p className="money-empty">해당 결제명이 없습니다.</p>}</div></section><section className="money-card money-ai-merchant-detail"><h3>{descriptor || "결제명 선택"} · 거래처 확인</h3>{provider.data && <p className="money-muted">{provider.data.configured ? `${provider.data.provider} · ${provider.data.model} · 하루 최대 ${provider.data.dailyLimit}회` : "외부 조회 제공자 미설정"}{!provider.data.enabled && <> · 외부 검색 꺼짐 <button onClick={() => p.navigate?.("/money/classification?ai=operations")}>검색 허용 설정</button></>}</p>}<div className="money-ai-section-heading"><h4>거래처 검색</h4><button disabled={busy || !descriptor} onClick={lookupMerchant}>외부 검색 ↗</button></div><label className="money-ai-field">지역 정보 (선택)<input aria-label="거래처 지역" value={region} onChange={e => setRegion(e.target.value)} maxLength={120} placeholder="지점 구분에 필요한 지역" /></label>{lookup && <><p className="money-muted">{lookup.retrievedAt ? date(lookup.retrievedAt) : "조회 응답"} · {lookup.status || "후보 확인"}</p><Sources result={lookup} /><div className="money-ai-candidates">{lookup.candidates?.map((c, i) => <label className="money-ai-candidate" key={c.name + i}><input type="radio" name="merchant-candidate" checked={candidate === c.name} onChange={() => setCandidate(c.name)} /><strong>{c.name}</strong><small>{c.region || "지역 미확인"}</small><p>{c.description}</p>{c.sources?.map(s => <a href={sourceUrl(s.url)} target="_blank" rel="noreferrer" key={s.url}>{s.title} ↗</a>)}</label>)}</div></>}
    <div className="money-ai-note">후보는 검색 결과입니다. 동일 이름·중개 결제명만으로 실제 구매처를 확정하지 않습니다.</div><h4>내가 확인한 정보 (선택)</h4><label className="money-ai-field">거래처 이름<input aria-label="직접 입력 거래처 이름" value={name} onChange={e => setName(e.target.value)} maxLength={160} /></label><label className="money-ai-field">다른 이름·별칭 (쉼표 구분)<input value={aliases} onChange={e => setAliases(e.target.value)} maxLength={1000} /></label><div className="money-ai-buttons"><button disabled={busy || !candidate || !descriptor} className="money-primary" onClick={() => save(candidate)}>선택한 거래처 연결</button><button disabled={busy || !name.trim() || !descriptor} onClick={() => save()}>직접 입력</button><button disabled={busy || !descriptor} onClick={() => { setLookup(null); setCandidate(""); setNotice("결제명 연결은 보류했습니다. 금융 값은 유지됩니다."); }}>나중에 확인</button></div><p className="money-muted">연결만 변경하며 기존 거래를 재분류하거나 항상 적용 규칙을 만들지 않습니다.</p>{row?.identity && <MerchantRule key={row.identity.id} identity={row.identity} p={p} /> }{notice && <p role="status">{notice}</p>}</section></div></section>;
}

function MerchantRule({ identity, p }: { identity: MerchantIdentity; p: Props }) {
  const [kind, setKind] = useState("EXPENSE"), [accountId, setAccountId] = useState(""), [categoryId, setCategoryId] = useState(""), [condition, setCondition] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const cache = useMoneyCache();
  return <details className="money-ai-merchant-rule"><summary>확정 거래처의 분류 규칙 만들기</summary><p className="money-ai-note">앞으로 생성되는 해당 거래처·유형·계좌의 기록만 적용합니다. 기존 거래에는 적용하지 않습니다. 여러 상품을 파는 거래처는 제목 조건을 추가해야 합니다.</p><label className="money-ai-field">거래 유형<select value={kind} onChange={e => { setKind(e.target.value); setCategoryId(""); }}><option value="EXPENSE">지출</option><option value="INCOME">수입</option></select></label><label className="money-ai-field">적용 계좌<select aria-label="거래처 규칙 계좌" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">소유 계좌 선택</option>{p.accounts.filter(a => !a.archived).map(a => <option value={a.id} key={a.id}>{a.displayName}</option>)}</select></label><label className="money-ai-field">카테고리<CategoryPicker label="거래처 규칙 카테고리" categories={p.categories.filter(c => c.kind === kind)} value={categoryId} onChange={setCategoryId} /></label><label className="money-ai-field">거래 제목에 포함할 조건 (선택)<input value={condition} onChange={e => setCondition(e.target.value)} maxLength={240} placeholder="혼합 상품 거래처는 조건 필수" /></label><div className="money-ai-preview">{identity.name} · {kind === "INCOME" ? "수입" : "지출"} · {p.accounts.find(a => a.id === accountId)?.displayName || "계좌 선택 필요"} → {categoryIndex(p.categories).path(categoryId)}<small>분류 기본값만 적용 · 사용자 수정 우선 · 과거 기록 유지</small></div><LoadState error={error} loading={false} /><button disabled={busy || !accountId || !categoryId} onClick={async () => {
    setBusy(true); setError(""); setNotice("");
    try { await api.post("/ai/merchant-rule", { merchantId: identity.id, rule: { name: `${identity.name} · ${p.accounts.find(a => a.id === accountId)?.displayName}`, conditions: [{ field: "merchant", operator: "EXACT", value: identity.descriptor }, { field: "type", operator: "EXACT", value: kind }, { field: "accountId", operator: "EXACT", value: accountId }, ...(condition.trim() ? [{ field: "title", operator: "CONTAINS", value: condition.trim() }] : [])], categoryId, titleDefault: null, memoDefault: null, status: "ACTIVE", expectedVersion: 0 } }); cache.mutate("ai"); setNotice("해당 범위의 규칙을 승인했습니다. 자동 적용은 학습·운영 설정을 따릅니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }}>이 범위의 규칙 승인</button>{notice && <p role="status">{notice}</p>}</details>;
}

export function AiOperations(p: Props) {
  const data = useMoneyData<Operations>("/ai/operations"); const cache = useMoneyCache();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function settings(field: "externalLookup" | "automaticRules", enabled: boolean) { if (!data.data) return; setBusy(true); setError(""); try { await api.put("/ai/settings", { expectedVersion: data.data.settings.version, externalLookup: data.data.settings.externalLookup, automaticRules: data.data.settings.automaticRules, [field]: enabled }); cache.mutate("ai"); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  const d = data.data; const index = categoryIndex(p.categories);
  return <section className="money-ai" data-money-ai-screen="S06"><AiHeading title="학습 · 운영" text="실제 누적 이벤트와 최근 100개 결정·50개 조회를 확인하세요." /><LoadState loading={data.loading} error={data.error || error} />{d && <><div className="money-ai-metrics">{[["확정된 결정", d.metrics.confirmed], ["보류", d.metrics.deferred], ["실행 취소", d.metrics.reversed], ["조회 실패", d.metrics.lookupErrors]].map(([label, value]) => <div className="money-card" key={label}><small>{label}</small><strong>{value}건</strong></div>)}</div><div className="money-ai-split"><div className="money-ai-evidence"><section className="money-card"><h3>최근 판정 이력</h3><Events events={d.events} /><p className="money-muted">확정된 결정만 이후 제안의 근거로 사용합니다. 보류·취소는 활성 학습 근거에서 제외합니다.</p></section><section className="money-card"><div className="money-ai-section-heading"><h3>명시적 분류 규칙</h3><button onClick={() => p.select({ kind: "classificationRule", value: null })}>규칙 추가</button></div><div className="money-table-wrap"><table className="money-table"><thead><tr><th>규칙</th><th>카테고리</th><th>적용 조건</th><th>상태</th><th /></tr></thead><tbody>{d.rules.map(r => <tr key={r.id}><td>{r.name || r.merchant}</td><td>{index.path(r.categoryId)}</td><td>{r.conditions.map((c, i) => <small key={i}>{c.field} · {c.operator} · {c.value}</small>)}</td><td>{ruleStatuses[r.status]}</td><td><button onClick={() => p.select({ kind: "classificationRule", value: r })}>수정 · 일시 정지</button></td></tr>)}</tbody></table>{!d.rules.length && <p className="money-empty">등록된 규칙이 없습니다. 확정 이력은 규칙과 별도로 유지됩니다.</p>}</div></section></div><aside><section className="money-card"><h3>자동 처리 범위</h3><div className="money-ai-setting"><strong>기존 승인된 결정적 규칙</strong><p>기존 활성 규칙의 적용과 사용자 수정 우선순위를 유지합니다.</p></div><label className="money-ai-setting money-ai-check"><input type="checkbox" disabled={busy} checked={d.settings.automaticRules} onChange={e => settings("automaticRules", e.target.checked)} /><span><strong>승인한 거래처·계좌 규칙 자동 적용</strong><small>확정 거래처·유형·소유 계좌 조건을 충족하는 승인 규칙만 적용합니다. 일반 AI 제안은 검토 후 승인합니다.</small></span></label><label className="money-ai-setting money-ai-check"><input type="checkbox" disabled={busy} checked={d.settings.externalLookup} onChange={e => settings("externalLookup", e.target.checked)} /><span><strong>거래처 외부 검색 허용</strong><small>조회할 결제명·지역만 서버 제공자에 전달합니다. 금액·계좌·원문을 보내지 않습니다.</small></span></label><p className="money-ai-note">카테고리 구조 변경과 이체 연결은 승인 필요 · 금액·계좌·시각은 분류로 변경하지 않습니다.</p></section><section className="money-card"><h3>조회 처리 이력</h3>{d.lookups.map(l => <div className="money-ai-source" key={l.id}><strong>{l.query}</strong><small>{date(l.createdAt)} · {l.status}</small>{l.errorCode && <p>{l.errorCode}</p>}<button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const [descriptor, ...regionParts] = l.query.split(" | "); await api.post("/ai/lookup", { descriptor, region: regionParts.join(" | ") || null }); cache.mutate("ai"); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>다시 시도</button></div>)}{!d.lookups.length && <p className="money-muted">조회 이벤트가 없습니다.</p>}</section></aside></div></>}</section>;
}

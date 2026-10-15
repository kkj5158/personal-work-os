"use client";
import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { moneyApi as api, won, type Transaction } from "@/lib/money/model";
import { moneyAmount } from "@/lib/money/accounts";
import { calendarComposition, calendarDates, changeCalendarMonth, kstDate, newWorkRecord, workStatuses, type CalendarLedger, type CalendarSection, type WorkMonth, type WorkRecord, type WorkTemplate } from "@/lib/money/calendar";
import type { Tracking } from "@/lib/money/meaning";
import type { Props } from "./MoneyWebViews";
import { useMoneyCache, useMoneyScroll, useMoneyViewState } from "./MoneyDataProvider";
import { useMoneyData } from "./MoneyWebData";
import { MoneyPanel, PanelContext } from "./MoneyPanel";
import { CategoryFilters } from "./MoneyCategoryPicker";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
import { CalendarRequestState, TemplateEditor, WeeklyEditor, WorkRecordEditor } from "./MoneyCalendarEditors";
import "./money-calendar.css";

type WeekOpener = { start: string; source: "grid" | "table" };
type Selection = { kind: "day"; date: string } | { kind: "work"; record: WorkRecord } | ({ kind: "week" } & WeekOpener) | { kind: "templates"; id: string };
function Metric({ label, value, note, tone = "" }: { label: string; value: ReactNode; note: ReactNode; tone?: string }) { return <article className="mc-metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{note}</small></article>; }
export function MoneyCalendar(p: Props & { section: CalendarSection }) {
  const scope = "calendar-" + p.section, work = p.section === "coupang-work-calendar", income = p.section === "income-calendar", kind = income ? "INCOME" : "EXPENSE", today = kstDate(), cache = useMoneyCache();
  const [month, setMonth] = useMoneyViewState(scope + "-month", () => today.slice(0, 7)), [accounts, setAccounts] = useMoneyViewState<string[] | null>(scope + "-accounts", () => null), [categories, setCategories] = useMoneyViewState<string[] | null>(scope + "-categories", () => null), [status, setStatus] = useMoneyViewState(scope + "-status", () => "ALL"), [selectedDay, setSelectedDay] = useMoneyViewState(scope + "-selected", () => "");
  const [selection, setSelection] = useState<Selection | null>(null), [localError, setLocalError] = useState(""), [newTemplate, setNewTemplate] = useState<WorkTemplate | null>(null), [wide, setWide] = useState(false), ref = useRef<HTMLDivElement>(null), returnFocusDate = useRef<string | null>(null), returnFocusWeek = useRef<WeekOpener | null>(null), { setDirty } = useContext(PanelContext);
  const query = new URLSearchParams({ month, kind }); if (accounts !== null) query.set("accountIds", accounts.join(",") || "none"); if (categories !== null) query.set("categoryIds", categories.join(",") || "none");
  const ledger = useMoneyData<CalendarLedger>(work ? null : "/calendar/ledger?" + query), works = useMoneyData<WorkMonth>(work ? "/calendar/work?month=" + month : null), templates = useMoneyData<WorkTemplate[]>(work ? "/calendar/templates" : null), tracking = useMoneyData<Tracking>(!work ? "/tracking" : null);
  const result = work ? works : ledger, loading = result.loading || (work ? templates.loading : tracking.loading), failed = result.error || (work ? templates.error : tracking.error), dates = calendarDates(month), summary = ledger.data?.summary, workSummary = works.data?.summary, ready = !!p.ready && !loading && !failed && (work ? !!templates.data : !!tracking.data);
  useMoneyScroll(scope + ":" + month, ready);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new ResizeObserver(() => setWide(node.clientWidth >= 1320)); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (selection || !ready || !returnFocusDate.current && !returnFocusWeek.current) return;
    const week = returnFocusWeek.current;
    const selector = week ? `[data-calendar-week="${week.start}"][data-week-source="${week.source}"]` : `[data-calendar-date="${returnFocusDate.current}"]`;
    const opener = ref.current?.querySelector<HTMLButtonElement>(selector);
    if (opener) { returnFocusDate.current = null; returnFocusWeek.current = null; opener.focus(); }
  }, [selection, ready, month]);
  useEffect(() => {
    const root = ref.current;
    if (!root || wide || !selection) return;
    let queued = false, live = true;
    const recoverModalFocus = () => {
      if (queued) return;
      queued = true;
      // Focus is semantic state; hidden tabs may never run animation frames.
      queueMicrotask(() => {
        queued = false;
        if (!live) return;
        const panel = root.querySelector<HTMLElement>('.mc-panel-host [role="dialog"][aria-modal="true"]');
        const active = document.activeElement;
        if (!panel || !panel.isConnected || active && active !== document.body && active !== document.documentElement) return;
        // A disabled save control can strand focus at BODY. Do not override
        // another modal or an explicitly focused element outside this panel.
        if (Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(modal => modal !== panel)) return;
        panel.focus({ preventScroll: true });
      });
    };
    const observer = new window.MutationObserver(recoverModalFocus);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    root.addEventListener("focusout", recoverModalFocus);
    return () => { live = false; observer.disconnect(); root.removeEventListener("focusout", recoverModalFocus); };
  }, [selection, wide]);
  const change = (action: () => void) => { if (p.changeContext?.() === false) return; setSelection(null); setLocalError(""); action(); };
  const close = () => change(() => { returnFocusDate.current = selection?.kind === "work" ? selection.record.workDate : selection?.kind === "day" ? selection.date : null; returnFocusWeek.current = selection?.kind === "week" ? { start: selection.start, source: selection.source } : null; });
  const invalidate = () => cache.invalidate(key => key.startsWith("/calendar/"));
  const retryRead = () => cache.invalidate(key => key.startsWith("/calendar/") || ["/tracking", "/accounts", "/categories"].includes(key));
  const categoryName = (id: string | null): string => { const category = p.categories.find(category => category.id === id); return category ? (category.parentId ? (p.categories.find(parent => parent.id === category.parentId)?.name ?? "이전 분류") + " / " : "") + category.name : id ? "이전 분류" : "미분류"; };
  const rows = ledger.data?.items ?? [], dailyRows = (date: string) => rows.filter(row => kstDate(new Date(row.occurredAt)) === date), dailyAmount = (date: string) => ledger.data?.trend.find(item => item.day === date)?.amount ?? 0;
  const openDay = (date: string) => {
    if (!ready) return;
    change(() => { setSelectedDay(date); if (!date.startsWith(month)) { setMonth(date.slice(0, 7)); if (!work) { setSelection({ kind: "day", date }); return; } }
      if (work) { const record = works.data?.records.find(record => record.workDate === date); setSelection({ kind: "work", record: record ?? newWorkRecord(date, today, crypto.randomUUID(), templates.data?.find(template => template.active)) }); }
      else setSelection({ kind: "day", date });
    });
  };
  const openWeek = (start: string, source: WeekOpener["source"]) => change(() => setSelection({ kind: "week", start, source }));
  const selectedTemplate = templates.data?.find(template => selection?.kind === "templates" && template.id === selection.id) ?? (newTemplate?.id === (selection?.kind === "templates" ? selection.id : "") ? newTemplate : null);
  const addTemplate = () => change(() => { const presetId = crypto.randomUUID(), template: WorkTemplate = { id: crypto.randomUUID(), version: 0, name: "새 근무 템플릿", durationMinutes: 240, startTime: "09:00", endTime: "13:00", breakMinutes: 0, overnight: false, shiftDescription: "", groupName: "", active: true, defaultPresetId: presetId, presets: [{ id: presetId, name: "기본 수령액", amount: 0, active: true }] }; setNewTemplate(template); setSelection({ kind: "templates", id: template.id }); setDirty(true); });
  const renderDay = (date: string) => {
    if (work) {
      const record = works.data?.records.find(record => record.workDate === date);
      const visible = record && (status === "ALL" || (status === "UNPAID" ? record.status === "COMPLETED" && record.payments.reduce((sum, payment) => sum + payment.amount, 0) < record.expectedAmount : record.status === status));
      if (!record || !visible) return <span className="mc-none">—</span>;
      const paid = record.payments.reduce((sum, payment) => sum + payment.amount, 0), remaining = Math.max(0, record.expectedAmount - paid);
      return <><strong className="mc-label">{record.templateName || workStatuses[record.status]}</strong><span className="mc-label">{workStatuses[record.status]} · {record.durationMinutes / 60}h {record.memo ? "• 메모" : ""}</span><b title={paid ? "수령 " + won(paid) : "예상 " + won(record.expectedAmount)} className={paid ? "mc-income" : "mc-amber"}>{paid ? "수령 " + won(paid) : "예상 " + won(record.expectedAmount)}</b><span className="mc-label">{remaining && record.status === "COMPLETED" ? `${paid ? "부분 입금" : "미입금"} · ${won(remaining)}` : record.status === "SCHEDULED" ? "예정 금액" : paid ? "입금 " + record.payments.map(payment => payment.depositDate.slice(5)).join(", ") : workStatuses[record.status]}</span></>;
    }
    const list = dailyRows(date), amount = dailyAmount(date);
    return list.length ? <><b title={ledger.data?.analyticsUnavailable ? "통화별 확인" : won(amount)} className={income || amount < 0 ? "mc-income" : "mc-expense"}>{ledger.data?.analyticsUnavailable ? "통화별 확인" : won(amount)}</b><span className="mc-label">{list[0].title || list[0].counterpartyText || "거래"}</span><span className="mc-label">{list.length}건{list.some(row => row.type === "REFUND") ? " · 환불 포함" : ""}</span></> : <span className="mc-none">—</span>;
  };
  const count = work ? works.data?.records.length : rows.length;
  return <div className={"mc-root " + (selection ? "mc-open " : "") + (wide ? "mc-wide" : "mc-narrow")} ref={ref}>
    <div className="mc-main"><div className="mc-actions">{work ? <><button disabled={templates.loading || !!templates.error} onClick={() => change(() => setSelection({ kind: "templates", id: templates.data?.[0]?.id ?? "" }))}>근무 템플릿</button><button className="money-primary" disabled={!ready} onClick={() => openDay(month === today.slice(0, 7) ? today : month + "-01")}>＋ 근무 기록</button></> : <button onClick={() => p.navigate?.("/money/bookkeeping")}>가계부 보기 ↗</button>}</div>
    <section className="mc-summary" aria-label="월간 요약">{work ? <>
      <Metric label="완료한 근무" value={ready && workSummary ? `${workSummary.completedWorkdays}일` : "—"} note="근무일 기준 · 완료만 포함" /><Metric label="총 근무시간" value={ready && workSummary ? `${workSummary.completedMinutes / 60}시간` : "—"} note="휴게 차감 후 실근무" /><Metric label="실제 수령액" value={ready && workSummary ? won(workSummary.receivedAmount) : "—"} note="선택 월 입금일 기준" tone="mc-income" /><Metric label="완료 근무 · 미입금 예상" value={ready && workSummary ? won(workSummary.outstandingAmount) : "—"} note={ready && workSummary ? `향후 예정 ${won(workSummary.scheduledAmount)} 별도` : "선택 월 근무일 기준"} tone="mc-amber" />
    </> : <>
      <Metric label={income ? "확정 월 수입" : "월간 순지출"} value={ready && summary ? summary.total === null ? "통화별 확인 필요" : won(summary.total) : "—"} note="현재 필터 · 기존 장부 기준" tone={income ? "mc-income" : "mc-expense"} /><Metric label={income ? "수입이 있었던 날" : "소비한 날"} value={ready && summary ? `${income ? summary.incomeDayCount : summary.spendingDayCount}일` : "—"} note={income ? "확정 수입 발생일" : "환불만 있는 날 제외"} /><Metric label={income ? "수입 거래" : "일평균 순지출"} value={ready && summary ? income ? `${summary.transactionCount}건` : summary.averageDailySpending === null ? "—" : won(Math.round(summary.averageDailySpending)) : "—"} note={income ? "예정 근무 급여 제외" : "현재 월 경과일 · 과거 월 전체일"} /><Metric label={income ? "금융 원장" : "거래 / 환불"} value={ready && summary ? income ? "확정 수입" : `${summary.transactionCount} / ${summary.refundCount}건` : "—"} note={income ? "근무 수령 기록과 독립" : "기존 소비 투영 기준"} />
    </>}</section>
    <section className="mc-card" aria-label="월간 달력"><div className="mc-toolbar"><div className="mc-month"><button aria-label="이전 달" onClick={() => change(() => setMonth(changeCalendarMonth(month, -1)))}>‹</button><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><button aria-label="다음 달" onClick={() => change(() => setMonth(changeCalendarMonth(month, 1)))}>›</button><button onClick={() => change(() => setMonth(today.slice(0, 7)))}>이번 달</button></div>
      {work && <label>근무 상태 <select value={status} onChange={event => change(() => setStatus(event.target.value))}><option value="ALL">전체 상태</option>{Object.entries(workStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="UNPAID">미입금 / 부분 입금</option></select></label>}
    </div>
    {!work && <details className="mc-filters"><summary>분류·계좌 필터 {accounts !== null || categories !== null ? "· 필터된 장부" : "· 추적 계좌 전체"}</summary><CategoryFilters categories={p.categories.filter(category => category.kind === kind)} value={categories} onChange={value => change(() => setCategories(value))} /><GroupedAccountFilter accounts={p.accounts.filter(account => tracking.data?.[income ? "income" : "expense"].includes(account.id))} value={accounts} onChange={value => change(() => setAccounts(value))} /><button onClick={() => change(() => { setAccounts(null); setCategories(null); })}>조건 초기화</button></details>}
    <p className="mc-legend">{work ? "셀: 근무일 · 상태 필터는 셀에만 적용 / 주별 수령: 입금일" : income ? "확정 금융 수입만 포함 · 예정 급여 제외" : "순지출 · 환불은 발생일 차감 · 현재 필터 적용"}<span>한국 시간 · KRW</span></p>
    <CalendarRequestState loading={loading || !p.ready} error={failed} retry={retryRead} />{ready && <><div className="mc-scroll" tabIndex={0} aria-label="가로 스크롤 가능한 달력"><div className={"mc-grid " + (work ? "mc-work" : "")}>{["월", "화", "수", "목", "금", "토", "일"].map((label, index) => <div key={label} className={"mc-weekday " + (index === 6 ? "mc-expense" : index === 5 ? "mc-blue" : "")}>{label}</div>)}{work && <div className="mc-weekday">주별 수령</div>}
      {dates.map((date, index) => <Fragment key={date}><button type="button" data-calendar-date={date} aria-label={`${date} ${work ? "근무 기록" : `${dailyRows(date).length}건 거래`}`} aria-current={date === today ? "date" : undefined} aria-pressed={date === selectedDay} className={"mc-day " + (!date.startsWith(month) ? "mc-other " : "") + (date === selectedDay ? "mc-selected " : "") + (date === today ? "mc-today " : "") + (index % 7 === 6 ? "mc-sunday" : "")} onKeyDown={event => { const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : event.key === "ArrowDown" ? 7 : 0; if (step) { event.preventDefault(); const buttons = ref.current?.querySelectorAll<HTMLButtonElement>(".mc-day"); buttons?.[index + step]?.focus(); } }} onClick={() => openDay(date)}><span className="mc-date">{Number(date.slice(8))}{date === today && <small>오늘</small>}</span>{renderDay(date)}</button>{work && index % 7 === 6 && (() => { const start = dates[index - 6], week = works.data?.weeks.find(week => week.start === start); return <button type="button" className="mc-week-cell" data-calendar-week={start} data-week-source="grid" onClick={() => openWeek(start, "grid")} aria-label={`${start} 주 정산`}><small>{start.slice(5)}–{date.slice(5)}</small><strong className="mc-income">{week ? won(week.totalPay) : "—"}</strong><small>주 정산 ›</small></button>; })()}</Fragment>)}
    </div></div><p className="mc-foot">{count ? `${count}개 기록 · 현재 월` : "이 달 또는 현재 필터에 해당하는 기록이 없습니다. 다른 달이나 필터를 선택하세요."}{ledger.data?.analyticsUnavailable && " · 외화 포함: KRW 합계 대신 통화별 원본을 확인하세요."}</p></>}
    </section>
    {ready && (work ? <section className="mc-card mc-below"><h2>주별 비교 <small>월–일 · 고용주 정산 주기와 별개</small></h2><div className="mc-scroll"><table><thead><tr><th>주간</th><th>실제 수령</th><th>기본급</th><th>수당 상태</th><th>완료 근무</th><th>정산</th></tr></thead><tbody>{works.data?.weeks.map(week => <tr key={week.start}><td>{week.start}–{week.end}</td><td className="mc-income">{won(week.totalPay)}</td><td>{week.allowancesConfirmed && !week.needsReview && week.basePay !== null ? won(week.basePay) : "미확정"}</td><td>{week.needsReview ? "재검토 필요" : week.allowancesConfirmed ? "확인 완료" : "수당 미입력"}</td><td>{week.completedWorkdays}일 · {week.completedMinutes / 60}h</td><td><button data-calendar-week={week.start} data-week-source="table" onClick={() => openWeek(week.start, "table")}>주 정산</button></td></tr>)}</tbody></table></div><p className="mc-foot">월 경계 주는 양쪽 월 입금을 포함합니다. 주별 합계와 월간 수령액은 다를 수 있습니다.</p></section> : <section className="mc-card mc-below"><h2>{income ? "수입원별 구성" : "소비 분류 요약"} <small>현재 월 · 현재 필터</small></h2><div className="mc-composition">{ledger.data?.analyticsUnavailable ? <p className="mc-hint">여러 통화의 금액을 원화 구성비로 합산하지 않습니다. 당일 거래에서 통화를 확인하세요.</p> : calendarComposition(ledger.data?.composition ?? [], income).map((item, index) => <div key={`${item.categoryId}-${index}`}><span>{income && item.counterpartyText ? item.counterpartyText + " · " : ""}{categoryName(item.categoryId)}</span><b className={income ? "mc-income" : "mc-expense"}>{won(item.amount)}</b><small>{item.count}건</small></div>)}{!ledger.data?.composition.length && <p className="mc-hint">표시할 구성 내역이 없습니다.</p>}</div></section>)}
    {localError && <p className="mc-error" role="alert">{localError}</p>}
    </div>
    {selection && <PanelContext.Provider value={{ setDirty, drawer: !wide }}><div className="mc-panel-host">{!wide && <button className="money-drawer-backdrop" aria-label="달력 상세 닫기" onClick={close} />}<MoneyPanel title={selection.kind === "day" ? `${selection.date} ${income ? "수입" : "소비"} 내역` : selection.kind === "work" ? "근무 기록" : selection.kind === "week" ? "주간 정산" : "근무 템플릿 관리"} onClose={close} trackDirty={false}>
      {selection.kind === "day" && <><CalendarRequestState loading={loading} error={ledger.error} retry={retryRead} />{!loading && !ledger.error && <><p className="mc-hint">현재 달력 필터와 같은 장부 내역</p><p className={"mc-day-total " + (income ? "mc-income" : "mc-expense")}>{ledger.data?.analyticsUnavailable ? "통화별 확인 필요" : won(dailyAmount(selection.date))}</p><div className="mc-transactions">{dailyRows(selection.date).map(row => <button key={row.id} onClick={async () => { try { const transaction = await api.get<Transaction>("/transactions/" + row.id); if (p.changeContext?.() === false) return; setSelection(null); p.select({ kind: "transaction", value: transaction }); } catch (error) { setLocalError(error instanceof Error ? error.message : "거래 조회 실패"); } }}><span><strong>{row.title || row.counterpartyText || "거래"}</strong><b className={row.type === "REFUND" || income ? "mc-income" : "mc-expense"}>{row.type === "REFUND" ? "환불 +" : ""}{moneyAmount(row.amount, row.currency ?? "KRW")}</b></span><small>{new Date(row.occurredAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} · {categoryName(row.categoryId)}</small><small>{p.accounts.find(account => account.id === row.accountId)?.displayName ?? "이전 계좌"} · 원본 거래 상세 ›</small></button>)}</div>{!dailyRows(selection.date).length && <p className="mc-state">이 날짜에 거래가 없습니다.</p>}</>}</>}
      {selection.kind === "work" && <><CalendarRequestState loading={loading} error={failed} retry={retryRead} />{works.data && templates.data && (() => { const record = works.data.records.find(record => record.workDate === selection.record.workDate) ?? selection.record; return <WorkRecordEditor key={selection.record.id} value={record} templates={templates.data} onClose={close} onSaved={invalidate} />; })()}</>}
      {selection.kind === "week" && <WeeklyEditor key={selection.start} start={selection.start} onClose={close} onSaved={invalidate} />}
      {selection.kind === "templates" && <><div className="mc-template-list">{templates.data?.map(template => <button key={template.id} aria-pressed={selection.id === template.id} onClick={() => change(() => setSelection({ kind: "templates", id: template.id }))}>{template.name}{!template.active && " · 비활성"}</button>)}<button onClick={addTemplate}>＋ 템플릿 추가</button></div>{selectedTemplate ? <TemplateEditor key={selectedTemplate.id} initial={selectedTemplate} onSaved={template => { setNewTemplate(template); invalidate(); }} /> : <p className="mc-state">새 템플릿을 추가해 주세요.</p>}</>}
      {localError && <p className="mc-error" role="alert">{localError}</p>}
    </MoneyPanel></div></PanelContext.Provider>}
  </div>;
}

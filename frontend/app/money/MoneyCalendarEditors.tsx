"use client";
import { useContext, useRef, useState } from "react";
import { moneyApi as api, won } from "@/lib/money/model";
import { allowances, applyTemplate, kstDate, settlement, validateWork, validKrw, workMinutes, workStatuses, type CalendarWeek, type WorkRecord, type WorkTemplate, type AllowanceKey } from "@/lib/money/calendar";
import { PanelContext } from "./MoneyPanel";
import { useMoneyData } from "./MoneyWebData";
import { useMoneyCache } from "./MoneyDataProvider";
import type { ReactNode } from "react";

export function CalendarField({ label, children }: { label: string; children: ReactNode }) { return <label className="mc-field"><span>{label}</span>{children}</label>; }
function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) { return <CalendarField label={label}><input type="number" required min={min} max="999999999999" step="1" value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.value === "" ? NaN : Number(event.target.value))} /></CalendarField>; }
export function CalendarRequestState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) { return <>{loading && <p className="mc-state" role="status">달력 내역을 불러오는 중…</p>}{error && <div className="mc-error" role="alert">{error} <button type="button" onClick={retry}>다시 불러오기</button></div>}</>; }
/** A conflict never rebases an old draft onto a new version implicitly. */
function SaveError({ message, path, onReload }: { message: string; path: string; onReload: (value: never) => void }) {
  const [latest, setLatest] = useState<unknown>(null), [readError, setReadError] = useState("");
  const fields: [string, ReactNode][] = [];
  if (latest && typeof latest === "object") {
    if ("workDate" in latest) { const record = latest as WorkRecord; fields.push(["근무일", record.workDate], ["상태", workStatuses[record.status]], ["템플릿", record.templateName], ["예상 수령액", won(record.expectedAmount)], ["메모", record.memo || "—"], ["실제 입금", record.payments.map(payment => `${payment.depositDate} · ${won(payment.amount)}`).join(" / ") || "없음"]); }
    else if ("totalPay" in latest) { const week = latest as CalendarWeek; fields.push(["주간", `${week.start}–${week.end}`], ["주급 총액", won(week.totalPay)], ...allowances.map(([key, label]): [string, ReactNode] => [label, week[key] === null ? "미입력" : won(week[key])]), ["확인 상태", week.needsReview ? "재검토 필요" : week.allowancesConfirmed ? "확인 완료" : "미확정"]); }
    else if ("presets" in latest) { const template = latest as WorkTemplate; fields.push(["템플릿", template.name], ["실근무", `${template.durationMinutes}분`], ["기본 시각", `${template.startTime || "미지정"}–${template.endTime || "미지정"}${template.overnight ? " (익일 종료)" : ""}`], ["휴게", `${template.breakMinutes}분`], ["사용 상태", template.active ? "활성" : "비활성"], ["금액 프리셋", template.presets.map(preset => `${preset.name} ${won(preset.amount)}${preset.id === template.defaultPresetId ? " (기본)" : ""}${preset.active ? "" : " (비활성)"}`).join(" / ")]); }
  }
  return <div className="mc-error" role="alert"><p>{message} 입력한 초안은 유지됩니다.</p><button type="button" onClick={async () => { try { setLatest(await api.get(path)); setReadError(""); } catch (error) { setReadError(error instanceof Error ? error.message : "현재 값을 조회하지 못했습니다."); } }}>서버의 현재 값 비교</button>{readError && <p>{readError}</p>}{latest != null && <><details open><summary>서버의 현재 값</summary><dl className="mc-compare">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details><button type="button" onClick={() => { if (window.confirm("현재 초안을 버리고 서버 값을 불러올까요?")) onReload(latest as never); }}>서버 값으로 다시 열기</button></>}</div>;
}
export function WorkRecordEditor({ value, templates, onSaved, onClose }: { value: WorkRecord; templates: WorkTemplate[]; onSaved: (record: WorkRecord) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(value)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [presetName, setPresetName] = useState(""), [savePreset, setSavePreset] = useState(false);
  const busy = useRef(false), { setDirty } = useContext(PanelContext), today = kstDate();
  const patch = (changes: Partial<WorkRecord>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const template = templates.find(template => template.id === draft.templateId), duration = workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight), paid = draft.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const working = ["SCHEDULED", "COMPLETED"].includes(draft.status);
  async function save() {
    if (busy.current) return;
    const problem = validateWork(draft, today) || (working && !draft.templateId ? "사용할 근무 템플릿을 먼저 만들어 선택하세요." : "") || (savePreset && !presetName.trim() ? "새 프리셋 이름을 입력하세요." : "");
    if (problem) { setError(problem); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const record = await api.put<WorkRecord>("/calendar/work-records/" + draft.id, { expectedVersion: draft.version, workDate: draft.workDate, status: draft.status, templateId: draft.templateId, presetId: draft.presetId, startTime: draft.startTime || null, endTime: draft.endTime || null, overnight: draft.overnight, breakMinutes: draft.breakMinutes, durationMinutes: working ? duration : 0, expectedAmount: working ? draft.expectedAmount : 0, memo: draft.memo, payments: draft.payments.map(({ id, depositDate, amount }) => ({ id, depositDate, amount })), ...(savePreset ? { saveAsPresetName: presetName.trim() } : {}) });
      setDraft(record); setDirty(false); setSaved(true); setSavePreset(false); onSaved(record);
    } catch (error) { setError(error instanceof Error ? error.message : "근무 기록을 저장하지 못했습니다."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <form className="mc-editor" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={saving}>
    <p className="money-muted">{draft.workDate} · 근무일 기준</p>
    <CalendarField label="근무 상태"><select value={draft.status} onChange={event => patch({ status: event.target.value as WorkRecord["status"] })}>{Object.entries(workStatuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></CalendarField>
    <CalendarField label="근무 템플릿"><select value={draft.templateId ?? ""} onChange={event => { const selected = templates.find(template => template.id === event.target.value); if (selected) { setDraft(current => applyTemplate(current, selected)); setDirty(true); setSaved(false); } }}><option value="">템플릿 선택</option>{templates.filter(template => template.active || template.id === draft.templateId).map(template => <option key={template.id} value={template.id}>{template.name}{!template.active ? " · 비활성" : ""}</option>)}</select></CalendarField>
    {value.version > 0 && <p className="mc-hint">기록 당시: {value.templateName} · {value.presetName} · {won(value.presetAmount)}<br />과거 값은 템플릿 변경 후에도 보존됩니다.</p>}
    <CalendarField label="하위 금액 프리셋"><select value={draft.presetId === value.presetId && draft.expectedAmount === value.expectedAmount && value.version > 0 ? "snapshot" : draft.presetId ?? ""} onChange={event => { if (event.target.value === "snapshot") { patch({ presetId: value.presetId, presetName: value.presetName, presetAmount: value.presetAmount, expectedAmount: value.expectedAmount }); return; } const preset = template?.presets.find(preset => preset.id === event.target.value); if (preset) patch({ presetId: preset.id, presetName: preset.name, presetAmount: preset.amount, expectedAmount: preset.amount }); }}>
      {value.version > 0 && <option value="snapshot">기록 당시 · {value.presetName} · {won(value.presetAmount)}</option>}<option value="">프리셋 선택</option>{template?.presets.filter(preset => preset.active).map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {won(preset.amount)}</option>)}
    </select></CalendarField>
    <h3>근무 시간</h3><div className="mc-two"><CalendarField label="시작"><input type="time" required={working} value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="종료"><input type="time" required={working} value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료 시각은 다음 날</label>
    <NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><p className="mc-hint">실근무 {working ? Number.isFinite(duration) ? `${duration / 60}시간 (${duration}분)` : "시간 확인 필요" : "0시간"}</p>
    <NumberField label="하루 예상 수령액 (원)" value={draft.expectedAmount} onChange={expectedAmount => patch({ expectedAmount })} />
    <label className="mc-check"><input type="checkbox" checked={savePreset} onChange={event => { setSavePreset(event.target.checked); setDirty(true); }} />이 금액을 새 프리셋으로도 저장</label>{savePreset && <CalendarField label="새 프리셋 이름"><input required value={presetName} onChange={event => { setPresetName(event.target.value); setDirty(true); }} /></CalendarField>}
    <h3>실제 입금 내역</h3><p className="mc-hint">입금일은 근무일과 별도입니다. MONEY 수입 거래를 자동 생성하지 않습니다.</p>
    {draft.payments.map((payment, index) => <section className="mc-payment" key={payment.id}><header><b>입금 {index + 1}</b><button type="button" onClick={() => patch({ payments: draft.payments.filter(item => item.id !== payment.id) })}>삭제</button></header><CalendarField label={`입금 ${index + 1} 날짜`}><input type="date" required min={draft.workDate} max={today} value={payment.depositDate} onChange={event => patch({ payments: draft.payments.map(item => item.id === payment.id ? { ...item, depositDate: event.target.value } : item) })} /></CalendarField><NumberField label={`입금 ${index + 1} 금액 (원)`} min={1} value={payment.amount} onChange={amount => patch({ payments: draft.payments.map(item => item.id === payment.id ? { ...item, amount } : item) })} /></section>)}
    <button type="button" onClick={() => patch({ payments: [...draft.payments, { id: crypto.randomUUID(), depositDate: today, amount: Math.max(1, draft.expectedAmount - paid) }] })}>＋ 실제 입금 추가</button>
    <p className="mc-hint">실제 수령 {won(paid)} · {paid > draft.expectedAmount ? `예상보다 ${won(paid - draft.expectedAmount)} 많음` : `잔여 예상 ${won(draft.expectedAmount - paid)}`}</p>
    <CalendarField label="메모"><textarea rows={3} value={draft.memo ?? ""} onChange={event => patch({ memo: event.target.value })} /></CalendarField>
    {error && <SaveError message={error} path={"/calendar/work-records/" + draft.id} onReload={(record: WorkRecord) => { setDraft(record); setDirty(false); setError(""); }} />}{saved && <p className="mc-success" role="status">근무 기록을 저장했습니다.</p>}
    </fieldset><footer><button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving} type="submit">{saving ? "저장 중…" : "근무 기록 저장"}</button></footer></form>;
}

export function WeeklyEditor({ start, onClose, onSaved }: { start: string; onClose: () => void; onSaved: () => void }) {
  const result = useMoneyData<CalendarWeek>("/calendar/weeks/" + start), cache = useMoneyCache();
  return <><CalendarRequestState loading={result.loading} error={result.error} retry={() => cache.invalidate(key => key === "/calendar/weeks/" + start)} />{result.data && <WeeklyForm key={start} initial={result.data} onClose={onClose} onSaved={onSaved} />}</>;
}
export function WeeklyForm({ initial, onClose, onSaved }: { initial: CalendarWeek; onClose: () => void; onSaved: () => void }) {
  const [week, setWeek] = useState(initial), [values, setValues] = useState(() => Object.fromEntries(allowances.map(([key]) => [key, initial[key] === null ? "" : String(initial[key])])) as Record<AllowanceKey, string>), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false);
  const { setDirty } = useContext(PanelContext), parsed = allowances.map(([key]) => values[key] === "" ? null : Number(values[key])), computed = settlement(week.totalPay, parsed);
  return <form className="mc-editor" onSubmit={async event => { event.preventDefault(); if (!computed.valid || busy.current) return; busy.current = true; setSaving(true); setError(""); try { const saved = await api.put<CalendarWeek>("/calendar/weeks/" + week.start, { expectedVersion: week.version, expectedTotalPay: week.totalPay, ...Object.fromEntries(allowances.map(([key], index) => [key, parsed[index]])) }); setWeek(saved); setDirty(false); setSaved(true); onSaved(); } catch (error) { setError(error instanceof Error ? error.message : "수당 저장 실패"); } finally { busy.current = false; setSaving(false); } }}>
    <fieldset disabled={saving}><p className="mc-hint">{week.start}–{week.end} · 월–일 / 입금일 기준<br />고용주 급여 정산 주기와 별개인 달력 비교 기간입니다.</p>
    <span className="money-muted">주급 총액 · 실제 수령</span><p className="mc-week-total">{won(week.totalPay)}</p><div className="mc-base"><span>기본급{!saved && (week.needsReview || !week.allowancesConfirmed) ? " · 미확정 미리보기" : ""}</span><b>{computed.valid ? won(computed.base) : "미확정"}</b></div>
    <p className="mc-hint">완료 근무 {week.completedWorkdays}일 · {week.completedMinutes / 60}시간<br />이 주 근무의 미입금 예상 {won(week.outstandingAmount)}</p>
    {week.needsReview && <p className="mc-error" role="alert">입금 변경으로 수당 재검토가 필요합니다. 기존 수당은 보존되어 있습니다.</p>}
    <h3>별도 수당 내역</h3><p className="mc-hint">총액에서 분해합니다. 총액에 다시 더하지 않습니다.</p>{allowances.map(([key, label]) => <CalendarField key={key} label={label}><input type="number" min="0" max="999999999999" step="1" value={values[key]} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setDirty(true); setSaved(false); }} /></CalendarField>)}
    <p className="mc-hint">수당 합계 {won(computed.sum)} · {week.allowancesConfirmed ? "저장된 분해값" : "수당 미확정"}</p>{!computed.valid && <p className="mc-error" role="alert">네 수당을 모두 0 이상의 정수로 입력하세요. 수당 합계는 주급을 넘을 수 없습니다. 네 개의 0을 저장하면 수당 없음을 확인합니다.</p>}
    <h3>주급에 포함된 입금</h3><ul className="mc-payment-list">{week.payments.map(payment => <li key={payment.id}><span>입금 {payment.depositDate}<small>근무 {payment.workDate}</small></span><b>{won(payment.amount)}</b></li>)}</ul>{!week.payments.length && <p className="mc-hint">이 주에 확인된 입금이 없습니다.</p>}
    {error && <SaveError message={error} path={"/calendar/weeks/" + week.start} onReload={(current: CalendarWeek) => { setWeek(current); setValues(Object.fromEntries(allowances.map(([key]) => [key, current[key] === null ? "" : String(current[key])])) as Record<AllowanceKey, string>); setDirty(false); setError(""); }} />}{saved && <p role="status" className="mc-success">수당 내역을 저장했습니다.</p>}</fieldset>
    <footer><button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving || !computed.valid}>{saving ? "저장 중…" : "수당 내역 저장"}</button></footer></form>;
}

export function TemplateEditor({ initial, onSaved }: { initial: WorkTemplate; onSaved: (template: WorkTemplate) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false), { setDirty } = useContext(PanelContext);
  const patch = (changes: Partial<WorkTemplate>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const setPreset = (id: string, changes: Partial<WorkTemplate["presets"][number]>) => patch({ presets: draft.presets.map(preset => preset.id === id ? { ...preset, ...changes } : preset) });
  return <form className="mc-editor" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return;
    const duration = draft.startTime || draft.endTime ? workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight) : draft.durationMinutes;
    if (!draft.name.trim() || !Number.isInteger(draft.durationMinutes) || draft.durationMinutes <= 0 || draft.durationMinutes > 1440 || duration !== draft.durationMinutes || !Number.isInteger(draft.breakMinutes) || draft.breakMinutes < 0 || draft.presets.some(preset => !preset.name.trim() || !validKrw(preset.amount)) || draft.active && !draft.presets.some(preset => preset.id === draft.defaultPresetId && preset.active)) { setError("이름·시간·휴게·프리셋을 확인하세요. 기본 시각은 둘 다 비우거나 실근무 분과 일치해야 하며, 활성 템플릿에는 활성 기본 프리셋이 필요합니다."); return; }
    busy.current = true; setSaving(true); setError("");
    try { const saved = await api.put<WorkTemplate>("/calendar/templates/" + draft.id, { expectedVersion: draft.version, name: draft.name, durationMinutes: draft.durationMinutes, startTime: draft.startTime || null, endTime: draft.endTime || null, breakMinutes: draft.breakMinutes, overnight: draft.overnight, shiftDescription: draft.shiftDescription, groupName: draft.groupName, active: draft.active, presets: draft.presets, defaultPresetId: draft.defaultPresetId }); setDraft(saved); setDirty(false); setSaved(true); onSaved(saved); } catch (error) { setError(error instanceof Error ? error.message : "템플릿 저장 실패"); } finally { busy.current = false; setSaving(false); }
  }}><fieldset disabled={saving}>
    <p className="mc-hint">새 기록에 적용할 기본값입니다. 이전 근무 기록의 이름·시간·금액은 보존됩니다.</p><CalendarField label="템플릿 이름"><input required value={draft.name} onChange={event => patch({ name: event.target.value })} /></CalendarField>
    <div className="mc-two"><NumberField label="실근무 (분)" min={1} value={draft.durationMinutes} onChange={durationMinutes => patch({ durationMinutes })} /><NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><CalendarField label="기본 시작 (선택)"><input type="time" value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="기본 종료 (선택)"><input type="time" value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료는 다음 날</label>
    <CalendarField label="시간대 설명"><input value={draft.shiftDescription ?? ""} onChange={event => patch({ shiftDescription: event.target.value })} /></CalendarField><CalendarField label="근무조"><input value={draft.groupName ?? ""} onChange={event => patch({ groupName: event.target.value })} /></CalendarField>
    <label className="mc-check"><input type="checkbox" checked={draft.active} onChange={event => patch({ active: event.target.checked })} />이 템플릿 사용</label><h3>하위 금액 프리셋</h3>
    {draft.presets.map((preset, index) => <section className="mc-payment" key={preset.id}><label className="mc-check"><input type="radio" name="default-preset" checked={draft.defaultPresetId === preset.id} disabled={!preset.active} onChange={() => patch({ defaultPresetId: preset.id })} />기본 프리셋</label><CalendarField label={`프리셋 ${index + 1} 이름`}><input required value={preset.name} onChange={event => setPreset(preset.id, { name: event.target.value })} /></CalendarField><NumberField label={`프리셋 ${index + 1} 금액 (원)`} value={preset.amount} onChange={amount => setPreset(preset.id, { amount })} /><label className="mc-check"><input type="checkbox" checked={preset.active} onChange={event => setPreset(preset.id, { active: event.target.checked })} />사용 (해제하면 비활성)</label></section>)}
    <button type="button" onClick={() => patch({ presets: [...draft.presets, { id: crypto.randomUUID(), name: "새 수령액", amount: 0, active: true }] })}>＋ 금액 프리셋 추가</button>
    {error && <SaveError message={error} path={"/calendar/templates/" + draft.id} onReload={(template: WorkTemplate) => { setDraft(template); setDirty(false); setError(""); }} />}{saved && <p role="status" className="mc-success">템플릿을 저장했습니다.</p>}
    </fieldset><footer><button className="money-primary" disabled={saving}>{saving ? "저장 중…" : "템플릿 저장"}</button></footer></form>;
}

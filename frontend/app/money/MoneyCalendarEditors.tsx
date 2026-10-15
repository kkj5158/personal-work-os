"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { moneyApi as api, won } from "@/lib/money/model";
import { allowances, applyTemplate, kstDate, nonWorkingRecord, offTemplateId, settlement, validateWork, validKrw, workMinutes, workStatuses, type CalendarWeek, type WorkRecord, type WorkTemplate, type AllowanceKey } from "@/lib/money/calendar";
import { PanelContext } from "./MoneyPanel";
import { useMoneyData } from "./MoneyWebData";
import { useMoneyCache } from "./MoneyDataProvider";
import type { ReactNode } from "react";

export function CalendarField({ label, children }: { label: string; children: ReactNode }) { return <label className="mc-field"><span>{label}</span>{children}</label>; }
function useEditorActive() { const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []); return active; }
function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) { return <CalendarField label={label}><input type="number" required min={min} max="999999999999" step="1" value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.value === "" ? NaN : Number(event.target.value))} /></CalendarField>; }
export function CalendarRequestState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) { return <>{loading && <p className="mc-state" role="status">달력 내역을 불러오는 중…</p>}{error && <div className="mc-error" role="alert">{error} <button type="button" onClick={retry}>다시 불러오기</button></div>}</>; }
/** A conflict never rebases an old draft onto a new version implicitly. */
function SaveError({ message, path, onReload }: { message: string; path: string; onReload: (value: never) => void }) {
  const [latest, setLatest] = useState<unknown>(null), [readError, setReadError] = useState("");
  const fields: [string, ReactNode][] = [];
  if (latest && typeof latest === "object") {
    if ("workDate" in latest) { const record = latest as WorkRecord; fields.push(["근무일", record.workDate], ["상태", workStatuses[record.status]], ["템플릿", record.templateName], ["받을 예정액", won(record.expectedAmount)], ["메모", record.memo || "—"]); }
    else if ("totalPay" in latest) { const week = latest as CalendarWeek; fields.push(["주간", `${week.start}–${week.end}`], ["주급 총액", won(week.totalPay)], ...allowances.map(([key, label]): [string, ReactNode] => [label, week[key] === null ? "미입력" : won(week[key])]), ["확인 상태", week.needsReview ? "재검토 필요" : week.allowancesConfirmed ? "확인 완료" : "미확정"]); }
    else if ("presets" in latest) { const template = latest as WorkTemplate; fields.push(["템플릿", template.name], ["실근무", `${template.durationMinutes}분`], ["기본 시각", `${template.startTime || "미지정"}–${template.endTime || "미지정"}${template.overnight ? " (익일 종료)" : ""}`], ["휴게", `${template.breakMinutes}분`], ["사용 상태", template.active ? "활성" : "비활성"], ["금액 프리셋", template.presets.map(preset => `${preset.name} ${won(preset.amount)}${preset.id === template.defaultPresetId ? " (기본)" : ""}${preset.active ? "" : " (비활성)"}`).join(" / ")]); }
  }
  return <div className="mc-error" role="alert"><p>{message} 입력한 초안은 유지됩니다.</p><button type="button" onClick={async () => { try { setLatest(await api.get(path)); setReadError(""); } catch (error) { setReadError(error instanceof Error ? error.message : "현재 값을 조회하지 못했습니다."); } }}>서버의 현재 값 비교</button>{readError && <p>{readError}</p>}{latest != null && <><details open><summary>서버의 현재 값</summary><dl className="mc-compare">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details><button type="button" onClick={() => { if (window.confirm("현재 초안을 버리고 서버 값을 불러올까요?")) onReload(latest as never); }}>서버 값으로 다시 열기</button></>}</div>;
}
export function WorkRecordEditor({ value: initialValue, templates, onSaved, onClose, onRemoved }: { value: WorkRecord; templates: WorkTemplate[]; onSaved: (record: WorkRecord, options?: { templatesChanged: boolean }) => void; onClose: () => void; onRemoved?: () => void }) {
  const [value, setValue] = useState(() => structuredClone(initialValue));
  const [draft, setDraft] = useState(() => ["OFF", "CANCELLED"].includes(value.status) ? nonWorkingRecord(structuredClone(value), value.status as "OFF" | "CANCELLED") : structuredClone(value)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [presetName, setPresetName] = useState(""), [savePreset, setSavePreset] = useState(false);
  const busy = useRef(false), active = useEditorActive(), { setDirty } = useContext(PanelContext), today = kstDate();
  const patch = (changes: Partial<WorkRecord>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const template = templates.find(template => template.id === draft.templateId), duration = workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight);
  const working = ["SCHEDULED", "COMPLETED"].includes(draft.status);
  const hasSnapshot = value.version > 0 && !value.removed && ["SCHEDULED", "COMPLETED"].includes(value.status) && draft.templateId === value.templateId;
  async function save() {
    if (busy.current) return;
    const problem = validateWork(draft, today) || (working && !draft.templateId ? "사용할 근무 템플릿을 먼저 만들어 선택하세요." : "") || (working && savePreset && !presetName.trim() ? "새 프리셋 이름을 입력하세요." : "");
    if (problem) { setError(problem); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const record = await api.put<WorkRecord>("/calendar/work-records/" + draft.id, { expectedVersion: draft.version, workDate: draft.workDate, status: draft.status, templateId: draft.templateId, presetId: draft.presetId, startTime: draft.startTime || null, endTime: draft.endTime || null, overnight: draft.overnight, breakMinutes: draft.breakMinutes, durationMinutes: working ? duration : 0, expectedAmount: working ? draft.expectedAmount : 0, memo: draft.memo, ...(working && savePreset ? { saveAsPresetName: presetName.trim() } : {}) });
      if (!active.current) return;
      setValue(record); setDraft(record); setDirty(false); setSaved(true); setSavePreset(false); onSaved(record, { templatesChanged: working && savePreset });
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "근무 기록을 저장하지 못했습니다."); }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }
  async function removeOff() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try { await api.post("/calendar/work-records/" + draft.id + "/remove-off", { expectedVersion: draft.version }); if (!active.current) return; setDirty(false); if (onRemoved) onRemoved(); else onClose(); }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : "휴무 기록을 삭제하지 못했습니다."); }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }
  return <form className="mc-editor" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={saving}>
    <p className="money-muted">{draft.workDate} · 근무일 기준</p>
    <CalendarField label="근무 상태"><select value={draft.status} onChange={event => { const status = event.target.value as WorkRecord["status"]; setSavePreset(false); if (status === "OFF" || status === "CANCELLED") patch(nonWorkingRecord(draft, status)); else { const normal = templates.find(template => template.active && !template.builtIn); patch(!working && normal ? applyTemplate({ ...draft, status }, normal, today) : { status }); } }}>{Object.entries(workStatuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></CalendarField>
    <CalendarField label="근무 템플릿"><select value={draft.status === "OFF" ? offTemplateId : draft.templateId ?? ""} onChange={event => { const selected = templates.find(template => template.id === event.target.value); if (selected) { setDraft(current => applyTemplate(current, selected, today)); setSavePreset(false); setDirty(true); setSaved(false); } }}><option value="">템플릿 선택</option>{templates.filter(template => template.active || template.id === draft.templateId).map(template => <option key={template.id} value={template.id}>{template.name}{!template.active ? " · 비활성" : ""}</option>)}</select></CalendarField>
    {working && hasSnapshot && <p className="mc-hint">기록 당시: {value.templateName} · {value.presetName} · {won(value.presetAmount)}<br />과거 값은 템플릿 변경 후에도 보존됩니다.</p>}
    {working ? <>
    <CalendarField label="하위 금액 프리셋"><select value={draft.presetId === value.presetId && draft.expectedAmount === value.expectedAmount && hasSnapshot ? "snapshot" : draft.presetId ?? ""} onChange={event => { if (event.target.value === "snapshot") { patch({ presetId: value.presetId, presetName: value.presetName, presetAmount: value.presetAmount, expectedAmount: value.expectedAmount }); return; } const preset = template?.presets.find(preset => preset.id === event.target.value); if (preset) patch({ presetId: preset.id, presetName: preset.name, presetAmount: preset.amount, expectedAmount: preset.amount }); }}>
      {hasSnapshot && <option value="snapshot">기록 당시 · {value.presetName} · {won(value.presetAmount)}</option>}<option value="">프리셋 선택</option>{template?.presets.filter(preset => preset.active).map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {won(preset.amount)}</option>)}
    </select></CalendarField>
    <h3>근무 시간</h3><div className="mc-two"><CalendarField label="시작"><input type="time" required={working} value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="종료"><input type="time" required={working} value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료 시각은 다음 날</label>
    <NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><p className="mc-hint">실근무 {working ? Number.isFinite(duration) ? `${duration / 60}시간 (${duration}분)` : "시간 확인 필요" : "0시간"}</p>
    <NumberField label="일급 · 받을 예정액 (원)" value={draft.expectedAmount} onChange={expectedAmount => patch({ expectedAmount })} /><p className="mc-hint">근무일 기준 예상액입니다. 실제 입금 확인이나 금융 수입 거래를 뜻하지 않습니다.</p>
    <label className="mc-check"><input type="checkbox" checked={savePreset} onChange={event => { setSavePreset(event.target.checked); setDirty(true); }} />이 금액을 새 프리셋으로도 저장</label>{savePreset && <CalendarField label="새 프리셋 이름"><input required value={presetName} onChange={event => { setPresetName(event.target.value); setDirty(true); }} /></CalendarField>}
    </> : <p className="mc-hint">{workStatuses[draft.status]} · 실근무 0분 · 받을 예정액 0원</p>}
    <CalendarField label="메모"><textarea rows={3} value={draft.memo ?? ""} onChange={event => patch({ memo: event.target.value })} /></CalendarField>
    {error && <SaveError message={error} path={"/calendar/work-records/" + draft.id} onReload={(record: WorkRecord) => { setValue(record); setDraft(record); setDirty(false); setError(""); }} />}{saved && <p className="mc-success" role="status">근무 기록을 저장했습니다.</p>}
    </fieldset><footer>{value.status === "OFF" && draft.status === "OFF" && value.version > 0 && !value.removed && <button type="button" disabled={saving} onClick={() => void removeOff()}>휴무 기록 삭제</button>}<button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving} type="submit">{saving ? "저장 중…" : "근무 기록 저장"}</button></footer></form>;
}

export function WeeklyEditor({ start, onClose, onSaved }: { start: string; onClose: () => void; onSaved: () => void }) {
  const result = useMoneyData<CalendarWeek>("/calendar/pay-weeks/" + start, { autoRefresh: false }), cache = useMoneyCache();
  return <><CalendarRequestState loading={result.loading && !result.data} error={result.error} retry={() => cache.invalidate(key => key === "/calendar/pay-weeks/" + start)} />{result.data && <WeeklyForm key={start} initial={result.data} onClose={onClose} onSaved={onSaved} />}</>;
}
export function WeeklyForm({ initial, onClose, onSaved }: { initial: CalendarWeek; onClose: () => void; onSaved: () => void }) {
  const [week, setWeek] = useState(initial), [values, setValues] = useState(() => Object.fromEntries(allowances.map(([key]) => [key, initial[key] === null ? "" : String(initial[key])])) as Record<AllowanceKey, string>), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false);
  const active = useEditorActive(), { setDirty } = useContext(PanelContext), parsed = allowances.map(([key]) => values[key] === "" ? null : Number(values[key])), computed = settlement(week.totalPay, parsed);
  return <form className="mc-editor" onSubmit={async event => { event.preventDefault(); if (!computed.valid || busy.current) return; busy.current = true; setSaving(true); setError(""); try { const saved = await api.put<CalendarWeek>("/calendar/pay-weeks/" + week.start, { expectedVersion: week.version, expectedTotalPay: week.totalPay, ...Object.fromEntries(allowances.map(([key], index) => [key, parsed[index]])) }); if (!active.current) return; setWeek(saved); setDirty(false); setSaved(true); onSaved(); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "수당 저장 실패"); } finally { busy.current = false; if (active.current) setSaving(false); } }}>
    <fieldset disabled={saving}><p className="mc-hint">{week.start}–{week.end} · 일–토 · 완료 근무일 일급 합계<br />고용주 정산 주기와 별개이며 실제 입금 확인이 아닙니다.</p>
    <span className="money-muted">주급 총액 · 받을 예정액</span><p className="mc-week-total">{won(week.totalPay)}</p><div className="mc-base"><span>기본급{!saved && (week.needsReview || !week.allowancesConfirmed) ? " · 미확정 미리보기" : ""}</span><b>{computed.valid ? won(computed.base) : "미확정"}</b></div>
    <p className="mc-hint">완료 근무 {week.completedWorkdays}일 · {week.completedMinutes / 60}시간</p>
    {week.needsReview && <p className="mc-error" role="alert">근무 일급 변경으로 수당 재검토가 필요합니다. 기존 수당은 보존되어 있습니다.</p>}
    <h3>별도 수당 내역</h3><p className="mc-hint">총액에서 분해합니다. 총액에 다시 더하지 않습니다.</p>{allowances.map(([key, label]) => <CalendarField key={key} label={label}><input type="number" min="0" max="999999999999" step="1" value={values[key]} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setDirty(true); setSaved(false); }} /></CalendarField>)}
    <p className="mc-hint">수당 합계 {won(computed.sum)} · {week.allowancesConfirmed ? "저장된 분해값" : "수당 미확정"}</p>{!computed.valid && <p className="mc-error" role="alert">네 수당을 모두 0 이상의 정수로 입력하세요. 수당 합계는 주급을 넘을 수 없습니다. 네 개의 0을 저장하면 수당 없음을 확인합니다.</p>}
    <h3>주급에 포함된 완료 근무</h3><ul className="mc-payment-list">{week.workEntries?.map(record => <li key={record.id}><span>{record.workDate}<small>{record.templateName} · {record.durationMinutes / 60}시간</small></span><b>{won(record.expectedAmount)}</b></li>)}</ul>{!week.workEntries?.length && <p className="mc-hint">이 주에 완료한 근무가 없습니다.</p>}
    {error && <SaveError message={error} path={"/calendar/pay-weeks/" + week.start} onReload={(current: CalendarWeek) => { setWeek(current); setValues(Object.fromEntries(allowances.map(([key]) => [key, current[key] === null ? "" : String(current[key])])) as Record<AllowanceKey, string>); setDirty(false); setError(""); }} />}{saved && <p role="status" className="mc-success">수당 내역을 저장했습니다.</p>}</fieldset>
    <footer><button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving || !computed.valid}>{saving ? "저장 중…" : "수당 내역 저장"}</button></footer></form>;
}

export function TemplateEditor({ initial, onSaved }: { initial: WorkTemplate; onSaved: (template: WorkTemplate) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false), active = useEditorActive(), { setDirty } = useContext(PanelContext);
  const patch = (changes: Partial<WorkTemplate>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const setPreset = (id: string, changes: Partial<WorkTemplate["presets"][number]>) => patch({ presets: draft.presets.map(preset => preset.id === id ? { ...preset, ...changes } : preset) });
  if (initial.builtIn === "OFF") return <section className="mc-editor"><h3>🏠 휴무</h3><p className="mc-hint">기본 제공 템플릿 · 읽기 전용<br />실근무 0분 · 받을 예정액 0원. 근무일의 템플릿 선택에서 바로 사용할 수 있습니다.</p></section>;
  return <form className="mc-editor" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return;
    const duration = draft.startTime || draft.endTime ? workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight) : draft.durationMinutes;
    if (!draft.name.trim() || !Number.isInteger(draft.durationMinutes) || draft.durationMinutes <= 0 || draft.durationMinutes > 1440 || duration !== draft.durationMinutes || !Number.isInteger(draft.breakMinutes) || draft.breakMinutes < 0 || draft.presets.some(preset => !preset.name.trim() || !validKrw(preset.amount)) || draft.active && !draft.presets.some(preset => preset.id === draft.defaultPresetId && preset.active)) { setError("이름·시간·휴게·프리셋을 확인하세요. 기본 시각은 둘 다 비우거나 실근무 분과 일치해야 하며, 활성 템플릿에는 활성 기본 프리셋이 필요합니다."); return; }
    busy.current = true; setSaving(true); setError("");
    try { const saved = await api.put<WorkTemplate>("/calendar/templates/" + draft.id, { expectedVersion: draft.version, name: draft.name, durationMinutes: draft.durationMinutes, startTime: draft.startTime || null, endTime: draft.endTime || null, breakMinutes: draft.breakMinutes, overnight: draft.overnight, shiftDescription: draft.shiftDescription, groupName: draft.groupName, active: draft.active, presets: draft.presets, defaultPresetId: draft.defaultPresetId }); if (!active.current) return; setDraft(saved); setDirty(false); setSaved(true); onSaved(saved); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "템플릿 저장 실패"); } finally { busy.current = false; if (active.current) setSaving(false); }
  }}><fieldset disabled={saving}>
    <p className="mc-hint">새 기록에 적용할 기본값입니다. 이전 근무 기록의 이름·시간·금액은 보존됩니다.</p><CalendarField label="템플릿 이름"><input required value={draft.name} onChange={event => patch({ name: event.target.value })} /></CalendarField>
    <div className="mc-two"><NumberField label="실근무 (분)" min={1} value={draft.durationMinutes} onChange={durationMinutes => patch({ durationMinutes })} /><NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><CalendarField label="기본 시작 (선택)"><input type="time" value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="기본 종료 (선택)"><input type="time" value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료는 다음 날</label>
    <CalendarField label="시간대 설명"><input value={draft.shiftDescription ?? ""} onChange={event => patch({ shiftDescription: event.target.value })} /></CalendarField><CalendarField label="근무조"><input value={draft.groupName ?? ""} onChange={event => patch({ groupName: event.target.value })} /></CalendarField>
    <label className="mc-check"><input type="checkbox" checked={draft.active} onChange={event => patch({ active: event.target.checked })} />이 템플릿 사용</label><h3>하위 금액 프리셋</h3>
    {draft.presets.map((preset, index) => <section className="mc-payment" key={preset.id}><label className="mc-check"><input type="radio" name="default-preset" checked={draft.defaultPresetId === preset.id} disabled={!preset.active} onChange={() => patch({ defaultPresetId: preset.id })} />기본 프리셋</label><CalendarField label={`프리셋 ${index + 1} 이름`}><input required value={preset.name} onChange={event => setPreset(preset.id, { name: event.target.value })} /></CalendarField><NumberField label={`프리셋 ${index + 1} 금액 (원)`} value={preset.amount} onChange={amount => setPreset(preset.id, { amount })} /><label className="mc-check"><input type="checkbox" checked={preset.active} onChange={event => setPreset(preset.id, { active: event.target.checked })} />사용 (해제하면 비활성)</label></section>)}
    <button type="button" onClick={() => patch({ presets: [...draft.presets, { id: crypto.randomUUID(), name: "새 일급", amount: 0, active: true }] })}>＋ 금액 프리셋 추가</button>
    {error && <SaveError message={error} path={"/calendar/templates/" + draft.id} onReload={(template: WorkTemplate) => { setDraft(template); setDirty(false); setError(""); }} />}{saved && <p role="status" className="mc-success">템플릿을 저장했습니다.</p>}
    </fieldset><footer><button className="money-primary" disabled={saving}>{saving ? "저장 중…" : "템플릿 저장"}</button></footer></form>;
}

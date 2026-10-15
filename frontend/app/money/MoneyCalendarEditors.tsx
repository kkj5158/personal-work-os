"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { moneyApi as api, won } from "@/lib/money/model";
import { earningsAllowances, dailyEarnings, earningsDraft, applyTemplate, kstDate, nonWorkingRecord, offTemplateId, validateWork, validKrw, workMinutes, workStatuses, type EarningsWeek, type WorkRecord, type WorkTemplate } from "@/lib/money/calendar";
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
    if ("workDate" in latest) { const record = latest as WorkRecord; fields.push(["근무일", record.workDate], ["상태", workStatuses[record.status]], ["템플릿", record.templateName], ["확정 일당", record.confirmedDailyPay == null ? "과거 금액 확인 필요" : won(record.confirmedDailyPay)], ["메모", record.memo || "—"]); }
    else if ("finalPay" in latest) { const week = latest as EarningsWeek; fields.push(["주간", `${week.start}–${week.end}`], ["주급 총액", won(week.finalPay)], ...earningsAllowances.map(([key, label]): [string, ReactNode] => [label, won(week[key])])); }
    else if ("presets" in latest) { const template = latest as WorkTemplate; fields.push(["템플릿", template.name], ["실근무", `${template.durationMinutes}분`], ["기본 시각", `${template.startTime || "미지정"}–${template.endTime || "미지정"}${template.overnight ? " (익일 종료)" : ""}`], ["휴게", `${template.breakMinutes}분`], ["사용 상태", template.active ? "활성" : "비활성"], ["금액 프리셋", template.presets.map(preset => `${preset.name} ${won(preset.amount)}${preset.id === template.defaultPresetId ? " (기본)" : ""}${preset.active ? "" : " (비활성)"}`).join(" / ")]); }
  }
  return <div className="mc-error" role="alert"><p>{message} 입력한 초안은 유지됩니다.</p><button type="button" onClick={async () => { try { setLatest(await api.get(path)); setReadError(""); } catch (error) { setReadError(error instanceof Error ? error.message : "현재 값을 조회하지 못했습니다."); } }}>서버의 현재 값 비교</button>{readError && <p>{readError}</p>}{latest != null && <><details open><summary>서버의 현재 값</summary><dl className="mc-compare">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details><button type="button" onClick={() => { if (window.confirm("현재 초안을 버리고 서버 값을 불러올까요?")) onReload(latest as never); }}>서버 값으로 다시 열기</button></>}</div>;
}
export function WorkRecordEditor({ value: initialValue, templates, onSaved, onClose, onRemoved }: { value: WorkRecord; templates: WorkTemplate[]; onSaved: (record: WorkRecord, options?: { templatesChanged: boolean }) => void; onClose: () => void; onRemoved?: () => void }) {
  const [value, setValue] = useState(() => structuredClone(initialValue));
  const [draft, setDraft] = useState(() => earningsDraft(value)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [presetName, setPresetName] = useState(""), [savePreset, setSavePreset] = useState(false);
  const workingSnapshot = useRef<WorkRecord | null>(null), busy = useRef(false), active = useEditorActive(), { setDirty } = useContext(PanelContext), today = kstDate();
  const patch = (changes: Partial<WorkRecord>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const template = templates.find(template => template.id === draft.templateId), duration = workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight);
  const working = ["SCHEDULED", "COMPLETED"].includes(draft.status);
  const earnings = dailyEarnings(draft.basePay ?? NaN, draft.dailyIncentive ?? NaN, draft.totalDeduction ?? NaN);
  const legacy = value.version > 0 && !value.removed && value.wageModel !== "CONFIRMED_V2" && (["COMPLETED", "SCHEDULED"].includes(value.status) || value.expectedAmount !== 0);
  const hasSnapshot = value.wageModel === "CONFIRMED_V2" && value.version > 0 && !value.removed && ["SCHEDULED", "COMPLETED"].includes(value.status) && draft.templateId === value.templateId;
  function selectTemplate(selected: WorkTemplate, status?: WorkRecord["status"]) {
    if (selected.builtIn === "OFF") { selectNonWorking("OFF"); return; }
    const next = applyTemplate({ ...draft, ...(status ? { status } : {}) }, selected, today);
    const prior = !working ? workingSnapshot.current : null;
    patch({ ...next, basePay: prior?.basePay ?? next.expectedAmount, dailyIncentive: prior?.dailyIncentive ?? draft.dailyIncentive ?? 0, totalDeduction: prior?.totalDeduction ?? draft.totalDeduction ?? 0 });
    setSavePreset(false);
  }
  function selectNonWorking(status: "OFF" | "CANCELLED") {
    const hasMoney = (draft.basePay ?? 0) !== 0 || (draft.dailyIncentive ?? 0) !== 0 || (draft.totalDeduction ?? 0) !== 0 || legacy && draft.expectedAmount !== 0;
    if (hasMoney && !window.confirm("휴무·취소는 급여 합계에서 제외되며 금액은 0원이 됩니다. 기존 원본은 보존됩니다. 변경할까요?")) return;
    if (working) workingSnapshot.current = structuredClone(draft);
    patch({ ...nonWorkingRecord(draft, status), basePay: 0, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 0 }); setSavePreset(false);
  }
  async function save() {
    if (busy.current) return;
    const problem = validateWork(draft, today) || (!earnings.valid ? "기본급·인센·공제총액을 입력하세요. 공제총액은 기본급과 인센의 합계를 넘을 수 없습니다." : "") || (working && !draft.templateId ? "사용할 근무 템플릿을 먼저 만들어 선택하세요." : "") || (working && savePreset && !presetName.trim() ? "새 프리셋 이름을 입력하세요." : "");
    if (problem) { setError(problem); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const record = await api.put<WorkRecord>("/calendar/earnings-records/" + draft.id, { expectedVersion: draft.version, workDate: draft.workDate, status: draft.status, templateId: draft.templateId, presetId: draft.presetId, startTime: draft.startTime || null, endTime: draft.endTime || null, overnight: draft.overnight, breakMinutes: draft.breakMinutes, durationMinutes: working ? duration : 0, basePay: draft.basePay, dailyIncentive: draft.dailyIncentive, totalDeduction: draft.totalDeduction, memo: draft.memo, ...(working && savePreset ? { saveAsPresetName: presetName.trim() } : {}) });
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
    <CalendarField label="근무 상태"><select value={draft.status} onChange={event => { const status = event.target.value as WorkRecord["status"]; if (status === "OFF" || status === "CANCELLED") selectNonWorking(status); else { const normal = templates.find(template => template.active && !template.builtIn); if (!working && normal) selectTemplate(normal, status); else patch({ status }); } }}>{Object.entries(workStatuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></CalendarField>
    <CalendarField label="근무 템플릿"><select value={draft.status === "OFF" ? offTemplateId : draft.templateId ?? ""} onChange={event => { const selected = templates.find(template => template.id === event.target.value); if (selected) selectTemplate(selected); }}><option value="">템플릿 선택</option>{templates.filter(template => template.active || template.id === draft.templateId).map(template => <option key={template.id} value={template.id}>{template.name}{!template.active ? " · 비활성" : ""}</option>)}</select></CalendarField>
    {legacy && <div className="mc-error" role="note">과거 금액 {won(value.expectedAmount)}은 이전 예상액 원본입니다. 확정 급여 합계에서 제외됩니다. 기본급·인센·공제총액을 직접 확인하여 입력하거나 템플릿을 명시적으로 적용한 뒤 저장하세요.</div>}
    {working && hasSnapshot && <p className="mc-hint">기록 당시: {value.templateName} · {value.presetName} · {won(value.presetAmount)}<br />과거 값은 템플릿 변경 후에도 보존됩니다.</p>}
    {working ? <>
    <CalendarField label="기본급 프리셋"><select value={draft.presetId === value.presetId && draft.basePay === value.basePay && value.wageModel === "CONFIRMED_V2" && hasSnapshot ? "snapshot" : template?.presets.find(preset => preset.id === draft.presetId)?.amount === draft.basePay ? draft.presetId ?? "" : ""} onChange={event => { if (event.target.value === "snapshot") { patch({ presetId: value.presetId, presetName: value.presetName, presetAmount: value.presetAmount, basePay: value.basePay }); return; } const preset = template?.presets.find(preset => preset.id === event.target.value); if (preset) patch({ presetId: preset.id, presetName: preset.name, presetAmount: preset.amount, basePay: preset.amount }); }}>
      {hasSnapshot && <option value="snapshot">기록 당시 · {value.presetName} · {won(value.presetAmount)}</option>}<option value="">직접 입력 / 프리셋 선택</option>{template?.presets.filter(preset => preset.active).map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {won(preset.amount)}</option>)}
    </select></CalendarField>
    <h3>근무 시간</h3><div className="mc-two"><CalendarField label="시작"><input type="time" required={working} value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="종료"><input type="time" required={working} value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료 시각은 다음 날</label>
    <NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><p className="mc-hint">실근무 {working ? Number.isFinite(duration) ? `${duration / 60}시간 (${duration}분)` : "시간 확인 필요" : "0시간"}</p>
    <NumberField label="기본급 (원)" value={draft.basePay ?? NaN} onChange={basePay => patch({ basePay })} /><p className="mc-hint">공휴일 가산금이 있으면 기본급에 포함해 입력하세요.</p>
    <NumberField label="인센 (원)" value={draft.dailyIncentive ?? 0} onChange={dailyIncentive => patch({ dailyIncentive })} />
    <NumberField label="공제총액 (원)" value={draft.totalDeduction ?? 0} onChange={totalDeduction => patch({ totalDeduction })} />
    <div className="mc-base"><span>확정 일당</span><output>{earnings.valid ? won(earnings.total) : "금액 확인 필요"}</output></div>{!earnings.valid && <p className="mc-error" role="alert">세 금액은 0 이상의 원 단위 정수여야 하며 공제총액이 기본급과 인센의 합계를 넘을 수 없습니다.</p>}
    <label className="mc-check"><input type="checkbox" checked={savePreset} onChange={event => { setSavePreset(event.target.checked); setDirty(true); }} />이 기본급을 새 프리셋으로도 저장</label>{savePreset && <CalendarField label="새 프리셋 이름"><input required value={presetName} onChange={event => { setPresetName(event.target.value); setDirty(true); }} /></CalendarField>}
    </> : <p className="mc-hint">{workStatuses[draft.status]} · 실근무 0분 · 확정 일당 0원</p>}
    <CalendarField label="메모"><textarea rows={3} value={draft.memo ?? ""} onChange={event => patch({ memo: event.target.value })} /></CalendarField>
    {error && <SaveError message={error} path={"/calendar/earnings-records/" + draft.id} onReload={(record: WorkRecord) => { workingSnapshot.current = null; setValue(record); setDraft(earningsDraft(record)); setDirty(false); setError(""); }} />}{saved && <p className="mc-success" role="status">근무 기록을 저장했습니다.</p>}
    </fieldset><footer>{value.status === "OFF" && draft.status === "OFF" && value.version > 0 && !value.removed && <button type="button" disabled={saving} onClick={() => void removeOff()}>휴무 기록 삭제</button>}<button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving} type="submit">{saving ? "저장 중…" : "근무 기록 저장"}</button></footer></form>;
}

export function WeeklyEditor({ start, onClose, onSaved }: { start: string; onClose: () => void; onSaved: () => void }) {
  const result = useMoneyData<EarningsWeek>("/calendar/earnings-weeks/" + start, { autoRefresh: false }), cache = useMoneyCache();
  return <><CalendarRequestState loading={result.loading && !result.data} error={result.error} retry={() => cache.invalidate(key => key === "/calendar/earnings-weeks/" + start)} />{result.data && <WeeklyForm key={start} initial={result.data} onClose={onClose} onSaved={onSaved} />}</>;
}
export function WeeklyForm({ initial, onClose, onSaved }: { initial: EarningsWeek; onClose: () => void; onSaved: () => void }) {
  const [week, setWeek] = useState(initial), [special, setSpecial] = useState(initial.specialWorkAllowance), [rest, setRest] = useState(initial.weeklyHolidayAllowance), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false);
  const active = useEditorActive(), { setDirty } = useContext(PanelContext), finalPay = week.baseTotal + week.incentiveTotal - week.deductionTotal + special + rest, valid = validKrw(special) && validKrw(rest) && Number.isSafeInteger(finalPay) && finalPay >= 0;
  function load(current: EarningsWeek) { setWeek(current); setSpecial(current.specialWorkAllowance); setRest(current.weeklyHolidayAllowance); setDirty(false); setError(""); }
  return <form className="mc-editor" onSubmit={async event => { event.preventDefault(); if (!valid || busy.current) return; busy.current = true; setSaving(true); setError(""); try { const response = await api.put<EarningsWeek>("/calendar/earnings-weeks/" + week.start, { expectedVersion: week.version, expectedDailyFingerprint: week.dailyFingerprint, specialWorkAllowance: special, weeklyHolidayAllowance: rest }); if (!active.current) return; load(response); setSaved(true); onSaved(); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "수당 저장 실패"); } finally { busy.current = false; if (active.current) setSaving(false); } }}>
    <fieldset disabled={saving}><p className="mc-hint">{week.start}–{week.end} · 일–토 · 저장된 근무의 확정 급여<br />근무 예정·완료 여부와 관계없이 확정 금액을 합산합니다.</p>
    <span className="money-muted">주급 총액</span><p className="mc-week-total">{valid ? won(finalPay) : "금액 확인 필요"}</p>
    <div className="mc-base"><span>기본급 총합</span><b>{won(week.baseTotal)}</b></div><p className="mc-hint">인센 합계 {won(week.incentiveTotal)} · 공제액 총합 {won(week.deductionTotal)}</p>
    {!!week.legacyReviewCount && <p className="mc-error">과거 기록 {week.legacyReviewCount}건은 금액 확인이 필요하여 합계에서 제외되어 있습니다.</p>}
    <h3>주간 추가 수당</h3><NumberField label="특근수당" value={special} onChange={value => { setSpecial(value); setDirty(true); setSaved(false); }} /><NumberField label="주휴수당" value={rest} onChange={value => { setRest(value); setDirty(true); setSaved(false); }} />
    {!valid && <p className="mc-error" role="alert">수당을 0 이상의 원 단위 정수로 입력하세요. 계산 결과도 허용 금액 범위여야 합니다.</p>}
    <h3>주급에 포함된 근무</h3><ul className="mc-payment-list">{week.workEntries?.map(record => <li key={record.id}><span>{record.workDate}<small>{record.templateName} · {workStatuses[record.status]}</small></span><b>{won(record.confirmedDailyPay ?? 0)}</b></li>)}</ul>{!week.workEntries?.length && <p className="mc-hint">확정 급여가 저장된 근무가 없습니다.</p>}
    {error && <SaveError message={error} path={"/calendar/earnings-weeks/" + week.start} onReload={load} />}{saved && <p role="status" className="mc-success">수당 내역을 저장했습니다.</p>}</fieldset>
    <footer><button type="button" disabled={saving} onClick={onClose}>닫기</button><button className="money-primary" disabled={saving || !valid}>{saving ? "저장 중…" : "수당 내역 저장"}</button></footer></form>;
}

export function TemplateEditor({ initial, onSaved }: { initial: WorkTemplate; onSaved: (template: WorkTemplate) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), busy = useRef(false), active = useEditorActive(), { setDirty } = useContext(PanelContext);
  const patch = (changes: Partial<WorkTemplate>) => { setDraft(current => ({ ...current, ...changes })); setDirty(true); setSaved(false); };
  const setPreset = (id: string, changes: Partial<WorkTemplate["presets"][number]>) => patch({ presets: draft.presets.map(preset => preset.id === id ? { ...preset, ...changes } : preset) });
  if (initial.builtIn === "OFF") return <section className="mc-editor"><h3>🏠 휴무</h3><p className="mc-hint">기본 제공 템플릿 · 읽기 전용<br />실근무 0분 · 확정 일당 0원. 근무일의 템플릿 선택에서 바로 사용할 수 있습니다.</p></section>;
  return <form className="mc-editor" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return;
    const duration = draft.startTime || draft.endTime ? workMinutes(draft.startTime, draft.endTime, draft.breakMinutes, draft.overnight) : draft.durationMinutes;
    if (!draft.name.trim() || !Number.isInteger(draft.durationMinutes) || draft.durationMinutes <= 0 || draft.durationMinutes > 1440 || duration !== draft.durationMinutes || !Number.isInteger(draft.breakMinutes) || draft.breakMinutes < 0 || draft.presets.some(preset => !preset.name.trim() || !validKrw(preset.amount)) || draft.active && !draft.presets.some(preset => preset.id === draft.defaultPresetId && preset.active)) { setError("이름·시간·휴게·프리셋을 확인하세요. 기본 시각은 둘 다 비우거나 실근무 분과 일치해야 하며, 활성 템플릿에는 활성 기본 프리셋이 필요합니다."); return; }
    busy.current = true; setSaving(true); setError("");
    try { const saved = await api.put<WorkTemplate>("/calendar/templates/" + draft.id, { expectedVersion: draft.version, name: draft.name, durationMinutes: draft.durationMinutes, startTime: draft.startTime || null, endTime: draft.endTime || null, breakMinutes: draft.breakMinutes, overnight: draft.overnight, shiftDescription: draft.shiftDescription, groupName: draft.groupName, active: draft.active, presets: draft.presets, defaultPresetId: draft.defaultPresetId }); if (!active.current) return; setDraft(saved); setDirty(false); setSaved(true); onSaved(saved); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "템플릿 저장 실패"); } finally { busy.current = false; if (active.current) setSaving(false); }
  }}><fieldset disabled={saving}>
    <p className="mc-hint">명시적으로 선택하면 기본급에 적용하는 설정입니다. 기존 예상액 프리셋도 적용 전에 금액을 확인하세요. 이전 근무 기록의 이름·시간·금액은 보존됩니다.</p><CalendarField label="템플릿 이름"><input required value={draft.name} onChange={event => patch({ name: event.target.value })} /></CalendarField>
    <div className="mc-two"><NumberField label="실근무 (분)" min={1} value={draft.durationMinutes} onChange={durationMinutes => patch({ durationMinutes })} /><NumberField label="휴게 (분)" value={draft.breakMinutes} onChange={breakMinutes => patch({ breakMinutes })} /><CalendarField label="기본 시작 (선택)"><input type="time" value={draft.startTime?.slice(0, 5) ?? ""} onChange={event => patch({ startTime: event.target.value })} /></CalendarField><CalendarField label="기본 종료 (선택)"><input type="time" value={draft.endTime?.slice(0, 5) ?? ""} onChange={event => patch({ endTime: event.target.value })} /></CalendarField></div>
    <label className="mc-check"><input type="checkbox" checked={draft.overnight} onChange={event => patch({ overnight: event.target.checked })} />종료는 다음 날</label>
    <CalendarField label="시간대 설명"><input value={draft.shiftDescription ?? ""} onChange={event => patch({ shiftDescription: event.target.value })} /></CalendarField><CalendarField label="근무조"><input value={draft.groupName ?? ""} onChange={event => patch({ groupName: event.target.value })} /></CalendarField>
    <label className="mc-check"><input type="checkbox" checked={draft.active} onChange={event => patch({ active: event.target.checked })} />이 템플릿 사용</label><h3>기본급 프리셋</h3>
    {draft.presets.map((preset, index) => <section className="mc-payment" key={preset.id}><label className="mc-check"><input type="radio" name="default-preset" checked={draft.defaultPresetId === preset.id} disabled={!preset.active} onChange={() => patch({ defaultPresetId: preset.id })} />기본 프리셋</label><CalendarField label={`프리셋 ${index + 1} 이름`}><input required value={preset.name} onChange={event => setPreset(preset.id, { name: event.target.value })} /></CalendarField><NumberField label={`프리셋 ${index + 1} 기본급 (원)`} value={preset.amount} onChange={amount => setPreset(preset.id, { amount })} /><label className="mc-check"><input type="checkbox" checked={preset.active} onChange={event => setPreset(preset.id, { active: event.target.checked })} />사용 (해제하면 비활성)</label></section>)}
    <button type="button" onClick={() => patch({ presets: [...draft.presets, { id: crypto.randomUUID(), name: "새 기본급", amount: 0, active: true }] })}>＋ 금액 프리셋 추가</button>
    {error && <SaveError message={error} path={"/calendar/templates/" + draft.id} onReload={(template: WorkTemplate) => { setDraft(template); setDirty(false); setError(""); }} />}{saved && <p role="status" className="mc-success">템플릿을 저장했습니다.</p>}
    </fieldset><footer><button className="money-primary" disabled={saving}>{saving ? "저장 중…" : "템플릿 저장"}</button></footer></form>;
}

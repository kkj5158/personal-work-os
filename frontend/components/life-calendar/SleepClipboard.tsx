"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { isCalendarTextTarget, type PasteTarget } from "@/app/calendar/clipboard";
import { copySleepRecord, pasteSleepDraft, type SleepClipboard as Snapshot } from "@/lib/sleep/clipboard";
import type { Draft } from "@/lib/sleep/model";

export type SleepClipboardControls = { active: boolean; target: PasteTarget | null; onTarget: (target: PasteTarget) => void };
export function useSleepClipboard(options: { owner: string | null; draft: Draft | null; disabled: boolean; dirty: boolean; paste: (draft: Draft) => void; notify: (message: string) => void }) {
  const [buffer, setBuffer] = useState<{ owner: string; snapshot: Snapshot } | null>(null);
  const [target, setTarget] = useState<PasteTarget | null>(null);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current) { setBuffer(null); setTarget(null); } });
    return () => { current = false; };
  }, [options.owner]);
  const snapshot = buffer?.owner === options.owner ? buffer?.snapshot : null;
  function copy() {
    if (options.disabled || !options.owner) return;
    if (options.dirty) { options.notify("변경한 기록을 저장하거나 취소한 뒤 복사해주세요."); return; }
    try {
      if (!options.draft) throw Error("복사할 수면 기록을 선택해주세요.");
      setBuffer({ owner: options.owner, snapshot: copySleepRecord(options.draft) }); setTarget(null);
      options.notify("1개 복사됨 · 붙여넣을 날짜/시간을 선택하세요.");
    } catch (e) { options.notify((e as Error).message); }
  }
  function paste() {
    if (options.disabled || !snapshot) return;
    if (options.dirty) { options.notify("변경한 기록을 저장하거나 취소한 뒤 붙여넣어주세요."); return; }
    if (!target) { options.notify("붙여넣을 날짜/시간을 먼저 선택하세요."); return; }
    try { options.paste(pasteSleepDraft(snapshot, target)); } catch (e) { options.notify((e as Error).message); }
  }
  const keydown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat || e.altKey || options.disabled || isCalendarTextTarget(e.target) || window.getSelection()?.toString()) return;
    const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (command && key === "c" && options.draft?.original) { e.preventDefault(); copy(); }
    else if (command && key === "v" && snapshot) { e.preventDefault(); paste(); }
  });
  useEffect(() => { const handler = (e: KeyboardEvent) => keydown(e); document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler); }, []);
  const controls: SleepClipboardControls = { active: !!snapshot, target, onTarget: setTarget };
  const toolbar = <div className="sleep-clipboard sleep-row" aria-label="수면 복사 및 붙여넣기">
    <button disabled={options.disabled || !options.draft?.original || options.dirty} onClick={copy} title="Ctrl/Cmd+C">복사</button>
    {snapshot && <><span>1개 복사됨 · {snapshot.kind === "nap" ? "낮잠" : "야간 수면"}</span>
      <label>대상 날짜<input aria-label="붙여넣을 날짜" type="date" disabled={options.disabled} value={target?.date ?? ""} onChange={e => setTarget(e.target.value ? { ...target, date: e.target.value } : null)}/></label>
      <label>대상 시각<input aria-label="붙여넣을 시각" type="time" disabled={options.disabled || !target} value={target?.minute === undefined ? "" : `${String(Math.floor(target.minute / 60)).padStart(2,"0")}:${String(target.minute % 60).padStart(2,"0")}`} onChange={e => { if (target) { const [h,m] = e.target.value.split(":").map(Number); setTarget({ date: target.date, minute: e.target.value ? h * 60 + m : undefined }); } }}/></label>
      <span>{target ? `${target.date} · ${target.minute === undefined ? "원래 시간 유지" : "선택한 시간"}` : "빈 시간대를 클릭하거나 대상 날짜를 선택하세요."}</span>
      <button disabled={options.disabled || options.dirty || !target} onClick={paste} title="Ctrl/Cmd+V">붙여넣기</button>
      <button disabled={options.disabled} onClick={() => { setBuffer(null); setTarget(null); }}>복사 해제</button></>}
  </div>;
  return { controls, toolbar };
}

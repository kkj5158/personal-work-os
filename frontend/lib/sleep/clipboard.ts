import type { PasteTarget } from "@/app/calendar/clipboard";
import { draftOf, endpoint, localParts, resolve, type Draft, type Nap, type Session } from "./model";

/** A module-private, manual-only snapshot. No identity, revision or device evidence. */
export type SleepClipboard = { kind: "main" | "nap"; start: string; durationMs: number; sleepScore?: string; sleepNote?: string };
export function copySleepRecord(draft: Draft): SleepClipboard {
  if (!draft.original) throw Error("저장된 수면 기록을 선택해주세요.");
  const record = draft.original;
  const start = draft.kind === "main" ? (record as Session).bedtimeIntentAt : (record as Nap).startAt;
  const end = draft.kind === "main" ? (record as Session).wakeAt : (record as Nap).endAt;
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw Error("시작과 종료가 있는 수면 기록만 복사할 수 있습니다.");
  return { kind: draft.kind, start, durationMs: Date.parse(end) - Date.parse(start),
    ...(draft.kind === "main" ? { sleepScore: (record as Session).sleepScore == null ? "" : String((record as Session).sleepScore), sleepNote: (record as Session).sleepNote ?? "" } : {}) };
}
export function pasteSleepDraft(clipboard: SleepClipboard, target: PasteTarget): Draft {
  const clock = localParts(clipboard.start, "Asia/Seoul").time;
  const time = target.minute === undefined ? clock : `${String(Math.floor(target.minute / 60)).padStart(2,"0")}:${String(target.minute % 60).padStart(2,"0")}`;
  const start = resolve({ date: target.date, time, zone: "Asia/Seoul", offset: "", known: true })!.at;
  // A date-only target retains the original clock, including sub-minute precision.
  const at = Date.parse(start) + (target.minute === undefined ? Date.parse(clipboard.start) % 60000 : 0);
  return { ...draftOf(clipboard.kind, null, target.date), sleepScore: clipboard.sleepScore, sleepNote: clipboard.sleepNote,
    start: endpoint(new Date(at).toISOString(), "Asia/Seoul"), end: endpoint(new Date(at + clipboard.durationMs).toISOString(), "Asia/Seoul") };
}

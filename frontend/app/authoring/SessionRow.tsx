"use client";
import { Button } from "@/components/ui/Button";
import { sessionRoute, type Program, type SessionSummary } from "@/lib/authoring/types";

export const displayDate = (date: string) => new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** A custom title leads when present; otherwise the program name stands in for it. */
/** "2026.09.24" in the app's Asia/Seoul calendar. */
export const compactDate = (date: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(date)).map(part => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day}`;
};

export function SessionRow({ session, program, go, showProgram = true, showMemo = false, fallbackTitle }: { session: SessionSummary; program?: Program; go: (path: string) => void; showProgram?: boolean; showMemo?: boolean; fallbackTitle?: string }) {
  const completed = session.status === "COMPLETED", name = program?.title ?? session.programKey, title = session.title?.trim();
  const status = `${completed ? "완료" : "작성 중"} · ${displayDate(session.updatedAt)}`;
  return <div className="authoring-session-row">
    <div className="authoring-session-text"><strong>{title || fallbackTitle || name}</strong><span>{title && showProgram ? `${name} · ${status}` : status}</span>{showMemo && session.memo?.trim() && <p className="authoring-session-memo">{session.memo}</p>}</div>
    <div className="authoring-session-actions">{completed ? <><Button type="button" variant="ghost" onClick={() => go(sessionRoute(session, "full"))}>내용 보기</Button><Button type="button" onClick={() => go(sessionRoute(session, "report"))}>Report 보기 →</Button></> : <Button type="button" onClick={() => go(sessionRoute(session))}>이어쓰기 →</Button>}</div>
  </div>;
}

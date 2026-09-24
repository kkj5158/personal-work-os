"use client";
import { Button } from "@/components/ui/Button";
import { groupTitle, sessionRoute, type Program, type SessionSummary } from "@/lib/authoring/types";

export const displayDate = (date: string) => new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export function SessionRow({ session, program, go, showGroup = false }: { session: SessionSummary; program?: Program; go: (path: string) => void; showGroup?: boolean }) {
  const completed = session.status === "COMPLETED";
  return <div className="authoring-session-row">
    <div><strong>{program?.title ?? session.programKey}</strong>{showGroup && program && <span className="authoring-group-label">{groupTitle(program.group)}</span>}<span>{completed ? "완료" : "작성 중"} · {displayDate(session.updatedAt)}</span></div>
    <div>{completed ? <><Button type="button" variant="ghost" onClick={() => go(sessionRoute(session, "full"))}>내용 보기</Button><Button type="button" onClick={() => go(sessionRoute(session, "report"))}>Report 보기 →</Button></> : <Button type="button" onClick={() => go(sessionRoute(session))}>이어쓰기 →</Button>}</div>
  </div>;
}

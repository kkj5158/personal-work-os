"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Compass, Sunrise, Home } from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import { sessionRoute, type Program, type SessionSummary } from "@/lib/authoring/types";
import { AuthoringDialog } from "./AuthoringDialog";
export const displayDate = (date: string) => new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
export default function AuthoringHome() {
  const [programs, setPrograms] = useState<Program[]>([]), [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [future, setFuture] = useState<string | null>(null), [source, setSource] = useState("");
  const shell = useGlobalTabs(), router = useRouter();
  const action = useRef(false), creating = useRef(false);
  const navigate = (path: string) => shell ? shell.navigate(path) : router.push(path);
  const go = (path: string) => { if (action.current) return; action.current = true; setBusy(true); navigate(path); };
  const load = useCallback(() => Promise.all([authoringApi.programs(), authoringApi.sessions()])
    .then(([p, s]) => { setPrograms(p); setSessions(s); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "Authoring을 불러오지 못했습니다."))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  async function start(key: string, reference?: string, fromSource = false) {
    if (action.current && !fromSource) return;
    if (creating.current) return;
    creating.current = true; action.current = true;
    setBusy(true); setError("");
    try { const s = await authoringApi.create(key, reference); navigate(sessionRoute(s)); }
    catch (e) { creating.current = false; action.current = !!future; setBusy(false); setError(e instanceof Error ? e.message : "시작하지 못했습니다."); }
  }
  const completed = sessions.filter(s => s.status === "COMPLETED").sort((a,b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const candidates = (key: string) => completed.filter(s => key === "grounded-future" ? s.programKey === "reality" : ["recovery", "reality", "grounded-future", "past"].includes(s.programKey));
  const realities = candidates(future ?? "grounded-future");
  return <div className="authoring-home-shell">
    <SharedSidebar system="AUTHORING" groups={[{ section: "AUTHORING", items: [{ label: "Home", icon: Home, active: true, destination: "/authoring" }] }]} />
    <main className="authoring-home" onClick={event => event.stopPropagation()}>
      <header className="authoring-intro"><p className="authoring-eyebrow">AUTHORING</p><h1>자신의 언어로 쓰고,<br />현실의 행동으로 돌아가기.</h1><p>특정 시점의 삶을 글쓰기·점검·선택 과정을 통해 구조화하고 결과를 Report/Snapshot으로 남기는 guided authoring system.</p></header>
      {error && <div role="alert" className="authoring-error">{error} <Button type="button" onClick={() => void load()}>다시 시도</Button></div>}
      {loading ? <p role="status">불러오는 중…</p> : <>
        {[{title:"Quick Writing",quick:true},{title:"Deep Authoring",quick:false}].map(group => <section className="authoring-program-group" key={group.title} aria-label={group.title}><h2>{group.title}</h2>{group.quick && <p className="authoring-muted">5–10분 · 지금 할 작은 행동으로 돌아가기</p>}<div className="authoring-programs" onClick={event => event.stopPropagation()}>{programs.filter(p => (p.programKey === "quick-motivation") === group.quick).map(p => {
          const Icon = p.programKey === "recovery" ? Leaf : p.programKey === "reality" ? Compass : Sunrise;
          const unfinished = sessions.filter(s => s.programKey === p.programKey && s.status === "IN_PROGRESS").sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          const newSession = () => { if (action.current) return; if ((p.programKey === "grounded-future" || p.programKey === "review")) { setSource(candidates(p.programKey)[0]?.id ?? ""); action.current = true; setFuture(p.programKey); } else void start(p.programKey); };
          return <article key={p.programKey} className={`authoring-program ${p.programKey}`}><Icon size={30} strokeWidth={1.5} /><h3>{p.title}</h3><p>{p.description}</p><div><Button type="button" variant="primary" disabled={busy || !!future} onClick={() => unfinished ? go(sessionRoute(unfinished)) : newSession()}>{unfinished ? "이어쓰기" : "시작하기"} →</Button>{unfinished && <Button type="button" variant="ghost" disabled={busy || !!future} onClick={newSession}>새로 시작</Button>}</div></article>;
        })}</div></section>)}
        <section className="authoring-recent"><h2>최근 작성</h2>{sessions.length === 0 && <p className="authoring-muted">아직 작성한 세션이 없습니다. 프로그램을 선택해 시작하세요.</p>}{sessions.map(s => <div className="authoring-session-row" key={s.id}><div><strong>{programs.find(p => p.programKey === s.programKey)?.title ?? s.programKey}</strong><span>{s.status === "COMPLETED" ? "완료" : "작성 중"} · {displayDate(s.updatedAt)}</span></div><div>{s.status === "COMPLETED" ? <><Button type="button" variant="ghost" onClick={() => go(sessionRoute(s, "full"))}>내용 보기</Button><Button type="button" onClick={() => go(sessionRoute(s, "report"))}>Report 보기 →</Button></> : <Button type="button" onClick={() => go(sessionRoute(s))}>이어쓰기 →</Button>}</div></div>)}</section>
      </>}
      {future && <AuthoringDialog title={future === "review" ? "Review 시작" : "Grounded Future 시작"} onClose={() => { if (!busy) { action.current = false; setFuture(null); } }}><p>{future === "review" ? "완료된 기록을 읽고 변화를 돌아봅니다. 원본은 수정되지 않습니다." : "Reality를 출발점으로 미래를 작성합니다. 참조 없이 시작할 수도 있습니다."}</p><label className="authoring-field">참고할 완료 기록<select value={source} onChange={e => setSource(e.target.value)}><option value="">{future === "review" ? "기록을 선택하세요" : "참조 없이 시작"}</option>{realities.map((s,i) => <option key={s.id} value={s.id}>{i === 0 ? "최근 · " : ""}{programs.find(p => p.programKey === s.programKey)?.title} · {displayDate(s.completedAt!)}</option>)}</select></label>{future === "review" && !realities.length && <p>Recovery, Reality, Grounded Future 또는 Past를 완료한 뒤 Review를 시작할 수 있습니다.</p>}{error && <p role="alert">{error}</p>}<Button type="button" variant="primary" disabled={busy || (future === "review" && !source)} onClick={() => { if (busy) return; void start(future, source || undefined, true); }}>시작하기</Button></AuthoringDialog>}
    </main>
  </div>;
}

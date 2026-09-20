"use client";
import { useCallback, useEffect, useState } from "react";
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
  const [future, setFuture] = useState(false), [source, setSource] = useState("");
  const shell = useGlobalTabs(), router = useRouter();
  const go = (path: string) => shell ? shell.navigate(path) : router.push(path);
  const load = useCallback(() => Promise.all([authoringApi.programs(), authoringApi.sessions()])
    .then(([p, s]) => { setPrograms(p); setSessions(s); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "Authoring을 불러오지 못했습니다."))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  async function start(key: string, reference?: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { const s = await authoringApi.create(key, reference); go(sessionRoute(s)); }
    catch (e) { setError(e instanceof Error ? e.message : "시작하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const realities = sessions.filter(s => s.programKey === "reality" && s.status === "COMPLETED").sort((a,b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return <div className="authoring-home-shell">
    <SharedSidebar system="AUTHORING" groups={[{ section: "AUTHORING", items: [{ label: "Home", icon: Home, active: true, destination: "/authoring" }] }]} />
    <main className="authoring-home">
      <header className="authoring-intro"><p className="authoring-eyebrow">AUTHORING</p><h1>자신의 언어로 쓰고,<br />현실의 행동으로 돌아가기.</h1><p>특정 시점의 삶을 글쓰기·점검·선택 과정을 통해 구조화하고 결과를 Report/Snapshot으로 남기는 guided authoring system.</p></header>
      {error && <div role="alert" className="authoring-error">{error} <Button onClick={() => void load()}>다시 시도</Button></div>}
      {loading ? <p role="status">불러오는 중…</p> : <>
        <div className="authoring-programs">{programs.map(p => {
          const Icon = p.programKey === "recovery" ? Leaf : p.programKey === "reality" ? Compass : Sunrise;
          const unfinished = sessions.find(s => s.programKey === p.programKey && s.status === "IN_PROGRESS");
          const newSession = () => { if (p.programKey === "grounded-future") { setSource(realities[0]?.id ?? ""); setFuture(true); } else void start(p.programKey); };
          return <article key={p.programKey} className={`authoring-program ${p.programKey}`}><Icon size={30} strokeWidth={1.5} /><h2>{p.title}</h2><p>{p.description}</p><div><Button variant="primary" disabled={busy} onClick={() => unfinished ? go(sessionRoute(unfinished)) : newSession()}>{unfinished ? "이어쓰기" : "시작하기"} →</Button>{unfinished && <Button variant="ghost" disabled={busy} onClick={newSession}>새로 시작</Button>}</div></article>;
        })}</div>
        <section className="authoring-recent"><h2>최근 작성</h2>{sessions.length === 0 && <p className="authoring-muted">아직 작성한 세션이 없습니다. 프로그램을 선택해 시작하세요.</p>}{sessions.map(s => <div className="authoring-session-row" key={s.id}><div><strong>{programs.find(p => p.programKey === s.programKey)?.title ?? s.programKey}</strong><span>{s.status === "COMPLETED" ? "완료" : "작성 중"} · {displayDate(s.updatedAt)}</span></div><div>{s.status === "COMPLETED" ? <><Button variant="ghost" onClick={() => go(sessionRoute(s, "full"))}>내용 보기</Button><Button onClick={() => go(sessionRoute(s, "report"))}>Report 보기 →</Button></> : <Button onClick={() => go(sessionRoute(s))}>이어쓰기 →</Button>}</div></div>)}</section>
        <div className="authoring-future">{["Review Authoring", "Past Authoring"].map(title => <div key={title} aria-disabled="true"><span>{title}</span><span>Coming Later</span></div>)}</div>
      </>}
      {future && <AuthoringDialog title="Grounded Future 시작" onClose={() => !busy && setFuture(false)}><p>Reality를 출발점으로 미래를 작성합니다. 참조 없이 시작할 수도 있습니다.</p><label className="authoring-field">참고할 Reality<select value={source} onChange={e => setSource(e.target.value)}><option value="">참조 없이 시작</option>{realities.map((s,i) => <option key={s.id} value={s.id}>{i === 0 ? "최근 · " : ""}{displayDate(s.completedAt!)} · {s.specVersion}</option>)}</select></label>{error && <p role="alert">{error}</p>}<Button variant="primary" disabled={busy} onClick={() => void start("grounded-future", source)}>시작하기</Button></AuthoringDialog>}
    </main>
  </div>;
}

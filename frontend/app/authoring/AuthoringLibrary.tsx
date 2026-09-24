"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import type { Program, SessionSummary } from "@/lib/authoring/types";
import { AuthoringSidebar } from "./AuthoringSidebar";
import { SessionRow } from "./SessionRow";

type StatusFilter = "ALL" | SessionSummary["status"];
const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" }, { value: "IN_PROGRESS", label: "작성 중" }, { value: "COMPLETED", label: "완료" },
];

export default function AuthoringLibrary() {
  const [programs, setPrograms] = useState<Program[]>([]), [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL"), [programKey, setProgramKey] = useState("");
  const [query, setQuery] = useState(""), [oldest, setOldest] = useState(false);
  const shell = useGlobalTabs(), router = useRouter();
  const go = (path: string) => shell ? shell.navigate(path) : router.push(path);
  const load = useCallback(() => Promise.all([authoringApi.programs(), authoringApi.sessions()])
    .then(([p, s]) => { setPrograms(p); setSessions(s); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "작성 기록을 불러오지 못했습니다."))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  const byKey = useMemo(() => new Map(programs.map(p => [p.programKey, p])), [programs]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return sessions
      .filter(s => (status === "ALL" || s.status === status) && (!programKey || s.programKey === programKey)
        && (!text || (byKey.get(s.programKey)?.title ?? s.programKey).toLowerCase().includes(text)))
      .sort((a, b) => (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * (oldest ? 1 : -1) || a.id.localeCompare(b.id));
  }, [sessions, status, programKey, query, oldest, byKey]);
  return <div className="authoring-home-shell">
    <AuthoringSidebar active="library" navigate={path => { if (path !== "/authoring/library") go(path); }} />
    <main className="authoring-home authoring-library">
      <header className="authoring-intro"><p className="authoring-eyebrow">AUTHORING</p><h1>Library</h1><p>작성 중이거나 완료한 글을 찾아보고 다시 열 수 있습니다.</p></header>
      {error && <div role="alert" className="authoring-error">{error} <Button type="button" onClick={() => void load()}>다시 시도</Button></div>}
      {loading ? <p role="status">불러오는 중…</p> : !error && sessions.length === 0 ? <section className="authoring-library-empty">
        <p>아직 작성한 글이 없습니다.</p><p className="authoring-muted">Home에서 Authoring을 시작하면 이곳에 기록이 쌓입니다.</p>
        <Button type="button" variant="primary" onClick={() => go("/authoring")}>Authoring 시작하기</Button>
      </section> : sessions.length > 0 && <>
        <div className="authoring-library-filters">
          <div role="group" aria-label="상태 필터" className="authoring-segmented">{statusFilters.map(f => <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => setStatus(f.value)}>{f.label}</button>)}</div>
          <select aria-label="프로그램 필터" value={programKey} onChange={e => setProgramKey(e.target.value)}><option value="">프로그램 전체</option>{programs.map(p => <option key={p.programKey} value={p.programKey}>{p.title}</option>)}</select>
          <input type="search" aria-label="프로그램 이름 검색" placeholder="프로그램 이름 검색" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="정렬" value={oldest ? "oldest" : "recent"} onChange={e => setOldest(e.target.value === "oldest")}><option value="recent">최근 수정 순</option><option value="oldest">오래된 순</option></select>
        </div>
        <p className="authoring-muted" role="status">{visible.length}개 기록</p>
        {visible.length ? <div className="authoring-library-list">{visible.map(s => <SessionRow key={s.id} session={s} program={byKey.get(s.programKey)} go={go} showGroup />)}</div>
          : <p className="authoring-library-none">조건에 맞는 작성 기록이 없습니다.</p>}
      </>}
    </main>
  </div>;
}

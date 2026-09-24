"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import { authoringGroups, type Program, type SessionSummary } from "@/lib/authoring/types";
import { AuthoringSidebar } from "./AuthoringSidebar";
import { SessionRow } from "./SessionRow";

type StatusFilter = "ALL" | SessionSummary["status"];
const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" }, { value: "IN_PROGRESS", label: "작성 중" }, { value: "COMPLETED", label: "완료" },
];

export default function AuthoringLibrary() {
  const [programs, setPrograms] = useState<Program[]>([]), [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL"), [query, setQuery] = useState(""), [oldest, setOldest] = useState(false);
  const shell = useGlobalTabs(), router = useRouter();
  const go = (path: string) => shell ? shell.navigate(path) : router.push(path);
  const load = useCallback(() => Promise.all([authoringApi.programs(), authoringApi.sessions()])
    .then(([p, s]) => { setPrograms(p); setSessions(s); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "작성 기록을 불러오지 못했습니다."))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  // Group → program → session, keeping only branches that still hold a matching session.
  const tree = useMemo(() => {
    const text = query.trim().toLowerCase();
    const title = (key: string) => programs.find(p => p.programKey === key)?.title ?? key;
    const matches = sessions.filter(s => (status === "ALL" || s.status === status)
      && (!text || [s.title, s.memo, title(s.programKey)].some(value => value?.toLowerCase().includes(text))));
    const order = (a: SessionSummary, b: SessionSummary) => (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * (oldest ? 1 : -1) || a.id.localeCompare(b.id);
    return authoringGroups.map(group => {
      const branches = programs.filter(p => p.group === group.group)
        .map(program => ({ program, sessions: matches.filter(s => s.programKey === program.programKey).sort(order) }))
        .filter(branch => branch.sessions.length > 0);
      return { ...group, branches, count: branches.reduce((sum, b) => sum + b.sessions.length, 0) };
    }).filter(group => group.count > 0);
  }, [programs, sessions, status, query, oldest]);
  const total = tree.reduce((sum, group) => sum + group.count, 0);
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
          <input type="search" aria-label="제목, 메모, 프로그램 검색" placeholder="제목, 메모, 프로그램 검색" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="정렬" value={oldest ? "oldest" : "recent"} onChange={e => setOldest(e.target.value === "oldest")}><option value="recent">최근 수정 순</option><option value="oldest">오래된 순</option></select>
        </div>
        <p className="authoring-muted" role="status">{total}개 기록</p>
        {tree.length ? tree.map(group => <section key={group.group} className="authoring-library-group" aria-label={group.title}>
          <h2>{group.title} <span>· {group.count}개 기록</span></h2>
          {group.branches.map(({ program, sessions: list }) => <section key={program.programKey} className="authoring-library-program" aria-label={program.title}>
            <h3>{program.title} <span>· {list.length}개</span></h3>
            <div className="authoring-library-list">{list.map(s => <SessionRow key={s.id} session={s} program={program} go={go} showProgram={false} showMemo />)}</div>
          </section>)}
        </section>) : <p className="authoring-library-none">조건에 맞는 작성 기록이 없습니다.</p>}
      </>}
    </main>
  </div>;
}

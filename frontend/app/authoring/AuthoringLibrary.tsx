"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import { authoringGroups, type Program, type SessionSummary } from "@/lib/authoring/types";
import { AuthoringSidebar } from "./AuthoringSidebar";
import { SessionRow, compactDate } from "./SessionRow";

type StatusFilter = "ALL" | SessionSummary["status"];
const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" }, { value: "IN_PROGRESS", label: "작성 중" }, { value: "COMPLETED", label: "완료" },
];
const PREVIEW = 3;

function ProgramBlock({ program, sessions, expanded, toggle, go }: { program: Program; sessions: SessionSummary[]; expanded: boolean; toggle: () => void; go: (path: string) => void }) {
  const latest = sessions.reduce((max, s) => Date.parse(s.updatedAt) > Date.parse(max) ? s.updatedAt : max, sessions[0].updatedAt);
  const shown = expanded ? sessions : sessions.slice(0, PREVIEW);
  return <section className="authoring-program-block" aria-label={program.title}>
    <header><h3>{program.title}</h3><p>{sessions.length}개 기록 · 최근 수정 {compactDate(latest)}</p></header>
    <div>{shown.map(s => <SessionRow key={s.id} session={s} program={program} go={go} showProgram={false} showMemo
      fallbackTitle={`${compactDate(s.startedAt ?? s.updatedAt)} 작성`} />)}</div>
    {sessions.length > PREVIEW && <button type="button" className="authoring-more" aria-expanded={expanded} onClick={toggle}>
      {expanded ? "접기" : `기록 ${sessions.length - PREVIEW}개 더 보기`}</button>}
  </section>;
}

export default function AuthoringLibrary() {
  const [programs, setPrograms] = useState<Program[]>([]), [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL"), [query, setQuery] = useState(""), [oldest, setOldest] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const shell = useGlobalTabs(), router = useRouter();
  const go = (path: string) => shell ? shell.navigate(path) : router.push(path);
  const load = useCallback(() => Promise.all([authoringApi.programs(), authoringApi.sessions()])
    .then(([p, s]) => { setPrograms(p); setSessions(s); setError(""); })
    .catch(e => setError(e instanceof Error ? e.message : "작성 기록을 불러오지 못했습니다."))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);
  const filtering = status !== "ALL" || query.trim() !== "";
  // Three shelves (Quick/Core/Topic) → program blocks → sessions. Filters never flatten the hierarchy.
  const shelves = useMemo(() => {
    const text = query.trim().toLowerCase();
    const title = (key: string) => programs.find(p => p.programKey === key)?.title ?? key;
    const matches = sessions.filter(s => (status === "ALL" || s.status === status)
      && (!text || [s.title, s.memo, title(s.programKey)].some(value => value?.toLowerCase().includes(text))));
    const order = (a: SessionSummary, b: SessionSummary) => (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * (oldest ? 1 : -1) || a.id.localeCompare(b.id);
    return authoringGroups.map(group => {
      const blocks = programs.filter(p => p.group === group.group)
        .map(program => ({ program, sessions: matches.filter(s => s.programKey === program.programKey).sort(order) }))
        .filter(block => block.sessions.length > 0);
      return { ...group, blocks, count: blocks.reduce((sum, b) => sum + b.sessions.length, 0) };
    });
  }, [programs, sessions, status, query, oldest]);
  const visible = filtering ? shelves.filter(shelf => shelf.count > 0) : shelves;
  const total = shelves.reduce((sum, shelf) => sum + shelf.count, 0);
  const toggle = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
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
        {visible.length ? visible.map(shelf => <section key={shelf.group} className="authoring-shelf" aria-label={shelf.title}>
          <header className="authoring-shelf-header"><h2>{shelf.title}</h2><p>{shelf.blocks.length}개 프로그램 · {shelf.count}개 기록</p></header>
          {shelf.blocks.length ? <div className="authoring-program-blocks">{shelf.blocks.map(({ program, sessions: list }) =>
            <ProgramBlock key={program.programKey} program={program} sessions={list} expanded={expanded.has(program.programKey)} toggle={() => toggle(program.programKey)} go={go} />)}</div>
            : <p className="authoring-shelf-empty">아직 작성한 기록이 없습니다.</p>}
        </section>) : <p className="authoring-library-none">조건에 맞는 작성 기록이 없습니다.</p>}
      </>}
    </main>
  </div>;
}

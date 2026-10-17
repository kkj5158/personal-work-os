"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import { sessionRoute, type Program, type SessionSummary } from "@/lib/authoring/types";
import { writingAreas, writingCategories, type WritingArea } from "@/lib/authoring/menu";
import { AuthoringDialog } from "./AuthoringDialog";
import { AuthoringSidebar } from "./AuthoringSidebar";
import { SessionRow, displayDate } from "./SessionRow";
export default function AuthoringHome() {
  const [programs, setPrograms] = useState<Program[]>([]), [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [future, setFuture] = useState<string | null>(null), [source, setSource] = useState("");
  const [area, setArea] = useState<WritingArea>("CORE");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState(""), [status, setStatus] = useState("ALL");
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
  const reviewSources = ["recovery", "reality", "present-life", "grounded-future", "past", "sexual-pattern", "responsibility", "present-future-identity", "earning-a-living", "career-temperament", "light-body-free-style", "ren-daily-training", "desired-physique"];
  const titleOf = (key: string) => programs.find(p => p.programKey === key)?.title ?? key;
  const candidates = (key: string) => completed.filter(s => key === "grounded-future" ? s.programKey === "reality" : reviewSources.includes(s.programKey));
  const realities = candidates(future ?? "grounded-future");
  const programSessions = (key: string) => sessions.filter(s => s.programKey === key).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const statusOf = (key: string) => {
    const list = programSessions(key);
    return list.some(s => s.status === "IN_PROGRESS") ? "IN_PROGRESS" : list.some(s => s.status === "COMPLETED") ? "COMPLETED" : "NOT_STARTED";
  };
  const statusLabel = (value: string) => value === "IN_PROGRESS" ? "작성 중" : value === "COMPLETED" ? "완료" : "시작 전";
  const categories = writingCategories.filter(category => category.area === area).map(category => ({ ...category,
    items: category.programs.flatMap(key => programs.find(p => p.programKey === key) ?? []),
  }));
  const areaPrograms = categories.flatMap(category => category.items);
  const matches = (p: Program) => (status === "ALL" || statusOf(p.programKey) === status)
    && (!query.trim() || `${p.title} ${p.subtitle ?? ""} ${p.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const allCollapsed = categories.every(category => collapsed.has(category.key));
  const flipCategory = (key: string) => setCollapsed(current => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next; });
  const renderProgram = (p: Program) => {
    const list = programSessions(p.programKey), unfinished = list.find(s => s.status === "IN_PROGRESS"), done = list.find(s => s.status === "COMPLETED");
    // Keep the stored title's tagline, while matching the approved compact menu heading.
    const [heading, tagline] = p.programKey === "sexual-pattern" && p.title.startsWith("성중독과 삶의 회복 - ")
      ? ["성중독과 삶의 회복", p.title.slice("성중독과 삶의 회복 - ".length)] : [p.title, p.subtitle];
    const state = statusOf(p.programKey);
    const newSession = () => { if (action.current) return; if ((p.programKey === "grounded-future" || p.programKey === "review")) { setSource(candidates(p.programKey)[0]?.id ?? ""); action.current = true; setFuture(p.programKey); } else void start(p.programKey); };
    return <article key={p.programKey} className={`authoring-program ${p.programKey}`} data-program-key={p.programKey}>
      <div className="authoring-program-state"><span className="authoring-status-badge" data-status={state}>{statusLabel(state)}</span><span>기록 {list.length}개</span></div>
      <h3>{heading}</h3>{tagline && <p className="authoring-program-subtitle">{tagline}</p>}<p>{p.description}</p>
      {list[0] && <small className="authoring-muted">최근 수정 {displayDate(list[0].updatedAt)}</small>}
      <div className="authoring-program-actions"><Button type="button" variant="primary" disabled={busy || !!future} onClick={() => unfinished ? go(sessionRoute(unfinished)) : done ? go(sessionRoute(done, "full")) : newSession()}>{unfinished ? "이어쓰기" : done ? "기록 보기" : "시작하기"} →</Button>{(unfinished || done) && <Button type="button" variant="ghost" disabled={busy || !!future} onClick={newSession}>새로 시작</Button>}{unfinished && done && <Button type="button" variant="ghost" disabled={busy || !!future} onClick={() => go(sessionRoute(done, "full"))}>기록 보기</Button>}</div>
    </article>;
  };
  const quick = programs.find(p => p.programKey === "quick-motivation");
  return <div className="authoring-home-shell">
    <AuthoringSidebar active="home" navigate={path => { if (path !== "/authoring") go(path); }} />
    <main className="authoring-home authoring-menu" onClick={event => event.stopPropagation()}>
      <header className="authoring-intro"><p className="authoring-eyebrow">AUTHORING</p><h1>나를 이해하고, 삶의 방향을 쓰다.</h1><p>지금의 삶부터 앞으로의 방향까지, 나에게 필요한 글쓰기를 선택하세요.</p></header>
      {error && <div role="alert" className="authoring-error">{error} <Button type="button" onClick={() => void load()}>다시 시도</Button></div>}
      {loading ? <p role="status">불러오는 중…</p> : <>
        <div className="authoring-area-controls" role="group" aria-label="글쓰기 영역">{writingAreas.map(item => <button type="button" key={item.key} aria-pressed={area === item.key} onClick={() => { setArea(item.key); setQuery(""); setStatus("ALL"); }}><span aria-hidden="true">{item.emoji}</span>{item.title}<span className="authoring-area-count">{writingCategories.filter(c => c.area === item.key).flatMap(c => c.programs).filter(key => programs.some(p => p.programKey === key)).length}</span></button>)}</div>
        <dl className="authoring-menu-summary" aria-label="선택한 영역의 프로그램 요약">{[{ label: "전체 프로그램", value: areaPrograms.length }, ...["IN_PROGRESS", "COMPLETED", "NOT_STARTED"].map(value => ({ label: statusLabel(value), value: areaPrograms.filter(p => statusOf(p.programKey) === value).length }))].map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}<small>개</small></dd></div>)}</dl>
        <div className="authoring-menu-tools"><input type="search" aria-label="글쓰기 프로그램 검색" placeholder="프로그램 검색" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="프로그램 상태" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">전체 상태</option>{["IN_PROGRESS", "COMPLETED", "NOT_STARTED"].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select><button type="button" aria-expanded={!allCollapsed} onClick={() => setCollapsed(current => { const next = new Set(current); categories.forEach(c => allCollapsed ? next.delete(c.key) : next.add(c.key)); return next; })}>{allCollapsed ? "전체 펼치기" : "전체 접기"}</button></div>
        {categories.map(category => ({ ...category, visible: category.items.filter(matches) })).filter(category => category.visible.length > 0).map(category => {
          const open = !collapsed.has(category.key);
          return <section className="authoring-program-group" key={category.key} data-category={category.key} aria-label={category.title}>
            <header className="authoring-category-header"><span className="authoring-category-emoji" data-category={category.key} aria-hidden="true">{category.emoji}</span><div><h2><button type="button" aria-expanded={open} aria-controls={`category-${category.key}`} onClick={() => flipCategory(category.key)}>{category.title}<span>{category.visible.length}개 프로그램</span></button></h2><p>{category.description}</p></div><button className="authoring-category-toggle" type="button" aria-label={`${category.title} ${open ? "접기" : "펼치기"}`} aria-expanded={open} aria-controls={`category-${category.key}`} onClick={() => flipCategory(category.key)}>{open ? "접기" : "펼치기"}</button></header>
            <div id={`category-${category.key}`} hidden={!open}><div className="authoring-programs">{category.visible.map(renderProgram)}</div></div>
          </section>;
        })}
        {!areaPrograms.some(matches) && <p role="status" className="authoring-menu-empty">조건에 맞는 프로그램이 없습니다.</p>}
        {quick && <details className="authoring-quick"><summary>빠른 글쓰기 · 5~10분</summary>{renderProgram(quick)}</details>}
        <section className="authoring-recent"><header><h2>최근 작성</h2>{sessions.length > 0 && <Button type="button" variant="ghost" onClick={() => go("/authoring/library")}>전체 기록 보기 →</Button>}</header>{sessions.length === 0 && <p className="authoring-muted">아직 작성한 세션이 없습니다. 프로그램을 선택해 시작하세요.</p>}{sessions.slice(0, 5).map(s => <SessionRow key={s.id} session={s} program={programs.find(p => p.programKey === s.programKey)} go={go} />)}</section>
      </>}
      {future && <AuthoringDialog title={`${titleOf(future)} 시작`} onClose={() => { if (!busy) { action.current = false; setFuture(null); } }}><p>{future === "review" ? "완료된 기록을 읽고 변화를 돌아봅니다. 원본은 수정되지 않습니다." : `${titleOf("reality")} 기록을 출발점으로 앞으로의 삶을 설계합니다. 참조 없이 시작할 수도 있습니다.`}</p><label className="authoring-field">참고할 완료 기록<select value={source} onChange={e => setSource(e.target.value)}><option value="">{future === "review" ? "기록을 선택하세요" : "참조 없이 시작"}</option>{realities.map((s,i) => <option key={s.id} value={s.id}>{i === 0 ? "최근 · " : ""}{s.title ? `${s.title} · ` : ""}{titleOf(s.programKey)} · {displayDate(s.completedAt!)}</option>)}</select></label>{future === "review" && !realities.length && <p>{reviewSources.map(titleOf).join(", ")} 중 하나를 완료한 뒤 시작할 수 있습니다.</p>}{error && <p role="alert">{error}</p>}<Button type="button" variant="primary" disabled={busy || (future === "review" && !source)} onClick={() => { if (busy) return; void start(future, source || undefined, true); }}>시작하기</Button></AuthoringDialog>}
    </main>
  </div>;
}

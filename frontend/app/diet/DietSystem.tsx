"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { House, ListChecks, CalendarDays, NotebookPen, ChartNoAxesCombined, Images, Target } from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { useDietStore } from "./store";
import { dailyNotesApi } from "@/lib/diet/dailyNote";
import { notesApi } from "@/lib/api/notes";
import Home from "./Home";
import Record from "./Record";
import Planner from "./Planner";
import Progress from "./Progress";
import BoardPage from "./BoardPage";
import NoteSurface from "./NoteSurface";
import "./diet.css";
export const DIET_NOTE_WORKSPACE = "다이어트 기록";
export const dietNoteHref = (workspaceId: string | null | undefined) => workspaceId ? `/diet/note?workspace=${workspaceId}` : undefined;
export default function DietSystem() {
  const store = useDietStore(), path = usePathname(), router = useRouter(), shell = useGlobalTabs();
  const [noteWorkspaceId, setNoteWorkspaceId] = useState<string | null>(null), [noteResolved, setNoteResolved] = useState(false), [noteError, setNoteError] = useState("");
  const noteFlush = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((flush: () => Promise<void>) => { noteFlush.current = flush; return () => { if (noteFlush.current === flush) noteFlush.current = null; }; }, []);
  const flushNote = useCallback(async () => { try { await noteFlush.current?.(); setNoteError(""); } catch (error) { setNoteError(error instanceof Error ? error.message : "노트를 저장하지 못했습니다."); throw error; } }, []);
  useEffect(() => {
    let live = true;
    dailyNotesApi.syncSettings().then(async s => s.workspaceId ?? (await notesApi.workspaces()).find(w => !w.archivedAt && w.name === DIET_NOTE_WORKSPACE)?.id ?? null).then(id => { if (live) setNoteWorkspaceId(id); }).catch(() => { if (live) setNoteError("다이어트 노트 Workspace를 확인하지 못했습니다."); }).finally(() => { if (live) setNoteResolved(true); });
    return () => { live = false; };
  }, []);
  useShellNavigationGuard(proceed => { if (!store.busy && !store.pendingChecks) void flushNote().then(proceed).catch(() => {}); });
  const navigate = useCallback(async (href: string) => { try { await flushNote(); if (shell) shell.navigate(href); else router.push(href); } catch { /* Retain the current unsaved note. */ } }, [flushNote, shell, router]);
  const nav = [{ label: "홈", icon: House, href: "/diet" }, { label: "기록", icon: ListChecks, href: "/diet/record" }, { label: "플래너", icon: CalendarDays, href: "/diet/planner" }, { label: "다이어트 노트", icon: NotebookPen, href: dietNoteHref(noteWorkspaceId) }, { label: "통계", icon: ChartNoAxesCombined, href: "/diet/progress" }, { label: "갤러리", icon: Images, href: "/diet/gallery" }, { label: "정체성/목표", icon: Target, href: "/diet/identity" }];
  const refined = path === "/diet/planner" || path === "/diet/note";
  return <div className={`diet-shell ${refined ? "diet-refined" : ""}`}><SharedSidebar system="DIET SYS" beforeNavigate={flushNote} beforeLogout={flushNote} navigate={href => void navigate(href)} groups={[{ section: "DIET SYS", items: nav.map(n => ({ ...n, active: path === n.href?.split("?")[0], destination: n.href })) }]} /><div className="diet"><div className="diet-content-column">
    <div aria-live="polite" className="diet-save-state">{store.pendingChecks ? `${store.pendingChecks}개 기록 저장 중…` : store.busy ? "저장 중…" : ""}</div>
    {(store.error || noteError) && <div role="alert" className="diet-error">{noteError || store.error} <button onClick={() => void store.reload()}>다시 불러오기</button></div>}
    {path === "/diet/note" ? <><div className="diet-heading"><h1>다이어트 노트</h1></div>{noteWorkspaceId ? <NoteSurface workspaceId={noteWorkspaceId} registerFlush={registerFlush}/> : <p>{noteResolved ? "기존 다이어트 기록 Workspace가 없습니다. NOTE 연동 설정을 확인하세요." : "다이어트 노트 불러오는 중…"}</p>}</> : path === "/diet/gallery" ? <BoardPage mode="gallery"/> : path === "/diet/identity" ? <BoardPage mode="identity"/> : store.loading ? <p>DIET SYS 불러오는 중…</p> : path === "/diet/record" ? <Record store={store}/> : path === "/diet/planner" ? <><div className="diet-heading"><div><h1>플래너</h1><small>챌린지 목표 · 기간 · 마일스톤</small></div></div><Planner store={store} registerFlush={registerFlush}/></> : path === "/diet/progress" ? <Progress store={store}/> : <Home store={store}/>}
  </div></div></div>;
}

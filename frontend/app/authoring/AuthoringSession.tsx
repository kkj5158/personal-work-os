"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SystemSwitcher } from "@/components/SystemSwitcher";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import { authoringApi } from "@/lib/api/authoring";
import { ApiError } from "@/lib/api/client";
import { Autosave, type SaveState } from "@/lib/notes/autosave";
import { answerKey, answerFor, contextAnswer, gateMissing, programTitle, questionComplete, sectionLabel, sectionProgress, sessionRoute, type Answer, type Draft, type Session } from "@/lib/authoring/types";
import { draftDiffers, draftOf, metadataDiffers, type StoredDraft } from "@/lib/authoring/drafts";
import { AuthoringDialog } from "./AuthoringDialog";
import { QuestionField } from "./QuestionField";
import { ReportDocument, ScanSummary, SessionDocument } from "./SessionDocument";

type Mode = "runner" | "full" | "report";
const message = (e: unknown) => e instanceof Error ? e.message : "저장하지 못했습니다. 입력은 유지됩니다.";
const draftKey = (id: string) => `authoring.draft.${id}`;
function remember(id: string, draft: StoredDraft) { try { sessionStorage.setItem(draftKey(id), JSON.stringify(draft)); } catch { /* The unload guard remains when session storage is unavailable. */ } }
function forget(id: string) { try { sessionStorage.removeItem(draftKey(id)); } catch { /* Storage may be disabled. */ } }
function savedDraft(id: string): StoredDraft | null { try { const raw = JSON.parse(sessionStorage.getItem(draftKey(id)) ?? "null"); return raw && typeof raw.answers === "object" && typeof raw.currentSectionKey === "string" && typeof raw.version === "number" ? raw : null; } catch { return null; } }

export default function AuthoringSession({ programKey, sessionId, mode }: { programKey: string; sessionId: string; mode: Mode }) {
  const [session, setSession] = useState<Session | null>(null), [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved"), [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [reference, setReference] = useState<Session | null>(null), [conflict, setConflict] = useState<Session | null>(null);
  const [conflictVisible, setConflictVisible] = useState(true), [memoOpen, setMemoOpen] = useState(false);
  const [retainedDraft, setRetainedDraft] = useState<StoredDraft | null>(null), [showRetainedDraft, setShowRetainedDraft] = useState(false);
  const current = useRef<Session | null>(null), queue = useRef<Autosave<Draft> | null>(null), mounted = useRef(false);
  const workspace = useRef<HTMLDivElement>(null);
  const shell = useGlobalTabs(), router = useRouter();
  const setTitle = shell?.setTitle;
  useEffect(() => { workspace.current?.scrollIntoView({ block: "start" }); }, [mode, session?.currentSectionKey]);
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    async function load() {
      try {
        const loaded = await authoringApi.get(sessionId);
        if (cancelled) return;
        if (loaded.programKey !== programKey) throw new Error("프로그램과 세션이 일치하지 않습니다.");
        current.current = loaded; setSession(loaded); setTitle?.(programTitle(loaded));
        const draft = savedDraft(sessionId);
        // Completed sessions keep an immutable report; only their title and memo are saved.
        const saver = new Autosave<Draft>(async draft => {
          const latest = current.current!;
          const result = latest.status === "COMPLETED"
            ? await authoringApi.saveMetadata(sessionId, latest.version, { title: draft.title ?? null, memo: draft.memo ?? null })
            : await authoringApi.save(sessionId, latest.version, draft);
          // Responses advance the version but never replace newer local input.
          const next = { ...current.current!, version: result.version, updatedAt: result.updatedAt };
          current.current = next;
          if (mounted.current) setSession(next);
          if (!cancelled && next.status === "IN_PROGRESS") remember(sessionId, { ...draftOf(next), version: next.version });
        }, (state, failure) => {
          if (cancelled || !mounted.current) return;
          if (state === "saved") forget(sessionId);
          setSaveState(state);
          if (failure) setError(message(failure));
        });
        queue.current = saver;
        if (loaded.status === "COMPLETED") {
          if (draftDiffers(draft, loaded)) { setRetainedDraft(draft); setShowRetainedDraft(true); }
          else forget(sessionId);
          return;
        }
        if (draftDiffers(draft, loaded) || metadataDiffers(draft, loaded)) {
          const restored = { ...loaded, answers: draft.answers, currentSectionKey: loaded.definition.sections.some(s => s.sectionKey === draft.currentSectionKey) ? draft.currentSectionKey : loaded.currentSectionKey,
            title: draft.title !== undefined ? draft.title : loaded.title, memo: draft.memo !== undefined ? draft.memo : loaded.memo };
          current.current = restored; setSession(restored);
          if (draft.version === loaded.version) saver.set(draftOf(restored));
          else { setSaveState("error"); setConflict(loaded); setError("저장되지 않은 입력과 서버의 새 버전이 있습니다. 두 내용을 확인하세요."); }
        } else if (draft) forget(sessionId);
      } catch (e) { if (!cancelled) setError(message(e)); }
    }
    void load();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.current?.dirty() || (current.current && savedDraft(sessionId))) { e.preventDefault(); void queue.current?.flush().catch(() => {}); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { cancelled = true; mounted.current = false; window.removeEventListener("beforeunload", beforeUnload); const old = queue.current; queue.current = null; old?.stop(); void old?.flush().catch(() => {}); };
  }, [programKey, sessionId, setTitle]);

  async function flush() {
    if (conflict) throw new Error("버전 충돌을 확인한 뒤 이동하세요.");
    await queue.current?.flush();
  }
  useShellNavigationGuard(async proceed => { await flush(); proceed(); });
  async function go(path: string) {
    try { await flush(); if (shell) shell.navigate(path); else router.push(path); }
    catch (e) { setError(message(e)); }
  }
  function change(answerKey: string, answer: Answer) {
    if (!current.current || current.current.status === "COMPLETED") return;
    const next = { ...current.current, answers: { ...current.current.answers, [answerKey]: answer } };
    current.current = next; setSession(next);
    const draft = draftOf(next);
    remember(sessionId, { ...draft, version: next.version });
    if (!conflict) queue.current?.set(draft);
  }
  function changeMetadata(patch: { title?: string; memo?: string }) {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next; setSession(next);
    const draft = draftOf(next);
    if (next.status === "IN_PROGRESS") remember(sessionId, { ...draft, version: next.version });
    if (!conflict) queue.current?.set(draft);
  }
  async function section(key: string) {
    if (!current.current || busy) return;
    const target = current.current.definition.sections.findIndex(s => s.sectionKey === key);
    if (target > 0 && gateMissing(current.current.definition, current.current.answers)) { setError("이번에 돌아볼 상황을 먼저 적어주세요."); return; }
    // Section changes are queued with the full latest draft, serializing them
    // behind any in-flight answer save rather than racing independent requests.
    const next = { ...current.current, currentSectionKey: key };
    current.current = next; setSession(next);
    if (next.status === "IN_PROGRESS") {
      const draft = draftOf(next);
      remember(sessionId, { ...draft, version: next.version });
      if (!conflict) queue.current?.set(draft);
    }
    if (mode !== "runner") await go(sessionRoute(next));
  }
  async function retry() {
    if (conflict) { setConflictVisible(true); return; }
    setError("");
    try { await flush(); }
    catch (e) {
      setError(message(e));
      if (e instanceof ApiError && e.status === 409) {
        try { setConflict(await authoringApi.get(sessionId)); setConflictVisible(true); } catch (readError) { setError(message(readError)); }
      }
    }
  }
  async function complete() {
    setBusy(true); setError("");
    try {
      await flush();
      const completed = await authoringApi.complete(sessionId, current.current!.version);
      current.current = completed; setSession(completed); forget(sessionId); setCompletion(false);
      if (shell) shell.navigate(sessionRoute(completed, "report")); else router.push(sessionRoute(completed, "report"));
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function openReference() {
    if (!session?.sourceSessionId) return;
    try { setReference(await authoringApi.get(session.sourceSessionId)); } catch (e) { setError(message(e)); }
  }
  async function exportRecovery() {
    if (!session) return;
    try {
      const data = await authoringApi.recoveryExport(session.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `recovery-${session.id}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(message(e)); }
  }
  if (!session) return <div className="authoring-loading"><SystemSwitcher system="AUTHORING" />{error ? <div role="alert"><p>{error}</p><Button type="button" onClick={() => location.reload()}>다시 시도</Button><Button type="button" onClick={() => void go("/authoring")}>Home</Button></div> : <p role="status">세션을 불러오는 중…</p>}</div>;
  const definition = session.definition, editable = session.status === "IN_PROGRESS";
  const index = Math.max(0, definition.sections.findIndex(s => s.sectionKey === session.currentSectionKey)), active = definition.sections[index];
  const missing = definition.sections.flatMap(s => s.questions).filter(q => (definition.completionKeys.includes(q.questionKey) || q.required) && !questionComplete(q, session.answers));
  const isDocument = mode !== "runner" || !editable;
  const locked = editable && gateMissing(definition, session.answers), context = contextAnswer(definition, session.answers);
  return <div ref={workspace} className="authoring-workspace" onCompositionStart={() => queue.current?.composition(true)} onCompositionEnd={() => queue.current?.composition(false)}>
    <header className="authoring-toolbar"><div><SystemSwitcher system="AUTHORING" compact /><Button type="button" variant="ghost" onClick={() => void go("/authoring")}>← Home</Button><strong>{programTitle(session)}</strong></div><div>
      {(editable || saveState !== "saved") && <span role="status" className="authoring-save-state">{{ saved: "자동 저장됨", pending: "저장 대기", saving: "저장 중…", error: "저장 실패 · 입력 유지됨" }[saveState]}</span>}
      {session.sourceSessionId && <Button type="button" onClick={() => void openReference()}>{session.programKey === "review" ? "원본 Report 보기" : "참고한 기록 보기"}</Button>}
      <Button type="button" onClick={() => void go(sessionRoute(session, mode === "full" && editable ? "" : "full"))}>{mode === "full" && editable ? "작성으로 돌아가기" : "전체 내용 보기"}</Button>
      {!editable && mode !== "report" && <Button type="button" onClick={() => void go(sessionRoute(session, "report"))}>Report 보기</Button>}
    </div></header>
    <div className="authoring-session-meta">
      <input aria-label="글 제목" placeholder="제목 추가 (선택)" maxLength={200} value={session.title ?? ""} onChange={e => changeMetadata({ title: e.target.value.replace(/[\r\n]+/g, " ") })} />
      {memoOpen || session.memo ? <textarea aria-label="메모" placeholder="이 글을 쓰는 이유나 기억할 점 (선택)" rows={2} maxLength={5000} value={session.memo ?? ""} onChange={e => changeMetadata({ memo: e.target.value })} />
        : <button type="button" className="authoring-meta-toggle" onClick={() => setMemoOpen(true)}>+ 메모 추가</button>}
    </div>
    {error && <div role="alert" className="authoring-error">{error}{editable && <Button type="button" onClick={() => void retry()}>저장 다시 시도</Button>}</div>}
    {retainedDraft && <div role="status" className="authoring-error">다른 화면에서 세션이 완료되었습니다. 이 탭의 미저장 입력은 따로 보관되어 있습니다. <Button type="button" onClick={() => setShowRetainedDraft(true)}>미저장 입력 보기</Button></div>}
    <div className={`authoring-workspace-body ${isDocument ? "document-mode" : ""}`}>
      {!isDocument && <nav className="authoring-sections" aria-label="프로그램 섹션"><p>{sectionProgress(definition, index)}</p>{definition.sections.map((s, i) => <button key={s.sectionKey} type="button" disabled={i > 0 && locked} aria-current={i === index ? "step" : undefined} onClick={() => void section(s.sectionKey)}><span>{sectionLabel(definition, i)}</span><span>{s.title}</span>{s.questions.length > 0 && s.questions.every(q => questionComplete(q, session.answers)) && <span aria-label="작성됨">✓</span>}</button>)}</nav>}
      <main className="authoring-canvas">
        {isDocument ? <><p className="authoring-eyebrow">{editable ? "REVIEW" : "COMPLETED"} · {session.specVersion}</p><h1>{mode === "report" ? definition.reportTitle ?? `${programTitle(session)} Report` : "전체 내용 보기"}</h1><p className="authoring-muted">{programTitle(session)}</p>
          {mode === "report" ? <>{session.programKey === "sexual-pattern" && <div className="authoring-completion-note"><h2>이번 글쓰기를 마쳤습니다.</h2><p>모든 문제가 해결되었다는 뜻은 아닙니다. 지금의 경험을 돌아보고, 앞으로 지킬 기준과 다음 행동을 남겼습니다.</p><p>{typeof session.answers.firstAction === "string" && session.answers.firstAction.trim() ? "아직 답하지 못한 질문은 남겨두어도 됩니다. 오늘 정한 행동부터 시작해 보세요." : "아직 답하지 못한 질문은 남겨두어도 됩니다. 준비가 되면 다음 행동 하나부터 정해보세요."}</p></div>}<ReportDocument session={session} />{session.programKey === "quick-motivation" && <div className="authoring-navigation"><Button type="button" onClick={() => void go("/authoring")}>작성 종료</Button><Button type="button" variant="primary" onClick={() => void go("/authoring")}>바로 시작하기 →</Button></div>}{session.programKey === "recovery" && <div className="authoring-export"><Button type="button" disabled title="OPS Recovery Protocol API 연결 대기">OPS Recovery Protocol에 적용</Button><p>OPS 연결 대기 · Authoring의 구조화 결과를 파일로 보관할 수 있습니다.</p><Button type="button" onClick={() => void exportRecovery()}>구조화 결과 다운로드 (JSON)</Button></div>}</> : <SessionDocument session={session} edit={editable ? key => void section(key) : undefined} />}
          {editable && <footer className="authoring-navigation"><Button type="button" onClick={() => void go(sessionRoute(session))}>계속 작성</Button><Button type="button" variant="primary" onClick={() => { setAcknowledged(false); setCompletion(true); }}>세션 완료 검토 →</Button></footer>}
        </> : <><p className="authoring-eyebrow">{sectionProgress(definition, index)}</p><h1>{active.title}</h1>{index > 0 && context && <details className="authoring-source authoring-context"><summary>{context.label}</summary><p>{context.value}</p></details>}{active.prompt && <p className="authoring-section-prompt">{active.prompt}</p>}{active.description && <p className="authoring-section-description">{active.description}</p>}
          {index === 0 && definition.guidance && <details className="authoring-source"><summary>프로그램 안내</summary><p>{definition.guidance}</p></details>}<div className="authoring-questions">{active.questions.map(q => <QuestionField key={q.questionKey} question={q} value={answerFor(q, session.answers)} answers={session.answers} change={value => change(answerKey(q), value)} />)}</div>
          {active.sectionKey === "scan" && <ScanSummary session={session} />}
          {session.sourceSessionId && (session.programKey === "review" ? ["source", "look-back"].includes(active.sectionKey) : index === 0) && <Button type="button" onClick={() => void openReference()}>{session.programKey === "review" ? "선택한 원본 Report 읽기" : "참고한 기록 읽기"}</Button>}
          {index === 0 && locked && <p className="authoring-help">이번에 돌아볼 상황을 적으면 다음 단계로 넘어갈 수 있습니다. 작성 중인 내용은 자동으로 저장됩니다.</p>}
          {active.sectionKey === "report" && <p className="authoring-help">전체 내용을 검토한 뒤 완료하면 Report가 저장됩니다.</p>}
          <footer className="authoring-navigation"><Button type="button" disabled={index === 0} onClick={() => void section(definition.sections[index - 1].sectionKey)}>← 이전</Button>{index < definition.sections.length - 1 ? <Button type="button" variant="primary" disabled={index === 0 && locked} onClick={() => void section(definition.sections[index + 1].sectionKey)}>다음 →</Button> : <Button type="button" variant="primary" onClick={() => void go(sessionRoute(session, "full"))}>전체 내용 검토 →</Button>}</footer>
        </>}
      </main>
    </div>
    {completion && <AuthoringDialog title="세션 완료" onClose={() => !busy && setCompletion(false)}><p>완료한 답변과 Report는 이 시점의 기록으로 보존되며 수정되지 않습니다.</p><ul>{definition.stoppingRules.map(rule => <li key={rule}>{rule}</li>)}</ul>{missing.length > 0 && <div className="authoring-error"><p>완료 전에 다음 내용을 작성하세요.</p><ul>{missing.map(q => <li key={q.questionKey}>{q.prompt}</li>)}</ul></div>}<label className="authoring-confirm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />종료 조건을 확인했습니다.</label>{error && <p role="alert">{error}</p>}<div className="authoring-navigation"><Button type="button" onClick={() => setCompletion(false)} disabled={busy}>계속 작성</Button><Button type="button" variant="primary" disabled={busy || !acknowledged || missing.length > 0} onClick={() => void complete()}>세션 완료</Button></div></AuthoringDialog>}
    {reference && <AuthoringDialog title="완료 기록 참고" onClose={() => setReference(null)}><p>{programTitle(reference)} · {reference.completedAt?.slice(0, 10)}</p><ReportDocument session={reference} /></AuthoringDialog>}
    {retainedDraft && showRetainedDraft && <AuthoringDialog title="미저장 입력 보관" onClose={() => setShowRetainedDraft(false)}><p>완료된 기록은 그대로 보존됩니다. 아래 입력을 복사하거나 파일로 저장한 뒤 새 세션에서 계속할 수 있습니다.</p><Button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ programKey, specVersion: session.specVersion, ...retainedDraft }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `authoring-unsaved-${sessionId}.json`; a.click(); URL.revokeObjectURL(url); }}>미저장 입력 다운로드</Button><SessionDocument session={{ ...session, answers: retainedDraft.answers }} /></AuthoringDialog>}
    {conflict && conflictVisible && <AuthoringDialog title="저장된 버전 확인" onClose={() => setConflictVisible(false)}><p>서버 내용과 현재 입력을 비교하세요. 완료된 세션은 덮어쓸 수 없습니다.</p><details><summary>현재 입력</summary><SessionDocument session={session} /></details><details><summary>서버 내용</summary><SessionDocument session={conflict} /></details><div className="authoring-navigation"><Button type="button" onClick={() => { queue.current?.stop(); forget(sessionId); location.reload(); }}>서버 내용으로 돌아가기</Button>{conflict.status === "IN_PROGRESS" && <Button type="button" onClick={() => { const next = { ...session, version: conflict.version }; current.current = next; setSession(next); setConflict(null); setError(""); queue.current?.set(draftOf(next)); }}>현재 입력으로 다시 저장</Button>}</div></AuthoringDialog>}
  </div>;
}

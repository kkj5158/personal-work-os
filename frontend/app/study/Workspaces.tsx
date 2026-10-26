"use client";
/* eslint-disable @next/next/no-img-element -- Local blob previews preserve full written-answer resolution. */
import { useEffect, useRef, useState } from "react";
import { useShellNavigationGuard } from "@/components/GlobalTabs";
import { bindingFor, completion, responseKey, validateFile, validatePackage, validateResponse, type AnswerKey, type DailyStudyPackage, type StudyDataPort, type StudyPart, type StudySnapshot } from "@/lib/study/model";
import { onlineAttempt } from "@/lib/study/port";
import { kindLabel, QuestionRenderer } from "./QuestionRenderer";
export type WorkspaceProps = { pkg: DailyStudyPackage; part: StudyPart; snapshot: StudySnapshot; port: StudyDataPort; back: () => void; open: (mode: "solve" | "handwritten" | "document", doc?: string) => void };
export function WorkspaceHeader({ pkg, part, back }: Pick<WorkspaceProps, "pkg" | "part" | "back">) { return <header className="study-workspace-header"><button onClick={back}>← 돌아가기</button><div><p>{pkg.date} · {part === "required" ? "필수 15분" : "확장 +30분"} · 문제집 v{pkg.version} · 정책 v{pkg.policyVersion}</p><h1>{pkg.topic}</h1></div><span className="study-badge">샘플 작업공간</span></header>; }
export function Solver(props: WorkspaceProps) {
  const { pkg, part, port, snapshot, open } = props;
  const [keys, setKeys] = useState<AnswerKey[] | null>(null), [message, setMessage] = useState("");
  const errors = validatePackage(pkg);
  const ordered = [...pkg[part]].sort((a, b) => a.order - b.order);
  const answered = ordered.filter(q => validateResponse(q, snapshot.drafts[responseKey(bindingFor(pkg, part, q))]?.response)).length;
  const progress = completion(pkg, part, snapshot.attempts);
  const review = async () => { try { setKeys(await port.readAnswerKeys(pkg.id, pkg.version, part)); } catch (error) { setMessage(String(error)); } };
  if (errors.length) return <section className="study-workspace"><WorkspaceHeader {...props} /><div className="study-error" role="alert"><h2>문항 데이터를 확인할 수 없습니다</h2>{errors.map(e => <p key={e}>{e}</p>)}</div></section>;
  return <section className="study-workspace"><WorkspaceHeader {...props} />
    <div className="study-notice">샘플 데이터 · 답안은 현재 브라우저 메모리에만 유지됩니다. 새로고침하면 초기화되며 서버 제출·AI 채점은 연결되지 않았습니다.</div>
    <div className="study-workspace-tools"><span>작성 {answered}/{ordered.length} · 제출 범위 {progress.covered}/{progress.total}</span><progress value={answered} max={ordered.length} aria-label="답안 작성 진행률" /><button onClick={() => open("handwritten")}>수기로 이어 풀기</button><button onClick={() => open("document", "question")}>문제 미리보기</button></div>
    <div className="study-solve-layout"><aside className="study-question-index" aria-label="문항 이동">{ordered.map((q, i) => <a key={q.id} href={`#question-${q.id}`} aria-label={`${i + 1}번 ${validateResponse(q, snapshot.drafts[responseKey(bindingFor(pkg, part, q))]?.response) ? "작성됨" : "미응답"}`}>{i + 1}<span>{validateResponse(q, snapshot.drafts[responseKey(bindingFor(pkg, part, q))]?.response) ? "✓" : "·"}</span></a>)}</aside>
    <div className="study-question-canvas">{ordered.map((q, i) => { const key = responseKey(bindingFor(pkg, part, q)); const answer = keys?.find(k => responseKey(k.binding) === key); return <article id={`question-${q.id}`} className="study-question" key={key}>
      <div className="study-row"><span className="study-badge">{String(i + 1).padStart(2, "0")} · {kindLabel[q.kind]}</span><span className="study-muted">{snapshot.drafts[key] ? "메모리 초안 있음" : "미응답"}</span></div>
      <h2>{q.prompt}</h2>{q.context && <div className="study-case">{q.context}</div>}{q.guidance && <p className="study-muted">{q.guidance}</p>}
      <fieldset disabled={!!keys}><legend className="study-sr-only">{q.prompt}</legend><QuestionRenderer question={q} response={snapshot.drafts[key]?.response} onChange={response => { try { port.saveDraft(bindingFor(pkg, part, q), response); setMessage(""); } catch (error) { setMessage(String(error)); } }} /></fieldset>
      {q.kind === "diagram" && <div className="study-actions"><button onClick={() => open("document", "question")}>문제 미리보기</button><button onClick={() => open("handwritten")}>수기 답안 제출</button></div>}
      <p className="study-source">출처: {q.source.section}</p>
      {answer && <section className="study-answer"><h3>샘플 해설 · 자가 검토용</h3><p>{answer.model}</p><p>{answer.explanation}</p><ul>{answer.rubric.map(r => <li key={r}>{r}</li>)}</ul>{answer.incorrectReasons && <details><summary>다른 선택지를 검토해보세요</summary>{Object.entries(answer.incorrectReasons).map(([id, reason]) => <p key={id}>{id}: {reason}</p>)}</details>}<p>더 생각하기: {answer.followUp.join(" / ")}</p></section>}
    </article>; })}
    <footer className="study-submit-bar"><span>미응답 {ordered.length - answered}개 · 그림 문항은 수기로 보완할 수 있습니다.</span><div className="study-actions">{keys ? <button onClick={() => setKeys(null)}>해설 닫고 풀이 계속</button> : <button onClick={review}>샘플 정답·해설 보기</button>}<button onClick={() => { if (window.confirm("이 문제집의 메모리 초안을 지울까요? 기존 제출 기록은 유지됩니다.")) { port.discardDrafts(pkg.id, pkg.version, part); setMessage("메모리 초안을 지웠습니다."); } }}>초안 지우기</button><button className="study-primary" disabled={!answered || !!keys} onClick={() => { try { port.recordAttempt(onlineAttempt(pkg, part, snapshot.drafts)); setMessage("로컬 샘플 제출을 기록했습니다. POS 서버에는 저장되지 않았습니다. 점수·자동 채점은 제공하지 않습니다."); } catch (error) { setMessage(String(error)); } }}>작성 문항 샘플 제출</button></div></footer>
    <p role="status" className="study-status">{message}</p></div></div>
  </section>;
}
type LocalAttachment = { id: string; file: File; url: string };
export function Handwritten(props: WorkspaceProps) {
  const { pkg, part, port, snapshot, open } = props;
  const [files, setFiles] = useState<LocalAttachment[]>([]), [coverage, setCoverage] = useState<string[]>([]), [note, setNote] = useState(""), [message, setMessage] = useState(""), [submitted, setSubmitted] = useState(false);
  const activeFiles = useRef(files);
  useEffect(() => { activeFiles.current = files; }, [files]);
  useEffect(() => () => { activeFiles.current.forEach(f => URL.revokeObjectURL(f.url)); }, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (activeFiles.current.length) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  useShellNavigationGuard(proceed => { if (!files.length || submitted || window.confirm("선택한 파일은 서버에 저장되지 않았습니다. 이동하면 로컬 미리보기가 사라집니다. 이동할까요?")) proceed(); });
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: LocalAttachment[] = [], errors: string[] = [];
    for (const file of Array.from(list)) { const error = validateFile(file); if (error) errors.push(`${file.name}: ${error}`); else if (files.length + next.length >= 10) errors.push("최대 10개 파일을 선택할 수 있습니다."); else next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }); }
    setFiles(previous => [...previous, ...next]); setSubmitted(false); setMessage(errors.join(" "));
  };
  const reorder = (i: number, offset: number) => { setFiles(previous => { const next = [...previous]; const target = i + offset; if (target < 0 || target >= next.length) return previous; [next[i], next[target]] = [next[target], next[i]]; return next; }); setSubmitted(false); };
  const errors = validatePackage(pkg), progress = completion(pkg, part, snapshot.attempts);
  return <section className="study-workspace"><WorkspaceHeader {...props} /><div className="study-notice">로컬 파일 미리보기 전용 · 파일 바이트는 POS 서버나 브라우저 저장소에 저장되지 않습니다. 이동·새로고침 시 파일을 다시 선택해야 합니다.</div>
    {errors.length ? <div role="alert" className="study-error">{errors.join(" / ")}</div> : <div className="study-upload-layout"><div>
      <div className="study-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><strong>답안 사진이나 스캔 PDF를 여기에 놓으세요</strong><p>JPG · PNG · PDF / 파일당 최대 20MB / 최대 10개</p><div className="study-actions"><label className="study-file-button">파일 선택<input aria-label="답안 파일 선택" type="file" accept="image/jpeg,image/png,application/pdf" multiple onChange={e => { addFiles(e.target.files); e.target.value = ""; }} /></label><label className="study-file-button">사진 촬영<input aria-label="답안 사진 촬영" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} /></label></div></div>
      <div className="study-file-previews">{files.map((f, i) => <article className="study-file-preview" key={f.id}><header><strong>{i + 1}. {f.file.name}</strong><div className="study-actions"><button aria-label={`${f.file.name} 위로`} disabled={i === 0} onClick={() => reorder(i, -1)}>↑</button><button aria-label={`${f.file.name} 아래로`} disabled={i === files.length - 1} onClick={() => reorder(i, 1)}>↓</button><button aria-label={`${f.file.name} 제거`} onClick={() => { URL.revokeObjectURL(f.url); setFiles(previous => previous.filter(item => item.id !== f.id)); setSubmitted(false); }}>제거</button></div></header>{f.file.type === "application/pdf" ? <><object data={f.url} type="application/pdf" aria-label={`${f.file.name} PDF 미리보기`}><p>이 브라우저는 PDF 내부 미리보기를 지원하지 않습니다.</p></object><a href={f.url} target="_blank" rel="noreferrer">PDF 크게 열기</a></> : <img src={f.url} alt={`${i + 1}번째 답안: ${f.file.name}`} />}</article>)}</div>
      {!files.length && <div className="study-empty">선택한 답안이 없습니다. 파일을 선택하면 이 영역에 크게 표시됩니다.</div>}
    </div><aside className="study-panel study-coverage"><h2>제출 범위</h2><p>필수·확장은 별도 기록됩니다. 이미 온라인으로 제출한 문항과 겹쳐도 완료를 중복 집계하지 않습니다.</p><p>현재 {progress.covered}/{progress.total} 문항 제출</p>{pkg[part].map((q, i) => { const key = responseKey(bindingFor(pkg, part, q)); const covered = snapshot.attempts.some(a => a.coverage.includes(key)); return <label className="study-coverage-option" key={key}><input type="checkbox" checked={coverage.includes(key)} onChange={e => { setCoverage(previous => e.target.checked ? [...previous, key] : previous.filter(k => k !== key)); setSubmitted(false); }} /><span>{i + 1}. {kindLabel[q.kind]} {covered && <small>· 기존 제출 있음</small>}</span></label>; })}<label className="study-field">제출 메모<textarea rows={5} maxLength={2000} value={note} onChange={e => { setNote(e.target.value); setSubmitted(false); }} placeholder="문항과 페이지 연결, 참고할 내용" /></label><button className="study-primary" disabled={!files.length || !coverage.length || submitted} onClick={() => { try { port.recordAttempt({ workbookId: pkg.id, workbookVersion: pkg.version, part, mode: "handwritten", coverage, responses: {}, attachments: files.map((f, order) => ({ id: f.id, name: f.file.name, type: f.file.type, size: f.file.size, order })), note, }); setSubmitted(true); setMessage("로컬 샘플 제출 메타데이터만 기록했습니다. 파일은 POS 서버에 저장되지 않았으며 OCR·채점도 실행되지 않았습니다."); } catch (error) { setMessage(String(error)); } }}>수기 답안 샘플 제출</button><button onClick={() => open("solve")}>화면 풀이로 이어가기</button><button onClick={() => open("document", "question")}>문제 미리보기</button><p role="status" className="study-status">{message}</p></aside></div>}
  </section>;
}
export function DocumentViewer(props: WorkspaceProps & { doc: string }) {
  const { pkg, part, doc, port, open } = props;
  const [keys, setKeys] = useState<AnswerKey[] | null>(null), [error, setError] = useState("");
  const answer = doc === "answer", metadata = answer ? pkg.answerExplanationPdf : pkg.questionPdf;
  const errors = validatePackage(pkg);
  const validUrl = metadata.state === "ready" && metadata.workbookId === pkg.id && metadata.workbookVersion === pkg.version && metadata.url?.startsWith("https://");
  return <section className="study-workspace"><WorkspaceHeader {...props} /><div className="study-actions"><button aria-pressed={!answer} onClick={() => open("document", "question")}>문제 문서</button><button aria-pressed={answer} onClick={() => open("document", "answer")}>정답·해설 문서</button><button onClick={() => open("handwritten")}>수기 답안 제출</button></div>
    <div className="study-notice">{metadata.state === "missing" ? "문서 쌍 누락 · 게시할 수 없습니다." : "본문 미리보기 · 실제 PDF 생성·다운로드·인쇄는 연결되지 않았습니다."}</div>
    {errors.length > 0 ? <div role="alert" className="study-error">{errors.join(" / ")}</div> : <div className="study-document"><h2>{answer ? "정답·해설" : "문제"} 미리보기 · {part === "required" ? "필수" : "확장"}</h2><p>{pkg.id} · v{pkg.version} · 정책 v{pkg.policyVersion}</p>
    {answer && !keys && <button className="study-primary" onClick={async () => { try { setKeys(await port.readAnswerKeys(pkg.id, pkg.version, part)); } catch (e) { setError(String(e)); } }}>샘플 해설 열기</button>}
    {(!answer || keys) && [...pkg[part]].sort((a,b) => a.order-b.order).map((q,i) => <article key={q.id}><h3>{i + 1}. {q.prompt}</h3>{q.context && <p>{q.context}</p>}{answer ? (() => { const key = keys?.find(k => k.binding.questionId === q.id && k.binding.questionVersion === q.version); return key && <><p>{key.model}</p><p>{key.explanation}</p><ul>{key.rubric.map(r => <li key={r}>{r}</li>)}</ul></>; })() : <>{q.options?.map(o => <p key={o.id}>{o.id}. {o.text}</p>)}{q.kind === "diagram" && <div className="study-drawing-area">도식 작성 공간 · 수기 답안으로 제출하세요</div>}</>}</article>)}
    {validUrl && <a href={metadata.url} target="_blank" rel="noreferrer">연결된 문서 열기</a>}<p role="alert">{error}</p></div>}
  </section>;
}

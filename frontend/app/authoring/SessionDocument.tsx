import { Button } from "@/components/ui/Button";
import { answerFor, scanSummary, sectionLabel, type Session } from "@/lib/authoring/types";
import { AnswerValue } from "./QuestionField";
export function ScanSummary({ session }: { session: Session }) {
  const scan = scanSummary(session.definition, session.answers);
  if (!scan) return null;
  return <div className="authoring-scan-summary"><p>평균 {scan.average.toFixed(1)} / 10 <span>· {scan.count}/{scan.total}개 작성</span></p><p>상위 안정 영역 · {scan.high.map(s => `${s.title} ${s.value}`).join(" · ")}</p><p>하위 영역 · {scan.low.map(s => `${s.title} ${s.value}`).join(" · ")}</p>{session.programKey === "reality" && <p>최고–최저 점수 차이 · {scan.spread}</p>}</div>;
}
export function SessionDocument({ session, edit }: { session: Session; edit?: (key: string) => void }) {
  return <div className="authoring-document">{session.definition.guidance && <p className="authoring-help">{session.definition.guidance}</p>}{session.definition.sections.map((section, i) => <section key={section.sectionKey}>
    <header><h2>{sectionLabel(session.definition, i)}. {section.title}</h2>{edit && <Button variant="ghost" onClick={() => edit(section.sectionKey)}>수정</Button>}</header>
    {section.description && <p className="authoring-help">{section.description}</p>}
    {section.questions.map(q => <div className="authoring-document-question" key={q.questionKey}><h3>{q.prompt}</h3>{q.helperText && <p className="authoring-help">{q.helperText}</p>}<AnswerValue value={answerFor(q, session.answers)} type={q.type} /></div>)}
    {section.sectionKey === "scan" && <ScanSummary session={session} />}
  </section>)}</div>;
}
export function ReportDocument({ session }: { session: Session }) {
  if (!session.report) return <p>완료한 세션의 Report가 여기에 표시됩니다.</p>;
  const scan = session.report.scanSummary;
  const source = session.report.source;
  const summaryKeys = session.programKey === "recovery" ? ["level", "arrival.state"] : session.programKey === "reality" ? ["arrival.satisfaction"] : [];
  const summaryItems = session.report.sections.flatMap(s => s.items).filter(item => summaryKeys.includes(item.questionKey));
  return <div className="authoring-document"><section><h2>Session Summary</h2>{source && <p className="authoring-muted">원본: {source.programKey} · {new Date(source.completedAt).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})} · {source.specVersion}</p>}<p>{session.definition.title} · {session.specVersion}</p><p>{new Date(session.report.completedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>{summaryItems.map(item => <div key={item.questionKey}><h3>{item.prompt}</h3><AnswerValue value={item.value} type={item.type} /></div>)}{scan && <div className="authoring-scan-summary"><p>평균 {scan.average.toFixed(1)} / 10 · {scan.count}개 작성</p><p>상위 안정 영역 · {scan.highest.map(s => `${s.prompt} ${s.value}`).join(" · ")}</p><p>하위 영역 · {scan.lowest.map(s => `${s.prompt} ${s.value}`).join(" · ")}</p>{session.programKey === "reality" && <p>최고–최저 점수 차이 · {scan.spread}</p>}</div>}</section>{session.report.sections.map((section, index) => <section key={index}><h2>{section.title}</h2>{section.items.map(item => <div key={item.questionKey} className="authoring-document-question"><h3>{item.prompt}</h3><AnswerValue value={item.value} type={item.type} /></div>)}</section>)}</div>;
}

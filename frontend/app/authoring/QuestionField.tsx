"use client";
import { Button } from "@/components/ui/Button";
import { hasAnswer, type Answer, type Answers, type Classification, type Question, type Score } from "@/lib/authoring/types";
import { GoalsWriting, PastWriting, StructuredAnswer } from "./StructuredWriting";
export function QuestionField({ question: q, value, answers, change }: { question: Question; value?: Answer; answers: Answers; change: (value: Answer) => void }) {
  const id = `answer-${q.questionKey}`;
  const hint = q.helperText ? `${id}-hint` : undefined;
  return <fieldset className={`authoring-question type-${q.type}`} id={q.questionKey}>
    <legend>{q.prompt}{q.required && <span className="authoring-required">완료에 필요</span>}</legend>
    {q.helperText && <p id={hint} className="authoring-help">{q.helperText}</p>}
    {q.type === "FREE_TEXT" && <textarea id={id} aria-label={q.prompt} aria-describedby={hint} value={typeof value === "string" ? value : ""} rows={q.metadata?.rows ?? (q.helperText && q.helperText.length > 200 ? 12 : 8)} onChange={e => change(e.target.value)} />}
    {(q.type === "SINGLE_SELECT" || q.type === "MULTI_SELECT") && <div className="authoring-options">{q.options?.map((option, index) => <label key={option} htmlFor={`${id}-${index}`}><input id={`${id}-${index}`} type={q.type === "SINGLE_SELECT" ? "radio" : "checkbox"} name={id} checked={q.type === "SINGLE_SELECT" ? value === option : Array.isArray(value) && (value as string[]).includes(option)} onChange={() => {
      if (q.type === "SINGLE_SELECT") change(option);
      else { const list = (Array.isArray(value) ? value : []) as string[]; change(list.includes(option) ? list.filter(v => v !== option) : [...list, option]); }
    }} /><span>{option}</span></label>)}</div>}
    {q.type === "SCORE" && <><div className="authoring-score">{Array.from({ length: 10 }, (_, index) => index + 1).map(n => <label key={n}><input type="radio" name={id} aria-label={`${q.prompt} ${n}점`} checked={(value as Score)?.value === n} onChange={() => change({ ...((value as Score) ?? {}), value: n })} /><span>{n}</span></label>)}<button type="button" className="authoring-clear" aria-label={`${q.prompt} 점수 지우기`} onClick={() => change({ ...((value as Score) ?? {}), value: null })}>지우기</button></div>{q.metadata?.memo && <details><summary>메모 추가 (선택)</summary><label className="authoring-field authoring-score-memo">메모 (선택)<input value={(value as Score)?.memo ?? ""} onChange={e => change({ value: (value as Score)?.value ?? null, memo: e.target.value })} /></label></details>}</>}
    {["GOALS", "GOAL_DEEP_DIVE"].includes(q.type) && <GoalsWriting type={q.type} value={value} change={change} guides={q.metadata?.guides as Record<string,string> | undefined} />}
    {["EPOCHS", "EXPERIENCES", "EFFECTS", "CRITICAL"].includes(q.type) && <PastWriting type={q.type} value={value} change={change} />}
    {q.type === "CLASSIFICATION" && <ClassificationField question={q} value={Array.isArray(value) ? value as Classification[] : []} source={q.metadata?.sourceQuestionKey ? answers[q.metadata.sourceQuestionKey] : undefined} change={change} />}
  </fieldset>;
}
function ClassificationField({ question: q, value, source, change }: { question: Question; value: Classification[]; source?: Answer; change: (value: Answer) => void }) {
  function update(index: number, patch: Partial<Classification>) { change(value.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  const sourceLines = typeof source === "string" ? source.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const remaining = sourceLines.filter(text => !value.some(row => row.text === text));
  return <div className="authoring-classification">
    {sourceLines.length > 0 && <details className="authoring-source"><summary>UNLOAD 다시 보기</summary><p>{String(source)}</p><Button type="button" disabled={!remaining.length} onClick={() => change([...value, ...remaining.map(text => ({ text, classification: "", timing: "" }))])}>줄별로 항목 가져오기</Button></details>}
    {value.map((row, i) => <div className="authoring-classification-row" key={i}>
      <input aria-label={`${q.prompt} 항목 ${i + 1}`} value={row.text} placeholder="항목" onChange={e => update(i, { text: e.target.value })} />
      <select aria-label={`항목 ${i + 1} 분류`} value={row.classification} onChange={e => update(i, { classification: e.target.value, timing: e.target.value === "MUST" ? row.timing : "" })}><option value="">분류 선택</option>{q.options?.map(option => <option key={option}>{option}</option>)}</select>
      {q.metadata?.timing && row.classification === "MUST" && <select aria-label={`항목 ${i + 1} 처리 시점`} value={row.timing ?? ""} onChange={e => update(i, { timing: e.target.value })}><option value="">시점 선택</option>{["오늘", "내일", "48시간 내"].map(s => <option key={s}>{s}</option>)}</select>}
      {q.metadata?.memo && <input aria-label={`항목 ${i + 1} 실제 시간 사용`} placeholder="실제로 시간을 쓰고 있는지" value={row.memo ?? ""} onChange={e => update(i, { memo: e.target.value })} />}
      <Button type="button" variant="ghost" aria-label={`항목 ${i + 1} 삭제`} onClick={() => change(value.filter((_, n) => n !== i))}>×</Button>
    </div>)}
    <Button type="button" onClick={() => change([...value, { text: "", classification: "", timing: "" }])}>+ 항목 추가</Button>
  </div>;
}
export function AnswerValue({ value, type }: { value?: Answer; type: Question["type"] }) {
  if (type === "SCORE" && value && (value as Score).memo && (value as Score).value == null) return <p className="authoring-answer">점수 미작성 · {(value as Score).memo}</p>;
  if (["GOALS","GOAL_DEEP_DIVE","EPOCHS","EXPERIENCES","EFFECTS","CRITICAL"].includes(type)) return <StructuredAnswer value={value} type={type} />;
  if ((type !== "CLASSIFICATION" && !hasAnswer(value)) || (type === "CLASSIFICATION" && (!Array.isArray(value) || !value.length))) return <p className="authoring-empty">아직 작성하지 않음</p>;
  if (type === "SCORE") { const score = value as Score; return <p className="authoring-answer">{score.value} / 10{score.memo && ` · ${score.memo}`}</p>; }
  if (type === "CLASSIFICATION") return <ul className="authoring-answer">{((value ?? []) as Classification[]).map((row, i) => <li key={i}><strong>{row.classification || "미분류"}</strong> · {row.text}{row.timing && ` · ${row.timing}`}{row.memo && ` · ${row.memo}`}</li>)}</ul>;
  return <p className="authoring-answer">{Array.isArray(value) ? (value as string[]).join(" · ") : String(value)}</p>;
}

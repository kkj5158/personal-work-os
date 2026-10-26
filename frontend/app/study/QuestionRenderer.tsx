"use client";
import type { ComponentType } from "react";
import { type Question, type Response, type QuestionKind } from "@/lib/study/model";
type Props = { question: Question; response?: Response; onChange: (value: Response) => void; disabled?: boolean };
function Single({ question: q, response, onChange, disabled }: Props) {
  const selected = response && "selected" in response ? response.selected : undefined;
  return <div className="study-options">{q.options!.map(o => <label key={o.id}><input type="radio" name={q.id} checked={selected === o.id} onChange={() => onChange({ selected: o.id })} disabled={disabled} /><span><b>{o.id}</b> {o.text}</span></label>)}</div>;
}
function Multiple({ question: q, response, onChange, disabled }: Props) {
  const selected = response && "selected" in response && Array.isArray(response.selected) ? response.selected : [];
  return <div className="study-options">{q.options!.map(o => <label key={o.id}><input type="checkbox" checked={selected.includes(o.id)} onChange={event => onChange({ selected: event.target.checked ? [...selected, o.id].sort() : selected.filter(id => id !== o.id) })} disabled={disabled} /><span><b>{o.id}</b> {o.text}</span></label>)}</div>;
}
function BooleanQuestion({ question: q, response, onChange, disabled }: Props) {
  return <div className="study-options study-boolean">{[true, false].map(value => <label key={String(value)}><input type="radio" name={q.id} checked={!!response && "value" in response && response.value === value} onChange={() => onChange({ value })} disabled={disabled} /><span>{value ? "참" : "거짓"}</span></label>)}</div>;
}
function Short({ question: q, response, onChange, disabled }: Props) { return <input className="study-text" aria-label={q.prompt} value={response && "text" in response ? response.text : ""} maxLength={16000} onChange={e => onChange({ text: e.target.value })} disabled={disabled} placeholder="짧은 답을 작성하세요" />; }
function Long({ question: q, response, onChange, disabled }: Props) { return <textarea className="study-text" aria-label={q.prompt} rows={q.rows ?? 9} maxLength={16000} value={response && "text" in response ? response.text : ""} onChange={e => onChange({ text: e.target.value })} disabled={disabled} placeholder="생각의 흐름이 드러나도록 자유롭게 작성하세요." />; }
const registry: Partial<Record<QuestionKind, ComponentType<Props>>> = { single_choice: Single, multiple_choice: Multiple, true_false: BooleanQuestion, short_answer: Short, essay: Long, case_analysis: Long };
export function QuestionRenderer(props: Props) { const Widget = registry[props.question.kind]; return Widget ? <Widget {...props} /> : <p className="study-notice">이 문항은 화면 입력을 지원하지 않습니다. 아래 문제 미리보기와 수기 답안 제출을 이용하세요.</p>; }
export const kindLabel: Record<QuestionKind, string> = { single_choice: "객관식", multiple_choice: "복수 선택", true_false: "참·거짓", short_answer: "단답형", essay: "서술형", case_analysis: "사례 분석", diagram: "그림·도식 (수기)" };

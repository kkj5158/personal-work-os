"use client";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { parseDietDay, dietDayLines } from "@/lib/notes/dietDay";

/** Read-only view of the DIET SYS projection. DIET SYS remains canonical; edit there. */
export function DietDayView({ node }: NodeViewProps) {
  const day = parseDietDay(String(node.attrs.payload ?? ""));
  if (!day) return <NodeViewWrapper className="diet-day diet-day-invalid" contentEditable={false}>다이어트 기록을 읽을 수 없습니다.</NodeViewWrapper>;
  const { measurements, checklist, focus } = dietDayLines(day);
  return (
    <NodeViewWrapper className="diet-day" contentEditable={false} data-drag-handle="">
      <header><strong>다이어트 기록</strong><time dateTime={day.date}>{day.date}</time></header>
      {focus.length > 0 && <p className="diet-day-focus">{focus.join(" · ")}</p>}
      {measurements.length > 0 && <ul className="diet-day-measurements">{measurements.map(line => <li key={line}>{line}</li>)}</ul>}
      {checklist && <p className="diet-day-checklist">{checklist}</p>}
      {day.note.trim() && <p className="diet-day-note">{day.note}</p>}
      <footer><a href={`/diet/planner?date=${day.date}`}>DIET SYS 플래너에서 편집</a> · 자동 정리됨</footer>
    </NodeViewWrapper>
  );
}

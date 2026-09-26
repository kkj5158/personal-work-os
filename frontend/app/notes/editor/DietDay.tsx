"use client";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { parseDietDay, dietDayView } from "@/lib/notes/dietDay";

/**
 * Read-only structured view of the DIET SYS projection (managed block). DIET SYS,
 * CHECKLIST SYS and the Diet Daily Note stay canonical; edit them in DIET SYS.
 */
export function DietDayView({ node }: NodeViewProps) {
  const day = parseDietDay(String(node.attrs.payload ?? ""));
  if (!day) return <NodeViewWrapper className="diet-day diet-day-invalid" contentEditable={false}>다이어트 기록을 읽을 수 없습니다.</NodeViewWrapper>;
  const view = dietDayView(day);
  return (
    <NodeViewWrapper className="diet-day" contentEditable={false} data-drag-handle="">
      <header className="diet-day-head"><strong>다이어트 기록</strong><time dateTime={day.date}>{day.date}</time></header>

      <section className="diet-day-section" aria-label="Focus / Goal">
        {view.focus.map(group => (
          <div key={group.role} className="diet-day-focus">
            <span className="diet-day-label">{group.label}</span>
            {group.entries.length ? group.entries.map(f => (
              <div key={`${f.title}-${f.startDate}`} className="diet-day-focus-entry">
                <b>{f.title}</b>
                <small>{f.startDate} – {f.endDate}{f.keyPoint ? ` · ${f.keyPoint}` : ""}</small>
              </div>
            )) : <small className="diet-day-muted">—</small>}
          </div>
        ))}
      </section>

      <section className="diet-day-section" aria-label="측정 기록">
        <h4>측정 기록</h4>
        {view.currentWeight && <p className="diet-day-current">현재 체중 <b>{view.currentWeight.value} kg</b> <small>{view.currentWeight.note}</small></p>}
        <table className="diet-day-table">
          <thead><tr><th>항목</th><th>아침</th><th>취침 전</th></tr></thead>
          <tbody>{view.measurements.map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label}{row.unit && <small> {row.unit}</small>}</th>
              <td>{row.morning}</td>
              <td className={row.bedtime === "해당 없음" ? "diet-day-muted" : undefined}>{row.bedtime}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="diet-day-section" aria-label="체크리스트">
        <h4>체크리스트{view.checklistSummary && <small>{view.checklistSummary}</small>}</h4>
        {view.checklist.length ? (
          <table className="diet-day-table">
            <thead><tr><th>구분</th><th>체크리스트 항목</th><th>상태</th></tr></thead>
            <tbody>{view.checklist.map((row, i) => (
              <tr key={`${row.title}-${i}`}>
                <td className="diet-day-importance">{row.importance}</td>
                <td>{row.title}</td>
                <td><span className={`diet-day-state diet-day-state-${row.state.toLowerCase()}`}>{row.label}</span></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="diet-day-muted">이 날짜에 해당하는 항목이 없습니다.</p>}
      </section>

      <section className="diet-day-section" aria-label="오늘의 기록">
        <h4>오늘의 기록</h4>
        {day.note.trim() ? <p className="diet-day-note">{day.note}</p> : <p className="diet-day-muted">작성된 기록이 없습니다.</p>}
      </section>

      <footer><a href={`/diet/planner?date=${day.date}`}>DIET SYS 플래너에서 편집</a></footer>
    </NodeViewWrapper>
  );
}

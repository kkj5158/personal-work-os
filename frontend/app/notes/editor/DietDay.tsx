"use client";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { parseDietDay, dietDayView, type MeasurementCell } from "@/lib/notes/dietDay";

function Measurement({ cell }: { cell: MeasurementCell }) {
  return <td className={`diet-day-measure diet-day-measure-${cell.state}`} aria-label={cell.state === "missing" ? "미입력" : undefined}>{cell.value}</td>;
}

/**
 * Read-only structured view of the DIET SYS projection (managed block). DIET SYS,
 * CHECKLIST SYS and the Diet Daily Note stay canonical; edit them in DIET SYS.
 */
export function DietDayView({ node }: NodeViewProps) {
  const day = parseDietDay(String(node.attrs.payload ?? ""));
  if (!day) return <NodeViewWrapper className="diet-day diet-day-invalid" contentEditable={false}>다이어트 기록을 읽을 수 없습니다.</NodeViewWrapper>;
  const view = dietDayView(day);
  return (
    <NodeViewWrapper className="diet-day diet-day-compact" contentEditable={false} data-drag-handle="">
      <header className="diet-day-head"><strong>다이어트 기록</strong><time dateTime={day.date}>{day.date}</time></header>

      <section className="diet-day-section" aria-label="Focus / Goal">
        {view.focus.map(group => (
          <div key={group.role} className="diet-day-focus">
            <span className="diet-day-label">{group.label}</span>
            {group.entries.length ? group.entries.map(f => (
              <div key={`${f.title}-${f.startDate}`} className="diet-day-focus-entry" title={f.status}>
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
        <div className="diet-day-table-scroll" role="region" aria-label="측정 기록 표" tabIndex={0}>
        <table className="diet-day-table diet-day-measurements">
          <thead><tr><th scope="col">구분</th><th scope="col">체중 <small>kg</small></th><th scope="col">혈당 <small>mg/dL</small></th><th scope="col">혈중 케톤 <small>mmol/L</small></th><th scope="col">호흡 케톤 <small>ppm</small></th><th scope="col">측정 시각</th></tr></thead>
          <tbody>{view.measurements.map(row => (
            <tr key={row.slot} data-slot={row.slot}>
              <th scope="row">{row.label}</th>
              <Measurement cell={row.weight} />
              <Measurement cell={row.glucose} />
              <Measurement cell={row.bloodKetone} />
              <Measurement cell={row.breathKetone} />
              <td className="diet-day-measured-at">{row.measuredAt ? <time dateTime={row.measuredAt.dateTime} title={row.measuredAt.dateTime}>{row.measuredAt.label}</time> : <span aria-label="측정 시각 미입력">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        </div>
      </section>

      <section className="diet-day-section" aria-label="체크리스트">
        <h4>체크리스트{view.checklistSummary && <small>{view.checklistSummary}</small>}</h4>
        {view.checklist.length ? (
          <div className="diet-day-table-scroll" role="region" aria-label="체크리스트 표" tabIndex={0}>
          <table className="diet-day-table diet-day-checklist">
            <thead><tr><th scope="col">구분</th><th scope="col">체크리스트 항목</th><th scope="col">상태</th></tr></thead>
            <tbody>{view.checklist.map((row, i) => (
              <tr key={`${row.title}-${i}`}>
                <td className="diet-day-importance">{row.importance}</td>
                <td>{row.title}</td>
                <td><span className={`diet-day-state diet-day-state-${row.state.toLowerCase()}`}>{row.label}</span></td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        ) : <p className="diet-day-muted">이 날짜에 해당하는 항목이 없습니다.</p>}
      </section>

      <section className="diet-day-section" aria-label="DIET Daily Note 읽기 전용">
        <h4>오늘의 기록 <small>DIET Daily Note · 읽기 전용</small></h4>
        {day.note.trim() ? <p className="diet-day-note">{day.note}</p> : <p className="diet-day-muted">작성된 기록이 없습니다.</p>}
      </section>

      <footer><a href={`/diet/record?date=${day.date}`}>DIET SYS 기록 보기</a></footer>
    </NodeViewWrapper>
  );
}

"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X, Square, Undo2 } from "lucide-react";
import { rectangleKeys, movePoint, type GridPoint } from "@/lib/checklist-core/selection";
import { planDateNotRecorded, type DateNotRecordedPlan } from "@/lib/checklist-core/dateAction";
import { cellKey, splitCellKey, STATE_LABELS, type CellAvailability, type CellChange, type ChecklistState } from "@/lib/checklist-core/types";
import { dayOfMonth, weekdayLabel } from "@/lib/checklist-core/dates";
import type { ChecklistMutations } from "./useChecklistMutations";
import { ChecklistIcon } from "./icons";

export type GridRow = { id: string; label: string; icon?: string | null; meta?: ReactNode; aside?: ReactNode };
export type GridGroup = { id: string; label: ReactNode; rows: GridRow[] };
export type GridDate = { date: string; sub?: ReactNode; title?: string };

type Props = {
  groups: GridGroup[];
  dates: GridDate[];
  today: string;
  mutations: ChecklistMutations;
  availability: (rowId: string, date: string) => CellAvailability;
  /** Accessible name for the grid, e.g. "체크리스트 기록". */
  label: string;
  rowHeader?: string;
  asideHeader?: string;
  emptyText?: string;
};

type Menu = { kind: "cell"; x: number; y: number; targets: string[] } | { kind: "date"; x: number; y: number; date: string };

const glyph = (state: ChecklistState, availability: CellAvailability) => {
  if (availability === "INACTIVE") return null;
  if (state === "SUCCESS") return <Check size={17} strokeWidth={2.4} aria-hidden="true" />;
  if (state === "FAILURE") return <X size={16} strokeWidth={2.2} aria-hidden="true" />;
  if (state === "NOT_RECORDED") return <span className="ckc-dot ckc-dot-nr" aria-hidden="true" />;
  return <span className="ckc-dot" aria-hidden="true" />;
};

const Cell = memo(function Cell({ row, col, state, availability, selected, today, focusable, label }: {
  row: number; col: number; state: ChecklistState; availability: CellAvailability; selected: boolean; today: boolean; focusable: boolean; label: string;
}) {
  return (
    <td className={`ckc-td${today ? " ckc-today" : ""}`}>
      <button
        type="button"
        className="ckc-cell"
        data-cell=""
        data-row={row}
        data-col={col}
        data-state={state}
        data-availability={availability}
        data-selected={selected || undefined}
        aria-disabled={availability !== "EDITABLE" || undefined}
        aria-label={`${label} ${availability === "INACTIVE" ? "비활성" : availability === "FUTURE" ? "미래" : state === "UNTOUCHED" ? "미입력" : STATE_LABELS[state]}${selected ? " 선택됨" : ""}`}
        tabIndex={focusable ? 0 : -1}
      >
        {glyph(state, availability)}
      </button>
    </td>
  );
});

/**
 * The shared checklist Journal grid — rows are checklist items, columns are
 * dates. The cell itself is the interaction surface: click toggles SUCCESS,
 * right-click / keys reach the other states, drag selects a rectangle for the
 * shared Bulk Action Bar, and a date header runs date-level NOT_RECORDED.
 */
export function ChecklistGrid({ groups, dates, today, mutations, availability, label, rowHeader = "체크리스트 항목", asideHeader, emptyText = "표시할 항목이 없습니다." }: Props) {
  const { getState, apply } = mutations;
  const rows = useMemo(() => groups.flatMap(group => group.rows), [groups]);
  const rowIds = useMemo(() => rows.map(row => row.id), [rows]);
  const dateKeys = useMemo(() => dates.map(d => d.date), [dates]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<GridPoint>({ row: 0, col: Math.max(0, dateKeys.indexOf(today)) });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirm, setConfirm] = useState<DateNotRecordedPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [barPosition, setBarPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const anchor = useRef<GridPoint | null>(null);
  const drag = useRef<{ start: GridPoint; moved: boolean; additive: boolean; shift: boolean; base: Set<string> } | null>(null);

  const editable = useCallback((rowId: string, date: string) => availability(rowId, date) === "EDITABLE", [availability]);
  // Drop selected cells that are no longer visible (filter / period change).
  const visibleSelection = useMemo(() => {
    const visible = new Set<string>();
    for (const key of selection) {
      const { rowId, date } = splitCellKey(key);
      if (rowIds.includes(rowId) && dateKeys.includes(date)) visible.add(key);
    }
    return visible;
  }, [selection, rowIds, dateKeys]);

  const pointOf = (element: Element | null): GridPoint | null => {
    const cell = element?.closest<HTMLElement>("[data-cell]");
    if (!cell) return null;
    return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
  };
  const keyAt = (point: GridPoint) => cellKey(rowIds[point.row], dateKeys[point.col]);

  const applyTo = useCallback((keys: Iterable<string>, state: ChecklistState, operation: string) => {
    const changes: CellChange[] = [];
    for (const key of keys) {
      const { rowId, date } = splitCellKey(key);
      if (editable(rowId, date)) changes.push({ rowId, date, state });
    }
    if (!changes.length) return;
    apply(changes, `${changes.length}개 칸 ${operation}`);
  }, [apply, editable]);

  const toggle = useCallback((point: GridPoint) => {
    const rowId = rowIds[point.row], date = dateKeys[point.col];
    if (!rowId || !date || !editable(rowId, date)) return;
    const next: ChecklistState = getState(rowId, date) === "SUCCESS" ? "UNTOUCHED" : "SUCCESS";
    apply([{ rowId, date, state: next }], next === "SUCCESS" ? "성공 기록" : "초기화");
  }, [apply, dateKeys, editable, getState, rowIds]);

  // Pointer: press + move = rectangle selection; press + release on the same cell = click.
  useEffect(() => {
    function up() {
      const current = drag.current;
      drag.current = null;
      if (!current || current.moved) return;
      const key = keyAt(current.start);
      if (current.shift && anchor.current) {
        setSelection(rectangleKeys(rowIds, dateKeys, anchor.current, current.start, editable));
        return;
      }
      anchor.current = current.start;
      if (current.additive) {
        setSelection(previous => {
          const next = new Set(previous);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        });
        return;
      }
      setSelection(new Set());
      toggle(current.start);
    }
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  });

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const point = pointOf(event.target as Element);
    if (!point) return;
    event.preventDefault();
    (event.target as HTMLElement).closest<HTMLElement>("[data-cell]")?.focus({ preventScroll: true });
    setFocus(point);
    setMenu(null);
    drag.current = { start: point, moved: false, additive: event.ctrlKey || event.metaKey, shift: event.shiftKey, base: event.ctrlKey || event.metaKey ? new Set(visibleSelection) : new Set() };
  }

  function onPointerOver(event: React.PointerEvent) {
    const current = drag.current;
    if (!current || !(event.buttons & 1)) return;
    const point = pointOf(event.target as Element);
    if (!point) return;
    if (!current.moved && point.row === current.start.row && point.col === current.start.col) return;
    current.moved = true;
    anchor.current = current.start;
    const rect = rectangleKeys(rowIds, dateKeys, current.start, point, editable);
    setSelection(new Set([...current.base, ...rect]));
  }

  function onContextMenu(event: React.MouseEvent) {
    const point = pointOf(event.target as Element);
    if (!point) return;
    event.preventDefault();
    const key = keyAt(point);
    const { rowId, date } = splitCellKey(key);
    if (!editable(rowId, date)) return;
    const targets = visibleSelection.has(key) ? [...visibleSelection] : [key];
    setMenu({ kind: "cell", x: event.clientX, y: event.clientY, targets });
  }

  function focusCell(point: GridPoint) {
    setFocus(point);
    wrapper.current?.querySelector<HTMLElement>(`[data-cell][data-row="${point.row}"][data-col="${point.col}"]`)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const point = pointOf(event.target as Element);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      mutations.runUndo();
      return;
    }
    if (event.key === "Escape") {
      setSelection(new Set());
      setMenu(null);
      return;
    }
    if (!point) return;
    const moved = movePoint(point, event.key, rowIds.length, dateKeys.length);
    if (moved) {
      event.preventDefault();
      if (event.shiftKey) {
        anchor.current ??= point;
        setSelection(rectangleKeys(rowIds, dateKeys, anchor.current, moved, editable));
      } else anchor.current = moved;
      focusCell(moved);
      return;
    }
    const targets = visibleSelection.size ? [...visibleSelection] : [keyAt(point)];
    const keyState: Record<string, ChecklistState> = { "1": "SUCCESS", s: "SUCCESS", "2": "FAILURE", f: "FAILURE", "3": "NOT_RECORDED", n: "NOT_RECORDED", "0": "UNTOUCHED", Backspace: "UNTOUCHED", Delete: "UNTOUCHED" };
    const state = keyState[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (state) {
      event.preventDefault();
      applyTo(targets, state, STATE_LABELS[state]);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (visibleSelection.size) applyTo(targets, "SUCCESS", STATE_LABELS.SUCCESS);
      else toggle(point);
    }
  }

  function openDateMenu(event: React.MouseEvent, date: string) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind: "date", x: rect.left, y: rect.bottom + 4, date });
  }

  function runDateNotRecorded(date: string) {
    setMenu(null);
    const plan = planDateNotRecorded(date, rowIds, getState, editable);
    if (plan.conflicts.length) { setConfirm(plan); return; }
    if (!plan.safe.length) { setNotice(`${date} 에 기록 못함으로 바꿀 칸이 없습니다.`); return; }
    apply(plan.safe, `${Number(date.slice(5, 7))}/${Number(date.slice(8))} 날짜 기록 못함 ${plan.safe.length}개`);
    setNotice("");
  }

  function selectDate(date: string) {
    setMenu(null);
    const col = dateKeys.indexOf(date);
    anchor.current = { row: 0, col };
    setSelection(rectangleKeys(rowIds, dateKeys, { row: 0, col }, { row: rowIds.length - 1, col }, editable));
  }

  // Keep the bulk bar next to the selection without shifting the grid layout.
  useLayoutEffect(() => {
    const host = wrapper.current;
    if (!host || !visibleSelection.size) { setBarPosition(null); return; }
    const cells = [...host.querySelectorAll<HTMLElement>("[data-cell][data-selected]")];
    if (!cells.length) { setBarPosition(null); return; }
    const base = host.getBoundingClientRect();
    const rects = cells.map(cell => cell.getBoundingClientRect());
    const top = Math.min(...rects.map(r => r.top)) - base.top;
    const bottom = Math.max(...rects.map(r => r.bottom)) - base.top;
    const left = Math.min(...rects.map(r => r.left)) - base.left;
    const right = Math.max(...rects.map(r => r.right)) - base.left;
    const barHeight = 44;
    const place = top - barHeight - 6 >= 36 ? top - barHeight - 6 : bottom + 6;
    setBarPosition({ top: place, left: Math.max(8, Math.min(base.width - 500, (left + right) / 2 - 240)) });
  }, [visibleSelection]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!(event.target as Element).closest(".ckc-menu")) setMenu(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const safeFocus = { row: Math.min(focus.row, Math.max(0, rowIds.length - 1)), col: Math.min(focus.col, Math.max(0, dateKeys.length - 1)) };
  let rowIndex = -1;

  return (
    <div className="ckc" ref={wrapper}>
      <div className="ckc-scroll">
        <table className="ckc-grid" aria-label={label} onPointerDown={onPointerDown} onPointerOver={onPointerOver} onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              <th scope="col" className="ckc-rowhead ckc-corner">{rowHeader}</th>
              {dates.map(d => (
                <th key={d.date} scope="col" className={`ckc-datehead${d.date === today ? " ckc-today" : ""}`} title={d.title}>
                  <button type="button" onClick={event => openDateMenu(event, d.date)} aria-label={`${d.date} 날짜 작업`} aria-haspopup="menu">
                    <span className="ckc-day">{dayOfMonth(d.date)}</span>
                    <span className="ckc-weekday">{weekdayLabel(d.date)}</span>
                    {d.sub && <span className="ckc-datesub">{d.sub}</span>}
                  </button>
                </th>
              ))}
              {asideHeader && <th scope="col" className="ckc-asidehead">{asideHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <GroupRows key={group.id} group={group} span={dates.length + 1 + (asideHeader ? 1 : 0)}>
                {group.rows.map(row => {
                  rowIndex++;
                  const r = rowIndex;
                  return (
                    <tr key={row.id} className="ckc-row">
                      <th scope="row" className="ckc-rowhead">
                        {row.icon && <span className="ckc-rowicon"><ChecklistIcon name={row.icon} /></span>}
                        <span className="ckc-rowlabel">{row.label}</span>
                        {row.meta && <span className="ckc-rowmeta">{row.meta}</span>}
                      </th>
                      {dates.map((d, c) => {
                        const key = cellKey(row.id, d.date);
                        return (
                          <Cell
                            key={d.date}
                            row={r}
                            col={c}
                            state={getState(row.id, d.date)}
                            availability={availability(row.id, d.date)}
                            selected={visibleSelection.has(key)}
                            today={d.date === today}
                            focusable={safeFocus.row === r && safeFocus.col === c}
                            label={`${d.date} ${row.label}`}
                          />
                        );
                      })}
                      {asideHeader && <td className="ckc-aside">{row.aside}</td>}
                    </tr>
                  );
                })}
              </GroupRows>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="ckc-empty">{emptyText}</p>}
      </div>

      {barPosition && visibleSelection.size > 0 && (
        <div className="ckc-bulkbar" role="toolbar" aria-label="선택한 칸 일괄 처리" style={{ top: barPosition.top, left: barPosition.left }}>
          <button type="button" className="ckc-b-success" onClick={() => applyTo(visibleSelection, "SUCCESS", "성공")}><Check size={14} />성공</button>
          <button type="button" className="ckc-b-failure" onClick={() => applyTo(visibleSelection, "FAILURE", "실패")}><X size={14} />실패</button>
          <button type="button" className="ckc-b-nr" onClick={() => applyTo(visibleSelection, "NOT_RECORDED", "기록 못함")}><span className="ckc-dot ckc-dot-nr" />기록 못함</button>
          <button type="button" className="ckc-b-clear" onClick={() => applyTo(visibleSelection, "UNTOUCHED", "초기화")}><Square size={13} />초기화</button>
          <button type="button" className="ckc-b-count" aria-label="선택 해제" title="선택 해제 (Esc)" onClick={() => setSelection(new Set())}>선택 {visibleSelection.size}개 <X size={12} /></button>
        </div>
      )}

      {menu?.kind === "cell" && (
        <div className="ckc-menu" role="menu" style={{ top: menu.y, left: menu.x }}>
          {(["SUCCESS", "FAILURE", "NOT_RECORDED", "UNTOUCHED"] as ChecklistState[]).map(state => (
            <button key={state} role="menuitem" type="button" data-state={state} onClick={() => { applyTo(menu.targets, state, STATE_LABELS[state]); setMenu(null); }}>
              {STATE_LABELS[state]}{menu.targets.length > 1 ? ` (${menu.targets.length})` : ""}
            </button>
          ))}
        </div>
      )}
      {menu?.kind === "date" && (
        <div className="ckc-menu" role="menu" style={{ top: menu.y, left: menu.x }}>
          <p className="ckc-menu-title">{menu.date}</p>
          <button role="menuitem" type="button" data-state="NOT_RECORDED" onClick={() => runDateNotRecorded(menu.date)}>이 날짜 전체 기록 못함</button>
          <button role="menuitem" type="button" onClick={() => selectDate(menu.date)}>이 날짜 칸 선택</button>
        </div>
      )}

      {confirm && (
        <div className="ckc-confirm-backdrop" role="presentation">
          <div className="ckc-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ckc-confirm-title">
            <h3 id="ckc-confirm-title">{confirm.date} 기록 못함</h3>
            <p>이미 성공·실패가 기록된 칸 <b>{confirm.conflicts.length}개</b>가 있습니다. 비어 있는 칸 <b>{confirm.safe.length}개</b>{confirm.unchanged ? `, 이미 기록 못함 ${confirm.unchanged}개` : ""}.</p>
            <div className="ckc-confirm-actions">
              <button type="button" onClick={() => setConfirm(null)}>취소</button>
              <button type="button" disabled={!confirm.safe.length} onClick={() => { apply(confirm.safe, `${confirm.date} 빈 칸 기록 못함 ${confirm.safe.length}개`); setConfirm(null); }}>빈 칸만 ({confirm.safe.length})</button>
              <button type="button" className="ckc-primary" onClick={() => { const all = [...confirm.safe, ...confirm.conflicts]; apply(all, `${confirm.date} 전체 기록 못함 ${all.length}개`); setConfirm(null); }}>기존 기록 포함 전체 ({confirm.safe.length + confirm.conflicts.length})</button>
            </div>
          </div>
        </div>
      )}

      <ChecklistFeedback mutations={mutations} notice={notice} onDismissNotice={() => setNotice("")} />
    </div>
  );
}

function GroupRows({ group, span, children }: { group: GridGroup; span: number; children: ReactNode }) {
  return (
    <>
      <tr className="ckc-group">
        <th scope="rowgroup" colSpan={span}><span className="ckc-grouplabel"><span className="ckc-groupicon"><Square size={13} strokeWidth={1.5} /></span>{group.label}</span></th>
      </tr>
      {children}
    </>
  );
}

/** Saving / error / Undo feedback for the last logical checklist operation. */
export function ChecklistFeedback({ mutations, notice, onDismissNotice }: { mutations: ChecklistMutations; notice?: string; onDismissNotice?: () => void }) {
  const { undo, runUndo, dismissUndo, error, clearError, saving } = mutations;
  if (!(undo && undo.changes.length > 1) && !error && !notice && !saving) return null;
  return (
    <div className="ckc-toast" aria-live="polite">
      {error && <p role="alert" className="ckc-toast-error">{error} <button type="button" onClick={clearError}>닫기</button></p>}
      {notice && <p>{notice} <button type="button" onClick={onDismissNotice}>닫기</button></p>}
      {undo && undo.changes.length > 1 && !error && <p>{undo.label} <button type="button" onClick={runUndo}><Undo2 size={13} />실행 취소</button><button type="button" aria-label="알림 닫기" onClick={dismissUndo}><X size={12} /></button></p>}
      {saving && !(undo && undo.changes.length > 1) && !error && <p className="ckc-toast-muted">저장 중…</p>}
    </div>
  );
}

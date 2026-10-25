"use client";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, FileText, GripVertical } from "lucide-react";
import { useState } from "react";
import type { Summary } from "@/lib/notes/types";

function OperationalRow({ note, selected, busy, readonly, first, last, select, move }: {
  note: Summary; selected: boolean; busy: boolean; readonly: boolean; first: boolean; last: boolean;
  select: () => void; move: (direction: number) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: note.id, disabled: busy || readonly });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} className={`operational-row${selected ? " selected" : ""}`}>
    <button type="button" {...attributes} {...listeners} disabled={busy || readonly} className="operational-handle" aria-label={`${note.title} 순서 변경`} title="끌어서 순서 변경 · Space로 선택 후 방향키로 이동"><GripVertical size={16}/></button>
    <button type="button" className="operational-select" disabled={busy} aria-pressed={selected} onClick={select} title={note.title}><FileText size={16}/><span>{note.title}</span></button>
    <div className="operational-move">
      <button type="button" disabled={busy || readonly || first} onClick={() => move(-1)} aria-label={`${note.title} 위로 이동`}><ArrowUp size={12}/></button>
      <button type="button" disabled={busy || readonly || last} onClick={() => move(1)} aria-label={`${note.title} 아래로 이동`}><ArrowDown size={12}/></button>
    </div>
  </li>;
}

/** Title rail only. Document editing remains the shared NoteEditor in the center. */
export function OperationalNotes({ rows, selectedId, loading, busy, readonly, error, onSelect, onCreate, onReorder, onReload }: {
  rows: Summary[]; selectedId: string | null; loading: boolean; busy: boolean; readonly: boolean; error: string;
  onSelect: (id: string) => void; onCreate: () => void; onReorder: (rows: Summary[]) => void; onReload: () => void;
}) {
  const [query, setQuery] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visible = rows.filter(n => n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function move(id: string, direction: number) {
    const index = rows.findIndex(n => n.id === id), next = index + direction;
    if (index >= 0 && next >= 0 && next < rows.length) onReorder(arrayMove(rows, index, next));
  }
  return <aside className="operational-notes" aria-label="운영 노트 목록" aria-busy={busy || loading}>
    <header><h2>운영 노트</h2><button type="button" className="primary" disabled={readonly || busy} onClick={onCreate}>+ 새 운영 노트</button></header>
    <input type="search" aria-label="운영 노트 제목 검색" placeholder="제목 검색…" value={query} onChange={e => setQuery(e.target.value)}/>
    {error && <div className="note-error" role="alert">{error}<button type="button" onClick={onReload} disabled={busy}>다시 불러오기</button></div>}
    {loading ? <p className="note-muted">불러오는 중…</p> : <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (readonly || busy || !over || active.id === over.id) return;
        const from = rows.findIndex(n => n.id === active.id), to = rows.findIndex(n => n.id === over.id);
        if (from >= 0 && to >= 0) onReorder(arrayMove(rows, from, to));
      }}>
        <SortableContext items={visible.map(n => n.id)} strategy={verticalListSortingStrategy}>
          <ul className="operational-list">{visible.map(note => <OperationalRow key={note.id} note={note} selected={selectedId === note.id} busy={busy} readonly={readonly} first={rows[0]?.id === note.id} last={rows.at(-1)?.id === note.id} select={() => onSelect(note.id)} move={direction => move(note.id, direction)}/>)}</ul>
        </SortableContext>
      </DndContext>
      {!visible.length && <p className="note-muted">{rows.length ? "검색 결과가 없습니다." : "운영 노트가 없습니다. 자주 참고할 원칙과 계획을 작성하세요."}</p>}
      {!!rows.length && <p className="operational-help">손잡이를 끌거나 위·아래 버튼으로 순서를 바꿀 수 있습니다. 변경한 순서는 자동 저장됩니다.</p>}
    </>}
  </aside>;
}

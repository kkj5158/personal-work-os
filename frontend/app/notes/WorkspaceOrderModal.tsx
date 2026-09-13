"use client";

import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { notesApi } from "@/lib/api/notes";
import type { Workspace } from "@/lib/notes/types";
import { workspaceIcon } from "./WorkspaceIconPicker";

function WorkspaceRow({ workspace, selected, busy, main, onMain }: { workspace: Workspace; selected: boolean; busy: boolean; main: boolean; onMain: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: workspace.id, disabled: busy });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} className="workspace-order-row">
    <button type="button" {...attributes} {...listeners} aria-label={`${workspace.name} 순서 변경`} className="workspace-order-handle"><GripVertical size={16}/></button>
    <button type="button" role="radio" aria-checked={main} aria-label={`${workspace.name} 메인 Workspace`} title="메인 Workspace" disabled={busy} onClick={onMain}>{main ? "★" : "☆"}</button>
    <span aria-hidden="true">{workspaceIcon(workspace.icon)}</span><span className="workspace-order-name">{workspace.name}</span>
    {selected && <small>선택됨</small>}
  </li>;
}

export function WorkspaceOrderModal({ workspaces, selectedId, mainWorkspaceId, onMainSaved, onClose, onSaved }: {
  workspaces: Workspace[]; selectedId?: string; mainWorkspaceId: string | null; onMainSaved: (id: string) => void; onClose: () => void; onSaved: (rows: Workspace[]) => void;
}) {
  const [rows, setRows] = useState(() => workspaces.filter(w => !w.archivedAt));
  const [main, setMain] = useState(() => workspaces.find(w => !w.archivedAt && w.id === mainWorkspaceId)?.id ?? workspaces.find(w => !w.archivedAt)?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      onSaved(await notesApi.reorderWorkspaces(rows.map(w => w.id)));
      if (main && main !== mainWorkspaceId) onMainSaved((await notesApi.saveMainWorkspace(main)).mainWorkspaceId);
      onClose();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Workspace 순서를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Workspace 순서 설정">
    <div role="dialog" aria-label="Workspace 순서 설정" aria-modal="true" onKeyDown={e => { if (e.key === "Escape" && !busy && !e.defaultPrevented) onClose(); }}>
      <p className="workspace-order-help">손잡이를 끌어 순서를 변경하세요. 별표로 NOTE SYS의 기본 진입 Workspace를 선택하세요. 허브 포함 여부는 바뀌지 않습니다.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (busy || !over || active.id === over.id) return;
        setRows(previous => {
          const from = previous.findIndex(w => w.id === active.id), to = previous.findIndex(w => w.id === over.id);
          return from < 0 || to < 0 ? previous : arrayMove(previous, from, to);
        });
      }}>
        <SortableContext items={rows.map(w => w.id)} strategy={verticalListSortingStrategy}>
          <ul className="workspace-order-list" role="radiogroup" aria-label="메인 Workspace">{rows.map(w => <WorkspaceRow key={w.id} workspace={w} selected={w.id === selectedId} busy={busy} main={w.id === main} onMain={() => setMain(w.id)}/>)}</ul>
        </SortableContext>
      </DndContext>
      {rows.length === 0 && <p>활성 Workspace가 없습니다.</p>}
      {error && <p role="alert" className="note-error">{error}</p>}
      <div className="workspace-order-actions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" className="primary" disabled={busy || !rows.length} onClick={() => void save()}>{busy ? "저장 중…" : "저장"}</button></div>
    </div>
  </Modal>;
}

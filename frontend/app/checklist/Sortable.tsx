"use client";
import type { ReactNode } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

function Row({ id, as: Tag, disabled, children }: { id: string; as: "div" | "tr"; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : <button type="button" className="cks-drag" aria-label="순서 변경" {...attributes} {...listeners}><GripVertical size={14} /></button>;
  return <Tag ref={setNodeRef as never} className={isDragging ? "cks-dragging" : undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>{children(handle)}</Tag>;
}

/** Explicit user ordering (DnD). Never derived from importance. */
export function Sortable({ ids, onReorder, as = "div", disabled = false, children }: { ids: string[]; onReorder: (ids: string[]) => void; as?: "div" | "tr"; disabled?: boolean; children: (id: string, handle: ReactNode) => ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
    }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map(id => <Row key={id} id={id} as={as} disabled={disabled}>{handle => children(id, handle)}</Row>)}
      </SortableContext>
    </DndContext>
  );
}

"use client";
import { useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Area, Identity } from "@/lib/checklist-sys/api";

type Kind = "identity" | "area";
type Data = { kind: Kind; identityId: string };
export type DropHint = { identityId: string; beforeAreaId: string | null } | null;

type Props = {
  identities: Identity[];
  areasOf: (identityId: string) => Area[];
  onReorderIdentities: (ids: string[]) => void;
  /** Same-Identity Area reorder. */
  onReorderAreas: (identityId: string, ids: string[]) => void;
  /** Area dropped into another Identity: new owner + that group's full new order. */
  onMoveArea: (areaId: string, identityId: string, ids: string[]) => void;
  renderIdentity: (identity: Identity, handle: ReactNode, state: { dropTarget: boolean }) => ReactNode;
  renderArea: (area: Area, identity: Identity, handle: ReactNode, state: { dropBefore: boolean }) => ReactNode;
  renderGroupEnd?: (identity: Identity) => ReactNode;
  collapsed?: (identityId: string) => boolean;
  disabled?: boolean;
  className?: string;
};

const key = (kind: Kind, id: string) => `${kind}:${id}`;
const idOf = (value: string | number) => String(value).slice(String(value).indexOf(":") + 1);
const dataOf = (value: { data: { current?: unknown } } | null | undefined) => value?.data.current as Data | undefined;

/**
 * Identity → Area hierarchy with direct DnD. Identities reorder as whole groups;
 * an Area reorders inside its group or moves into another group (ownership change).
 * Handles are the only drag start, so inline inputs, pickers and links stay clickable.
 */
export function IdentityAreaTree(props: Props) {
  const { identities, areasOf, onReorderIdentities, onReorderAreas, onMoveArea, disabled, className } = props;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [hint, setHint] = useState<DropHint>(null);

  const collision: CollisionDetection = args => {
    const kind = dataOf(args.active)?.kind;
    const of = (k: Kind) => args.droppableContainers.filter(c => dataOf(c)?.kind === k && c.id !== args.active.id);
    if (kind === "identity") return closestCenter({ ...args, droppableContainers: of("identity") });
    // Area drag: the Area row under the pointer, else the Identity group under it (append), else nearest Area.
    const areaHit = pointerWithin({ ...args, droppableContainers: of("area") });
    if (areaHit.length) return areaHit;
    const groupHit = pointerWithin({ ...args, droppableContainers: of("identity") });
    return groupHit.length ? groupHit : closestCenter({ ...args, droppableContainers: of("area") });
  };

  /** Where an Area would land: target Identity + the Area it goes before (null = end). */
  const targetOf = (activeId: string, over: DragOverEvent["over"]): DropHint => {
    const data = dataOf(over);
    if (!over || !data) return null;
    if (data.kind === "identity") return { identityId: data.identityId, beforeAreaId: null };
    return idOf(over.id) === activeId ? null : { identityId: data.identityId, beforeAreaId: idOf(over.id) };
  };

  const onDragOver = ({ active, over }: DragOverEvent) => setHint(dataOf(active)?.kind === "area" ? targetOf(idOf(active.id), over) : null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setHint(null);
    const data = dataOf(active);
    if (!data || !over) return;
    const activeId = idOf(active.id);
    if (data.kind === "identity") {
      const ids = identities.map(i => i.id), to = ids.indexOf(idOf(over.id));
      if (to >= 0 && to !== ids.indexOf(activeId)) onReorderIdentities(arrayMove(ids, ids.indexOf(activeId), to));
      return;
    }
    const target = targetOf(activeId, over);
    if (!target) return;
    const ids = areasOf(target.identityId).map(a => a.id).filter(id => id !== activeId);
    const at = target.beforeAreaId ? ids.indexOf(target.beforeAreaId) : -1;
    if (target.identityId === data.identityId) {
      // Same group: standard sortable semantics (the Area takes the hovered slot).
      const current = areasOf(target.identityId).map(a => a.id);
      if (!target.beforeAreaId) return;
      const next = arrayMove(current, current.indexOf(activeId), current.indexOf(target.beforeAreaId));
      if (next.join() !== current.join()) onReorderAreas(target.identityId, next);
      return;
    }
    ids.splice(at < 0 ? ids.length : at, 0, activeId);
    onMoveArea(activeId, target.identityId, ids);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setHint(null)}>
      <SortableContext items={identities.map(i => key("identity", i.id))} strategy={verticalListSortingStrategy} disabled={disabled}>
        <div className={className}>
          {identities.map(identity => <Group key={identity.id} {...props} identity={identity} hint={hint} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Handle({ label, attributes, listeners }: { label: string; attributes: object; listeners: object | undefined }) {
  return <button type="button" className="cks-drag" aria-label={label} title="드래그해 이동" {...attributes} {...listeners}><GripVertical size={13} /></button>;
}

function Group({ identity, areasOf, renderIdentity, renderArea, renderGroupEnd, collapsed, disabled, hint }: Props & { identity: Identity; hint: DropHint }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: key("identity", identity.id), data: { kind: "identity", identityId: identity.id } satisfies Data, disabled });
  const areas = areasOf(identity.id);
  const handle = disabled ? null : <Handle label={`${identity.name} 순서 변경`} attributes={attributes} listeners={listeners} />;
  const dropTarget = hint?.identityId === identity.id;
  return (
    <div ref={setNodeRef} className={`cks-tree-group${isDragging ? " cks-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`} data-identity={identity.id} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {renderIdentity(identity, handle, { dropTarget })}
      {!collapsed?.(identity.id) && (
        <SortableContext items={areas.map(a => key("area", a.id))} strategy={verticalListSortingStrategy} disabled={disabled}>
          {areas.map(area => <AreaNode key={area.id} area={area} identity={identity} renderArea={renderArea} disabled={disabled} dropBefore={hint?.beforeAreaId === area.id} />)}
        </SortableContext>
      )}
      {renderGroupEnd?.(identity)}
    </div>
  );
}

function AreaNode({ area, identity, renderArea, disabled, dropBefore }: { area: Area; identity: Identity; renderArea: Props["renderArea"]; disabled?: boolean; dropBefore: boolean }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: key("area", area.id), data: { kind: "area", identityId: identity.id } satisfies Data, disabled });
  const handle = disabled ? null : <Handle label={`${area.name} 이동`} attributes={attributes} listeners={listeners} />;
  return (
    <div ref={setNodeRef} className={`cks-tree-area${isDragging ? " cks-dragging" : ""}${dropBefore ? " is-drop-before" : ""}`} data-area={area.id} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {renderArea(area, identity, handle, { dropBefore })}
    </div>
  );
}

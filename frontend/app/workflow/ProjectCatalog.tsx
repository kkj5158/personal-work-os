"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, FolderPlus, GripVertical, Trash2 } from "lucide-react";
import type { Project, ProjectGroup } from "@/lib/api/workflow";
import { catalogSections } from "@/lib/workflow/catalog";
import { WorkflowConflictError } from "@/lib/workflow/store";
import { useWorkflow } from "./WorkflowContext";
import { InlineField } from "./TaskDetails";
import { RowControl } from "./TaskRow";

/** Container key of a catalog section; "none" is the 그룹 없음 projection (never a stored group). */
const NONE = "none";
const key = (group: ProjectGroup | null) => group?.id ?? NONE;
const COLLAPSE_KEY = "wf.projects.collapsedGroups";
const readCollapsed = (): string[] => { try { const raw = localStorage.getItem(COLLAPSE_KEY); const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter(item => typeof item === "string") : []; } catch { return []; } };
const errorText = (e: unknown) => e instanceof WorkflowConflictError ? e.message : e instanceof Error ? `순서를 저장하지 못해 원래 순서로 되돌렸습니다. (${e.message})` : "순서를 저장하지 못했습니다.";

export type RowRender = (project: Project, index: number, handle: ReactNode) => { className: string; style?: CSSProperties; onClick?: (event: React.MouseEvent<HTMLElement>) => void; content: ReactNode };

/**
 * S01 catalog with Project Groups. Groups reorder among themselves; Projects reorder inside a group and move
 * between groups (including 그룹 없음). Only the visible Projects are draggable; a drop is sent as
 * "before the next visible Project" so filtered or archived Projects keep their place in the full order.
 */
export function ProjectCatalog({ visible, renderRow, draggable }: { visible: Project[]; renderRow: RowRender; draggable: boolean }) {
  const flow = useWorkflow();
  const [collapsed, setCollapsed] = useState<string[]>([]), [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false), [name, setName] = useState(""), [confirm, setConfirm] = useState<string | null>(null);
  // Local mirror of the containers while a Project is dragged across groups; null when idle.
  const [preview, setPreview] = useState<Record<string, string[]> | null>(null);
  const [active, setActive] = useState<{ id: string; type: "project" | "group" } | null>(null), [overId, setOverId] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCollapsed(readCollapsed()); }, []);
  const toggle = (id: string) => setCollapsed(current => { const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]; try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ } return next; });

  const shown = useMemo(() => new Set(visible.map(project => project.id)), [visible]);
  const sections = useMemo(() => catalogSections(flow.projects, flow.groups).map(section => ({ ...section, ids: section.projects.filter(project => shown.has(project.id)).map(project => project.id) })), [flow.projects, flow.groups, shown]);
  const hasGroups = flow.groups.length > 0;
  const containers = preview ?? Object.fromEntries(sections.map(section => [key(section.group), section.ids]));
  const containerOf = (id: string) => Object.keys(containers).find(container => containers[container].includes(id)) ?? null;
  const byId = new Map(flow.projects.map(project => [project.id, project]));
  const numbering = new Map(sections.flatMap(section => containers[key(section.group)] ?? []).map((id, index) => [id, index]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Group drags only see group headers. Project drags first find the group area under the pointer, then the
  // closest Project inside it; an empty (or collapsed) group is itself the target.
  const collision: CollisionDetection = args => {
    if (args.active.data.current?.type === "group") return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(item => item.data.current?.type === "group") });
    const areas = args.droppableContainers.filter(item => item.data.current?.type === "container");
    const hit = pointerWithin({ ...args, droppableContainers: areas })[0] ?? closestCenter({ ...args, droppableContainers: areas })[0];
    const area = hit && areas.find(item => item.id === hit.id);
    if (!area) return [];
    const items = args.droppableContainers.filter(item => item.data.current?.type === "project" && item.data.current?.container === area.data.current?.key);
    return items.length ? closestCenter({ ...args, droppableContainers: items }) : [{ id: area.id }];
  };
  const targetContainer = (over: DragOverEvent["over"]) => !over ? null : over.data.current?.type === "container" ? String(over.data.current.key) : over.data.current?.type === "project" ? String(over.data.current.container) : null;

  function start(event: DragStartEvent) {
    setMessage(""); setOverId(null);
    const type = event.active.data.current?.type === "group" ? "group" : "project";
    setActive({ id: String(event.active.id), type });
    if (type === "project") setPreview(Object.fromEntries(sections.map(section => [key(section.group), section.ids])));
  }
  function over(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
    if (active?.type !== "project" || !preview) return;
    const id = String(event.active.id), from = containerOf(id), to = targetContainer(event.over);
    if (!from || !to || from === to) return;
    // Cross-group hover: move the placeholder into the hovered group at the hovered position.
    setPreview(current => {
      if (!current) return current;
      const target = current[to].filter(item => item !== id), at = event.over?.data.current?.type === "project" ? Math.max(0, target.indexOf(String(event.over.id))) : target.length;
      target.splice(at, 0, id);
      return { ...current, [from]: current[from].filter(item => item !== id), [to]: target };
    });
  }
  function finish(event: DragEndEvent) {
    const current = preview, dragged = active; setActive(null); setPreview(null); setOverId(null);
    if (!dragged || !event.over) return; // dropped outside a valid target: nothing changes
    if (dragged.type === "group") {
      const ids = sortedGroupIds(), from = ids.indexOf(dragged.id), to = ids.indexOf(String(event.over.id).replace(/^group:/, ""));
      if (from < 0 || to < 0 || from === to) return;
      void flow.reorderGroups(arrayMove(ids, from, to)).catch(e => setMessage(errorText(e)));
      return;
    }
    if (!current) return;
    const container = Object.keys(current).find(item => current[item].includes(dragged.id));
    if (!container) return;
    let list = current[container];
    if (event.over.data.current?.type === "project" && event.over.data.current.container === container) {
      const from = list.indexOf(dragged.id), to = list.indexOf(String(event.over.id));
      if (from >= 0 && to >= 0 && from !== to) list = arrayMove(list, from, to);
    }
    const origin = sections.find(section => section.ids.includes(dragged.id)), before = list[list.indexOf(dragged.id) + 1] ?? null;
    const unchanged = origin && key(origin.group) === container && origin.ids.indexOf(dragged.id) === list.indexOf(dragged.id);
    if (unchanged) return;
    void flow.moveProject(dragged.id, container === NONE ? null : container, before).catch(e => setMessage(errorText(e)));
  }
  const sortedGroupIds = () => sections.filter(section => section.group).map(section => section.group!.id);
  async function create() {
    const value = name.trim(); if (!value) return;
    try { await flow.createGroup(value); setName(""); setCreating(false); } catch (e) { setMessage(e instanceof Error ? e.message : "그룹을 만들지 못했습니다."); }
  }
  const dragging = active?.type === "project" ? byId.get(active.id) : undefined, draggingGroup = active?.type === "group" ? flow.groups.find(group => group.id === active.id) : undefined;
  const invalid = !!active && !overId;

  return <div className="wf-catalog">
    <div className="wf-catalog-bar">
      {creating ? <form className="wf-add-inline wf-group-create" aria-label="새 그룹" onSubmit={event => { event.preventDefault(); void create(); }}>
        <input autoFocus aria-label="그룹 이름" placeholder="그룹 이름" maxLength={80} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setCreating(false); setName(""); } }}/>
        <button className="wf-primary" disabled={!name.trim()}>만들기</button><button type="button" onClick={() => { setCreating(false); setName(""); }}>취소</button>
      </form> : <button type="button" className="wf-group-add" onClick={() => setCreating(true)}><FolderPlus size={14}/> 그룹</button>}
      {draggable && <small className="wf-muted">⠿ 핸들을 끌어 순서와 그룹을 바꿉니다. 키보드: 핸들에서 Space → 화살표 → Space.</small>}
    </div>
    {message && <p role="alert" className="wf-error wf-catalog-message">{message}<button type="button" aria-label="알림 닫기" onClick={() => setMessage("")}>×</button></p>}
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={start} onDragOver={over} onDragEnd={finish} onDragCancel={() => { setActive(null); setPreview(null); setOverId(null); }}>
      <SortableContext items={sortedGroupIds().map(id => `group:${id}`)} strategy={verticalListSortingStrategy}>
        {sections.filter(section => section.group || hasGroups || containers[NONE]?.length).map(section => {
          const id = key(section.group), ids = containers[id] ?? [], open = !collapsed.includes(id);
          const body = <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {open && <ol className="wf-project-rows">{ids.map(projectId => { const project = byId.get(projectId)!; return <SortableProject key={projectId} project={project} container={id} index={numbering.get(projectId) ?? 0} disabled={!draggable} renderRow={renderRow}/>; })}</ol>}
            {open && !ids.length && <p className="wf-group-empty">{section.group ? "프로젝트를 여기로 끌어 놓으세요." : "그룹에 속하지 않은 프로젝트가 없습니다."}</p>}
          </SortableContext>;
          return <CatalogSection key={id} group={section.group} containerKey={id} count={ids.length} total={section.projects.length} open={open} showHeader={hasGroups} draggable={draggable}
            onToggle={() => toggle(id)} confirm={confirm === id} onConfirm={value => setConfirm(value ? id : null)}
            onRename={value => { if (section.group && value.trim() && value.trim() !== section.group.name) void flow.renameGroup(section.group.id, value.trim()).catch(e => setMessage(e instanceof Error ? e.message : "이름을 바꾸지 못했습니다.")); }}
            onDelete={() => { if (section.group) void flow.deleteGroup(section.group.id).then(() => setConfirm(null), e => setMessage(e instanceof Error ? e.message : "그룹을 삭제하지 못했습니다.")); }}
            highlight={active?.type === "project" && !!overId && containerOf(active.id) === id}>{body}</CatalogSection>;
        })}
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {dragging ? <div className={`wf-drag-overlay wf-project-overlay ${invalid ? "is-invalid" : ""}`}><GripVertical size={14}/><span className="wf-color-dot" style={{ background: dragging.color }}/><strong>{dragging.title}</strong>{invalid && <small>여기에는 놓을 수 없습니다</small>}</div>
          : draggingGroup ? <div className={`wf-drag-overlay wf-group-overlay ${invalid ? "is-invalid" : ""}`}><GripVertical size={14}/><strong>{draggingGroup.name}</strong><small>{catalogSections(flow.projects, flow.groups).find(section => section.group?.id === draggingGroup.id)?.projects.length ?? 0}개</small></div> : null}
      </DragOverlay>
    </DndContext>
  </div>;
}

function CatalogSection({ group, containerKey, count, total, open, showHeader, draggable, onToggle, onRename, onDelete, confirm, onConfirm, highlight, children }: {
  group: ProjectGroup | null; containerKey: string; count: number; total: number; open: boolean; showHeader: boolean; draggable: boolean; highlight: boolean;
  onToggle: () => void; onRename: (value: string) => void; onDelete: () => void; confirm: boolean; onConfirm: (value: boolean) => void; children: ReactNode;
}) {
  const sortable = useSortable({ id: `group:${group?.id ?? NONE}`, data: { type: "group" }, disabled: !group || !draggable });
  const area = useDroppable({ id: `container:${containerKey}`, data: { type: "container", key: containerKey } });
  const name = group?.name ?? "그룹 없음";
  const style: CSSProperties | undefined = group ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition } : undefined;
  return <section ref={node => { area.setNodeRef(node); if (group) sortable.setNodeRef(node); }} style={style} aria-label={`${name} 그룹`}
    className={`wf-catalog-group ${group ? "" : "is-ungrouped"} ${sortable.isDragging ? "is-drag-origin" : ""} ${highlight || area.isOver ? "is-drop-target" : ""}`}>
    {showHeader && <header className="wf-catalog-group-head">
      {group && draggable ? <button type="button" className="wf-drag-handle" aria-label={`${name} 그룹 순서 변경`} title="끌어서 그룹 순서 변경" {...sortable.attributes} {...sortable.listeners}><GripVertical size={15}/></button> : <span className="wf-drag-spacer"/>}
      <button type="button" className="wf-catalog-toggle" aria-expanded={open} aria-label={`${name} 접기/펼치기`} onClick={onToggle}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
      {group ? <InlineField key={group.name} value={group.name} label={`${name} 그룹 이름`} className="wf-catalog-group-name" onSave={onRename}/> : <h2 className="wf-catalog-group-name is-neutral">그룹 없음</h2>}
      <span className="wf-count" title={count === total ? "프로젝트 수" : `표시 ${count} / 전체 ${total}`}>{count === total ? count : `${count}/${total}`}</span>
      {group && (confirm ? <span className="wf-settings-confirm">{total ? `프로젝트 ${total}개는 그룹 없음으로 이동합니다.` : "빈 그룹입니다."}<button type="button" className="wf-danger-text" onClick={onDelete}>삭제</button><button type="button" onClick={() => onConfirm(false)}>취소</button></span>
        : <button type="button" className="wf-td-icon" aria-label={`${name} 그룹 삭제`} title="그룹 삭제 (프로젝트는 유지)" onClick={() => onConfirm(true)}><Trash2 size={13}/></button>)}
    </header>}
    {children}
  </section>;
}

function SortableProject({ project, container, index, disabled, renderRow }: { project: Project; container: string; index: number; disabled: boolean; renderRow: RowRender }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: project.id, data: { type: "project", container }, disabled });
  const handle = disabled ? null : <RowControl className="wf-drag-cell"><button type="button" className="wf-drag-handle" aria-label={`${project.title} 순서 변경`} title="끌어서 순서·그룹 변경" {...attributes} {...listeners}><GripVertical size={15}/></button></RowControl>;
  const row = renderRow(project, index, handle);
  return <li ref={setNodeRef} data-project-id={project.id} className={`${row.className} ${isDragging ? "is-drag-origin" : ""}`}
    style={{ ...row.style, transform: CSS.Transform.toString(transform), transition }} onClick={row.onClick}>{row.content}</li>;
}

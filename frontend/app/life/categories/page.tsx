"use client";

import { useEffect, useState, type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Tags } from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import { createLifeCategory, listLifeCategories, renameLifeCategory, reorderLifeCategories, setLifeCategoryActive } from "@/lib/api/lifeCategories";
import type { LifeCategoryDto } from "@/lib/api/types";

const button = "rounded-md border border-control-border px-2.5 py-1.5 text-xs hover:bg-canvas-subtle disabled:opacity-40";
const input = "min-w-0 flex-1 rounded-md border border-control-border bg-canvas-default px-2 py-1.5 text-sm";
const sort = (a: LifeCategoryDto, b: LifeCategoryDto) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");

function SortableCategory({ category, disabled, children, nested }: { category: LifeCategoryDto; disabled: boolean; children: ReactNode; nested?: ReactNode }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: category.id, disabled });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }} className="rounded-md border border-border-default bg-canvas-default">
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" aria-label={`${category.name} 순서 변경`} className="shrink-0 cursor-grab touch-none text-fg-muted" {...attributes} {...listeners}><GripVertical size={16}/></button>
      {children}
    </div>
    {nested}
  </div>;
}

export default function LifeCategoriesPage() {
  const [categories, setCategories] = useState<LifeCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => { let live = true; listLifeCategories().then(rows => { if (live) setCategories(rows); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, []);
  const roots = categories.filter(c => !c.parentId).sort(sort);
  const siblings = (parentId: string | null) => categories.filter(c => (c.parentId ?? null) === parentId).sort(sort);
  async function action(run: () => Promise<LifeCategoryDto>) {
    if (busy) return;
    setBusy(true); setError("");
    try { const row = await run(); setCategories(previous => [...previous.filter(c => c.id !== row.id), row]); setEditing(null); setAdding(undefined); setNewName(""); }
    catch (e) { setError(e instanceof Error ? e.message : "카테고리를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function reorder({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || busy) return;
    const from = categories.find(c => c.id === active.id), to = categories.find(c => c.id === over.id);
    if (!from || !to || from.parentId !== to.parentId) return;
    const parentId = from.parentId ?? null;
    const group = siblings(parentId);
    const ids = arrayMove(group.map(c => c.id), group.findIndex(c => c.id === from.id), group.findIndex(c => c.id === to.id));
    const previous = categories;
    setCategories(categories.map(c => ids.includes(c.id) ? { ...c, sortOrder: ids.indexOf(c.id) } : c));
    setBusy(true); setError("");
    try { setCategories(await reorderLifeCategories(parentId, ids)); }
    catch (e) { setCategories(previous); setError(e instanceof Error ? e.message : "순서를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  function creation(parentId: string | null) {
    if (adding !== parentId) return null;
    return <form className="flex gap-2 py-2" onSubmit={e => { e.preventDefault(); if (newName.trim()) void action(() => createLifeCategory({ name: newName.trim(), parentId })); }}>
      <input autoFocus aria-label={parentId ? "중분류 이름" : "대분류 이름"} maxLength={100} className={input} value={newName} onChange={e => setNewName(e.target.value)} disabled={busy}/>
      <button className={button} disabled={busy || !newName.trim()}>추가</button><button type="button" className={button} disabled={busy} onClick={() => setAdding(undefined)}>취소</button>
    </form>;
  }
  function row(category: LifeCategoryDto) {
    return <>
      {!category.parentId && <button type="button" aria-label={`${category.name} ${collapsed.has(category.id) ? "펼치기" : "접기"}`} onClick={() => setCollapsed(prev => { const next = new Set(prev); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>{collapsed.has(category.id) ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}</button>}
      {editing === category.id ? <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void action(() => renameLifeCategory(category.id, name.trim())); }}>
        <input autoFocus className={input} aria-label="카테고리 이름" maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={busy}/>
        <button className={button} disabled={busy || !name.trim()}>저장</button><button type="button" className={button} disabled={busy} onClick={() => setEditing(null)}>취소</button>
      </form> : <><button type="button" className="flex-1 text-left text-sm font-medium" onClick={() => { setEditing(category.id); setName(category.name); }} disabled={busy}>{category.name}</button>
        {!category.isActive && <span className="text-xs text-fg-muted">비활성</span>}
        <button type="button" className={button} disabled={busy} onClick={() => { setEditing(category.id); setName(category.name); }}>이름 변경</button>
        <button type="button" className={button} disabled={busy} onClick={() => void action(() => setLifeCategoryActive(category.id, !category.isActive))}>{category.isActive ? "비활성화" : "활성화"}</button>
      </>}
    </>;
  }
  return <div className="flex min-h-screen bg-canvas-default text-fg-default">
    <SharedSidebar system="LIFE CODE" groups={[{ section: "LIFE CODE", items: [{ label: "카테고리", icon: Tags, active: true, action: () => undefined }] }]}/>
    <section className="min-w-0 flex-1 p-6 lg:p-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header><p className="mb-1 text-xs text-fg-muted">LIFE CODE</p><h1 className="text-xl font-semibold">카테고리</h1></header>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">생활 카테고리 관리</h2><button className={button} disabled={busy || loading} onClick={() => { setAdding(null); setNewName(""); }}>대분류 추가</button></div>
        <p className="text-xs text-fg-muted">Calendar에서 사용할 대분류와 중분류를 관리합니다. 이름을 클릭해 수정하고 손잡이를 끌어 같은 단계의 순서를 변경할 수 있습니다.</p>
        {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        {loading && <p className="text-sm text-fg-muted">불러오는 중…</p>}
        {!loading && roots.length === 0 && <p className="py-6 text-sm text-fg-muted">대분류를 추가해 생활 카테고리를 시작하세요.</p>}
        {creation(null)}
        <DndContext sensors={sensors} collisionDetection={args => { const selected = categories.find(c => c.id === args.active.id); return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(d => categories.find(c => c.id === d.id)?.parentId === selected?.parentId) }); }} onDragEnd={reorder}>
          <SortableContext items={roots.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {roots.map(root => <SortableCategory key={root.id} category={root} disabled={busy} nested={
              !collapsed.has(root.id) && <div className="ml-8 flex flex-col gap-2 p-2">
                <SortableContext items={siblings(root.id).map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {siblings(root.id).map(child => <SortableCategory key={child.id} category={child} disabled={busy}>{row(child)}</SortableCategory>)}
                </SortableContext>
                {creation(root.id)}
                <button type="button" className={`${button} self-start`} disabled={busy || !root.isActive} onClick={() => { setAdding(root.id); setNewName(""); }}>중분류 추가</button>
              </div>
            }>{row(root)}</SortableCategory>)}
          </SortableContext>
        </DndContext>
      </div>
    </section>
  </div>;
}

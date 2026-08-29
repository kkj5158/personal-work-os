"use client";

import { useState } from "react";
import { GearIcon, GrabberIcon, PlusIcon } from "@primer/octicons-react";
import type { ChecklistCategoryDto, ChecklistItemDto } from "@/lib/api/types";
import { FOCUS_VISIBLE } from "./format";

interface Props {
  items: ChecklistItemDto[];
  historicalItems: ChecklistItemDto[];
  categories: ChecklistCategoryDto[];
  onManageItems: () => void;
  onManageCategories: () => void;
}

export function ChecklistSettingsSection({ items, historicalItems, categories, onManageItems, onManageCategories }: Props) {
  const [showDeleted, setShowDeleted] = useState(false);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "미분류";
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name, position: c.position })), { id: null, name: "미분류", position: 9999 }]
    .map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id).sort((a, b) => a.position - b.position) }))
    .filter((g) => g.items.length);
  const deleted = historicalItems.filter((i) => i.deleted);

  return <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
    <div className="rounded-md border border-border-default">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3 className="text-sm font-semibold">체크리스트 항목 관리</h3>
        <button onClick={onManageItems} className={`flex h-8 items-center gap-1 rounded-md border border-control-border px-2.5 text-xs ${FOCUS_VISIBLE}`}><PlusIcon/> 항목 추가·관리</button>
      </div>
      {groups.map((g)=><div key={g.id??'none'}><div className="bg-canvas-subtle px-4 py-2 text-xs font-semibold text-fg-muted">▼ {g.name}</div>{g.items.map(i=><div key={i.id} className="flex items-center gap-2 border-t border-border-default px-4 py-2.5 text-sm"><GrabberIcon className="text-fg-muted"/><span className="flex-1">{i.emoji} {i.name}</span><span className="text-[10px] text-fg-muted">{i.priority}</span><span className={`rounded-full px-2 py-0.5 text-xs ${i.active?'bg-success-subtle text-success-fg':'bg-canvas-subtle text-fg-muted'}`}>{i.active?'활성':'비활성'}</span><button onClick={onManageItems} aria-label={`${i.name} 관리`} className="px-2 text-fg-muted">⋯</button></div>)}</div>)}
      <div className="border-t border-border-default p-3"><button onClick={()=>setShowDeleted(!showDeleted)} className={`h-8 rounded-md border border-control-border px-2.5 text-xs ${FOCUS_VISIBLE}`}>삭제된 항목 보기</button>{showDeleted&&<div className="mt-3 rounded-md border border-border-muted">{deleted.length===0?<p className="p-3 text-xs text-fg-muted">삭제된 항목이 없습니다.</p>:deleted.map(i=><div key={i.id} className="flex items-center gap-2 border-b border-border-muted px-3 py-2 text-sm last:border-0"><span className="flex-1 text-fg-muted">{i.emoji} {i.name} · {categoryName(i.categoryId)}</span><span className="rounded bg-canvas-subtle px-2 py-0.5 text-xs text-fg-muted">삭제됨</span></div>)}</div>}</div>
    </div>
    <div className="rounded-md border border-border-default">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3"><h3 className="text-sm font-semibold">카테고리 관리</h3><button onClick={onManageCategories} className={`flex h-8 items-center gap-1 rounded-md border border-control-border px-2.5 text-xs ${FOCUS_VISIBLE}`}><GearIcon/> 관리</button></div>
      {[...categories].sort((a,b)=>a.position-b.position).map(c=><div key={c.id} className="flex items-center gap-2 border-b border-border-default px-4 py-3 text-sm last:border-0"><GrabberIcon className="text-fg-muted"/><span>{c.name}</span></div>)}
    </div>
  </div>;
}

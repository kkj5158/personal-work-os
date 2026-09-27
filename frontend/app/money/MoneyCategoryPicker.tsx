"use client";
import { useState } from "react";
import type { Category } from "@/lib/money/model";
import { categoryIndex, toggleCategoryFilter } from "@/lib/money/categories";
import { useMoneyViewState } from "./MoneyDataProvider";

export function CategoryPicker({ categories, value, onChange, label = "카테고리" }: { categories: Category[]; value: string; onChange: (id: string) => void; label?: string }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  // Provider state is owner/session scoped and cleared on logout, never global storage.
  const [recent, setRecent] = useMoneyViewState<string[]>("category-recent", () => []);
  const index = categoryIndex(categories);
  const select = (id: string) => { onChange(id); if (id) setRecent([id,...recent.filter(x => x !== id)].slice(0,5)); setOpen(false); };
  return <div className="category-picker">
    <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>{index.path(value)} <span>⌄</span></button>
    {value && index.byId.has(value) && !index.active(index.byId.get(value)!) && <small role="status">비활성 분류 · 기존 값 유지</small>}
    {open && <div className="category-picker-menu" onKeyDown={e => {
      if(e.key === "Escape") setOpen(false);
      if(e.key === "ArrowDown" || e.key === "ArrowUp") { const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled),input")); const at=nodes.indexOf(e.target as HTMLButtonElement); nodes[(at+(e.key === "ArrowDown"?1:nodes.length-1))%nodes.length]?.focus();e.preventDefault(); }
    }}>
      <input aria-label="카테고리 검색" placeholder="카테고리 검색" value={search} onChange={e => setSearch(e.target.value)} />
      {!search && <><small>최근 사용 카테고리</small><div className="category-recents">{recent.filter(id => index.byId.has(id) && index.active(index.byId.get(id)!)).slice(0,5).map(id => <button type="button" key={id} onClick={() => select(id)}>{index.path(id)}</button>)}</div></>}
      <button type="button" onClick={() => select("")}>미분류</button>
      {index.roots.filter(index.active).map(parent => {
        const children=(index.children.get(parent.id) ?? []).filter(index.active);
        const matching=children.filter(c => index.path(c.id).includes(search));
        if(search && !parent.name.includes(search) && !matching.length) return null;
        const show=!!search || expanded.includes(parent.id);
        return <div key={parent.id}><div className="category-parent-row"><button type="button" aria-pressed={value===parent.id} onClick={() => select(parent.id)}>{parent.emoji} {parent.name}</button>{children.length>0 && <button type="button" aria-label={`${parent.name} 세부분류 펼치기`} aria-expanded={show} onClick={() => setExpanded(show?expanded.filter(x=>x!==parent.id):[...expanded,parent.id])}>{show?"⌄":"›"}</button>}</div>
        {show && matching.map(c => <button type="button" className="category-child" aria-pressed={value===c.id} key={c.id} onClick={() => select(c.id)}>{c.emoji} {c.name}</button>)}</div>;
      })}
      <small>분류명을 누르면 선택 · 화살표는 펼치기</small>
    </div>}
  </div>;
}

export function CategoryFilters({ categories, value, onChange }: { categories: Category[]; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const [expanded,setExpanded]=useState<string[]>([]);const index=categoryIndex(categories);
  const toggle=(id:string)=>onChange(toggleCategoryFilter(categories,value,id));
  return <div className="category-filters"><div className="meaning-filter-row"><strong>카테고리</strong><button onClick={()=>onChange(null)}>전체 선택</button><button onClick={()=>onChange([])}>전체 해제</button>
    <button aria-pressed={value===null||value.includes("uncategorized")} onClick={()=>toggle("uncategorized")}>미분류</button>
    {index.roots.map(c=><span className="category-filter-parent" key={c.id}><button aria-pressed={value===null||value.includes(c.id)} onClick={()=>toggle(c.id)} onDoubleClick={()=>onChange([c.id])}>{c.emoji} {c.name}</button><button aria-label={`${c.name} 필터 펼치기`} aria-expanded={expanded.includes(c.id)} onClick={()=>setExpanded(expanded.includes(c.id)?expanded.filter(x=>x!==c.id):[...expanded,c.id])}>⌄</button></span>)}
    </div>{index.roots.filter(c=>expanded.includes(c.id)).map(c=><div className="meaning-filter-row category-child-filters" key={c.id}><strong>{c.name} 세부분류</strong>{[{id:`direct:${c.id}`,name:"세부분류 없음"},...(index.children.get(c.id)??[])].map(child=><button key={child.id} aria-pressed={value?.includes(child.id)??false} onClick={()=>toggle(child.id)} onDoubleClick={()=>onChange([child.id])}>{child.name}</button>)}<small>대분류 전체 또는 세부 항목 선택</small></div>)}</div>;
}

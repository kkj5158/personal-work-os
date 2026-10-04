"use client";
import { useRef, useState } from "react";
import type { Category } from "@/lib/money/model";
import { assertFinalCategory, categoryTree, categoryFilterFromIds, categoryFilterIds, normalizeCategoryFilter, emptyCategoryFilter, type CategoryGroup, type CategoryFilterSelection } from "@/lib/money/categories";
import { normalizeIconQuery } from "@/lib/money/categoryIcons";
import { useMoneyViewState } from "./MoneyDataProvider";
import { CategoryIconView } from "./MoneyCategoryIcon";
import { MoneyAnchoredPopover, CategoryTreeColumns, useCategoryGroups } from "./MoneyCategoryTree";

const matches = (text: string, query: string) => !query || normalizeIconQuery(text).includes(normalizeIconQuery(query));
function Steps({step,setStep}:{step:number;setStep:(n:number)=>void}) { return <nav className="money-tree-steps" aria-label="분류 탐색 단계">{["L1 그룹","L2 분류","L3 세부분류"].map((s,i)=><button type="button" key={s} aria-pressed={step===i} onClick={()=>setStep(i)}>{s}</button>)}</nav>; }
export function CategoryPicker({ categories, value, onChange, label = "카테고리", groups: supplied }: { categories: Category[]; value: string; onChange: (id: string) => void; label?: string; groups?: CategoryGroup[] }) {
  const groups = useCategoryGroups(supplied), tree = categoryTree(categories,groups.data);
  const [open,setOpen] = useState(false), [search,setSearch] = useState(""), [groupId,setGroup] = useState(""), [rootId,setRoot] = useState(""), [step,setStep] = useState(0);
  const [recent,setRecent] = useMoneyViewState<string[]>("category-recent", () => []);
  const trigger=useRef<HTMLButtonElement>(null);
  const select = (id: string) => { const realId = assertFinalCategory(categories,id); setOpen(false); onChange(realId); trigger.current?.focus(); if(realId) setRecent([realId,...recent.filter(x=>x!==realId)].slice(0,5)); };
  const show = () => { const c=tree.byId.get(value), root=c?.parentId?tree.byId.get(c.parentId):c; setGroup(root?tree.groupOf(root):"");setRoot(root?.id??"");setSearch("");setStep(0);setOpen(true); };
  const roots=tree.rootsFor(groupId?[groupId]:[]).filter(tree.active).filter(c=>matches(c.name,search)||(tree.children.get(c.id)??[]).some(child=>matches(child.name,search)));
  const children=(rootId?tree.children.get(rootId)??[]:search?roots.flatMap(root=>tree.children.get(root.id)??[]):[]).filter(tree.active).filter(c=>matches(tree.path(c.id),search));
  return <div className="category-picker">
    <button type="button" ref={trigger} aria-label={label} aria-expanded={open} onClick={()=>open?setOpen(false):show()}>{tree.path(value)} <span>⌄</span></button>
    {value&&tree.byId.has(value)&&!tree.active(tree.byId.get(value)!)&&<small role="status">비활성 분류 · 기존 값 유지</small>}
    {open&&<MoneyAnchoredPopover label="분류 지정" onClose={()=>setOpen(false)}>
      <div className="money-section-heading"><strong>분류 지정</strong><button type="button" aria-label="분류 지정 닫기" onClick={()=>setOpen(false)}>×</button></div>
      <input aria-label="카테고리 검색" placeholder="분류 검색" value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value){setGroup("");setRoot("");}}}/>
      <small>현재: {tree.path(value)}</small>
      {!search&&<div className="category-recents">{recent.filter(id=>tree.byId.has(id)&&tree.active(tree.byId.get(id)!)).map(id=><button type="button" key={id} onClick={()=>select(id)}>{tree.path(id)}</button>)}</div>}
      <Steps step={step} setStep={setStep}/>
      <CategoryTreeColumns step={step}>
        <section className="money-tree-column"><h4>L1 · 구조 그룹</h4><div className="money-tree-scroll"><button type="button" aria-pressed={!groupId} onClick={()=>{setGroup("");setRoot("");setStep(1);}}>모든 그룹 ›</button>{tree.structural.filter(g=>tree.rootsFor([g.id]).some(tree.active)).map(g=><button type="button" key={g.id} aria-pressed={groupId===g.id} onClick={()=>{setGroup(g.id);setRoot("");setStep(1);}}>{g.name} ›</button>)}</div><small>구조 전용 · 거래 지정 불가</small></section>
        <section className="money-tree-column"><h4>L2 · 거래에 사용 가능</h4><div className="money-tree-scroll">{roots.map(c=><div className="money-tree-row" key={c.id}><button type="button" aria-pressed={rootId===c.id} onClick={()=>{setRoot(c.id);setStep(2);}}><CategoryIconView category={c}/>{c.name} ›</button><button type="button" aria-label={`${c.name} 직접 지정`} onClick={()=>select(c.id)}>지정</button></div>)}{!roots.length&&<p>검색과 일치하는 분류가 없습니다.</p>}</div><small>자식이 있어도 L2를 지정할 수 있습니다.</small></section>
        <section className="money-tree-column"><h4>L3 · 세부분류</h4><div className="money-tree-scroll">{children.map(c=><button type="button" key={c.id} aria-pressed={value===c.id} onClick={()=>select(c.id)}><CategoryIconView category={c}/>{c.name}</button>)}{!children.length&&<p>{rootId?"세부분류가 없습니다. L2를 그대로 지정하세요.":"L2를 선택하면 세부분류를 탐색합니다."}</p>}</div></section>
      </CategoryTreeColumns>
      <div className="money-tree-footer"><button type="button" onClick={()=>select("")}>미분류 지정</button><small>Enter 지정 · ↑↓ 탐색 · ←→ 단계 · Esc 취소</small></div>
      {groups.error&&<small role="status">구조 그룹을 불러오지 못해 기존 분류를 표시합니다.</small>}
    </MoneyAnchoredPopover>}
  </div>;
}

export function CategoryFilters({ categories, value, onChange, groups: supplied }: { categories: Category[]; value: string[] | null; onChange: (v: string[] | null) => void; groups?: CategoryGroup[] }) {
  const groups=useCategoryGroups(supplied),tree=categoryTree(categories,groups.data);
  const [open,setOpen]=useState(false),[search,setSearch]=useState(""),[draft,setDraft]=useState<CategoryFilterSelection>(()=>categoryFilterFromIds(categories,value)),[notice,setNotice]=useState(""),[step,setStep]=useState(0);
  const selected=normalizeCategoryFilter(categories,groups.data,draft);
  const roots=tree.rootsFor(selected.groups),finals=tree.finalsFor(selected.roots.length?roots.filter(c=>selected.roots.includes(c.id)):roots);
  const update=(next:CategoryFilterSelection)=>{const clean=normalizeCategoryFilter(categories,groups.data,next);setNotice(clean.roots.length<next.roots.length||clean.finals.length<next.finals.length?"상위 조건 변경으로 범위 밖 하위 조건을 해제했습니다.":"");setDraft(clean);};
  const toggle=(level:"groups"|"roots"|"finals",id:string)=>update({...selected,[level]:selected[level].includes(id)?selected[level].filter(x=>x!==id):[...selected[level],id]});
  const openFilter=()=>{if(JSON.stringify(categoryFilterIds(categories,groups.data,draft))!==JSON.stringify(value))setDraft(categoryFilterFromIds(categories,value));setNotice("");setSearch("");setStep(0);setOpen(true);};
  const button=(level:"groups"|"roots"|"finals",id:string,name:string)=><button type="button" key={id} aria-pressed={selected[level].includes(id)} onClick={()=>toggle(level,id)}><span aria-hidden="true">{selected[level].includes(id)?"☑":"☐"}</span> {name}</button>;
  return <div className="category-filters"><div className="meaning-filter-row"><strong>분류</strong><button type="button" aria-expanded={open} onClick={()=>open?setOpen(false):openFilter()}>{value?.length?`${value.length}개 조건 · 변경`:"전체 분류 · 선택"} ▾</button>{value?.length?<button type="button" onClick={()=>onChange(null)}>조건 초기화</button>:null}</div>
    {open&&<MoneyAnchoredPopover label="분류 필터" onClose={()=>setOpen(false)}>
      <div className="money-section-heading"><strong>분류 필터</strong><button type="button" aria-label="분류 필터 닫기" onClick={()=>setOpen(false)}>×</button></div>
      <input aria-label="분류 필터 검색" placeholder="그룹·분류 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
      <Steps step={step} setStep={setStep}/>
      <CategoryTreeColumns step={step}>
        <section className="money-tree-column"><h4>L1 · 구조 그룹</h4><div className="money-tree-controls"><button type="button" onClick={()=>update({...selected,groups:tree.structural.map(g=>g.id)})}>전체</button><button type="button" onClick={()=>update({...selected,groups:[]})}>해제</button></div><div className="money-tree-scroll">{tree.structural.filter(g=>matches(g.name,search)).map(g=>button("groups",g.id,g.name))}</div></section>
        <section className="money-tree-column"><h4>L2 · 분류</h4><div className="money-tree-controls"><button type="button" onClick={()=>update({...selected,roots:roots.map(c=>c.id)})}>전체</button><button type="button" onClick={()=>update({...selected,roots:[]})}>해제</button></div><div className="money-tree-scroll">{roots.filter(c=>matches(c.name,search)).map(c=>button("roots",c.id,`${c.name}${tree.active(c)?"":" · 비활성"}`))}</div></section>
        <section className="money-tree-column"><h4>L3 · 최종 지정</h4><div className="money-tree-controls"><button type="button" onClick={()=>update({...selected,finals:finals.map(c=>c.id)})}>전체</button><button type="button" onClick={()=>update({...selected,finals:[]})}>해제</button></div><div className="money-tree-scroll">{finals.filter(c=>matches(c.name,search)).map(c=>button("finals",c.id,c.name))}</div></section>
      </CategoryTreeColumns>
      <label className="money-check"><input type="checkbox" checked={selected.uncategorized} onChange={e=>update({...selected,uncategorized:e.target.checked})}/>미분류 포함</label>
      <small>같은 단계는 OR · 선택한 단계끼리는 AND · 선택 없음은 전체 분류</small>{notice&&<p role="status">{notice}</p>}
      <div className="money-tree-footer"><button type="button" onClick={()=>{setDraft(emptyCategoryFilter());setNotice("");}}>전체 해제</button><button type="button" className="money-primary" onClick={()=>{onChange(categoryFilterIds(categories,groups.data,selected));setOpen(false);}}>필터 적용</button></div>
    </MoneyAnchoredPopover>}
  </div>;
}

"use client";
import type {Category} from '@/lib/money/model';
import {categoryIndex} from '@/lib/money/categories';
import {CategoryIconView} from './MoneyCategoryIcon';
export function TwoLevelCategories({categories,parent,value,search,onParent,onChange,onCommit,disabled=false}:{categories:Category[];parent:string;value:string;search:string;onParent:(id:string)=>void;onChange:(id:string)=>void;onCommit?:(id:string)=>void;disabled?:boolean}) {
  const index=categoryIndex(categories),match=(c:Category)=>!search||`${c.name} ${c.emoji??''}`.toLowerCase().includes(search.toLowerCase());
  const roots=index.roots.filter(index.active).filter(c=>match(c)||(index.children.get(c.id)??[]).some(match));
  const commit=(id:string)=>{if(!onCommit||disabled)return;const node=index.byId.get(id);onParent(node?.parentId??id);onChange(id);onCommit(id);};
  return <div className="bk-v2-picker-columns"><section aria-label="중분류">{roots.map(c=><button type="button" key={c.id} disabled={disabled} aria-pressed={parent===c.id} onClick={()=>{onParent(c.id);onChange('');}} onDoubleClick={()=>commit(c.id)}><CategoryIconView category={c}/> {c.name}</button>)}</section><section aria-label="소분류">{parent&&index.byId.has(parent)&&index.active(index.byId.get(parent)!)&&<button type="button" disabled={disabled} aria-pressed={value===parent} onClick={()=>onChange(parent)} onDoubleClick={()=>commit(parent)}>소분류 없음</button>}{(index.children.get(parent)??[]).filter(index.active).filter(c=>match(c)||match(index.byId.get(parent)!)).map(c=><button type="button" key={c.id} disabled={disabled} aria-pressed={value===c.id} onClick={()=>onChange(c.id)} onDoubleClick={()=>commit(c.id)}><CategoryIconView category={c}/> {c.name}</button>)}</section></div>;
}

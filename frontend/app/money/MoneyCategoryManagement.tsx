"use client";
import { useState } from "react";
import { type Category, moneyApi as api } from "@/lib/money/model";
import { categoryIndex } from "@/lib/money/categories";
import { useMoneyCache } from "./MoneyDataProvider";
import { type Props } from "./MoneyWebViews";
import { type MeaningKind, type MeaningRule } from "@/lib/money/meaning";

export type CategoryImpact={id:string;parentId:string|null;version:number;records:number;rules:number;children:number};
export async function confirmCategoryMove(child:Category,parent:Category) {
  const preview=await api.get<CategoryImpact>(`/categories/${child.id}/impact`);
  if(!window.confirm(`'${child.name}' → '${parent.name}'\n연결 기록 ${preview.records}건 · 규칙 ${preview.rules}개\n과거 대분류 통계가 변경됩니다. 분류 ID와 연결 기록은 유지됩니다. 이동할까요?`)) return false;
  await api.put(`/categories/${child.id}/move`,{parentId:parent.id,expectedVersion:child.version,expectedParentVersion:parent.version,preview,confirmed:true});return true;
}
export function CategoryManagement(p:Props & {kind:MeaningKind;setKind:(k:MeaningKind)=>void;rules:MeaningRule[]}){
 const cache=useMoneyCache();const [expanded,setExpanded]=useState<string[]>([]),[search,setSearch]=useState(""),[drag,setDrag]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const all=p.categories.filter(c=>c.kind===p.kind),index=categoryIndex(all);
 const rows=index.roots.flatMap(c=>[c,...((search||expanded.includes(c.id))?index.children.get(c.id)??[]:[])]).filter(c=>!search||index.path(c.id).includes(search)|| (index.children.get(c.id)??[]).some(x=>x.name.includes(search)));
 async function drop(id:string,targetId:string){if(id===targetId||busy)return;const child=index.byId.get(id),target=index.byId.get(targetId);if(!child||!target)return;setBusy(true);setError("");try{
   if(child.parentId && child.parentId!==(target.parentId??target.id)) { const parent=index.byId.get(target.parentId??target.id)!;if(await confirmCategoryMove(child,parent))cache.mutate("category"); }
   else if((child.parentId??null)===(target.parentId??null)){
    const siblings=all.filter(c=>(c.parentId??null)===(child.parentId??null));const ordered=siblings.filter(c=>c.id!==id);ordered.splice(ordered.findIndex(c=>c.id===targetId),0,child);
    await api.put("/categories/order",{ids:ordered.map(c=>c.id),versions:Object.fromEntries(siblings.map(c=>[c.id,c.version]))});cache.mutate("category");
   }
  }catch(e){setError(e instanceof Error?e.message:"변경 실패");}finally{setBusy(false);setDrag(null);}}
 return <section className="money-card"><div className="money-section-heading"><h2>카테고리 관리</h2><div className="money-actions"><button disabled={busy} onClick={async()=>{setBusy(true);try{await api.post("/categories/defaults",{});cache.mutate("category");}catch(e){setError(e instanceof Error?e.message:"초기화 실패");}finally{setBusy(false);}}}>기본 카테고리 추가</button><button className="money-primary" onClick={()=>p.select({kind:"category",value:null})}>카테고리 추가</button></div></div>
 <div className="meaning-tabs">{(["EXPENSE","INCOME"] as const).map(k=><button key={k} aria-pressed={k===p.kind} onClick={()=>{if(p.changeContext?.()!==false)p.setKind(k);}}>{k==="EXPENSE"?"지출":"수입"}</button>)}</div>
 <div className="money-toolbar"><input aria-label="분류 관리 검색" placeholder="이름 검색" value={search} onChange={e=>setSearch(e.target.value)}/><span className="money-muted">최대 2단계 · 대분류/세부분류 모두 직접 선택 · 이동 전 영향 확인</span></div>{error&&<p role="alert">{error}</p>}
 <div className="money-table-wrap"><table className="money-table category-management"><thead><tr><th>순서</th><th>카테고리</th><th>연결 규칙</th><th>상태</th></tr></thead><tbody>{rows.map(c=>{
  const siblings=all.filter(x=>(x.parentId??null)===(c.parentId??null)),at=siblings.findIndex(x=>x.id===c.id);
  return <tr key={c.id} tabIndex={0} draggable={!busy} onDragStart={()=>setDrag(c.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag)void drop(drag,c.id);}} onClick={()=>p.select({kind:"category",value:c})} onKeyDown={e=>{if(e.key==="Enter")p.select({kind:"category",value:c});}} aria-selected={p.selected===c.id} className={c.parentId?"category-child-row":"category-root-row"}><td><span aria-label="순서 이동">⠿</span> <button aria-label={`${c.name} 위로`} disabled={!at||busy} onClick={e=>{e.stopPropagation();void drop(c.id,siblings[at-1].id);}}>↑</button></td><td>
  {!c.parentId&&<button aria-label={`${c.name} 관리 펼치기`} aria-expanded={expanded.includes(c.id)} onClick={e=>{e.stopPropagation();setExpanded(expanded.includes(c.id)?expanded.filter(x=>x!==c.id):[...expanded,c.id]);}}>{expanded.includes(c.id)?"⌄":"›"}</button>}
  <span className="meaning-emoji">{c.emoji||""}</span><strong>{c.name}</strong>{c.seeded&&<small> 기본</small>}</td><td>{p.rules.filter(r=>r.categoryId===c.id).length}개</td><td>{index.active(c)?"활성":c.archived?"비활성":"대분류 비활성"}</td></tr>;
 })}</tbody></table></div><p className="money-muted">하위 분류는 들여쓰기 한 단계로 표시됩니다. 다른 대분류로 끌면 영향을 확인한 뒤 이동합니다. 과거 기록은 보존됩니다.</p></section>;
}

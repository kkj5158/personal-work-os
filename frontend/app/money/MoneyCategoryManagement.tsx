"use client";
import { useState } from "react";
import { type Category, moneyApi as api } from "@/lib/money/model";
import { categoryTree, UNGROUPED, type CategoryGroup } from "@/lib/money/categories";
import { useMoneyCache } from "./MoneyDataProvider";
import { type Props } from "./MoneyWebViews";
import { type MeaningKind, type MeaningRule } from "@/lib/money/meaning";
import { CategoryIconView } from "./MoneyCategoryIcon";
import {CategoryOrderSurface,type OrderRow} from "./MoneyCategoryOrder";
import {reorderCategorySlots} from "@/lib/money/categoryOrder";
import { CategoryTreeColumns, useCategoryGroups } from "./MoneyCategoryTree";

export type CategoryImpact={id:string;parentId:string|null;version:number;records:number;rules:number;children:number;personalization:number;drafts:number;referenceFingerprint:string};
export async function confirmCategoryMove(child:Category,parent:Category) {
  const preview=await api.get<CategoryImpact>(`/categories/${child.id}/impact`);
  if(!window.confirm(`'${child.name}' → '${parent.name}'\n연결 기록 ${preview.records}건 · 규칙 ${preview.rules}개 · 개인화 ${preview.personalization}건 · 미적용 초안 ${preview.drafts}건\n과거 대분류 통계가 변경됩니다. 분류 ID와 연결 기록은 유지됩니다. 이동할까요?`)) return false;
  await api.put(`/categories/${child.id}/move`,{parentId:parent.id,expectedVersion:child.version,expectedParentVersion:parent.version,preview,confirmed:true});return true;
}
export function CategoryManagement(p:Props & {kind:MeaningKind;setKind:(k:MeaningKind)=>void;rules:MeaningRule[]}){
 const cache=useMoneyCache(),groups=useCategoryGroups();
 const [search,setSearch]=useState(""),[groupId,setGroup]=useState(""),[rootId,setRoot]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[step,setStep]=useState(0),[groupName,setGroupName]=useState("");
 const [optimistic,setOptimistic]=useState<Category[]|null>(null),[optimisticGroups,setOptimisticGroups]=useState<CategoryGroup[]|null>(null);
 const [undo,setUndo]=useState<{type:"category"|"group";ids:string[];versions:Record<string,number>}|null>(null),[notice,setNotice]=useState("");
 const [categoryBase,setCategoryBase]=useState<Category[]|null>(null),[groupBase,setGroupBase]=useState<CategoryGroup[]|null>(null);
 const displayCategories=categoryBase===p.categories&&optimistic?optimistic:p.categories;
 const groupItems=groupBase===groups.data&&optimisticGroups?optimisticGroups:groups.data;
 const all=displayCategories.filter(c=>c.kind===p.kind),tree=categoryTree(all,groupItems.filter(g=>g.kind===p.kind));
 // Inspection may be a narrow drawer. Closing it must preserve the navigated root
 // so explicit structural mapping stays available in the underlying manager.
 const selected=p.categories.find(c=>c.id===p.selected)??tree.byId.get(rootId),activeRoot=selected?.parentId??(!selected?.parentId&&selected?selected.id:rootId);
 const roots=tree.rootsFor(groupId?[groupId]:[]),children=tree.children.get(activeRoot)??[],group=groups.data.find(g=>g.id===groupId);
 const match=(c:Category)=>!search||tree.path(c.id).toLowerCase().includes(search.trim().toLowerCase())||(tree.children.get(c.id)??[]).some(x=>x.name.includes(search));
 const refresh=()=>{cache.mutate("category");cache.invalidate(key=>key.split("?")[0]==="/category-groups");};
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await fn();refresh();}catch(e){setError(e instanceof Error?e.message:"변경 실패");refresh();}finally{setBusy(false);}}
 const siblings=(c:Category)=>all.filter(x=>(x.parentId??null)===(c.parentId??null));
 const scope=(c:Category)=>c.parentId??tree.groupOf(c);
 async function persistOrder(type:"category"|"group",before:(Category|CategoryGroup)[],after:(Category|CategoryGroup)[],isUndo=false,expected?:Record<string,number>){
   if(busy||before.map(x=>x.id).join(',')===after.map(x=>x.id).join(',')&&!isUndo)return;
   const originalCategories=displayCategories,originalGroups=groupItems;
   setCategoryBase(p.categories);setGroupBase(groups.data);
   setBusy(true);setError("");setNotice("");
   if(type==="category")setOptimistic([...originalCategories.filter(c=>!after.some(x=>x.id===c.id)),...after.map((item,index)=>({...item,sortOrder:index})) as Category[]]);else setOptimisticGroups([...originalGroups.filter(g=>!after.some(x=>x.id===g.id)),...after.map((item,index)=>({...item,sortOrder:index})) as CategoryGroup[]]);
   try{
     const saved=await api.put<(Category|CategoryGroup)[]>(type==="category"?"/categories/order":"/category-groups/order",{ids:after.map(x=>x.id),versions:expected??Object.fromEntries(before.map(x=>[x.id,x.version]))});
     if(type==="category")setOptimistic(saved as Category[]);else setOptimisticGroups(saved as CategoryGroup[]);
     setUndo(isUndo?null:{type,ids:before.map(x=>x.id),versions:Object.fromEntries(saved.filter(x=>before.some(b=>b.id===x.id)).map(x=>[x.id,x.version]))});
     setNotice(isUndo?"이전 순서로 복원했습니다.":"순서를 저장했습니다. 선택과 초점을 유지합니다.");refresh();
   }catch(e){setOptimistic(originalCategories);setOptimisticGroups(originalGroups);setUndo(null);setError((e instanceof Error?e.message:"순서 저장 실패")+" · 표시 순서를 되돌렸습니다. 서버 최신 순서를 다시 확인하세요.");refresh();}
   finally{setBusy(false);}
 }
 function reorder(id:string,targetId:string,after:boolean){
   const c=tree.byId.get(id);if(c){const before=siblings(c),ordered=reorderCategorySlots(before,id,targetId,after,scope);void persistOrder("category",before,ordered);return;}
   const before=groupItems.filter(g=>g.kind===p.kind);void persistOrder("group",before,reorderCategorySlots(before,id,targetId,after,()=>"groups"));
 }
 function stepCategory(c:Category,direction:number){const list=siblings(c).filter(x=>scope(x)===scope(c)),at=list.findIndex(x=>x.id===c.id),target=list[at+direction];if(target)reorder(c.id,target.id,direction>0);}
 function stepGroup(g:CategoryGroup,direction:number){const list=groupItems.filter(x=>x.kind===p.kind).sort((a,b)=>a.sortOrder-b.sortOrder),at=list.findIndex(x=>x.id===g.id),target=list[at+direction];if(target)reorder(g.id,target.id,direction>0);}
 const orderRows:OrderRow[]=[...all.map(c=>({id:c.id,scope:"category:"+scope(c),name:c.name,selected:p.selected===c.id,content:<><CategoryIconView category={c}/><span className="money-order-label">{c.name}<small>{tree.active(c)?`${p.rules.filter(r=>r.categoryId===c.id).length}개 규칙`:"비활성 · 과거 기록 유지"}</small></span>{!c.parentId&&<span aria-hidden="true">›</span>}</>,onStep:(direction:number)=>stepCategory(c,direction),onSelect:()=>{if(p.changeContext?.()===false)return;setRoot(c.parentId??c.id);setStep(2);p.select({kind:"category",value:c});}})),...tree.structural.map(g=>({id:g.id,scope:"groups",name:g.name,selected:groupId===g.id,disabled:g.id===UNGROUPED,content:<><CategoryIconView category={g as Category}/><span className="money-order-label">{g.name}<small>{g.archived?"보관":`${tree.rootsFor([g.id]).length}개 분류`}</small></span><span aria-hidden="true">›</span></>,onStep:(direction:number)=>stepGroup(g,direction),onSelect:()=>{setGroup(g.id);setGroupName(g.name);setRoot("");setStep(1);}}))];
 return <section className="money-card money-category-manager"><div className="money-section-heading"><h2>분류 구조</h2><div className="money-actions"><button disabled={busy} onClick={()=>void run(async()=>{await api.post("/categories/defaults",{});})}>기본 분류 추가</button><button className="money-primary" onClick={()=>p.select({kind:"category",value:null})}>분류 추가</button></div></div>
 <div className="money-toolbar"><div className="meaning-tabs">{(["EXPENSE","INCOME"] as const).map(k=><button key={k} aria-pressed={k===p.kind} onClick={()=>{if(p.changeContext?.()!==false){p.setKind(k);setGroup("");setRoot("");setStep(0);}}}>{k==="EXPENSE"?"소비 분류":"수입 분류"}</button>)}</div><input aria-label="분류 관리 검색" placeholder="분류 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 {error&&<p className="money-error" role="alert">{error} · 초안을 유지했습니다. 최신 정보를 확인한 뒤 다시 적용하세요.</p>}{groups.error&&<p role="alert">구조 그룹 조회 실패 · 기존 분류를 표시합니다. <button onClick={()=>cache.invalidate(k=>k==="/category-groups")}>다시 조회</button></p>}
 <nav className="money-tree-steps" aria-label="관리 단계">{["L1 그룹","L2 분류","L3 세부"].map((label,i)=><button type="button" key={label} aria-pressed={step===i} onClick={()=>setStep(i)}>{label}</button>)}</nav>
 <CategoryOrderSurface rows={orderRows} busy={busy} onDrop={reorder}>{node=><CategoryTreeColumns step={step}>
  <section className="money-tree-column"><h4>L1 · 구조 그룹 · 거래 지정 불가</h4><div className="money-tree-scroll"><button aria-pressed={!groupId} onClick={()=>{setGroup("");setStep(1);}}>전체 그룹</button>{tree.structural.map(g=>node(g.id))}</div></section>
  <section className="money-tree-column"><h4>L2 · 기존 분류 · 거래 사용 가능</h4><div className="money-tree-scroll">{roots.filter(match).map(c=>node(c.id))}{!roots.filter(match).length&&<p>분류가 없습니다. 분류 추가 또는 그룹 배치를 사용하세요.</p>}</div></section>
  <section className="money-tree-column"><h4>L3 · 기존 세부분류</h4><div className="money-tree-scroll">{children.filter(match).map(c=>node(c.id))}{!children.length&&<p>L2 분류는 세부분류 없이도 그대로 사용할 수 있습니다.</p>}</div></section>
 </CategoryTreeColumns>}</CategoryOrderSurface>
 {notice&&<p role="status" aria-live="polite">{notice} {undo&&<button disabled={busy} onClick={()=>{const source=undo.type==="category"?displayCategories:groupItems;const before=source.filter(x=>undo.ids.includes(x.id));const ordered=undo.ids.map(id=>before.find(x=>x.id===id)!);void persistOrder(undo.type,before,ordered,true,undo.versions);}}>순서 실행 취소</button>}</p>}<p className="money-category-note">L1은 구조 전용입니다. 기존 root → L2 / child → L3 · 기존 ID, 상위 관계와 과거 기록을 보존합니다.</p>
 <div className="money-group-controls"><label>구조 그룹 이름 <input maxLength={80} value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="그룹 이름"/></label><button disabled={busy||!groupName.trim()} onClick={()=>void run(async()=>{await api.post("/category-groups",{name:groupName.trim(),kind:p.kind});setGroupName("");})}>그룹 추가</button>{group&&<><button disabled={busy||!groupName.trim()} onClick={()=>void run(async()=>{await api.put(`/category-groups/${group.id}`,{name:groupName.trim(),expectedVersion:group.version,archived:group.archived,sortOrder:group.sortOrder});})}>그룹 이름 저장</button><button disabled={busy} onClick={()=>void run(async()=>{await api.put(`/category-groups/${group.id}`,{name:group.name,expectedVersion:group.version,archived:!group.archived,sortOrder:group.sortOrder});})}>{group.archived?"그룹 복원":"그룹 보관"}</button></>}</div>
 {selected&&!selected.parentId&&<label className="money-group-mapping">{selected.name} 구조 그룹 배치 <select disabled={busy||!!groups.error||groups.loading} value={tree.groupOf(selected)} onChange={e=>{const target=e.target.value;if(p.changeContext?.()===false)return;void run(async()=>{const updated=await api.put<Category>(`/categories/${selected.id}/group`,{groupId:target===UNGROUPED?null:target,expectedVersion:selected.version});setGroup(target);setGroupName(groups.data.find(g=>g.id===target)?.name??"미분류 그룹");setRoot(updated.id);p.select({kind:"category",value:updated});});}}><option value={UNGROUPED}>미분류 그룹</option>{groups.data.filter(g=>g.kind===selected.kind&&!g.archived).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
 <p className="money-muted">분류를 선택하면 정보 영역에서 이름·아이콘·사용 현황을 확인하고 변경합니다. 같은 그룹의 형제 순서는 핸들 끌기 또는 Alt+↑/↓로 변경합니다. 부모 이동은 정보 패널에서 별도 영향 확인 후 실행합니다.</p>
 </section>;
}

"use client";

import {useEffect,useState,type ReactNode} from "react";
import {DndContext,PointerSensor,KeyboardSensor,useSensor,useSensors,useDroppable,closestCenter,pointerWithin,type CollisionDetection,type DragEndEvent} from "@dnd-kit/core";
import {SortableContext,useSortable,rectSortingStrategy,verticalListSortingStrategy,sortableKeyboardCoordinates,arrayMove} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {GripVertical,Pencil,Trash2} from "lucide-react";
import {Modal} from "@/components/ui/Modal";
import {apiClient} from "@/lib/api/client";
import {encodeImage} from "@/lib/api/imageUpload";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {boardBase,useBoard,type Kind,type Block,type Column} from "./boardStore";
import "./board.css";

type Draft={kind:Kind;id:string;title:string;body:string;parentId?:string};
type DragData={kind:Kind|"drop";parentId?:string};
function Sortable({id,kind,parentId,label,busy,children}:{id:string;kind:Kind;parentId?:string;label:string;busy:boolean;children:(handle:ReactNode)=>ReactNode}){
 const {setNodeRef,transform,transition,attributes,listeners,isDragging}=useSortable({id,data:{kind,parentId},disabled:busy});
 return <div ref={setNodeRef} className={`db-sortable ${isDragging?"db-dragging":""}`} style={{transform:CSS.Transform.toString(transform),transition}}>{children(<button type="button" className="diet-drag" aria-label={`${label} 순서 변경`} disabled={busy} {...attributes} {...listeners}><GripVertical size={15}/></button>)}</div>;
}
function DropColumn({column,children}:{column:Column;children:ReactNode}){
 const {setNodeRef,isOver}=useDroppable({id:`drop:${column.id}`,data:{kind:"drop",parentId:column.id}});
 return <div ref={setNodeRef} className={`db-blocks ${isOver?"db-over":""}`}>{children}</div>;
}
function PrivateImage({id}:{id:string}){
 const [url,setUrl]=useState(""),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true,objectUrl="";const abort=new AbortController();
  void (async()=>{try{const client=createSupabaseBrowserClient();const session=client?(await client.auth.getSession()).data.session:null;
   const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL??"http://localhost:8080"}${boardBase}/images/${id}`,{headers:session?{Authorization:`Bearer ${session.access_token}`}:{},cache:"no-store",signal:abort.signal});
   if(!response.ok)throw new Error();objectUrl=URL.createObjectURL(await response.blob());if(live)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
  }catch{if(live)setFailed(true);}})();return()=>{live=false;abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[id,attempt]);
 if(failed)return <button onClick={()=>{setFailed(false);setAttempt(a=>a+1);}}>이미지 다시 불러오기</button>;
 // Authenticated blobs use the shared private media store, not a public image URL.
 // eslint-disable-next-line @next/next/no-img-element
 return url?<img src={url} alt="갤러리 이미지" draggable={false}/>:<p>이미지 불러오는 중…</p>;
}
export default function BoardPage({mode}:{mode:"gallery"|"identity"}){
 const store=useBoard(),{data,busy,loading}=store;
 const [draft,setDraft]=useState<Draft|null>(null),[remove,setRemove]=useState<{kind:Kind;id:string}|null>(null);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const gallery=mode==="gallery";
 const collision:CollisionDetection=args=>{
  const active=args.active.data.current as DragData;
  const droppableContainers=args.droppableContainers.filter(c=>{const target=c.data.current as DragData|undefined;return active.kind==="blocks"?target?.kind==="blocks"||target?.kind==="drop":target?.kind===active.kind&&target?.parentId===active.parentId;});
  const filtered={...args,droppableContainers};const hits=pointerWithin(filtered);const blocks=hits.filter(h=>droppableContainers.find(c=>c.id===h.id)?.data.current?.kind==="blocks");
  return blocks.length?blocks:hits.length?hits:closestCenter(filtered);
 };
 const reorder=(kind:Kind,ids:string[],parentId?:string)=>store.mutate(()=>apiClient.put(`${boardBase}/order/${kind}`,{ids,parentId:parentId??null}));
 const dragEnd=({active,over}:DragEndEvent)=>{
  if(busy||!over||active.id===over.id)return;const source=active.data.current as DragData,target=over.data.current as DragData;
  if(source.kind==="blocks"){
   const block=data.blocks.find(b=>b.id===active.id)!;const columnId=target.kind==="drop"?target.parentId!:data.blocks.find(b=>b.id===over.id)!.columnId;
   const siblings=data.blocks.filter(b=>b.columnId===columnId);const destination=siblings.findIndex(b=>b.id===over.id);
   if(block.columnId===columnId){const ids=siblings.map(b=>b.id);void reorder("blocks",arrayMove(ids,ids.indexOf(block.id),destination<0?ids.length-1:destination),columnId);}
   else void store.mutate(()=>apiClient.put(`${boardBase}/blocks/${block.id}/move`,{columnId,index:destination<0?siblings.length:destination}));
  }else if(source.kind!=="drop"){
   const ids=source.kind==="columns"?data.columns.filter(c=>c.sectionId===source.parentId).map(c=>c.id):data[source.kind].map(v=>v.id);
   void reorder(source.kind,arrayMove(ids,ids.indexOf(String(active.id)),ids.indexOf(String(over.id))),source.parentId);
  }
 };
 const edit=(kind:Kind,id:string,title:string,body="",parentId?:string)=>setDraft({kind,id,title,body,parentId});
 const add=(kind:Kind,parentId?:string)=>edit(kind,crypto.randomUUID(),"","",parentId);
 const actions=(kind:Kind,id:string,onEdit?:()=>void)=> <div className="db-actions">{onEdit&&<button aria-label="편집" onClick={onEdit} disabled={busy}><Pencil size={13}/></button>}<button aria-label="삭제" onClick={()=>setRemove({kind,id})} disabled={busy}><Trash2 size={13}/></button></div>;
 const renderBlock=(block:Block)=><Sortable key={block.id} id={block.id} kind="blocks" parentId={block.columnId} label={block.type==="TEXT"?(block.text??"텍스트"):"이미지"} busy={busy}>{handle=><article className="db-block"><div className="db-block-controls">{handle}{actions("blocks",block.id,block.type==="TEXT"?()=>edit("blocks",block.id,"",block.text??"",block.columnId):undefined)}</div>{block.type==="IMAGE"?<PrivateImage id={block.mediaId!}/>:<p className="db-text">{block.text}</p>}</article>}</Sortable>;
 const save=async()=>{
  if(!draft)return;const {kind,id,title,body,parentId}=draft;
  const value=kind==="sections"?{title,description:body}:kind==="columns"?{title,sectionId:parentId}:kind==="blocks"?{type:"TEXT",text:body,columnId:parentId}:{title,body};
  if(await store.mutate(()=>apiClient.put(`${boardBase}/${kind}/${id}`,value)))setDraft(null);
 };
 return <div className="diet-board">
  <header className="diet-heading"><div><h1>{gallery?"갤러리":"정체성/목표"}</h1><p>{gallery?"나의 변화와 영감이 되는 이미지, 짧은 생각을 자유롭게 모아보세요.":"나는 어떤 사람이고, 어떤 방향으로 살아가고 싶은지 적어보세요."}</p></div><div className="db-header-actions"><button className="primary" disabled={busy||loading||(!gallery&&data.identities.length>=3)} onClick={()=>add(gallery?"sections":"identities")}>{gallery?"+ 섹션 추가":"+ 블록 추가"}</button>{!gallery&&<small>최대 3개의 블록</small>}</div></header>
  <div role="status" className="db-status">{busy?"저장 중…":""}</div>
  {store.error&&<div role="alert" className="diet-error">{store.error} <button disabled={busy} onClick={()=>void store.reload()}>다시 불러오기</button></div>}
  {loading?<p>불러오는 중…</p>:<DndContext sensors={sensors} collisionDetection={collision} onDragEnd={dragEnd}>
   {gallery?<SortableContext items={data.sections.map(s=>s.id)} strategy={verticalListSortingStrategy}>
    {!data.sections.length&&<p className="diet-empty">섹션을 추가하고 나만의 시각 보드를 만들어보세요.</p>}
    {data.sections.map(section=><Sortable key={section.id} id={section.id} kind="sections" label={section.title} busy={busy}>{handle=><section className="db-section"><header>{handle}<div className="db-section-title"><h2>{section.title}</h2>{section.description&&<p>{section.description}</p>}</div>{actions("sections",section.id,()=>edit("sections",section.id,section.title,section.description))}<button disabled={busy} onClick={()=>add("columns",section.id)}>+ 열 추가</button></header>
     <div className="db-columns"><SortableContext items={data.columns.filter(c=>c.sectionId===section.id).map(c=>c.id)} strategy={rectSortingStrategy}>{data.columns.filter(c=>c.sectionId===section.id).map(column=><Sortable key={column.id} id={column.id} kind="columns" parentId={section.id} label={column.title} busy={busy}>{columnHandle=><div className="db-column"><header>{columnHandle}<h3>{column.title}</h3>{actions("columns",column.id,()=>edit("columns",column.id,column.title,"",section.id))}</header><DropColumn column={column}><SortableContext items={data.blocks.filter(b=>b.columnId===column.id).map(b=>b.id)} strategy={verticalListSortingStrategy}>{data.blocks.filter(b=>b.columnId===column.id).map(renderBlock)}</SortableContext>{!data.blocks.some(b=>b.columnId===column.id)&&<p className="db-drop-hint">이미지나 텍스트를 추가하거나<br/>블록을 여기로 옮기세요.</p>}</DropColumn><div className="db-add-controls"><label className={`db-upload ${busy?"disabled":""}`}>+ 이미지<input aria-label={`${column.title} 이미지 업로드`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void store.mutate(async()=>apiClient.post(`${boardBase}/images`,{columnId:column.id,...await encodeImage(file)}));}}/></label><button disabled={busy} onClick={()=>add("blocks",column.id)}>+ 텍스트</button></div></div>}</Sortable>)}</SortableContext></div>
    </section>}</Sortable>)}
   </SortableContext>:<><div className="db-identity-grid" style={{gridTemplateColumns:`repeat(${Math.max(1,data.identities.length)}, minmax(0, 1fr))`}}><SortableContext items={data.identities.map(b=>b.id)} strategy={rectSortingStrategy}>{data.identities.map(block=><Sortable key={block.id} id={block.id} kind="identities" label={block.title} busy={busy}>{handle=><article className="db-identity"><header>{handle}<h2>{block.title}</h2>{actions("identities",block.id,()=>edit("identities",block.id,block.title,block.body))}</header><p>{block.body}</p></article>}</Sortable>)}</SortableContext></div>{!data.identities.length&&<p className="diet-empty">나를 설명하는 문장과 지키고 싶은 원칙을 담아보세요.</p>}</>}
  </DndContext>}
  <Modal open={!!draft} onClose={()=>{if(!busy)setDraft(null);}} title={draft?.kind==="sections"?"섹션 편집":draft?.kind==="columns"?"열 편집":draft?.kind==="blocks"?"텍스트 편집":"정체성 블록 편집"}>{draft&&<form className="diet-form" onSubmit={e=>{e.preventDefault();void save();}}>{draft.kind!=="blocks"&&<label>제목<input autoFocus required maxLength={200} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>}{draft.kind!=="columns"&&<label>{draft.kind==="sections"?"설명 (선택)":"내용"}<textarea autoFocus={draft.kind==="blocks"} required={draft.kind==="blocks"} rows={draft.kind==="sections"?3:9} maxLength={draft.kind==="sections"?2000:draft.kind==="identities"?6000:4000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>}{store.error&&<p role="alert">{store.error}</p>}<div className="diet-inline"><button type="button" disabled={busy} onClick={()=>setDraft(null)}>취소</button><button className="primary" disabled={busy}>저장</button></div></form>}</Modal>
  <Modal open={!!remove} onClose={()=>{if(!busy)setRemove(null);}} title="삭제 확인"><div className="diet-form"><p>{remove?.kind==="sections"||remove?.kind==="columns"?"포함된 이미지와 텍스트도 함께 삭제됩니다.":"이 블록을 삭제할까요?"}</p>{store.error&&<p role="alert">{store.error}</p>}<div className="diet-inline"><button disabled={busy} onClick={()=>setRemove(null)}>취소</button><button disabled={busy} onClick={()=>{if(remove)void store.mutate(()=>apiClient.delete(`${boardBase}/${remove.kind}/${remove.id}`)).then(ok=>{if(ok)setRemove(null);});}}>삭제</button></div></div></Modal>
 </div>;
}

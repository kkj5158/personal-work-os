'use client';
import {useMemo,useRef,useState} from 'react';
import {DndContext,DragOverlay,PointerSensor,pointerWithin,useDraggable,useDroppable,useSensor,useSensors,type DragMoveEvent,type DragEndEvent} from '@dnd-kit/core';
import type {AttentionItem,AttentionLane,AttentionSnapshot} from '@/lib/api/attention';
import AttentionCard from './AttentionCard';
import {dragStartAllowed} from './cardModel';

class CardPointerSensor extends PointerSensor {
 static activators=[{eventName:'onPointerDown' as const,handler:({nativeEvent:event}:React.PointerEvent)=>event.isPrimary&&event.button===0&&event.target instanceof Element&&dragStartAllowed(event.target)}];
}
type CardProps=React.ComponentProps<typeof AttentionCard>;
function DraggableCard({item,props,disabled,indicator}:{item:AttentionItem;props:CardProps;disabled:boolean;indicator?:'before'|'after'}){
 const draggable=useDraggable({id:item.id,disabled}),drop=useDroppable({id:item.id,data:{laneId:item.laneId,item:true}});
 return <div ref={node=>{draggable.setNodeRef(node);drop.setNodeRef(node);}} {...draggable.listeners} className={`aq-card-slot ${draggable.isDragging?'aq-dragging':''} ${indicator?'aq-insert-'+indicator:''}`}><AttentionCard {...props}/></div>;
}
function Lane({lane,children,empty,highlighted}:{lane:AttentionLane;children:React.ReactNode;empty:boolean;highlighted:boolean}){const {setNodeRef,isOver}=useDroppable({id:'lane:'+lane.id,data:{laneId:lane.id}});return <section ref={setNodeRef} data-lane-id={lane.id} className={`aq-lane ${isOver||highlighted?'aq-drop-active':''}`}><h2>{lane.name}</h2><div className="aq-lane-cards">{children}{empty&&<p className="aq-empty">확인할 항목이 없습니다. 여기로 이동할 수 있습니다.</p>}</div></section>;}
export default function AttentionBoard({snapshot,mode,cardProps,onDragHold,onMove}:{snapshot:AttentionSnapshot;mode:'STACK'|'LANE';cardProps:Omit<CardProps,'item'>;onDragHold:(hold:boolean)=>void;onMove:(item:AttentionItem,lane:string,before:string|null)=>void}){
 const [active,setActive]=useState<AttentionItem|null>(null),[target,setTarget]=useState<{id:string;after:boolean}|null>(null),targetRef=useRef(target);
 const sensors=useSensors(useSensor(CardPointerSensor,{activationConstraint:{distance:7}}));
 const groups=mode==='STACK'?[{id:'stack',name:'확인할 항목',order:0,revision:0}]:snapshot.lanes;
 const ordered=useMemo(()=>[...snapshot.items].sort((a,b)=>mode==='STACK'?a.stackOrder-b.stackOrder:a.laneOrder-b.laneOrder),[snapshot.items,mode]);
 function position(event:DragMoveEvent){const over=event.over;if(!over){targetRef.current=null;setTarget(null);return;}const y=(event.activatorEvent as PointerEvent).clientY+event.delta.y;const next={id:String(over.id),after:y>over.rect.top+over.rect.height/2};targetRef.current=next;setTarget(next);}
 function clear(){setActive(null);setTarget(null);targetRef.current=null;onDragHold(false);}
 function end(event:DragEndEvent){const item=active,hit=targetRef.current;clear();if(!item||!event.over||!hit||hit.id===item.id)return;
  const over=snapshot.items.find(value=>value.id===hit.id),lane=over?.laneId??hit.id.replace('lane:','');
  if(mode==='LANE'&&!snapshot.lanes.some(value=>value.id===lane))return;
  const siblings=ordered.filter(value=>value.id!==item.id&&(mode==='STACK'||value.laneId===lane));
  const index=siblings.findIndex(value=>value.id===hit.id);const before=over?(hit.after?siblings[index+1]?.id??null:over.id):null;
  onMove(item,lane,before);
 }
 return <DndContext sensors={sensors} collisionDetection={args=>{const hits=pointerWithin(args);return hits.some(hit=>!String(hit.id).startsWith('lane:'))?hits.filter(hit=>!String(hit.id).startsWith('lane:')):hits;}} onDragStart={event=>{const item=snapshot.items.find(value=>value.id===event.active.id);if(item){setActive(item);onDragHold(true);}}} onDragMove={position} onDragOver={position} onDragEnd={end} onDragCancel={clear}>
  <div className={`aq-list ${mode==='LANE'?'aq-split':'aq-stack'}`} data-drag-active={!!active}>{groups.map(lane=>{const items=ordered.filter(item=>mode==='STACK'||item.laneId===lane.id);return <Lane key={lane.id} lane={lane} empty={!items.length} highlighted={!!active&&!!target&&(mode==='STACK'||target.id==='lane:'+lane.id||snapshot.items.find(value=>value.id===target.id)?.laneId===lane.id)}>{items.map(item=><DraggableCard key={item.id} item={item} disabled={cardProps.disabled} props={{...cardProps,item}} indicator={target?.id===item.id?(target.after?'after':'before'):undefined}/>)}</Lane>;})}</div>
  <DragOverlay dropAnimation={null}>{active&&<AttentionCard {...cardProps} item={active} preview onHold={()=>{}}/>}</DragOverlay>
 </DndContext>;
}

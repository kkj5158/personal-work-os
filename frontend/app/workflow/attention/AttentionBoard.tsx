"use client";
import {memo,useState} from 'react';
import {DndContext,DragOverlay,PointerSensor,pointerWithin,useDraggable,useDroppable,useSensor,useSensors} from '@dnd-kit/core';
import type {AttentionFeed,AttentionItem} from '@/lib/api/attention';
import AttentionCard from './AttentionCard';
import {dragStartAllowed,GROUPS,itemGroup} from './cardModel';
class CardPointerSensor extends PointerSensor {
 static activators=[{eventName:'onPointerDown' as const,handler:({nativeEvent:e}:React.PointerEvent)=>e.isPrimary&&e.button===0&&e.target instanceof Element&&dragStartAllowed(e.target)}];
}
type CardProps=React.ComponentProps<typeof AttentionCard>;
const DraggableCard=memo(function DraggableCard({item,props}:{item:AttentionItem;props:Omit<CardProps,'item'>}){
 const drag=useDraggable({id:item.id,disabled:props.disabled});
 return <div ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} role="group" aria-label={`${item.action} 카드`} className={`aq-card-slot ${drag.isDragging?'aq-dragging':''}`}><AttentionCard {...props} item={item}/></div>;
});
function Group({id,name,total,children}:{id:string;name:string;total:number;children:React.ReactNode}){
 const drop=useDroppable({id});return <section ref={drop.setNodeRef} data-group={id} className={`aq-lane ${drop.isOver?'aq-drop-active':''}`}><h2>{name}<span>{total}개</span></h2><div className="aq-lane-cards">{children}</div></section>;
}
const noHold=()=>{};
export default function AttentionBoard({feed,mode,cardProps,onDragHold,onMove,cleanup}:{cleanup?:React.ReactNode;feed:AttentionFeed;mode:'STACK'|'GROUP';cardProps:Omit<CardProps,'item'>;onDragHold:(hold:boolean)=>void;onMove:(item:AttentionItem,group:string)=>void}){
 const [active,setActive]=useState<AttentionItem|null>(null);
 const sensors=useSensors(useSensor(CardPointerSensor,{activationConstraint:{distance:7}}));
 const clear=()=>{setActive(null);onDragHold(false);};
 if(mode==='STACK')return <><div className="aq-list aq-stack" aria-label="전체 시간순 스택">{feed.items.map(item=><div className="aq-card-slot" key={item.id}><AttentionCard {...cardProps} item={item}/></div>)}{!feed.items.length&&<p className="aq-empty">해당하는 항목이 없습니다.</p>}</div>{cleanup}</>;
 return <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={e=>{const item=feed.items.find(i=>i.id===e.active.id);if(item){setActive(item);onDragHold(true);}}} onDragEnd={e=>{const item=active;clear();if(item&&e.over&&GROUPS.some(g=>g.id===e.over!.id)&&itemGroup(item)!==e.over.id)onMove(item,String(e.over.id));}} onDragCancel={clear}>
 <div className="aq-list aq-split" data-drag-active={!!active}>{GROUPS.map(group=>{const items=feed.items.filter(i=>itemGroup(i)===group.id);return <Group key={group.id} {...group} total={feed.totals[group.id]}>{group.id==='COMPLETED'&&cleanup}{items.map(item=><DraggableCard key={item.id} item={item} props={cardProps}/>)}{!items.length&&<p className="aq-empty">{feed.totals[group.id]?'다음 페이지에 항목이 있습니다.':'비어 있습니다.'}</p>}</Group>;})}</div>
 <DragOverlay dropAnimation={null}>{active&&<AttentionCard {...cardProps} item={active} preview onHold={noHold}/>}</DragOverlay></DndContext>;
}

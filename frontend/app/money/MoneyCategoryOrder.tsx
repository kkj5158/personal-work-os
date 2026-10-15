"use client";
import {DndContext,DragOverlay,PointerSensor,useSensor,useSensors,useDraggable,useDroppable,type DragMoveEvent} from '@dnd-kit/core';
import {useState,type ReactNode} from 'react';
export type OrderRow={id:string;scope:string;name:string;selected:boolean;content:ReactNode;disabled?:boolean;onSelect:()=>void;onStep:(direction:number)=>void};
function Row({row,busy,edge}:{row:OrderRow;busy:boolean;edge?:'before'|'after'}) {
  const drag=useDraggable({id:row.id,data:row,disabled:busy||row.disabled}),drop=useDroppable({id:row.id,data:row,disabled:busy||row.disabled});
  return <div ref={node=>{drag.setNodeRef(node);drop.setNodeRef(node);}} className="money-tree-row money-unified-row" data-selected={row.selected} data-dragging={drag.isDragging} data-insert={edge}>
    {!row.disabled&&<button type="button" className="money-order-handle" {...drag.attributes} {...drag.listeners} aria-label={`${row.name} 정렬 · Alt 위 아래`} title="끌어서 정렬 · Alt+↑/↓" aria-disabled={busy} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();if(!busy)row.onStep(e.key==='ArrowUp'?-1:1);}}}>⠿</button>}
    <button type="button" className="money-order-name" aria-pressed={row.selected} onClick={row.onSelect}>{row.content}</button>
  </div>;
}
export function CategoryOrderSurface({rows,busy,onDrop,children}:{rows:OrderRow[];busy:boolean;onDrop:(id:string,target:string,after:boolean)=>void;children:(render:(id:string)=>ReactNode)=>ReactNode}) {
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));
  const [active,setActive]=useState<OrderRow|null>(null),[insertion,setInsertion]=useState<{id:string;after:boolean}|null>(null);
  const position=(event:DragMoveEvent)=>{
    const source=event.active.data.current as OrderRow|undefined,target=event.over?.data.current as OrderRow|undefined;
    if(!source||!target||source.scope!==target.scope||source.id===target.id){setInsertion(null);return;}
    const start=event.activatorEvent as PointerEvent,rect=event.over!.rect;
    setInsertion({id:target.id,after:start.clientY+event.delta.y>rect.top+rect.height/2});
  };
  const name=(id:string|number)=>rows.find(row=>row.id===id)?.name??'분류';
  return <DndContext sensors={sensors} autoScroll accessibility={{screenReaderInstructions:{draggable:'핸들에 초점을 두고 Alt와 위 또는 아래 화살표를 함께 누르면 같은 그룹에서 정렬합니다. 포인터로 핸들을 끌어도 정렬할 수 있습니다.'},announcements:{onDragStart:({active})=>`${name(active.id)} 정렬 시작`,onDragOver:({active,over})=>over&&active.data.current?.scope===over.data.current?.scope?`${name(over.id)} 앞 또는 뒤 삽입 위치`:'같은 그룹의 형제를 선택하세요.',onDragEnd:({active,over})=>over?`${name(active.id)} 순서 변경 요청 · 저장 결과를 확인하세요.`:'순서 변경 취소',onDragCancel:()=>'순서 변경 취소'}}} onDragStart={event=>setActive(event.active.data.current as OrderRow)} onDragMove={position} onDragOver={position} onDragCancel={()=>{setActive(null);setInsertion(null);}} onDragEnd={event=>{const target=event.over?.data.current as OrderRow|undefined;if(active&&target&&insertion?.id===target.id&&active.scope===target.scope)onDrop(active.id,target.id,insertion.after);setActive(null);setInsertion(null);}}>
    {children(id=>{const row=rows.find(row=>row.id===id);return row?<Row key={id} row={row} busy={busy} edge={insertion?.id===id?(insertion.after?'after':'before'):undefined}/>:null;})}
    <DragOverlay dropAnimation={{duration:160,easing:'ease-out'}}>{active&&<div className="money-tree-row money-unified-row money-order-preview"><span className="money-order-handle">⠿</span><div className="money-order-name">{active.content}</div></div>}</DragOverlay>
  </DndContext>;
}

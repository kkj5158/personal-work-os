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
  return <DndContext sensors={sensors} autoScroll onDragStart={event=>setActive(event.active.data.current as OrderRow)} onDragMove={position} onDragOver={position} onDragCancel={()=>{setActive(null);setInsertion(null);}} onDragEnd={event=>{const target=event.over?.data.current as OrderRow|undefined;if(active&&target&&insertion?.id===target.id&&active.scope===target.scope)onDrop(active.id,target.id,insertion.after);setActive(null);setInsertion(null);}}>
    {children(id=>{const row=rows.find(row=>row.id===id);return row?<Row key={id} row={row} busy={busy} edge={insertion?.id===id?(insertion.after?'after':'before'):undefined}/>:null;})}
    <DragOverlay dropAnimation={{duration:160,easing:'ease-out'}}>{active&&<div className="money-tree-row money-unified-row money-order-preview"><span className="money-order-handle">⠿</span><div className="money-order-name">{active.content}</div></div>}</DragOverlay>
  </DndContext>;
}

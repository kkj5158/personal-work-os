"use client";
import type {ReactNode} from "react";
import {DndContext,closestCenter,PointerSensor,KeyboardSensor,useSensor,useSensors} from "@dnd-kit/core";
import {SortableContext,useSortable,verticalListSortingStrategy,arrayMove,sortableKeyboardCoordinates} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {GripVertical} from "lucide-react";
function Row({id,children}:{id:string;children:(handle:ReactNode)=>ReactNode}){const {setNodeRef,transform,transition,attributes,listeners}=useSortable({id});return <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition}}>{children(<button className="diet-drag" type="button" aria-label="순서 변경" {...attributes} {...listeners}><GripVertical size={16}/></button>)}</div>;}
export function SortableList({ids,onReorder,children}:{ids:string[];onReorder:(ids:string[])=>void;children:(id:string,handle:ReactNode)=>ReactNode}){const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(over&&active.id!==over.id)onReorder(arrayMove(ids,ids.indexOf(String(active.id)),ids.indexOf(String(over.id))));}}><SortableContext items={ids} strategy={verticalListSortingStrategy}>{ids.map(id=><Row key={id} id={id}>{handle=>children(id,handle)}</Row>)}</SortableContext></DndContext>;}

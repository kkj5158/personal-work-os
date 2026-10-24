"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { TimetableBlock } from "@/lib/api/timetables";
import { blockColor, DAYS, layoutBlocks, MINUTE_HEIGHT, shiftBlock, textColor, timeLabel } from "./model";
type Gesture={pointer:number;x:number;y:number;day:number;minute:number;block?:TimetableBlock;resize:boolean;moved:boolean};
export function TimetableGrid({id,blocks,defaultColor,busy,onCreate,onEdit,onMove}:{id:string;blocks:TimetableBlock[];defaultColor:string|null;busy:boolean;onCreate:(day:number,start:number,length:number)=>void;onEdit:(b:TimetableBlock)=>void;onMove:(before:TimetableBlock,after:TimetableBlock)=>void}) {
  const grid=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null);
  const [preview,setPreview]=useState<TimetableBlock|null>(null),[selection,setSelection]=useState<{day:number;start:number;end:number}|null>(null),[selected,setSelected]=useState<string|null>(null);
  const scrollPositions=useRef<Record<string,number>>({});
  useEffect(()=>{const el=scroll.current,positions=scrollPositions.current;if(!el)return;el.scrollTop=positions[id]??360*MINUTE_HEIGHT;return()=>{positions[id]=el.scrollTop;};},[id]);
  useEffect(()=>{const observer=new ResizeObserver(()=>{gesture.current=null;setPreview(null);setSelection(null);});if(grid.current)observer.observe(grid.current);return()=>observer.disconnect();},[]);
  const slices=useMemo(()=>layoutBlocks(blocks.map(b=>preview?.id===b.id?preview:b)),[blocks,preview]);
  const point=(event:PointerEvent)=>{const rect=grid.current!.getBoundingClientRect();return {day:Math.max(1,Math.min(7,Math.floor((event.clientX-rect.left)/rect.width*7)+1)),minute:Math.max(0,Math.min(1425,Math.floor((event.clientY-rect.top)/MINUTE_HEIGHT/15)*15))};};
  const down=(e:PointerEvent<HTMLDivElement>)=>{if(busy||e.button!==0)return;const target=e.target as HTMLElement;const node=target.closest<HTMLElement>("[data-block]");const b=blocks.find(b=>b.id===node?.dataset.block);const p=point(e);
    gesture.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,...p,block:b,resize:!!target.closest("[data-resize]"),moved:false};grid.current?.setPointerCapture(e.pointerId);if(b)setSelected(b.id);e.preventDefault();};
  const move=(e:PointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;if(Math.abs(e.clientX-g.x)+Math.abs(e.clientY-g.y)<5&&!g.moved)return;g.moved=true;const p=point(e);
    if(g.block){const delta=Math.round((e.clientY-g.y)/MINUTE_HEIGHT/15)*15;setPreview(g.resize?{...g.block,durationMinutes:Math.max(15,Math.min(1440,g.block.durationMinutes+delta))}:shiftBlock(g.block,p.day-g.day,delta));}
    else setSelection({day:g.day,start:Math.min(g.minute,p.minute),end:Math.min(1440,Math.max(g.minute,p.minute)+15)});};
  const up=(e:PointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g)return;gesture.current=null;if(grid.current?.hasPointerCapture(e.pointerId))grid.current.releasePointerCapture(e.pointerId);
    if(g.block){if(g.moved&&preview&&(preview.weekday!==g.block.weekday||preview.startMinute!==g.block.startMinute||preview.durationMinutes!==g.block.durationMinutes))onMove(g.block,preview);else if(!g.moved)onEdit(g.block);}
    else {const p=selection??{day:g.day,start:g.minute,end:Math.min(g.minute+60,1440)};onCreate(p.day,p.start,p.end-p.start);}setPreview(null);setSelection(null);};
  return <div className="tt-grid-scroll" ref={scroll}><div className="tt-grid-inner"><div className="tt-week-header"><span aria-hidden="true"/>{DAYS.map(name=><strong key={name}>{name}</strong>)}</div><div className="tt-grid-body"><div className="tt-time-axis" aria-hidden="true">{Array.from({length:25},(_,i)=><span key={i} style={{top:i*60*MINUTE_HEIGHT}}>{timeLabel(i*60)}</span>)}</div>
    <div ref={grid} className="tt-time-grid" aria-label="월요일부터 일요일까지 주간 시간표" style={{height:1440*MINUTE_HEIGHT}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{gesture.current=null;setPreview(null);setSelection(null);}}>
      {DAYS.map((name,i)=><div key={name} className="tt-day-column" style={{left:`${i/7*100}%`}} aria-hidden="true"/>)}
      {slices.map(s=>{const color=blockColor(s.block.color,defaultColor);return <button type="button" key={`${s.block.id}:${s.part}`} data-block={s.block.id} data-weekday={s.weekday} data-start={s.start} data-end={s.end} className={`tt-block ${selected===s.block.id?"selected":""}`} disabled={busy} style={{top:s.start*MINUTE_HEIGHT,height:(s.end-s.start)*MINUTE_HEIGHT,left:`${((s.weekday-1)+s.lane/s.lanes)/7*100}%`,width:`${100/7/s.lanes}%`,backgroundColor:color,color:textColor(color)}} aria-label={`${s.block.title}, ${DAYS[s.block.weekday-1]} ${timeLabel(s.block.startMinute)}부터 ${s.block.startMinute+s.block.durationMinutes>=1440?"다음 날 ":""}${timeLabel((s.block.startMinute+s.block.durationMinutes)%1440)}, ${s.lanes>1?"겹침 있음":""}`} aria-pressed={selected===s.block.id} onClick={e=>{if(e.detail===0){setSelected(s.block.id);onEdit(s.block);}}}>
        <strong>{s.part?"↪ ":""}{s.block.title}</strong><small>{timeLabel(s.start)}–{timeLabel(s.end)}{s.lanes>1?" · 겹침":""}</small>{s.last&&<span data-resize className="tt-resize" title="길이 조절" aria-hidden="true">＝</span>}
      </button>;})}
      {selection&&<div className="tt-drag-selection" style={{top:selection.start*MINUTE_HEIGHT,height:(selection.end-selection.start)*MINUTE_HEIGHT,left:`${(selection.day-1)/7*100}%`,width:`${100/7}%`}}>{timeLabel(selection.start)}–{timeLabel(selection.end)}</div>}
    </div></div></div></div>;
}

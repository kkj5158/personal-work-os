"use client";
import { useEffect, useRef, useState } from "react";
import type { ReflectionSnapshotDto, ReflectionTimeBlockDto } from "@/lib/api/types";
import { STATE_COLORS } from "@/lib/calendarColor";
import { STATE_LABELS } from "./statePolicy";
import { activeDayStart, ACTIVE_DAY_MINUTES } from "./overview";
import { calendarCategories, categoryAppearance, EMPTY_PREFERENCES, PREFERENCE_KEY, readPreferences, type CalendarCategory, type CalendarPreferences } from "./appearance";
import { listCategories } from "@/lib/api/categories";
import { listLifeCategories } from "@/lib/api/lifeCategories";

const minute=(time:string)=>{const [h,m]=time.split(":").map(Number);return h*60+m;};
const percent=(time:number)=>`${time/1440*100}%`;

/** Structured snapshot, common 24h axis with a scrollable 14h initial window. */
export function ReflectionTimeline({snapshot,categories:provided,prefs:providedPrefs}:{snapshot:ReflectionSnapshotDto;categories?:CalendarCategory[];prefs?:CalendarPreferences}) {
  const [catalog,setCatalog]=useState<CalendarCategory[]>([]);
  const [preferences,setPreferences]=useState(EMPTY_PREFERENCES);
  const scroll=useRef<HTMLDivElement>(null);
  const plan=Array.isArray(snapshot.plannedBlocks) ? snapshot.plannedBlocks : [];
  const actual=Array.isArray(snapshot.actualBlocks) ? snapshot.actualBlocks : [];
  const states=Array.isArray(snapshot.stateBlocks) ? snapshot.stateBlocks : [];
  const start=activeDayStart([...plan,...actual].map(b=>({start:minute(b.startTime),end:minute(b.startTime)+b.durationMinutes})));
  useEffect(()=>{
    if(provided) return;
    let active=true;
    void Promise.all([listCategories(),listLifeCategories()]).then(([w,l])=>{if(active)setCatalog(calendarCategories(w,l));}).catch(()=>{/* Stable category ID colors remain usable if the catalog is unavailable. */});
    // Hydrate browser-only appearance after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try{setPreferences(readPreferences(localStorage.getItem(PREFERENCE_KEY)));}catch{}
    return ()=>{active=false;};
  },[provided]);
  useEffect(()=>{
    const el=scroll.current;if(!el)return;
    const position=()=>{el.scrollLeft=start/ACTIVE_DAY_MINUTES*el.clientWidth;};position();
    const observer=new ResizeObserver(position);observer.observe(el);return ()=>observer.disconnect();
  },[start]);
  const laneEnds:number[]=[];
  const planned=[...plan].sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(block=>{
    let lane=laneEnds.findIndex(end=>end<=minute(block.startTime));if(lane<0)lane=laneEnds.length;
    laneEnds[lane]=minute(block.startTime)+block.durationMinutes;return {block,lane};
  });
  const planHeight=Math.max(1,laneEnds.length)*36;
  function activity(block:ReflectionTimeBlockDto,lane=0) {
    const begin=minute(block.startTime),duration=Math.min(block.durationMinutes,1440-begin);
    if(!Number.isFinite(begin) || !Number.isFinite(duration) || duration<=0)return null;
    const color=categoryAppearance(block.semanticType,block.categoryId,provided ?? catalog,providedPrefs ?? preferences);
    return <div key={`${block.semanticType}:${block.sourceId}`} className="absolute overflow-hidden rounded border px-1.5 text-xs leading-8 text-zinc-900" style={{top:lane*36+2,height:32,left:percent(begin),width:percent(duration),backgroundColor:`color-mix(in srgb, ${color.body} 50%, white)`,borderColor:color.parent}} title={`${block.label} · ${block.categoryLabel ?? "카테고리 없음"} · ${block.startTime.slice(0,5)}–${block.endTime.slice(0,5)}`}>{duration>=45 ? block.label : ""}</div>;
  }
  return <div aria-label="하루 흐름 스냅샷">
    <p className="mb-2 text-xs text-zinc-500">하루 흐름 · {String(start/60).padStart(2,"0")}:00–{String((start+ACTIVE_DAY_MINUTES)/60).padStart(2,"0")}:00 · 좌우로 스크롤해 나머지 시간 보기</p>
    <div className="flex gap-2">
      <div className="w-14 shrink-0 pt-6 text-xs font-semibold text-zinc-600"><div style={{height:planHeight}}>PLAN</div><div className="h-10 pt-2">ACTUAL</div><div className="pt-2">STATE</div></div>
      <div ref={scroll} className="min-w-0 flex-1 overflow-x-auto" data-reflection-axis>
        <div style={{width:`${1440/ACTIVE_DAY_MINUTES*100}%`}}>
          <div className="relative h-6 text-xs text-zinc-500">{Array.from({length:24},(_,h)=><span key={h} className="absolute" style={{left:percent(h*60)}}>{String(h).padStart(2,"0")}</span>)}</div>
          <div className="relative rounded bg-zinc-50" style={{height:planHeight}}>{planned.map(({block,lane})=>activity(block,lane))}</div>
          <div className="relative mt-1 h-9 rounded bg-zinc-50">{actual.map(b=>activity(b))}</div>
          <div className="relative mt-1 h-8 rounded bg-violet-50" aria-label="State 상태 맥락">{states.map((state,i)=>{
            const begin=minute(state.startTime),end=minute(state.endTime) || 1440;
            const label=STATE_LABELS[state.stateGroup];if(!label || !Number.isFinite(begin) || end<=begin)return null;
            return <div key={i} className={`absolute top-1 h-6 overflow-hidden rounded px-1 text-xs leading-6 ${STATE_COLORS[state.stateGroup].dot} text-zinc-950`} style={{left:percent(begin),width:percent(end-begin)}} title={`${label}${state.label ? ` · ${state.label}` : ""} · ${state.startTime.slice(0,5)}–${state.endTime.slice(0,5)}`}>{end-begin>=40 ? label : ""}</div>;
          })}</div>
        </div>
      </div>
    </div>
  </div>;
}

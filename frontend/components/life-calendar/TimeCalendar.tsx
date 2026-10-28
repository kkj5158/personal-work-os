"use client";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { duration, sleepSourceLabel, localParts, type Session } from "@/lib/sleep/model";
import { addDay, daysFor, instant, segments, shiftInterval, timeLabel, type Event, type Mode } from "@/lib/life-calendar/model";
import { editDelta, positionToTime, selectedInterval, timeToPosition } from "@/lib/life-calendar/editor";

import type { SleepClipboardControls } from "./SleepClipboard";

type Edge = "move"|"start"|"end";
type Proposal = {key:string;minutes:number;days:number;edge:Edge};
type Creation = {day:string;start:string;end:string};
type Gesture = {event?:Event;day:string;x:number;y:number;anchor:number;column:HTMLElement;width:number;edge:Edge;moved:boolean;capture:HTMLElement;pointerId:number};

export default function TimeCalendar({events,date,mode,sleepOnly,selected,disabled,onSelect,onPreview,onDay,onError,onCreate,clipboard}:{events:Event[];date:string;mode:Mode;sleepOnly:boolean;selected:string|null;disabled:boolean;onSelect:(event:Event)=>void;onPreview:(event:Event,start:string,end:string)=>void;onDay:(date:string)=>void;onError:(message:string)=>void;onCreate?:(day:string,start:string,end:string)=>void;clipboard?:SleepClipboardControls}) {
  const days=daysFor(date,mode,sleepOnly),hour=sleepOnly?26:64,overnight=sleepOnly&&mode==="week";
  const gesture=useRef<Gesture|null>(null),suppressClick=useRef(false),[drag,setDrag]=useState<Proposal|null>(null),[creation,setCreation]=useState<Creation|null>(null);
  const dailyTotal=(day:string,source:"sleep"|"nap")=>{
    const rows=events.filter(e=>e.attribution===day&&e.source===source&&e.start&&e.end&&(e.original as {intervalMinutes:number|null}).intervalMinutes!=null&&!(e.original as {excludedAt?:string}).excludedAt);
    if(!rows.length)return "—";
    const minutes=Math.round(rows.reduce((total,e)=>total+((e.original as {intervalMinutes:number|null}).intervalMinutes??0),0));
    return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;
  };
  const propose=(event:Event,minutes:number,horizontal:number,edge:Edge)=>{try{const p=shiftInterval(event,minutes,horizontal,edge);onPreview(event,p.start,p.end);}catch(e){onError((e as Error).message);}};
  function clear() {
    const g=gesture.current;gesture.current=null;
    if(g?.capture.hasPointerCapture(g.pointerId))g.capture.releasePointerCapture(g.pointerId);
    setDrag(null);setCreation(null);
  }
  useEffect(()=>{
    const cancel=(e:KeyboardEvent)=>{if(e.key==="Escape"&&gesture.current){e.preventDefault();suppressClick.current=true;clear();setTimeout(()=>{suppressClick.current=false;},0);}};
    window.addEventListener("keydown",cancel,true);return()=>window.removeEventListener("keydown",cancel,true);
  },[]);
  // A navigation/owner/pending transition invalidates any unfinished pointer operation.
  useEffect(()=>{clear();},[date,mode,disabled]); // eslint-disable-line react-hooks/set-state-in-effect
  function down(e:PointerEvent<HTMLElement>,event:Event,edge:Edge) {
    if(disabled||!event.mutable||!event.start||!event.end||e.button!==0)return;
    e.stopPropagation();
    const column=e.currentTarget.closest<HTMLElement>(".life-time-column")!,rect=column.getBoundingClientRect(),capture=column.parentElement!;
    gesture.current={event,day:column.dataset.day!,x:e.clientX,y:e.clientY,anchor:positionToTime(e.clientY-rect.top,hour),column,width:rect.width,edge,moved:false,capture,pointerId:e.pointerId};
    capture.setPointerCapture(e.pointerId);
  }
  function beginCreate(e:PointerEvent<HTMLDivElement>,day:string) {
    if((!onCreate&&!clipboard?.active)||disabled||e.button!==0||e.target!==e.currentTarget)return;
    e.preventDefault();
    const capture=e.currentTarget.parentElement!,rect=e.currentTarget.getBoundingClientRect(),anchor=positionToTime(e.clientY-rect.top,hour);
    gesture.current={day,x:e.clientX,y:e.clientY,anchor,column:e.currentTarget,width:rect.width,edge:"move",moved:false,capture,pointerId:e.pointerId};
    capture.setPointerCapture(e.pointerId);
  }
  function update(e:PointerEvent<HTMLElement>) {
    const g=gesture.current;if(!g||e.pointerId!==g.pointerId)return null;
    g.moved ||= Math.abs(e.clientY-g.y)>5||Math.abs(e.clientX-g.x)>5;
    if(!g.moved)return null;
    // Measure scrolled content at every move, rather than trusting a stale viewport delta.
    const cursor=positionToTime(e.clientY-g.column.getBoundingClientRect().top,hour);
    if(!g.event) {
      const interval={day:g.day,...selectedInterval(g.day,g.anchor,cursor,overnight)};setCreation(interval);return interval;
    }
    const proposal={key:g.event.key,minutes:editDelta(timeToPosition(cursor-g.anchor,hour),hour),days:g.edge==="move"?Math.round((e.clientX-g.x)/g.width):0,edge:g.edge};
    setDrag(proposal);return proposal;
  }
  function up(e:PointerEvent<HTMLElement>) {
    const g=gesture.current;if(!g||e.pointerId!==g.pointerId)return;
    const result=update(e);clear();
    if(!g.moved||!result){
      if(!g.event&&clipboard?.active&&!disabled){
        const at=selectedInterval(g.day,g.anchor,g.anchor,overnight).start;
        const parts=pasteTargetAt(at);clipboard.onTarget(parts);
      }
      // Capture belongs to the stable grid, so a click is explicitly routed back
      // to its original block rather than relying on the browser click target.
      if(g.event&&g.edge==="move"&&!disabled){suppressClick.current=true;onSelect(g.event);setTimeout(()=>{suppressClick.current=false;},0);}
      return;
    }
    suppressClick.current=true;
    if(g.event&&"minutes" in result)propose(g.event,result.minutes,result.days,result.edge);
    else if("start" in result)onCreate?.(result.day,result.start,result.end);
    setTimeout(()=>{suppressClick.current=false;},0);
  }
  function pasteTargetAt(at:string) { const p=localParts(at,"Asia/Seoul"),[h,m]=p.time.split(":").map(Number);return {date:p.date,minute:h*60+m}; }
  function cell(day:string) {
    const rows=segments(events,instant(day),1),owned=events.filter(r=>r.attribution===day);
    const sum=(source:string)=>{const recorded=owned.filter(r=>r.source===source&&r.start&&r.end&&!(r.original as {excludedAt?:string}).excludedAt);return recorded.length?recorded.reduce((n,r)=>n+(Date.parse(r.end!)-Date.parse(r.start!))/60000,0):null;};
    return <section key={day} className={`life-month-cell ${day.slice(0,7)!==date.slice(0,7)?"outside":""}`}><button className="life-day-link" onClick={()=>onDay(day)}>{day.slice(8)}</button>{sleepOnly?<><span className="life-month-value sleep">야간 {duration(sum("sleep"))}</span><span className="life-month-value nap">낮잠 {duration(sum("nap"))}</span></>:rows.map(({event})=><button key={event.key} className={`life-month-value ${event.source}`} onClick={()=>onSelect(event)}>{event.title} · {timeLabel(event.start)}</button>)}<div className="life-month-strips" aria-label={`${day} 실제 시간대 분포 00–24시`}>{rows.map(r=><button key={r.event.key} className={`life-month-strip ${r.event.source}`} aria-label={`${r.event.title} ${timeLabel(r.event.start)} → ${timeLabel(r.event.end)}`} onClick={()=>onSelect(r.event)} style={{marginLeft:`${r.top/24*100}%`,width:`${Math.max(.5,r.actualHeight/24*100)}%`}}/>)}</div><small>00 · 06 · 12 · 18 · 24</small></section>;
  }
  if(mode==="month")return <div><div className="life-month-weekdays">{["일","월","화","수","목","금","토"].map(d=><span key={d}>{d}</span>)}</div><div className="life-month-grid">{days.map(cell)}</div><p>숫자는 원본 귀속일 기준, 색상 띠는 달력 날짜의 실제 시간대입니다. 날짜를 선택하면 일별로 이동합니다.</p></div>;
  const displayed=events.map(event=>{if(event.key!==drag?.key)return event;try{return {...event,...shiftInterval(event,drag.minutes,drag.days,drag.edge)};}catch{return event;}});
  const columnMin=sleepOnly?84:Math.max(130,...days.map(day=>{const rows=segments(displayed,instant(day),hour),secondary=rows.some(r=>r.event.source==="calendar");return Math.max(130,...rows.filter(r=>r.event.source==="workout").map(r=>Math.ceil(r.lanes*160/(secondary ? .72 : 1))));}));
  let livePreview="";
  if(drag){const event=events.find(e=>e.key===drag.key);if(event)try{const interval=shiftInterval(event,drag.minutes,drag.days,drag.edge);livePreview=`${timeLabel(interval.start)} → ${timeLabel(interval.end)} · ${duration((Date.parse(interval.end)-Date.parse(interval.start))/60000)}`;}catch(e){livePreview=(e as Error).message;}}
  if(creation)livePreview=`새 기록 · ${timeLabel(creation.start)} → ${timeLabel(creation.end)} · ${duration((Date.parse(creation.end)-Date.parse(creation.start))/60000)}`;
  return <>
    <div className={`life-time-scroll ${sleepOnly?"sleep-only":"integrated"}`}>
      <div className="life-time-grid" onPointerMove={update} onPointerUp={up} onPointerCancel={clear} onLostPointerCapture={()=>{if(gesture.current)clear();}} style={{"--life-cols":days.length,"--life-col-min":`${columnMin}px`,"--life-hour":`${hour}px`} as CSSProperties}>
        <div className="life-time-head">KST<small>{overnight?"전일18–18":"00–24"}</small></div>
        {days.map(day=><button className={`life-time-head ${date===day?"focused-day":""}`} key={day} onClick={()=>onDay(day)}><b>{day.slice(5)} ({new Intl.DateTimeFormat("ko",{timeZone:"UTC",weekday:"short"}).format(new Date(day+"T12:00:00Z"))})</b><small>{sleepOnly?`야간 ${dailyTotal(day,"sleep")} · 낮잠 ${dailyTotal(day,"nap")}`:`${events.filter(r=>r.attribution===day).length}건 · 귀속일`}</small></button>)}
        <div className="life-time-axis">{Array.from({length:25},(_,i)=><span key={i} style={{top:`${i/24*100}%`}}>{String((i+(overnight?18:0))%24).padStart(2,"0")}:00</span>)}</div>
        {days.map(day=>{
          const origin=overnight?instant(addDay(day,-1),18):instant(day),rows=segments(displayed,origin,hour),hasSecondary=rows.some(r=>r.event.source==="calendar");
          return <div key={day} className={`life-time-column ${onCreate&&!disabled?"can-create":""}`} data-day={day} onPointerDown={e=>beginCreate(e,day)}>
            {overnight&&<div className="life-midnight"><span>자정 · {day.slice(5)}</span></div>}
            {clipboard?.active&&clipboard.target&&(()=>{const target=clipboard.target,at=Date.parse(instant(target.date))+(target.minute??0)*60000,top=(at-Date.parse(origin))/60000;return target.minute!==undefined&&top>=0&&top<1440?<div className="life-paste-target" role="status" style={{top:timeToPosition(top,hour)}}>붙여넣기 위치</div>:null;})()}
            {creation?.day===day&&<div className="life-create-preview" style={{top:timeToPosition((Date.parse(creation.start)-Date.parse(origin))/60000,hour),height:timeToPosition((Date.parse(creation.end)-Date.parse(creation.start))/60000,hour)}}>{timeLabel(creation.start)} → {timeLabel(creation.end)}</div>}
            {rows.map(r=>{
              const event=r.event,secondary=event.source==="calendar",space=hasSecondary?(secondary?28:72):100,offset=secondary?72:0,left=offset+r.lane*space/r.lanes,width=space/r.lanes,sleep=event.source==="sleep"?event.original as Session:null;
              const annotation=sleep?[sleep.sleepScore==null?null:`${sleep.sleepScore}/100`,sleep.sleepNote].filter(Boolean).join(" · "):"";
              const stateLabel=({CLOSED:"완료",OPEN:"진행 중",INCOMPLETE:"보완 필요"} as Record<string,string>)[event.state]??event.state;
              const label=`${event.title} · ${timeLabel(event.start)} → ${timeLabel(event.end)} · ${event.start&&event.end?duration((Date.parse(event.end)-Date.parse(event.start))/60000):stateLabel}${annotation?` · ${annotation}`:""}`;
              return <div key={event.key}>
                <div className={`life-occupancy ${event.source}`} style={{top:r.top,height:Math.max(2,r.actualHeight),left:`calc(${left}% + 3px)`}} aria-hidden="true"/>
                <div role="button" tabIndex={0} aria-label={label} aria-pressed={selected===event.key} data-source={event.source} data-source-id={event.id} className={`life-event ${event.source} ${selected===event.key?"selected":""} ${drag?.key===event.key?"dragging":""} ${r.height<60?"compact":""}`} style={{top:r.top,height:r.height,left:`calc(${left}% + 7px)`,width:`calc(${width}% - 12px)`}} title={label}
                  onClick={()=>{if(!suppressClick.current&&!disabled)onSelect(event);}}
                  onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();if(!disabled)onSelect(event);}if(e.shiftKey&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)&&event.mutable&&!disabled){e.preventDefault();propose(event,e.key==="ArrowUp"?-5:e.key==="ArrowDown"?5:0,e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:0,"move");}}}
                  onPointerDown={e=>down(e,event,"move")}>
                  {event.source==="workout"&&<small className="life-workout-kind">운동 · {event.state}</small>}
                  <b>{r.continuesBefore?"↑ ":""}{event.title}{r.continuesAfter?" ↓":""}</b>
                  <small>{event.start?timeLabel(event.start).slice(6):"미기록"} → {event.end?timeLabel(event.end).slice(6):"미기록"}</small>
                  {!secondary&&<strong>{event.start&&event.end?duration((Date.parse(event.end)-Date.parse(event.start))/60000):stateLabel}</strong>}
                  {sleep&&<><small className="life-sleep-provenance">{event.state==="저장 전"?"저장 전":sleepSourceLabel(sleep)}</small>{annotation&&<small className="life-sleep-annotation" title={annotation}>{annotation}</small>}</>}
                  {event.mutable&&!disabled&&event.start&&event.end&&<>
                    {!r.continuesBefore&&<button className="life-resize start" aria-label={`${event.title} 시작 조절`} onPointerDown={e=>down(e,event,"start")} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="ArrowUp"||e.key==="ArrowDown"){e.preventDefault();propose(event,e.key==="ArrowUp"?-5:5,0,"start");}}}/>}
                    {!r.continuesAfter&&<button className="life-resize end" style={{top:Math.max(6,r.actualHeight)-6}} aria-label={`${event.title} 종료 조절`} onPointerDown={e=>down(e,event,"end")} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="ArrowUp"||e.key==="ArrowDown"){e.preventDefault();propose(event,e.key==="ArrowUp"?-5:5,0,"end");}}}/>}
                  </>}
                </div>
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
    {livePreview&&<output className="life-drag-status" aria-live="polite">{livePreview} · 저장 전 미리보기</output>}
    <p className="life-time-hint">{sleepOnly?"전일 18시–당일 18시 · 야간 수면과 낮잠":"00–24시 · 옆 시간선이 실제 점유 구간"} · 드래그/양끝 조절 후 상세에서 저장하세요. Shift+방향키로 5분·날짜를 이동할 수 있습니다.{clipboard?.active&&" 빈 시간대를 클릭하여 붙여넣기 위치를 선택하세요."}{onCreate&&" 빈 공간을 드래그하면 새 기록을 검토할 수 있습니다. Esc로 진행 중인 선택을 취소합니다."}</p>
  </>;
}

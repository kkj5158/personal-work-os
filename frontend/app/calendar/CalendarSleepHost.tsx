"use client";
import { useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import SleepWorkspace from "@/app/life/sleep/SleepWorkspace";
import { localParts } from "@/lib/sleep/model";
import { CalendarViews, calendarSurfaceQuery } from "./CalendarViews";

export function CalendarSleepHost() {
  const params = useSearchParams();
  const leave = useRef<(proceed:()=>void)=>void>(proceed=>proceed());
  const registerLeave = useCallback((operation:(proceed:()=>void)=>void)=>{leave.current=operation;return()=>{leave.current=proceed=>proceed();};},[]);
  const requested=params.get("date");
  const date=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)&&Number.isFinite(Date.parse(requested))&&new Date(requested).toISOString().slice(0,10)===requested?requested:localParts(new Date().toISOString(),"Asia/Seoul").date;
  return <section className="calendar-sleep-host" aria-label="Calendar 수면 시간표">
    <CalendarViews current="sleep" onChange={surface=>leave.current(()=>window.history.replaceState(null,"",calendarSurfaceQuery(params.toString(),surface)))}/>
    <SleepWorkspace embedded selectedDate={date} registerLeave={registerLeave} onDateChange={nextDate=>{
      const next=new URLSearchParams(params);next.set("date",nextDate);
      window.history.replaceState(null,"",`/calendar?${next}`);
    }}/>
  </section>;
}

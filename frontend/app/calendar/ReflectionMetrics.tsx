import type { ReflectionSnapshotDto } from "@/lib/api/types";
import { STATE_LABELS } from "./statePolicy";
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
const duration=(n:number)=>`${Math.floor(n/60) ? `${Math.floor(n/60)}시간 ` : ""}${n%60 || !n ? `${n%60}분` : ""}`.trim();
export function ReflectionMetrics({snapshot}:{snapshot:ReflectionSnapshotDto}) {
  const actual=(snapshot.workSummary?.actualMinutes ?? 0)+(snapshot.lifeSummary?.actualMinutes ?? 0);
  const hasPlan=(snapshot.plannedBlocks?.length ?? 0)>0;
  const groups=new Map<string,number>();
  for(const state of snapshot.stateBlocks ?? []) {
    const label=STATE_LABELS[state.stateGroup];const span=(minutes(state.endTime)||1440)-minutes(state.startTime);
    if(label && span>0)groups.set(label,(groups.get(label) ?? 0)+span);
  }
  const major=[...groups.entries()].sort((a,b)=>b[1]-a[1])[0];
  return <div className="flex flex-wrap gap-5 rounded-md border border-zinc-200 p-3 text-sm" aria-label="하루 흐름 요약">
    <Stat label="실제 활동" value={duration(actual)}/>
    {(snapshot.workSummary?.actualMinutes ?? 0)>0 && <Stat label="업무 활동" value={duration(snapshot.workSummary.actualMinutes)}/>}
    {major && <Stat label={`주요 State · ${major[0]}`} value={duration(major[1])}/>}
    {(snapshot.lifeSummary?.actualMinutes ?? 0)>0 && <Stat label="생활 활동" value={duration(snapshot.lifeSummary.actualMinutes)}/>}
    <Stat label="남은 Plan" value={hasPlan ? `${snapshot.plannedBlocks.length}개` : "계획 없음"}/>
  </div>;
}
function Stat({label,value}:{label:string;value:string}){return <div><div className="text-xs text-zinc-500">{label}</div><strong className="text-base text-zinc-900">{value}</strong></div>;}

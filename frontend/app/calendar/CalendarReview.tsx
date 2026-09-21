import type { CalendarRangeResponse } from "@/lib/api/types";
import type { CalendarCategory } from "./appearance";
import { formatDuration } from "./duration";

/** Review is based on Actuals; no execution links or matched Plan pairs needed. */
export function CalendarReview({range,categories}:{range:CalendarRangeResponse;categories:CalendarCategory[]}) {
  const totals=new Map<string,number>();
  let work=0,life=0;
  const entries=[...range.actualBlocks.map(b=>({...b,minutes:b.durationMinutes})),...range.unscheduledActual.map(b=>({...b,minutes:b.durationMinutes}))];
  for(const item of entries){
    if(!Number.isFinite(item.minutes) || item.minutes<=0)continue;
    if(item.domainType==="WORK")work+=item.minutes;else life+=item.minutes;
    const id=item.domainType==="WORK" ? item.activityCategoryId : item.lifeCategoryId;
    const name=categories.find(c=>c.domain===item.domainType && c.id===id)?.name ?? "카테고리 없음";
    const label=`${item.domainType} · ${name}`;
    totals.set(label,(totals.get(label) ?? 0)+item.minutes);
  }
  return <section className="cal-review-summary" aria-label="Actual 회고 요약"><h2>회고 · Actual 활동</h2><p>전체 {formatDuration(work+life)} · WORK {formatDuration(work)} · LIFE {formatDuration(life)}</p><ul>{[...totals].map(([name,minutes])=><li key={name}>{name} · {formatDuration(minutes)}</li>)}</ul><p>남은 Plan {range.planBlocks.length+(range.unscheduledPlans?.length ?? 0)}개</p></section>;
}

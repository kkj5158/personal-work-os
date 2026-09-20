import type {CalendarPlanBlockDto} from "@/lib/api/types";
import type {Execution} from "./ExecutionActions";
import {formatDuration} from "./duration";
export function executionDifference(plan:CalendarPlanBlockDto,actual:Execution) {
 const start=actual.startAt ?? `${actual.actual.date}T${actual.actual.startTime}`;
 const planned=(Date.parse(plan.endAt)-Date.parse(plan.startAt))/60000;
 return {delay:Math.round((Date.parse(start)-Date.parse(plan.startAt))/60000),duration:actual.actual.durationMinutes-planned};
}
export function ExecutionComparison({plans,executions,now}:{plans:CalendarPlanBlockDto[];executions:Execution[];now:number}) {
 return <details className="cal-execution-comparison" open><summary>Plan ↔ Actual 분석 · {plans.filter(p=>!executions.some(e=>e.planId===p.id) && Date.parse(p.endAt)<now).length}개 미실행</summary><table><thead><tr><th>계획</th><th>실행 상태</th><th>시작 차이</th><th>소요 차이</th></tr></thead><tbody>{plans.map(p=>{const e=executions.find(e=>e.planId===p.id),diff=e?executionDifference(p,e):null;return <tr key={p.id}><td>{p.title}</td><td>{e ? e.running?"실행 중":"완료" : Date.parse(p.endAt)<now?"미실행":"예정"}</td><td>{diff?`${formatDuration(Math.abs(diff.delay))} ${diff.delay>=0?"지연":"일찍"}`:"—"}</td><td>{diff&&!e?.running?`${formatDuration(Math.abs(diff.duration))} ${diff.duration>=0?"초과":"단축"}`:"—"}</td></tr>;})}</tbody></table></details>;
}

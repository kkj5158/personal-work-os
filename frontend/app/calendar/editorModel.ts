import { validLocalDate } from "@/lib/localDateBridge";
import type { CalendarCategory } from "./appearance";
import { STATE_LABELS, observedRange } from "./statePolicy";
import type { ActualSourceType, CalendarStateBlockDto, CalendarUnscheduledActualDto, PlanDomainType, StateGroup } from "@/lib/api/types";
import type { GridBlock } from "./gridTypes";
import { parseLocalDateTime, toLocalDateTimeString } from "@/lib/date";

export interface CalendarEditorValue {
  key: string;
  kind: "plan" | "actual" | "state";
  id: string | null;
  sourceType?: ActualSourceType;
  originalStartAt?:string;
  originalEndAt?:string;
  title: string;
  date: string;
  start: string;
  end: string;
  duration: number;
  unscheduled: boolean;
  domainType: PlanDomainType;
  categoryId: string | null;
  phaseId: string | null;
  memo: string;
  stateGroup: StateGroup;
  dirty: boolean;
}
export const timeMinutes = (time: string) => { const [h,m] = time.split(":").map(Number); return h * 60 + m; };
export const minuteTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2,"0")}:${String(min % 60).padStart(2,"0")}`;
export function editorDateTime(date: string, time: string) {
  const value = parseLocalDateTime(`${date}T00:00:00`);
  value.setMinutes(timeMinutes(time));
  return toLocalDateTimeString(value);
}
export function newEditor(kind: CalendarEditorValue["kind"], date: string, start: number, end: number): CalendarEditorValue {
  return { key: crypto.randomUUID(), kind, id: null, title: "", date, start:minuteTime(start), end:minuteTime(end), duration:end-start, unscheduled:false, domainType:kind === "state" ? "LIFE" : "WORK", sourceType:kind === "actual" ? "WORK_TIME_ENTRY" : undefined, categoryId:null, phaseId:null, memo:"", stateGroup:"STABLE", dirty:false };
}
export function blockEditor(block: GridBlock): CalendarEditorValue {
  return {...newEditor(block.sourceType ? "actual" : "plan", block.startAt.slice(0,10), 0, 30), key:`${block.sourceType ?? "plan"}:${block.id}`, id:block.id, sourceType:block.sourceType,originalStartAt:block.startAt,originalEndAt:block.endAt, title:block.title, start:block.startAt.slice(11,16),end:block.endAt.slice(0,10) !== block.startAt.slice(0,10) && block.endAt.slice(11,16) === "00:00" ? "24:00" : block.endAt.slice(11,16),duration:Math.round((new Date(block.endAt).getTime()-new Date(block.startAt).getTime())/60000),domainType:block.domainType, categoryId:block.domainType === "WORK" ? block.activityCategoryId : block.lifeCategoryId,phaseId:block.phaseId,memo:block.memo ?? ""};
}
export function unscheduledEditor(item: CalendarUnscheduledActualDto): CalendarEditorValue {
  return {...newEditor("actual",item.date,540,570), key:`${item.sourceType}:${item.sourceId}`,id:item.sourceId,sourceType:item.sourceType,title:item.title,domainType:item.domainType,categoryId:item.domainType === "WORK" ? item.activityCategoryId : item.lifeCategoryId,phaseId:item.phaseId,memo:item.memo ?? "",duration:item.durationMinutes,unscheduled:true};
}
export function stateEditor(state: CalendarStateBlockDto): CalendarEditorValue {
  return {...newEditor("state",state.date,0,30), key:`state:${state.id}`,id:state.id,title:state.label ?? "",start:state.startAt.slice(11,16),end:state.endAt.slice(11,16),stateGroup:state.stateGroup,memo:state.memo ?? ""};
}
export function editorBlock(value: CalendarEditorValue): GridBlock {
  return {id:value.id ?? "draft",sourceType:value.kind === "actual" ? value.domainType === "LIFE" ? "LIFE_TIME_ENTRY" : value.sourceType ?? "WORK_TIME_ENTRY" : undefined,title:value.title || "제목 없음",startAt:editorDateTime(value.date,value.start),endAt:editorDateTime(value.date,value.end),domainType:value.domainType,activityCategoryId:value.domainType === "WORK" ? value.categoryId : null,lifeCategoryId:value.domainType === "LIFE" ? value.categoryId : null,phaseId:value.phaseId,memo:value.memo};
}
/** Invalid intermediate inputs must never replace persisted geometry in the grid. */
export function hasValidEditorTiming(value: CalendarEditorValue): boolean {
  if (value.unscheduled || !validLocalDate(value.date)) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value.end)) return false;
  const start=timeMinutes(value.start), end=timeMinutes(value.end);
  return end > start && end <= 1439;
}

export function validateEditor(value: CalendarEditorValue): string | null {
  if (value.kind !== "state" && !value.title.trim()) return "제목을 입력하세요.";
  if (!validLocalDate(value.date)) return "날짜를 입력하세요.";
  if (value.kind === "actual" && value.domainType === "WORK" && !value.categoryId) return "업무 카테고리를 선택하세요.";
  if(value.unscheduled && value.kind === "plan")return null;
  if (value.unscheduled && value.kind === "actual") return Number.isInteger(value.duration) && value.duration > 0 ? null : "소요 시간을 정수 분으로 입력하세요.";
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value.end)) return "올바른 시간을 입력하세요.";
  if(value.kind === "state" && !Object.hasOwn(STATE_LABELS,value.stateGroup)) return "상태를 선택하세요.";
  if(value.kind === "state" && !observedRange(value.date,value.end)) return "미래의 상태는 기록할 수 없습니다.";
  if(value.kind==="actual" && value.originalStartAt?.slice(11,16)===value.start && value.originalEndAt?.slice(11,16)===value.end && Date.parse(value.originalEndAt)>Date.parse(value.originalStartAt))return null;
  const duration = timeMinutes(value.end) - timeMinutes(value.start);
  if (!Number.isFinite(duration) || duration < 1 || timeMinutes(value.end) > 1439) return "종료는 시작보다 시작 이후여야 합니다.";
  if(value.kind !== "plan" && timeMinutes(value.end) === 1440) return "실행과 상태는 같은 날짜 안에서 기록하세요.";
  if(value.kind==="actual" && value.originalStartAt?.slice(11,16)===value.start && value.originalEndAt?.slice(11,16)===value.end)return null;
  if (timeMinutes(value.start) % 5 || (timeMinutes(value.end) % 5 && value.end !== "23:59")) return "시간은 5분 단위로 입력하세요.";
  return null;
}

/** Selection remains a single semantic ID; the two boxes only expose its hierarchy. */
export function editorCategories(categories: CalendarCategory[], domain: "WORK" | "LIFE", categoryId: string | null) {
  const own = categories.filter(c => c.domain === domain);
  const selected = own.find(c => c.id === categoryId);
  const rootId = selected?.parentId ?? selected?.id ?? "";
  const root = own.find(c => c.id === rootId && !c.parentId);
  const roots = own.filter(c => !c.parentId && c.isActive);
  const children = root?.isActive ? own.filter(c => c.parentId === rootId && c.isActive) : [];
  return { roots, children, rootId: root?.id ?? "", childId: selected?.parentId === root?.id ? selected?.id ?? "" : "", selected, root };
}

export function meaningfulEditorDraft(value: CalendarEditorValue | null) {
  return !!value?.dirty && (!!value.id || value.kind === "state" || !!value.title.trim() || !!value.memo.trim() || !!value.categoryId || !!value.phaseId);
}

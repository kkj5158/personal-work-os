import type {CalendarEditorValue} from "./editorModel";
export interface TitleUse {title:string;count:number;last:number}
export interface CalendarPreset {id:string;title:string;domainType:"WORK"|"LIFE";categoryId:string|null;duration:number;color:string}
export const TITLE_KEY="calendar.titles.v1",PRESET_KEY="calendar.presets.v1";
export const RECENT_BLOCK_KEY="calendar.quick-blocks.recent.v1";
// Saved blocks retain the original key and shape: existing browser favorites survive.
export function readQuickBlocks(raw:string|null):CalendarPreset[] {
 try {const values:unknown=JSON.parse(raw ?? "[]");return Array.isArray(values) ? values.filter((p):p is CalendarPreset=>!!p && typeof p.id==="string" && typeof p.title==="string" && ["WORK","LIFE"].includes(p.domainType) && Number.isFinite(p.duration) && p.duration>0) : [];}catch{return [];}
}
export function rememberQuickBlock(value:CalendarEditorValue,color="") {
 if(!value.title.trim())return;
 try {
  const duration=value.unscheduled ? value.duration : Number(value.end.slice(0,2))*60+Number(value.end.slice(3))-Number(value.start.slice(0,2))*60-Number(value.start.slice(3));
  if(duration<=0)return;
  const item:CalendarPreset={id:`recent:${value.domainType}:${value.categoryId ?? ""}:${value.title}:${duration}`,title:value.title,domainType:value.domainType,categoryId:value.categoryId,duration,color};
  const old=readQuickBlocks(localStorage.getItem(RECENT_BLOCK_KEY));
  if(!color)item.color=old.find(p=>p.id===item.id)?.color ?? "";
  localStorage.setItem(RECENT_BLOCK_KEY,JSON.stringify([item,...old.filter(p=>p.id!==item.id)].slice(0,12)));
 }catch{}
}
export function titleSuggestions(history:TitleUse[],query:string) {
 const q=query.trim().toLocaleLowerCase();
 return history.filter(v=>v.title.toLocaleLowerCase().includes(q)).sort((a,b)=>(b.count-a.count)||(b.last-a.last)).slice(0,12).map(v=>v.title);
}
export function rememberTitle(title:string) {
 try {const all=JSON.parse(localStorage.getItem(TITLE_KEY) ?? "[]") as TitleUse[],old=all.find(x=>x.title===title);localStorage.setItem(TITLE_KEY,JSON.stringify([{title,count:(old?.count ?? 0)+1,last:Date.now()},...all.filter(x=>x.title!==title)].slice(0,100)));}catch{}
}
export function presetPatch(preset:CalendarPreset,value:CalendarEditorValue):Partial<CalendarEditorValue> {
 const [h,m]=value.start.split(":").map(Number),end=Math.min(1439,h*60+m+preset.duration);
 return {title:preset.title,domainType:preset.domainType,categoryId:preset.categoryId,phaseId:null,duration:preset.duration,end:`${Math.floor(end/60).toString().padStart(2,"0")}:${(end%60).toString().padStart(2,"0")}`};
}

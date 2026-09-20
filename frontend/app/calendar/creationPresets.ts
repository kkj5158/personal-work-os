import type {CalendarEditorValue} from "./editorModel";
export interface TitleUse {title:string;count:number;last:number}
export interface CalendarPreset {id:string;title:string;domainType:"WORK"|"LIFE";categoryId:string|null;duration:number;color:string}
export const TITLE_KEY="calendar.titles.v1",PRESET_KEY="calendar.presets.v1";
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

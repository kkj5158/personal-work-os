import type { TimetableBlock } from "@/lib/api/timetables";
import { UNKNOWN_CATEGORY_COLOR } from "../appearance";
export const DAYS=["월","화","수","목","금","토","일"];
export const MINUTE_HEIGHT=1;
export const timeLabel=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
export const timeMinute=(value:string)=>{const m=/^(\d{2}):(\d{2})$/.exec(value);return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):NaN;};
export function duration(start:number,end:number,nextDay:boolean){const value=end-start+(nextDay?1440:0);return Number.isInteger(value)&&value>0&&value<=1440?value:null;}
export function shiftBlock(b:TimetableBlock,dayDelta:number,minuteDelta:number):TimetableBlock {
  const absolute=(((b.weekday-1+dayDelta)*1440+b.startMinute+minuteDelta)%10080+10080)%10080;
  return {...b,weekday:Math.floor(absolute/1440)+1,startMinute:absolute%1440};
}
export type Segment={block:TimetableBlock;weekday:number;start:number;end:number;part:number;last:boolean;lane:number;lanes:number};
export function layoutBlocks(blocks:TimetableBlock[]):Segment[] {
  const slices:Segment[]=blocks.flatMap(block=>{
    const end=block.startMinute+block.durationMinutes;
    const first:Segment={block,weekday:block.weekday,start:block.startMinute,end:Math.min(1440,end),part:0,last:end<=1440,lane:0,lanes:1};
    return end<=1440?[first]:[first,{...first,weekday:block.weekday%7+1,start:0,end:end-1440,part:1,last:true}];
  });
  for(let day=1;day<=7;day++){
    const sorted=slices.filter(s=>s.weekday===day).sort((a,b)=>a.start-b.start||a.end-b.end||a.block.id.localeCompare(b.block.id));
    let cluster:Segment[]=[],max=-1;
    const pack=()=>{const ends:number[]=[];for(const s of cluster){let lane=ends.findIndex(e=>e<=s.start);if(lane<0)lane=ends.length;ends[lane]=s.end;s.lane=lane;}for(const s of cluster)s.lanes=ends.length;};
    for(const s of sorted){if(s.start>=max){pack();cluster=[];max=-1;}cluster.push(s);max=Math.max(max,s.end);}pack();
  }
  return slices;
}
export const blockColor=(explicit:string|null,base:string|null)=>explicit??base??UNKNOWN_CATEGORY_COLOR;
export function textColor(hex:string){const c=hex.slice(1).match(/../g)!.map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2]>.179?"#111827":"#ffffff";}
export type Layout={left:boolean;right:boolean;selected?:string};
export function readLayout(raw:string|null):Layout {try{const p=JSON.parse(raw??"{}");return {left:p.left===true,right:p.right===true,selected:typeof p.selected==="string"?p.selected:undefined};}catch{return {left:false,right:false};}}

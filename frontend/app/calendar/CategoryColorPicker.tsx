"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PICKER_COLORS } from "./appearance";

export function CategoryColorPicker({name,selected,inherited,recent,onColor,defaultLabel="상속 / 기본 색상"}:{name:string;selected:string;inherited:boolean;recent:string[];onColor:(color:string|null)=>void;defaultLabel?:string}) {
  const [position,setPosition] = useState<{top:number;left:number}|null>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const native=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!position) return;
    const close=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))setPosition(null);};
    const escape=(e:KeyboardEvent)=>{if(e.key === "Escape"){e.stopPropagation();setPosition(null);trigger.current?.focus();}};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape,true);
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return ()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape,true);};
  },[position]);
  const choose=(color:string|null)=>{onColor(color);setPosition(null);trigger.current?.focus();};
  const swatches=(colors:string[])=>colors.map(color=><button key={color} type="button" className="cal-color-swatch" style={{backgroundColor:color}} aria-label={`${name} ${color}`} aria-pressed={!inherited && selected.toLowerCase() === color.toLowerCase()} onClick={()=>choose(color)}>{!inherited && selected.toLowerCase() === color.toLowerCase() ? "✓" : ""}</button>);
  return <><button type="button" ref={trigger} className="cal-color-trigger" style={{backgroundColor:selected}} aria-label={`${name} 색상`} aria-expanded={!!position} title={inherited ? "부모 색상 상속 중" : "색상 선택"} onClick={()=>{const rect=trigger.current!.getBoundingClientRect();setPosition(position ? null : {top:Math.max(8,Math.min(rect.bottom+5,window.innerHeight-310)),left:Math.max(8,Math.min(rect.left,window.innerWidth-260))});}}/>
    {position && createPortal(<div ref={panel} role="dialog" aria-label={`${name} 색상 선택`} className="cal-color-popover" style={position}>
      <button className="cal-color-default" aria-pressed={inherited} onClick={()=>choose(null)}>↶ {defaultLabel}{inherited ? " · 상속 중" : ""}</button>
      <p>기본 색상</p><div className="cal-color-palette">{swatches(PICKER_COLORS)}</div>
      {!!recent.length && <><p>최근 색상</p><div className="cal-color-palette">{swatches(recent)}</div></>}
      <button className="cal-color-custom" onClick={()=>native.current?.click()}>직접 색상 지정…</button>
      <input ref={native} type="color" tabIndex={-1} aria-label="정밀 색상 지정" value={selected} className="cal-native-color" onChange={e=>onColor(e.target.value)}/>
    </div>,document.body)}
  </>;
}

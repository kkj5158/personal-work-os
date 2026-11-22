"use client";
import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { CategoryGroup } from "@/lib/money/categories";
import { useMoneyData } from "./MoneyWebData";

const EMPTY_GROUPS:CategoryGroup[]=[];
export function useCategoryGroups(explicit?: CategoryGroup[]) {
  const result = useMoneyData<CategoryGroup[]>(explicit ? null : "/category-groups");
  return { ...result, data: explicit ?? result.data ?? EMPTY_GROUPS };
}
export function CategoryTreeColumns({children,step}:{children:ReactNode;step:number}) {
  const container=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    for(const column of container.current?.querySelectorAll<HTMLElement>(".money-tree-column")??[]){
      const buttons=Array.from(column.querySelectorAll<HTMLButtonElement>(".money-tree-scroll button:not(:disabled)"));
      const current=buttons.find(b=>b===document.activeElement)??buttons.find(b=>b.getAttribute("aria-pressed")==="true")??buttons[0];
      buttons.forEach(b=>{b.tabIndex=b===current?0:-1;});
    }
  },[children,step]);
  return <div ref={container} className="money-category-tree" data-step={step} onKeyDown={categoryColumnKey}>{children}</div>;
}
const PopoverAncestors = createContext<string>("");
/** Anchored, viewport-clamped non-modal popup. Outside and Escape cancel navigation only. */
export function MoneyAnchoredPopover({ children, onClose, label, className = "", focusTarget, clampHeight = false }: { children: ReactNode; onClose: () => void; label: string; className?: string; focusTarget?: string; clampHeight?: boolean }) {
  const ancestors=useContext(PopoverAncestors), popoverId=useId();
  const chain=[ancestors,popoverId].filter(Boolean).join(" ");
  const marker = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const [position,setPosition] = useState({ left: 12, top: 12, ready: false });
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; },[onClose]);
  useLayoutEffect(() => {
    const origin = marker.current?.parentElement?.querySelector<HTMLButtonElement>("button"), parent = marker.current?.parentElement;
    const update = () => {
      const rect = parent?.getBoundingClientRect(), node = popup.current;
      if (!rect || !node) return;
      const left = Math.max(12,Math.min(rect.left,window.innerWidth-node.offsetWidth-12));
      const below = Math.max(12,rect.bottom+6), preferred = below+node.offsetHeight <= window.innerHeight-12 ? below : Math.max(12,rect.top-node.offsetHeight-6);
      const top = clampHeight ? Math.max(12,Math.min(preferred,window.innerHeight-node.offsetHeight-12)) : preferred;
      setPosition({ left,top,ready: true });
    };
    update(); const observer = new ResizeObserver(update); if (popup.current) observer.observe(popup.current);
    const belongsToChild=(target:EventTarget|null)=>target instanceof window.Element && target.closest<HTMLElement>("[data-money-popovers]")?.dataset.moneyPopovers?.split(" ").includes(popoverId);
    const outside = (e: PointerEvent) => { if (!popup.current?.contains(e.target as Node) && !belongsToChild(e.target) && !parent?.contains(e.target as Node)) closeRef.current(); };
    const key = (e: globalThis.KeyboardEvent) => { if(e.key === "Escape") {
      const top=document.querySelectorAll<HTMLElement>("[data-money-popovers]");
      if(top[top.length-1]!==popup.current)return;
      e.preventDefault(); e.stopPropagation(); closeRef.current(); origin?.focus(); } };
    window.addEventListener("resize",update); window.addEventListener("scroll",update,true); document.addEventListener("pointerdown",outside); document.addEventListener("keydown",key,true);
    if(!focusTarget)popup.current?.querySelector<HTMLInputElement>("input")?.focus();
    const node=popup.current;
    return () => { observer.disconnect(); window.removeEventListener("resize",update); window.removeEventListener("scroll",update,true); document.removeEventListener("pointerdown",outside); document.removeEventListener("keydown",key,true); if(focusTarget&&(node?.contains(document.activeElement)||document.activeElement===document.body))origin?.focus(); };
  },[clampHeight,focusTarget,popoverId]);
  // A hidden portal cannot receive browser focus. Wait for its measured position to render.
  useLayoutEffect(()=>{if(position.ready&&focusTarget)popup.current?.querySelector<HTMLElement>(focusTarget)?.focus();},[position.ready,focusTarget]);
  return <><span ref={marker}/>{createPortal(<PopoverAncestors.Provider value={chain}><div role="dialog" data-money-popovers={chain} aria-label={label} ref={popup} className={`money-tree-popover ${className}`} style={{ ...(ancestors?{zIndex:1600+chain.split(" ").length}:{}),left: position.left, top: position.top, visibility: position.ready?"visible":"hidden" }}>{children}</div></PopoverAncestors.Provider>,document.body)}</>;
}
/** Keyboard navigation is column-local; arrows across columns never change membership. */
export function categoryColumnKey(e: KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented || e.altKey || e.nativeEvent.isComposing || e.target instanceof HTMLInputElement) return;
  const column = (e.target as HTMLElement).closest<HTMLElement>(".money-tree-column");
  if (!column) return;
  const buttons = Array.from(column.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")), at = buttons.indexOf(e.target as HTMLButtonElement);
  let next: HTMLButtonElement | undefined;
  if(e.key === "ArrowDown") next = buttons[(at+1)%buttons.length];
  if(e.key === "ArrowUp") next = buttons[(at+buttons.length-1)%buttons.length];
  if(e.key === "Home") next = buttons[0];
  if(e.key === "End") next = buttons.at(-1);
  if(e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const sibling = e.key === "ArrowRight" ? column.nextElementSibling : column.previousElementSibling;
    next = sibling?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? undefined;
  }
  if(next) { e.preventDefault(); buttons.forEach(b=>{b.tabIndex=-1;});next.tabIndex=0;next.focus(); }
}

"use client";
import { wikiOccurrences } from "@/lib/workflow/wiki";
import { useLayoutEffect, useRef, type HTMLAttributes, type Ref } from "react";

export type TextElement = HTMLDivElement & { value:string; selectionStart:number; selectionEnd:number; setSelectionRange:(start:number,end:number)=>void };
export function offsetIn(element:HTMLElement,node:Node,offset:number){
  const range=document.createRange();range.selectNodeContents(element);
  try{range.setEnd(node,offset);return range.toString().length;}catch{return 0;}
}
/**
 * A trailing "\n" (soft break at the end of a block) collapses in the browser, so the caret after it would jump back
 * onto the first line. A sentinel <br> keeps the empty last line real; it adds nothing to textContent.
 */
export function ensureTrailingBreak(element:HTMLElement,value:string){
  const last=element.lastChild as HTMLElement|null,sentinel=last?.nodeName==="BR"&&last.dataset.trailing==="1";
  if(value.endsWith("\n")&&!sentinel){const br=document.createElement("br");br.dataset.trailing="1";element.append(br);}
  else if(!value.endsWith("\n")&&sentinel)last.remove();
}
export function setRange(element:HTMLElement,start:number,end=start){
  const locate=(position:number):[Node,number]=>{const walker=document.createTreeWalker(element,4);let node:Node|null;while((node=walker.nextNode())){
    // The end of a text that finishes with a soft break is the start of the (sentinel-held) empty line.
    if(position===node.textContent!.length&&node.textContent!.endsWith("\n")&&node.nextSibling?.nodeName==="BR")return[element,[...element.childNodes].indexOf(node.nextSibling as ChildNode)];
    if(position<=node.textContent!.length)return[node,position];position-=node.textContent!.length;}return[element,element.childNodes.length];};
  const range=document.createRange();range.setStart(...locate(start));range.setEnd(...locate(end));const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
type Props=Omit<HTMLAttributes<TextElement>,"onChange"> & {value:string;ref?:Ref<TextElement>;disabled?:boolean;placeholder?:string;rows?:number;onChange:(e:React.ChangeEvent<TextElement>)=>void};
export default function EditableText({value,ref,disabled,placeholder,rows:_rows,onChange,...props}:Props){
  const local=useRef<TextElement|null>(null);
  function decorate(el:HTMLElement){
    const occurrences=wikiOccurrences(value);if(!occurrences.length)return;
    el.replaceChildren();let at=0;
    for(const occurrence of occurrences){el.append(document.createTextNode(value.slice(at,occurrence.start)));const span=document.createElement('span');span.className='wp-inline-wiki';span.dataset.start=String(occurrence.start);span.title='Open linked note · Ctrl+click to open as main document';
      for(const [text,syntax] of [['[[',true],[occurrence.name,false],[']]',true]] as const){const part=document.createElement('span');part.textContent=text;if(syntax)part.className='wp-wiki-syntax';span.append(part);}el.append(span);at=occurrence.end;
    }el.append(document.createTextNode(value.slice(at)));
    ensureTrailingBreak(el,value);
  }
  useLayoutEffect(()=>{const el=local.current;if(!el)return;if(el.textContent!==value){const focused=document.activeElement===el||el.contains(window.getSelection()?.anchorNode??null),start=el.selectionStart;el.textContent=value;ensureTrailingBreak(el,value);if(focused)setRange(el,Math.min(start,value.length));else decorate(el);}else ensureTrailingBreak(el,value);});
  return <div {...props} onBlur={e=>{decorate(e.currentTarget);props.onBlur?.(e as React.FocusEvent<TextElement>);}} className="wp-text-input" role="textbox" aria-multiline="true" aria-disabled={disabled} data-placeholder={placeholder} contentEditable={!disabled} suppressContentEditableWarning tabIndex={0} ref={el=>{
    if(el&&!Object.getOwnPropertyDescriptor(el,"value"))Object.defineProperties(el,{
      value:{get:()=>el.textContent??""},
      selectionStart:{get:()=>{const s=window.getSelection();return s?.rangeCount&&el.contains(s.getRangeAt(0).startContainer)?offsetIn(el,s.getRangeAt(0).startContainer,s.getRangeAt(0).startOffset):0;}},
      selectionEnd:{get:()=>{const s=window.getSelection();return s?.rangeCount&&el.contains(s.getRangeAt(0).endContainer)?offsetIn(el,s.getRangeAt(0).endContainer,s.getRangeAt(0).endOffset):(el.textContent?.length??0);}},
      setSelectionRange:{value:(a:number,b:number)=>setRange(el,a,b)},
    });
    local.current=el as TextElement|null;if(typeof ref==="function")ref(local.current);else if(ref)ref.current=local.current;
  }} onInput={e=>{e.stopPropagation();onChange(e as unknown as React.ChangeEvent<TextElement>);}}/>;
}

export function documentRange(root:HTMLElement|null){
  const s=window.getSelection();if(!root||!s?.rangeCount||s.isCollapsed)return null;
  const r=s.getRangeAt(0),find=(n:Node)=>(n.nodeType===1?n as Element:n.parentElement)?.closest<HTMLElement>(".wp-text-input");
  const included=[...root.querySelectorAll<HTMLElement>('.wp-text-input')].filter(el=>r.intersectsNode(el));
  const first=find(r.startContainer)??included[0],last=find(r.endContainer)??included.at(-1);
  if(!first||!last||!root.contains(first)||!root.contains(last))return null;
  return {first:first.closest<HTMLElement>(".wp-block")!.id.slice(3),last:last.closest<HTMLElement>(".wp-block")!.id.slice(3),start:first.contains(r.startContainer)?offsetIn(first,r.startContainer,r.startOffset):0,end:last.contains(r.endContainer)?offsetIn(last,r.endContainer,r.endOffset):(last.textContent?.length??0)};
}

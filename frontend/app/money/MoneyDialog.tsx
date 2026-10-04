"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function MoneyDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;const origin=document.activeElement as HTMLElement;const previous=document.body.style.overflow;dialog?.showModal();document.body.style.overflow="hidden";return()=>{dialog?.close();document.body.style.overflow=previous;if(origin?.isConnected)origin.focus();};},[]);
  return <dialog className="money-confirm-dialog" ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div><header><h2>{title}</h2><button autoFocus onClick={onClose} aria-label="닫기">×</button></header>{children}</div></dialog>;
}

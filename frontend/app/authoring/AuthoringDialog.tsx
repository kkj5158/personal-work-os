"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
/** Native dialog supplies focus containment, Escape and focus restoration. */
export function AuthoringDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="authoring authoring-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header><h2>{title}</h2><Button onClick={onClose} aria-label="닫기">닫기</Button></header>{children}
  </dialog>;
}

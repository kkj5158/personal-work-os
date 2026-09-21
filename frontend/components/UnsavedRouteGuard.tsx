"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShellNavigationGuard } from "./GlobalTabs";

/** Confirm separately from the editor so cancelling never unmounts its draft. */
export function UnsavedRouteGuard({ dirty }: { dirty: boolean }) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  useShellNavigationGuard(proceed => { if (dirty) setPending(() => proceed); else proceed(); });
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  return pending ? <LeaveDialog cancel={() => setPending(null)} discard={() => { setPending(null); pending(); }}/> : null;
}
function LeaveDialog({ cancel, discard }: { cancel: () => void; discard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="system-order-dialog" aria-labelledby="unsaved-route-title" onKeyDown={event => event.stopPropagation()} onCancel={cancel}>
    <h2 id="unsaved-route-title">저장하지 않은 변경사항을 버릴까요?</h2>
    <p>계속 편집하면 현재 화면과 입력한 내용을 유지합니다.</p>
    <button type="button" onClick={cancel} autoFocus>계속 편집</button>
    <button type="button" onClick={discard}>변경사항 버리고 이동</button>
  </dialog>, document.body);
}

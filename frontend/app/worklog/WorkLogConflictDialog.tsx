"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function WorkLogConflictDialog({ onClose, reload, loading, error }: { onClose: () => void; reload: () => void; loading: boolean; error: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="system-order-dialog" aria-labelledby="worklog-conflict-title" onKeyDown={event => event.stopPropagation()} onCancel={event => { if (loading) event.preventDefault(); else onClose(); }}>
    <h2 id="worklog-conflict-title">이 기록이 그 사이에 변경되었습니다.</h2>
    <p>현재 입력을 유지했습니다. 최신 내용을 불러오면 저장하지 않은 변경사항을 버립니다.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading} onClick={onClose} autoFocus>입력으로 돌아가기</button>
    <button type="button" disabled={loading} onClick={reload}>{loading ? "불러오는 중…" : "변경사항 버리고 최신 내용 불러오기"}</button>
  </dialog>, document.body);
}

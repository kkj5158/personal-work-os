'use client';
import type { ReactNode } from 'react';

/**
 * Non-modal split view: the source list stays fully interactive and keeps its own scroll, filters and
 * selection while the detail pane (with an independent scroll) swaps content. No overlay, no focus trap.
 */
export default function SplitView({ children, detail, label = '작업 상세' }: { children: ReactNode; detail: ReactNode | null; label?: string }) {
  return <div className={`wf-split ${detail ? 'has-detail' : ''}`}>
    <div className="wf-split-list">{children}</div>
    {detail && <aside className="wf-split-detail" aria-label={label}>{detail}</aside>}
  </div>;
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE } from "./format";

interface WorkLogModalProps {
  titleId: string;
  title: string;
  onClose: () => void;
  /** Optional — a title-and-footer-only confirmation dialog (v5 clock-in
   *  cancellation unit) has no body content at all; omitting the content
   *  section entirely for those avoids an empty padded gap between header
   *  and footer. */
  children?: ReactNode;
  footer?: ReactNode;
  /** "wide" is for the unified record-edit modal (v4 unit) — its embedded
   *  work-time table and two-column field grid need materially more room
   *  than every other Work Log dialog. "compact" is for a small title-only
   *  confirmation dialog (v5 unit), which would otherwise look sparse at
   *  the default width. */
  size?: "default" | "wide" | "compact";
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Route-local modal shell (spec §7 accessibility requirements): not a change
// to the shared components/ui/Modal.tsx, which Planning depends on and which
// doesn't implement focus trapping/restoration. Reused by both the record-
// detail modal now and, per spec, intended for the future Work-time modal —
// only one instance is ever mounted at a time (page.tsx's single
// discriminated modal state structurally prevents stacking).
export function WorkLogModal({ titleId, title, onClose, children, footer, size = "default" }: WorkLogModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Mount-only: captures whatever had focus before the dialog opened and
  // sets the initial `[data-autofocus]` target exactly once. Deliberately
  // NOT keyed on `onClose` — a multi-phase modal that swaps `<WorkLogModal>`
  // content via a sequence of `if (...) return (...)` branches in one
  // component (e.g. ChecklistManagementModal's list/form/delete-confirm
  // phases) reconciles as the *same* element across those phases unless the
  // caller gives each phase its own `key`, so this effect's cleanup/re-run
  // timing must not depend on a prop a caller might reasonably recreate
  // every render. See the keydown effect below for why this used to be
  // combined with it (BUG-01).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const autofocusTarget = dialog?.querySelector<HTMLElement>("[data-autofocus]");
    (autofocusTarget ?? dialog)?.focus();
    return () => {
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape/Tab handling — kept as its own effect, re-attached whenever
  // `onClose` changes identity. Previously this lived in the *same* effect
  // as the focus-management above, keyed on `[onClose]`; several call sites
  // pass a fresh inline `onClose` (e.g. a form phase's `() => setForm(null)`)
  // on every render, so that combined effect re-ran on every keystroke of a
  // controlled input inside the dialog — its cleanup restored focus to
  // whatever was focused a moment earlier, then immediately stole it back to
  // the `data-autofocus` element, breaking IME composition after exactly one
  // character (BUG-01). This effect never touches focus, so re-running it
  // on every render is harmless regardless of whether a caller memoizes
  // `onClose`.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (e.key === "Tab" && dialog) {
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-border-default bg-surface-default shadow-overlay focus:outline-none ${
          size === "wide" ? "max-w-[820px]" : size === "compact" ? "max-w-sm" : "max-w-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-fg-default">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={`rounded p-1 text-fg-muted hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {children != null && <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>}

        {footer && <div className="flex items-center justify-between gap-2 border-t border-border-default px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Shared visual layer for WORK FLOW's native (HTML5) drag surfaces. It never decides what a drop means:
 * each surface keeps its own dragover/drop handlers and semantics. Elements only declare:
 *   data-dnd-row                      the row/card that is being moved (lifted drag image + origin placeholder)
 *   data-dnd-target="before|inside"   a drop target, shown as an insertion line (before) or a container highlight
 *   data-dnd-accept="mime mime …"     the drag types that target accepts; any other type is shown as rejected
 * plus edge auto-scroll for the nearest scroll container (and the window) while dragging.
 */
export type DropMark = { element: Element; state: 'valid' | 'reject' } | null;

/** Nearest declared target that accepts one of the dragged types; otherwise the nearest target, rejected. */
export function resolveDropTarget(path: Element[], types: readonly string[]): DropMark {
  let nearest: Element | null = null;
  for (const element of path) {
    if (!element.hasAttribute?.('data-dnd-target')) continue;
    nearest ??= element;
    const accept = (element.getAttribute('data-dnd-accept') ?? '').split(/\s+/).filter(Boolean);
    if (accept.some(type => types.includes(type))) return { element, state: 'valid' };
  }
  return nearest ? { element: nearest, state: 'reject' } : null;
}

const EDGE = 64, MAX_STEP = 22;
/** Scroll step for a pointer at `position` inside [start, end]: faster the closer to an edge, 0 in the middle. */
export function edgeStep(position: number, start: number, end: number): number {
  if (position < start + EDGE) return -Math.ceil(MAX_STEP * (1 - Math.max(0, position - start) / EDGE));
  if (position > end - EDGE) return Math.ceil(MAX_STEP * (1 - Math.max(0, end - position) / EDGE));
  return 0;
}

function scrollParent(element: Element | null, axis: 'y' | 'x'): HTMLElement | null {
  for (let node = element as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node), overflow = axis === 'y' ? style.overflowY : style.overflowX;
    if (/(auto|scroll)/.test(overflow) && (axis === 'y' ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth)) return node;
  }
  return null;
}

let installed = 0, cleanup: (() => void) | null = null;
/** Installs the document listeners once per page (ref-counted for multiple providers). */
export function installDragPolish(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (installed++ === 0) {
    let marked: Element | null = null, source: HTMLElement | null = null;
    const unmark = () => { marked?.removeAttribute('data-drop-state'); marked = null; };
    const end = () => { unmark(); source?.classList.remove('wf-drag-source'); source = null; document.body.classList.remove('wf-dnd-active'); };
    const start = (event: DragEvent) => {
      const row = (event.target as Element | null)?.closest?.('[data-dnd-row]') as HTMLElement | null;
      if (!row || !event.dataTransfer) return;
      // Lift the whole row as the drag image (not just the handle); fade the origin after the image is taken.
      const rect = row.getBoundingClientRect();
      try { event.dataTransfer.setDragImage(row, Math.min(Math.max(0, event.clientX - rect.left), rect.width), Math.min(Math.max(0, event.clientY - rect.top), rect.height)); } catch { /* keep the default image */ }
      source = row; setTimeout(() => { if (source === row) row.classList.add('wf-drag-source'); document.body.classList.add('wf-dnd-active'); }, 0);
    };
    const over = (event: DragEvent) => {
      const types = [...(event.dataTransfer?.types ?? [])];
      const mark = resolveDropTarget(event.composedPath().filter((item): item is Element => item instanceof Element), types);
      if (mark?.element !== marked) unmark();
      if (mark) { marked = mark.element; mark.element.setAttribute('data-drop-state', mark.state); }
      const target = event.target as Element | null, y = scrollParent(target, 'y'), x = scrollParent(target, 'x');
      if (y) { const r = y.getBoundingClientRect(), step = edgeStep(event.clientY, r.top, r.bottom); if (step) y.scrollBy(0, step); }
      else { const step = edgeStep(event.clientY, 0, window.innerHeight); if (step) window.scrollBy(0, step); }
      if (x) { const r = x.getBoundingClientRect(), step = edgeStep(event.clientX, r.left, r.right); if (step) x.scrollBy(step, 0); }
    };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) unmark(); };
    document.addEventListener('dragstart', start, true);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', end, true);
    document.addEventListener('dragend', end, true);
    cleanup = () => { end(); document.removeEventListener('dragstart', start, true); document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', end, true); document.removeEventListener('dragend', end, true); };
  }
  return () => { if (--installed === 0) { cleanup?.(); cleanup = null; } };
}

/**
 * Smooth settle after a reorder: children marked data-flip-id animate from their previous position (FLIP, transform
 * only). Positions are relative to the container, so page scrolling never animates. Honors reduced motion.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, signature: string) {
  const positions = useRef(new Map<string, { top: number; left: number }>());
  useLayoutEffect(() => {
    const root = ref.current; if (!root) return;
    const origin = root.getBoundingClientRect(), next = new Map<string, { top: number; left: number }>();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach(element => {
      const rect = element.getBoundingClientRect(), id = element.dataset.flipId!, now = { top: rect.top - origin.top, left: rect.left - origin.left };
      const before = positions.current.get(id);
      if (before && !reduced && typeof element.animate === 'function' && (before.top !== now.top || before.left !== now.left))
        element.animate([{ transform: `translate(${before.left - now.left}px, ${before.top - now.top}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
      next.set(id, now);
    });
    positions.current = next;
  }, [ref, signature]);
}

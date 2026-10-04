"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
export const PanelContext = createContext<{
  setDirty: (dirty: boolean) => void;
  drawer?: boolean;
}>({ setDirty: () => {} });
export function MoneyPanel({
  title,
  children,
  onClose,
  trackDirty = true,
  status,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Autosaving editors report their own unsaved state instead of "any change is dirty". */
  trackDirty?: boolean;
  status?: ReactNode;
}) {
  const { setDirty, drawer } = useContext(PanelContext),
    ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    if (drawer) { ref.current?.focus(); document.body.style.overflow = "hidden"; }
    return () => {
      if (drawer) document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [drawer]);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="money-dock"
      role={drawer ? "dialog" : "complementary"}
      aria-modal={drawer || undefined}
      aria-label={title}
      onChangeCapture={() => {
        if (trackDirty) setDirty(true);
      }}
      onKeyDown={(e) => {
        if ((e.target as Element).closest("dialog")) return;
        if (drawer && e.key === "Tab") {
          const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(node=>node.getClientRects().length);
          const first=items[0],last=items.at(-1);
          if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}
          else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first?.focus();}
        }
        if (!e.defaultPrevented && e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <p className="money-eyebrow">MONEY SYS</p>
          <h2>{title}</h2>
          {status}
        </div>
        <button type="button" aria-label="패널 닫기" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="money-dock-body">{children}</div>
    </aside>
  );
}

/** Desktop placeholder that keeps the workbench layout stable while no row is selected. */
export function MoneyIdlePanel({ title, text }: { title: string; text: string }) {
  return (
    <aside className="money-dock money-dock-idle" aria-label={title}>
      <header>
        <div>
          <p className="money-eyebrow">MONEY SYS</p>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="money-dock-body">
        <p className="money-muted">{text}</p>
      </div>
    </aside>
  );
}

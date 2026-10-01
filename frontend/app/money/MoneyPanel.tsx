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
  const { setDirty } = useContext(PanelContext),
    ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="money-dock"
      role="complementary"
      aria-label={title}
      onChangeCapture={() => {
        if (trackDirty) setDirty(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
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

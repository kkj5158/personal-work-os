"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type NavigationOption = { id: string; label: string; href: string; active?: boolean; description?: string };
/** Shared pointer, touch and keyboard behavior for both Space and system menus. */
export function NavigationMenu({ label, children, options, onNavigate, className = "" }: {
  label: string; children: ReactNode; options: readonly NavigationOption[];
  onNavigate: (href: string, newTab: boolean) => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last" | "active">("active");
  const id = useId();
  function close(focus = false) { setOpen(false); if (focus) trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitemradio"]') ?? []);
    (initialFocus.current === "last" ? items.at(-1) : initialFocus.current === "first" ? items[0] : items.find(item => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function select(event: MouseEvent<HTMLAnchorElement>, option: NavigationOption) {
    // Shift-click and middle click retain the browser's ordinary new-window/tab semantics.
    if (event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); close(true);
    if (!option.active || event.ctrlKey || event.metaKey) onNavigate(option.href, event.ctrlKey || event.metaKey);
  }
  return <div ref={host} className={`pos-navigation-menu ${className}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { initialFocus.current = "active"; setOpen(!open); }}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); initialFocus.current = event.key === "ArrowUp" ? "last" : "first"; setOpen(true); } }}>
      {children}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div ref={menu} id={id} role="menu" aria-label={label} className="pos-navigation-options" onKeyDown={event => {
      const items = Array.from(menu.current!.querySelectorAll<HTMLAnchorElement>('[role="menuitemradio"]'));
      const index = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key.length === 1 && event.key !== " ") {
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        ordered.find(item => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
      }
    }}>
      {options.map(option => <a key={option.id} role="menuitemradio" aria-checked={!!option.active} href={option.href} tabIndex={-1} onClick={event => select(event, option)} onKeyDown={event => { if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}>
        <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.active && <Check size={15} aria-hidden="true" />}
      </a>)}
    </div>}
  </div>;
}

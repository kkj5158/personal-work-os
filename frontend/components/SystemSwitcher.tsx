"use client";

import { useState } from "react";
import { BriefcaseBusiness, NotebookPen, CalendarDays, ChevronDown, Check } from "lucide-react";

const systems = [
  { name: "WORK OS", href: "/worklog", Icon: BriefcaseBusiness },
  { name: "NOTE SYS", href: "/notes", Icon: NotebookPen },
  { name: "Calendar", href: "/calendar", Icon: CalendarDays },
] as const;

/** Shared shell grammar from dev, with Calendar as the third system. */
export function SystemSwitcher({ system, compact = false, onNavigate, onOpen }: {
  system: typeof systems[number]["name"];
  compact?: boolean;
  onNavigate: (href: string) => void | Promise<void>;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { Icon } = systems.find(item => item.name === system)!;
  return <div className="app-system-switcher" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
    <button className="app-system-button" type="button" aria-label="시스템 전환" aria-expanded={open} title={compact ? `${system} · 시스템 전환` : undefined}
      onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>
      <Icon size={23} strokeWidth={1.75} aria-hidden="true" />
      {!compact && <><strong>{system}</strong><ChevronDown size={14} aria-hidden="true" /></>}
    </button>
    {open && <nav className="app-system-menu" aria-label="시스템 선택">
      {systems.map(({ name, href, Icon: RowIcon }) => <button className="app-system-button" key={name} type="button"
        aria-current={name === system ? "page" : undefined} onClick={() => {
          setOpen(false);
          if (name !== system) { void onNavigate(href); }
        }}>
        <RowIcon size={20} strokeWidth={1.75} aria-hidden="true" /><span>{name}</span>
        {name === system && <Check size={15} aria-hidden="true" />}
      </button>)}
    </nav>}
  </div>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  NotebookPen,
  CalendarDays,
  ChevronDown,
  Check,
} from "lucide-react";

const systems = [
  { name: "WORK OS", href: "/worklog", Icon: BriefcaseBusiness },
  { name: "NOTE SYS", href: "/notes", Icon: NotebookPen },
  { name: "Calendar", href: "/calendar", Icon: CalendarDays },
] as const;

export type SystemName = (typeof systems)[number]["name"];

export function SystemSwitcher({
  system = "WORK OS",
  beforeNavigate,
  navigate,
  compact = false,
}: {
  system?: SystemName;
  beforeNavigate?: () => Promise<void>;
  /** Replaces the default push when the host owns its own leave guard (Calendar's unsaved Actual editor). */
  navigate?: (href: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { Icon } = systems.find((item) => item.name === system)!;
  return (
    <div
      className="app-system-switcher"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="시스템 전환"
        aria-expanded={open}
        title={compact ? `${system} · 시스템 전환` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Icon size={23} strokeWidth={1.75} />
        {!compact && <><strong>{system}</strong><ChevronDown size={14} /></>}
      </button>
      {open && (
        <div className="app-system-menu">
          {systems.map(({ name, href, Icon: RowIcon }) => (
            <button
              key={name}
              type="button"
              aria-current={name === system ? "true" : undefined}
              onClick={async () => {
                if (name !== system) {
                  if (navigate) {
                    setOpen(false);
                    navigate(href);
                    return;
                  }
                  await beforeNavigate?.();
                  router.push(href);
                }
                setOpen(false);
              }}
            >
              <RowIcon size={20} />
              <span>{name}</span>
              {name === system && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

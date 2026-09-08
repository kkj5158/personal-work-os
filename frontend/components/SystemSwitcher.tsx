"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  NotebookPen,
  ChevronDown,
  Check,
} from "lucide-react";

export function SystemSwitcher({
  system = "WORK OS",
  beforeNavigate,
  compact = false,
}: {
  system?: "WORK OS" | "NOTE SYS";
  beforeNavigate?: () => Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const Icon = system === "WORK OS" ? BriefcaseBusiness : NotebookPen;
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
          {(["WORK OS", "NOTE SYS"] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-current={name === system ? "true" : undefined}
              onClick={async () => {
                if (name !== system) {
                  await beforeNavigate?.();
                  router.push(name === "WORK OS" ? "/worklog" : "/notes");
                }
                setOpen(false);
              }}
            >
              {name === "WORK OS" ? <BriefcaseBusiness size={20} /> : <NotebookPen size={20} />}
              <span>{name}</span>
              {name === system && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  NotebookPen,
  ChevronDown,
  Check,
} from "lucide-react";

export function SystemSwitcher({
  system = "WORK OS",
  beforeNavigate,
}: {
  system?: "WORK OS" | "NOTE SYS";
  beforeNavigate?: () => Promise<void>;
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
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Icon size={18} />
        {system}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="app-system-menu">
          {(["WORK OS", "LIFE OS", "NOTE SYS"] as const).map((name) => (
            <button
              key={name}
              type="button"
              disabled={name === "LIFE OS"}
              onClick={async () => {
                if (name !== system) {
                  await beforeNavigate?.();
                  router.push(name === "WORK OS" ? "/worklog" : "/notes");
                }
                setOpen(false);
              }}
            >
              {name}
              {name === "LIFE OS" ? (
                " · 준비 중"
              ) : name === system ? (
                <Check size={15} />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function WorkSystemHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/notes") || pathname === "/login") return null;
  return (
    <header className="app-work-header">
      <SystemSwitcher />
    </header>
  );
}

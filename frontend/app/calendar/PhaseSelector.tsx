"use client";

import { useMemo, useState } from "react";
import type { PhaseWithProjectDto } from "@/lib/api/types";

interface PhaseSelectorProps {
  phases: PhaseWithProjectDto[];
  value: string | null;
  onChange: (phaseId: string | null) => void;
}

/** One searchable Phase selector (never a mandatory Project -> Phase
 *  two-step) — options grouped under Project headings, searchable by both
 *  Project and Phase text, with an explicit "Phase 지정 안 함" clear option. */
export function PhaseSelector({ phases, value, onChange }: PhaseSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = phases.find((p) => p.id === value) ?? null;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? phases.filter((p) => p.title.toLowerCase().includes(q) || p.projectName.toLowerCase().includes(q))
      : phases;
    const byProject = new Map<string, { projectName: string; phases: PhaseWithProjectDto[] }>();
    for (const phase of filtered) {
      const bucket = byProject.get(phase.projectId);
      if (bucket) bucket.phases.push(phase);
      else byProject.set(phase.projectId, { projectName: phase.projectName, phases: [phase] });
    }
    return Array.from(byProject.values());
  }, [phases, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-left text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {selected ? (
          <span className="flex flex-col leading-tight">
            <span className="truncate">{selected.title}</span>
            <span className="truncate text-[11px] text-zinc-400">{selected.projectName}</span>
          </span>
        ) : (
          <span className="text-zinc-400">Phase 지정 안 함</span>
        )}
        <span className="text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Project 또는 Phase 검색"
            className="w-full border-b border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
              className="w-full px-2.5 py-1.5 text-left text-sm text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Phase 지정 안 함
            </button>
            {grouped.map((group) => (
              <div key={group.projectName}>
                <div className="px-2.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {group.projectName}
                </div>
                {group.phases.map((phase) => (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => {
                      onChange(phase.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-sm text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className="truncate">{phase.title}</span>
                    <span className="text-[11px] text-zinc-400">
                      {phase.startDate} ~ {phase.endDate}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 && <p className="px-2.5 py-2 text-xs text-zinc-400">검색 결과가 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

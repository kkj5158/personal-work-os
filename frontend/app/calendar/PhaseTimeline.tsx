"use client";

import type { PhaseWithProjectDto } from "@/lib/api/types";
import { colorForProjectToken } from "@/lib/calendarColor";

interface PhaseTimelineProps {
  phases: PhaseWithProjectDto[];
  rangeStart: Date;
  rangeEnd: Date;
  selectedDate: Date;
}

/** Compact date-first Project/Phase timeline (locked V1 policy §14) —
 *  answers "which Phase period am I in on this date" at a glance. NOT a
 *  Project-management editing surface: one Project row + its relevant
 *  Phase row(s), overflow collapsed, no verbose metadata. */
export function PhaseTimeline({ phases, rangeStart, rangeEnd, selectedDate }: PhaseTimelineProps) {
  if (phases.length === 0) {
    return null;
  }

  const byProject = new Map<string, { projectName: string; colorToken: string; phases: PhaseWithProjectDto[] }>();
  for (const phase of phases) {
    const bucket = byProject.get(phase.projectId);
    if (bucket) bucket.phases.push(phase);
    else byProject.set(phase.projectId, { projectName: phase.projectName, colorToken: phase.projectColorToken, phases: [phase] });
  }

  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
  const selectedOffset = Math.round((selectedDate.getTime() - rangeStart.getTime()) / 86400000);
  const selectedPct = clampPct((selectedOffset / totalDays) * 100);

  function positionFor(date: string): number {
    const d = new Date(date + "T00:00:00");
    const offset = (d.getTime() - rangeStart.getTime()) / 86400000;
    return clampPct((offset / totalDays) * 100);
  }
  function widthFor(start: string, end: string): number {
    const s = positionFor(start);
    const e = positionFor(end) + 100 / totalDays; // include end day
    return Math.max(clampPct(e) - s, 2);
  }
  function clampPct(pct: number): number {
    return Math.min(Math.max(pct, 0), 100);
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-zinc-900 dark:bg-zinc-100" style={{ left: `${selectedPct}%` }} />
        {Array.from(byProject.values())
          .slice(0, 3)
          .map((group) => {
            const color = colorForProjectToken(group.colorToken);
            const visiblePhases = group.phases.slice(0, 2);
            const overflow = group.phases.length - visiblePhases.length;
            return (
              <div key={group.projectName} className="flex items-center gap-2 py-0.5 text-[11px]">
                <span className="w-24 shrink-0 truncate font-medium text-zinc-600 dark:text-zinc-400">{group.projectName}</span>
                <div className="relative h-5 flex-1">
                  {visiblePhases.map((phase) => (
                    <div
                      key={phase.id}
                      className={`absolute top-0.5 h-4 truncate rounded px-1.5 text-[10px] leading-4 ${color.bg} ${color.text}`}
                      style={{ left: `${positionFor(phase.startDate)}%`, width: `${widthFor(phase.startDate, phase.endDate)}%` }}
                      title={`${phase.title} (${phase.startDate} ~ ${phase.endDate})`}
                    >
                      {phase.title}
                    </div>
                  ))}
                  {overflow > 0 && <span className="absolute right-0 top-0.5 text-[10px] text-zinc-400">+{overflow}</span>}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

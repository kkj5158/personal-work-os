import type { StateGroup } from "@/lib/api/types";
import { colorForCategory } from "@/lib/categoryColor";

export type ColorMode = "PROJECT" | "ACTIVITY";

export interface BlockColor {
  bg: string;
  border: string;
  text: string;
}

// Project color tokens — a small fixed named palette (Project.colorToken),
// distinct from the deterministic per-category hash palette so a Project's
// color stays stable even if the user renames it.
const PROJECT_PALETTE: Record<string, BlockColor> = {
  slate: { bg: "bg-slate-100", border: "border-slate-400", text: "text-slate-900" },
  blue: { bg: "bg-blue-100", border: "border-blue-400", text: "text-blue-900" },
  purple: { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-900" },
  emerald: { bg: "bg-emerald-100", border: "border-emerald-400", text: "text-emerald-900" },
  amber: { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-900" },
  rose: { bg: "bg-rose-100", border: "border-rose-400", text: "text-rose-900" },
  cyan: { bg: "bg-cyan-100", border: "border-cyan-400", text: "text-cyan-900" },
  teal: { bg: "bg-teal-100", border: "border-teal-400", text: "text-teal-900" },
};

export const PROJECT_COLOR_TOKENS = Object.keys(PROJECT_PALETTE);

export function colorForProjectToken(token: string | null | undefined): BlockColor {
  return (token && PROJECT_PALETTE[token]) || PROJECT_PALETTE.slate;
}

// LIFE categories use the same deterministic-hash approach as WORK's
// ActivityCategory (colorForCategory) but a visually distinct palette so
// LIFE blocks never coincidentally match a WORK category's color.
const LIFE_PALETTE: BlockColor[] = [
  { bg: "bg-lime-100", border: "border-lime-400", text: "text-lime-900" },
  { bg: "bg-pink-100", border: "border-pink-400", text: "text-pink-900" },
  { bg: "bg-indigo-100", border: "border-indigo-400", text: "text-indigo-900" },
  { bg: "bg-orange-100", border: "border-orange-400", text: "text-orange-900" },
  { bg: "bg-fuchsia-100", border: "border-fuchsia-400", text: "text-fuchsia-900" },
  { bg: "bg-green-100", border: "border-green-400", text: "text-green-900" },
];

const LIFE_UNCATEGORIZED: BlockColor = { bg: "bg-zinc-100", border: "border-zinc-400", text: "text-zinc-900" };

export function colorForLifeCategory(categoryId: string | null): BlockColor {
  if (!categoryId) return LIFE_UNCATEGORIZED;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  }
  return LIFE_PALETTE[hash % LIFE_PALETTE.length];
}

// Fixed State-group visual semantics (locked V1 policy) — independent of
// the Project/Activity color-mode switch.
export const STATE_COLORS: Record<StateGroup, { bg: string; border: string; text: string; dot: string }> = {
  LOW: { bg: "bg-red-50", border: "border-red-400", text: "text-red-700", dot: "bg-red-500" },
  HIGH: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700", dot: "bg-amber-500" },
  MIXED: { bg: "bg-purple-50", border: "border-purple-400", text: "text-purple-700", dot: "bg-purple-500" },
  UNCLEAR: { bg: "bg-zinc-100", border: "border-zinc-400", text: "text-zinc-600", dot: "bg-zinc-400" },
  STABLE: { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700", dot: "bg-emerald-500" },
};

export const STATE_LABEL_PRESETS: Record<StateGroup, string[]> = {
  LOW: ["무기력", "처짐"],
  HIGH: ["활성 상승", "긴장"],
  MIXED: ["혼재", "전환 구간"],
  UNCLEAR: ["애매모호"],
  STABLE: ["안정"],
};

interface ColorableBlock {
  domainType: "WORK" | "LIFE";
  activityCategoryId?: string | null;
  lifeCategoryId?: string | null;
  phaseId?: string | null;
}

/** Resolves display color for a Plan or Actual block per the current
 *  color-mode switch (shared across Plan/Actual/Compare — locked policy). */
interface MinimalPhase {
  id: string;
  projectId: string;
}
interface MinimalProject {
  id: string;
  colorToken: string;
}

export function resolveBlockColor(
  block: ColorableBlock,
  mode: ColorMode,
  context: { phases: MinimalPhase[]; projects: MinimalProject[] }
): BlockColor {
  if (mode === "PROJECT") {
    if (block.domainType === "WORK" && block.phaseId) {
      const phase = context.phases.find((p) => p.id === block.phaseId);
      const project = phase ? context.projects.find((p) => p.id === phase.projectId) : undefined;
      if (project) return colorForProjectToken(project.colorToken);
    }
    // WORK without Project/Phase: neutral fallback. LIFE stays legible via
    // its own category fallback rather than being mistaken for a Project.
    if (block.domainType === "LIFE") {
      return colorForLifeCategory(block.lifeCategoryId ?? null);
    }
    return PROJECT_PALETTE.slate;
  }

  // ACTIVITY mode
  if (block.domainType === "WORK") {
    return colorForCategory(block.activityCategoryId ?? null);
  }
  return colorForLifeCategory(block.lifeCategoryId ?? null);
}

import type { ActualSourceType } from "@/lib/api/types";

/** The shape TimeGrid renders — Plan and Actual blocks are both normalized
 *  into this before reaching the grid, so the grid itself never needs to
 *  know which domain source a block came from. */
export interface GridBlock {
  id: string;
  /** Present for Actual blocks only — identifies which domain record owns this block. */
  sourceType?: ActualSourceType;
  title: string;
  startAt: string; // yyyy-MM-ddTHH:mm:ss, naive local
  endAt: string;
  domainType: "WORK" | "LIFE";
  activityCategoryId: string | null;
  lifeCategoryId: string | null;
  phaseId: string | null;
  memo: string | null;
}

/** One computed lane-packed layout slot for a block within its day column. */
export interface LaidOutBlock {
  block: GridBlock;
  laneIndex: number;
  laneCount: number;
}

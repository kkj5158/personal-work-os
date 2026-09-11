import { minutesFromMidnight, parseLocalDateTime } from "@/lib/date";
import type { GridBlock, LaidOutBlock } from "./gridTypes";

interface Interval {
  block: GridBlock;
  startMin: number;
  endMin: number;
}

/**
 * Lane-packs one day's blocks so overlapping blocks split into side-by-side
 * lanes only for their actual overlapping interval — a block with no
 * overlap anywhere keeps full width (locked V1 Planning-overlap policy).
 * Standard connected-component + greedy-interval-lane algorithm: blocks are
 * grouped into overlap clusters (transitively connected by pairwise
 * overlap), each cluster gets its own lane count = the max concurrent
 * overlap within it, and every block in that cluster renders at that lane
 * width — a block that overlaps nobody is its own one-block, one-lane
 * cluster and renders full width.
 */
export function layoutDayLanes(blocks: GridBlock[]): LaidOutBlock[] {
  const intervals: Interval[] = blocks
    .map((block) => ({
      block,
      startMin: minutesFromMidnight(parseLocalDateTime(block.startAt)),
      endMin: minutesFromMidnight(parseLocalDateTime(block.startAt)) + (parseLocalDateTime(block.endAt).getTime() - parseLocalDateTime(block.startAt).getTime()) / 60000,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters: Interval[][] = [];
  let current: Interval[] = [];
  let currentMaxEnd = -Infinity;

  for (const interval of intervals) {
    if (current.length > 0 && interval.startMin >= currentMaxEnd) {
      clusters.push(current);
      current = [];
      currentMaxEnd = -Infinity;
    }
    current.push(interval);
    currentMaxEnd = Math.max(currentMaxEnd, interval.endMin);
  }
  if (current.length > 0) clusters.push(current);

  const result: LaidOutBlock[] = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const laneOf = new Map<Interval, number>();
    for (const interval of cluster) {
      let lane = laneEnds.findIndex((end) => end <= interval.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(interval.endMin);
      } else {
        laneEnds[lane] = interval.endMin;
      }
      laneOf.set(interval, lane);
    }
    const laneCount = laneEnds.length;
    for (const interval of cluster) {
      result.push({ block: interval.block, laneIndex: laneOf.get(interval)!, laneCount });
    }
  }

  return result;
}


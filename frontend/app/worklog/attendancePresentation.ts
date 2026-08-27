// Single source of truth for attendance-status color presentation (v3 UI
// polish batch) — every screen that shows an attendance color (donut,
// badges, the attendance Select, record-detail values) reads from this one
// map instead of maintaining its own hue mapping. Distinct from the generic
// success/warning/danger semantic tokens in theme.css: those stay reserved
// for actual positive/caution/negative meaning elsewhere in the app, not
// attendance categories specifically (spec: don't reuse generic green for
// 근무 or red for every option).
//
// `미입력` is aggregation-only (never a selectable AttendanceStatus — see
// mockData.ts's ATTENDANCE_STATUSES) but still needs a color for the
// monthly donut, so this map is keyed by the wider `DonutCategory` rather
// than `AttendanceStatus`.

import type { AttendanceStatus } from "./mockData";

export type DonutCategory = AttendanceStatus | "미입력";

interface AttendancePresentation {
  /** SVG stroke/fill and small status-dot color — used as-is for the donut
   *  segments/legend/tooltip swatches. */
  base: string;
  /** Strong, readable text color for badges, the Select trigger/options,
   *  and record-detail attendance values. */
  strong: string;
  /** Very pale tint of `base`, for badge/Select backgrounds. */
  pale: string;
  /** A restrained (lighter-than-`base`) border tone pairing with `pale`. */
  border: string;
}

const BASE_COLORS: Record<DonutCategory, string> = {
  근무: "#5B8DEF",
  휴일: "#A7AFBA",
  연차: "#8FBC7A",
  병가: "#B86B77",
  조퇴: "#E58B8B",
  // Deliberately the strongest/darkest tone here — distinct from both 조퇴
  // (a lighter red) and 미입력 (a neutral gray), since 결근 is a real,
  // persisted attendance outcome, not just "nothing recorded yet".
  결근: "#8B3A3A",
  미입력: "#D8DDE4",
};

// Approved strong text colors (dark enough for body text on a pale
// background) — deliberately not derived from `base` since a readable text
// shade and a vivid chart-segment shade are different design constraints.
const STRONG_TEXT_COLORS: Record<AttendanceStatus, string> = {
  근무: "#2F6FD6",
  휴일: "#57606A",
  연차: "#4F7D45",
  병가: "#8F3D4B",
  조퇴: "#C74F55",
  결근: "#6B2C2C",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(clampChannel(n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampChannel(n: number): number {
  return Math.min(255, Math.max(0, n));
}

// Mixes `hex` toward white by `whiteRatio` (0 = unchanged, 1 = pure white) —
// used once at module load to derive the badge/Select pale background and
// border tones directly from each status's own `base` color, so the two
// always stay visually related without hand-picking six more hex values.
function tintTowardWhite(hex: string, whiteRatio: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * whiteRatio, g + (255 - g) * whiteRatio, b + (255 - b) * whiteRatio);
}

export const ATTENDANCE_PRESENTATION: Record<DonutCategory, AttendancePresentation> = Object.fromEntries(
  (Object.keys(BASE_COLORS) as DonutCategory[]).map((key) => [
    key,
    {
      base: BASE_COLORS[key],
      strong: key === "미입력" ? "#6E7781" : STRONG_TEXT_COLORS[key],
      pale: tintTowardWhite(BASE_COLORS[key], 0.86),
      border: tintTowardWhite(BASE_COLORS[key], 0.55),
    },
  ]),
) as Record<DonutCategory, AttendancePresentation>;

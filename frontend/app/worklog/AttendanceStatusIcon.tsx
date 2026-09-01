import { AlertIcon, BriefcaseIcon, SmileyFrownIcon } from "@primer/octicons-react";
import type { AttendanceStatus } from "./mockData";

// Clean UI-illustration icons for the Monthly Attendance Summary cards —
// deliberately not platform emoji glyphs. Reuses @primer/octicons-react
// where a suitable glyph already exists (근무/조퇴/결근); the remaining four
// (반차/연차/병가/휴일) have no octicon equivalent for "half-circle" /
// "clover" / "pill" / "power-off", so those are small hand-rolled inline
// SVGs instead of a new icon-library dependency — consistent with this
// app's existing "hand-rolled SVG for anything the chart/icon libraries
// don't cover" convention (see DailyWorkChart.tsx et al).
export function AttendanceStatusIcon({ status, size = 24 }: { status: AttendanceStatus; size?: number }) {
  switch (status) {
    case "근무":
      return <BriefcaseIcon size={size} aria-hidden="true" />;
    case "조퇴":
      return <SmileyFrownIcon size={size} aria-hidden="true" />;
    case "결근":
      return <AlertIcon size={size} aria-hidden="true" />;
    case "반차":
      return <HalfCircleIcon size={size} />;
    case "연차":
      return <CloverIcon size={size} />;
    case "병가":
      return <PillIcon size={size} />;
    case "휴일":
      return <PowerIcon size={size} />;
    default:
      return null;
  }
}

function HalfCircleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
    </svg>
  );
}

function CloverIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.4" cy="5.4" r="2.6" fill="currentColor" />
      <circle cx="10.6" cy="5.4" r="2.6" fill="currentColor" />
      <circle cx="5.4" cy="10.6" r="2.6" fill="currentColor" />
      <circle cx="10.6" cy="10.6" r="2.6" fill="currentColor" />
      <path d="M8 8v6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PillIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="5.5" width="13" height="5" rx="2.5" transform="rotate(-30 8 8)" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.4l1.6 5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PowerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M4.5 4.3a5.5 5.5 0 1 0 7 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

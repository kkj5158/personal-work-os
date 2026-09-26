import { seoul } from "./model";
export type Preset = "week" | "month" | "quarter" | "half" | "year" | "custom";
export type Period = { preset: Preset; from: string; to: string };
const date = (s: string) => new Date(s + "T12:00:00Z");
const format = (d: Date) => d.toISOString().slice(0, 10);
function days(s: string, n: number) {
  const d = date(s);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}
function months(s: string, n: number) {
  const d = date(s),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return format(d);
}
export function presetPeriod(
  preset: Exclude<Preset, "custom">,
  today = seoul(new Date().toISOString()).slice(0, 10),
): Period {
  const d = date(today);
  let from = today,
    to = today;
  if (preset === "week") {
    from = days(today, -((d.getUTCDay() + 6) % 7));
    to = days(from, 6);
  } else if (preset === "month" || preset === "quarter") {
    const m =
      preset === "quarter"
        ? Math.floor(d.getUTCMonth() / 3) * 3
        : d.getUTCMonth();
    from = format(new Date(Date.UTC(d.getUTCFullYear(), m, 1)));
    to = days(months(from, preset === "quarter" ? 3 : 1), -1);
  } else from = days(months(today, preset === "half" ? -6 : -12), 1);
  return { preset, from, to };
}
export function shiftPeriod(p: Period, direction: -1 | 1): Period {
  if (p.preset === "custom") {
    const span =
      Math.round((date(p.to).getTime() - date(p.from).getTime()) / 86400000) +
      1;
    return {
      ...p,
      from: days(p.from, direction * span),
      to: days(p.to, direction * span),
    };
  }
  if (p.preset === "week")
    return {
      ...p,
      from: days(p.from, direction * 7),
      to: days(p.to, direction * 7),
    };
  const unit =
    p.preset === "month"
      ? 1
      : p.preset === "quarter"
        ? 3
        : p.preset === "half"
          ? 6
          : 12;
  const from = months(p.from, direction * unit),
    to =
      p.preset === "month" || p.preset === "quarter"
        ? days(months(from, unit), -1)
        : months(p.to, direction * unit);
  return { ...p, from, to };
}

import { daysFor } from "../life-calendar/model";
import { localParts, type Session, type Nap } from "./model";

const positive = (minutes: number | null) => minutes != null && Number.isFinite(minutes) && minutes > 0;
const validInterval = (start: string | null, end: string | null) => !!start && !!end && Number.isFinite(Date.parse(start)) && Date.parse(end) > Date.parse(start);
/** Canonical records only. Visibility toggles and local drafts never redefine eligibility. */
export function weeklyAnalytics(date: string, sessions: Session[], naps: Nap[], serverNow: string) {
  const days = daysFor(date, "week", true), today = localParts(serverNow, "Asia/Seoul").date;
  const eligibleDays = days.filter(day => day <= today), eligible = new Set(eligibleDays);
  const main = sessions.filter(s => eligible.has(s.logicalWakeDate ?? s.expectedWakeDate) && s.status === "CLOSED" && !s.excludedAt && positive(s.intervalMinutes) && validInterval(s.bedtimeIntentAt, s.wakeAt));
  const nap = naps.filter(n => eligible.has(n.startLocalDate) && positive(n.intervalMinutes) && validInterval(n.startAt, n.endAt));
  return {
    from: days[0], to: days[6], eligibleDays: eligibleDays.length,
    meanSleep: main.length ? main.reduce((sum, s) => sum + s.intervalMinutes!, 0) / main.length : null,
    napFrequency: eligibleDays.length ? nap.length / eligibleDays.length : null,
    meanNap: nap.length ? nap.reduce((sum, n) => sum + n.intervalMinutes, 0) / nap.length : null,
    days: days.map(day => {
      const m = main.filter(s => (s.logicalWakeDate ?? s.expectedWakeDate) === day), n = nap.filter(n => n.startLocalDate === day);
      return { date: day, future: day > today, sleep: m.length ? m.reduce((sum, s) => sum + s.intervalMinutes!, 0) : null, nap: n.length ? n.reduce((sum, n) => sum + n.intervalMinutes, 0) : null };
    }),
  };
}

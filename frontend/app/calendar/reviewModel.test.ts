import assert from "node:assert/strict";
import { test } from "node:test";
import {
  monthDates,
  weekStart,
  shiftMonth,
  weeklyMetrics,
  average,
  workDuration,
} from "./reviewModel";
import type { DayMetrics } from "@/lib/api/calendarReviews";
import { civilDuration, civilMinute } from "./gridClock";
test("Seoul wall-clock geometry remains exact across browser DST and midnight", () => {
  assert.equal(
    civilDuration("2026-03-08T01:00:00", "2026-03-08T03:00:00"),
    120,
  );
  assert.equal(civilMinute("2026-10-25T00:00:00", "2026-10-24"), 1440);
  assert.equal(
    civilDuration("2026-12-31T23:00:00", "2027-01-01T01:00:00"),
    120,
  );
});
test("Monday month grids have exactly 4, 5 or 6 full weeks including leap/year boundaries", () => {
  assert.equal(monthDates("2021-02-15").length, 28);
  assert.equal(monthDates("2026-10-24").length, 35);
  assert.equal(monthDates("2026-11-24").length, 42);
  assert.equal(monthDates("2024-02-29").at(-1), "2024-03-03");
  assert.equal(monthDates("2026-10-24")[0], "2026-09-28");
  assert.equal(monthDates("2026-10-24").at(-1), "2026-11-01");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.equal(shiftMonth("2026-12-31", 1), "2027-01-01");
});
test("averages exclude missing, include zero and keep manually entered weekly scores independent", () => {
  assert.deepEqual(average([null, undefined]), { value: null, count: 0 });
  assert.deepEqual(average([0, 100, null]), { value: 50, count: 2 });
  const days: DayMetrics[] = [
    {
      date: "2026-09-28",
      workMinutes: 90,
      workScore: 0,
      reflection: {
        date: "2026-09-28",
        title: "",
        memo: "",
        status: "EDITING",
        version: 0,
        score: 0,
        mood: 1,
      },
    },
    {
      date: "2026-10-04",
      workMinutes: 30,
      workScore: 100,
      reflection: {
        date: "2026-10-04",
        title: "",
        memo: "",
        status: "EDITING",
        version: 0,
        score: 100,
        mood: 5,
      },
    },
    { date: "2026-10-05", workMinutes: 500, workScore: 90, reflection: null },
  ];
  const m = weeklyMetrics(days, "2026-09-28");
  assert.deepEqual(m.work, { value: 120, count: 2 });
  assert.equal(m.workScore.value, 50);
  assert.equal(m.mood.value, 3);
  assert.equal(m.score.value, 50);
  assert.equal(weeklyMetrics([], "2026-09-28").work.value, null);
  assert.equal(workDuration(null), "—");
  assert.equal(workDuration(0), "00h 00m");
  assert.equal(workDuration(432), "07h 12m");
});

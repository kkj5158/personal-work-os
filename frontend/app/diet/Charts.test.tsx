import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { weightAnalytics } from "@/lib/diet/weightAnalytics";
import type { DietData } from "@/lib/diet/types";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
// Load the shared renderer without its browser-only stylesheet.
const { WeightChart } = require("./Charts") as typeof import("./Charts");
Object.assign(globalThis, { React });
const data: DietData = { days: [{ date: "2026-09-01", targetWeight: 103 }, { date: "2026-09-30", targetWeight: 97 }], items: [], checks: [], challenges: [], milestones: [], settings: {}, goals: (["WEEKLY", "MONTHLY"] as const).flatMap((kind, i) => [{ id: `${i}a`, kind, targetDate: "2026-09-01", targetWeight: 102 - i, core: "", memoItems: [] }, { id: `${i}b`, kind, targetDate: "2026-09-30", targetWeight: 96 - i, core: "", memoItems: [] }]) };

test("shared chart connects three dated targets and retains horizontal references in clipped periods", () => {
  for (const [start, end] of [[undefined, undefined], ["2026-09-08", "2026-09-14"], ["2026-08-18", "2026-09-14"], ["2026-09-01", "2026-09-30"], ["2026-09-10", "2026-09-23"]]) {
    const doc = new JSDOM(renderToStaticMarkup(<WeightChart data={data} start={start} end={end} />)).window.document;
    for (const color of ["#b97d45", "#4d8a79", "#927aa9"]) {
      const path = doc.querySelector(`path[stroke="${color}"]`)!;
      assert.ok(path.getAttribute("d")?.includes("L"), `connected trajectory ${color}`);
      assert.equal(path.hasAttribute("stroke-dasharray"), false);
    }
    const references = [...doc.querySelectorAll('line[stroke-dasharray="6 5"]')];
    assert.equal(references.length, 2);
    for (const line of references) assert.equal(line.getAttribute("y1"), line.getAttribute("y2"));
  }
});

test("target trajectories do not extrapolate beyond dated history", () => {
  const chart = weightAnalytics(data, "2026-10-01", "2026-10-07");
  for (const series of chart.series.filter(s => "targetTrend" in s && s.targetTrend)) assert.ok(series.values.every(v => v === null));
});


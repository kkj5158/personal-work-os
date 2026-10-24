import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarViews, calendarSurfaceQuery } from "./CalendarViews";
import { tabTarget } from "../../lib/globalTabs";
test("three internal views keep Calendar date/filter/timetable state and same path",()=>{
 const q="date=2026-10-24&view=week&mode=actual&timetable=12345678-1234-1234-1234-123456789abc";
 const sleep=calendarSurfaceQuery(q,"sleep");assert.equal(new URL(sleep,"http://localhost").pathname,"/calendar");assert.match(sleep,/tab=sleep/);assert.match(sleep,/mode=actual/);assert.match(sleep,/view=week/);assert.match(sleep,/date=2026-10-24/);assert.match(sleep,/timetable=1234/);
 assert.equal(calendarSurfaceQuery(sleep.split("?")[1],"calendar"),`/calendar?${q}`);
 assert.match(tabTarget(sleep)!.route,/tab=sleep/);
 const html=renderToStaticMarkup(<CalendarViews current="sleep" onChange={()=>{}}/>);assert.ok(html.indexOf("일 / 주 캘린더")<html.indexOf(">시간표<"));assert.ok(html.indexOf(">시간표<")<html.indexOf("수면 시간표"));assert.equal((html.match(/aria-current="page"/g)??[]).length,1);assert.ok(!html.includes("href="));
});

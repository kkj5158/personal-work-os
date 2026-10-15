import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { FINANCIAL_TTL, type MoneyCache } from "../../lib/money/cache";
import { MoneyDataProvider, useMoneyCache } from "./MoneyDataProvider";
import { useMoneyData } from "./MoneyWebData";

test("calendar opt-out settles idle requests but keeps explicit and foreground revalidation; other MONEY timers remain", async () => {
  const get = moneyApi.get, realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    for (const autoRefresh of [false, true]) {
      const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
      Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
      const timers: { callback: () => void; delay: number }[] = [];
      dom.window.setTimeout = ((callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; }) as typeof dom.window.setTimeout;
      dom.window.clearTimeout = () => {};
      let calls = 0, cache: MoneyCache | undefined;
      moneyApi.get = async <T,>() => ({ value: ++calls }) as T;
      function Probe() { cache = useMoneyCache(); const result = useMoneyData<{ value: number }>("/calendar/pay-calendar?month=2026-10", { autoRefresh }); return <p>{result.data?.value}</p>; }
      const root = createRoot(document.getElementById("root")!);
      try {
        await act(async () => root.render(<MoneyDataProvider><Probe /></MoneyDataProvider>));
        assert.equal(calls, 1);
        assert.equal(timers.length > 0, autoRefresh);
        now += FINANCIAL_TTL + 1;
        if (autoRefresh) { await act(async () => timers[0].callback()); assert.equal(calls, 2, "ordinary MONEY TTL still reloads"); }
        else {
          assert.equal(calls, 1, "elapsed idle time does not issue a calendar request");
          await act(async () => dom.window.dispatchEvent(new dom.window.Event("focus")));
          assert.equal(calls, 2, "foreground checks expired work data");
          await act(async () => cache!.invalidate(key => key.startsWith("/calendar/pay-calendar?")));
          assert.equal(calls, 3, "saved work explicitly refreshes the calendar");
          assert.equal(document.querySelector("p")!.textContent, "3");
        }
      } finally { await act(async () => root.unmount()); dom.window.close(); }
    }
  } finally { moneyApi.get = get; Date.now = realNow; }
});

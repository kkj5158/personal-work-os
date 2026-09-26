import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { moneyApi } from "@/lib/money/model";
import BridgeConnection from "./BridgeConnection";

test("enrollment stays transient, hides on background, and failures are generic", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const originalGet = moneyApi.get, originalPost = moneyApi.post;
  moneyApi.get = async <T,>() => [] as T;
  moneyApi.post = async <T,>() => ({code: "SYNTHETIC-ONE-TIME-CODE", expiresAt: new Date(Date.now()+60000).toISOString()}) as T;
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => { await act(async () => { const b = [...document.querySelectorAll("button")].find(x => x.textContent===text); assert.ok(b); b.click(); await Promise.resolve(); }); };
  try {
    await act(async () => { root.render(<BridgeConnection />); await Promise.resolve(); });
    await click("휴대폰 등록 코드 발급");
    assert.equal((document.querySelector('input[aria-label="일회용 등록 코드"]') as HTMLInputElement).value, "SYNTHETIC-ONE-TIME-CODE");
    await act(async () => { Object.defineProperty(document,"hidden",{configurable:true,value:true}); document.dispatchEvent(new dom.window.Event("visibilitychange")); });
    assert.equal(document.querySelector("input"),null);
    moneyApi.post = async () => { throw Error("PRIVATE ERROR MUST NOT RENDER"); };
    await click("휴대폰 등록 코드 발급");
    assert.ok(document.querySelector("[role=alert]"));
    assert.equal(document.body.textContent?.includes("PRIVATE ERROR"), false);
  } finally { await act(() => root.unmount()); moneyApi.get=originalGet;moneyApi.post=originalPost;dom.window.close(); }
});

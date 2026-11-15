import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Carousel } from "./LogMedia";

test("four-photo carousel shows three desktop / one mobile and steps one image within bounds", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  let mobile = false;
  const listeners = new Set<() => void>();
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_name: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_name: string, fn: () => void) =>
        listeners.delete(fn),
    }),
  });
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/png" },
    });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let expanded = -1;
  try {
    await act(async () => {
      root.render(
        <Carousel
          owner="synthetic"
          profile="profile"
          images={["1", "2", "3", "4"]}
          open={(i) => {
            expanded = i;
          }}
        />,
      );
    });
    const count = () =>
      dom.window.document.querySelector(".media-carousel-count")!.textContent;
    const prev = () =>
      dom.window.document.querySelector<HTMLButtonElement>(
        '[aria-label="이전 사진"]',
      )!;
    const next = () =>
      dom.window.document.querySelector<HTMLButtonElement>(
        '[aria-label="다음 사진"]',
      )!;
    assert.equal(
      dom.window.document.querySelectorAll(".media-slide").length,
      3,
    );
    assert.equal(count(), "1–3 / 4");
    assert.equal(prev().disabled, true);
    await act(async () => {
      next().click();
    });
    assert.equal(count(), "2–4 / 4");
    assert.equal(next().disabled, true);
    await act(async () => {
      mobile = true;
      listeners.forEach((fn) => fn());
    });
    assert.equal(
      dom.window.document.querySelectorAll(".media-slide").length,
      1,
    );
    assert.equal(count(), "2–2 / 4");
    await act(async () => {
      next().click();
    });
    assert.equal(count(), "3–3 / 4");
    await act(async () => {
      dom.window.document
        .querySelector<HTMLButtonElement>(".media-slide")!
        .click();
    });
    assert.equal(expanded, 2);
    await act(async () => {
      next().click();
    });
    assert.equal(count(), "4–4 / 4");
    assert.equal(next().disabled, true);
    await act(async () => {
      prev().click();
    });
    assert.equal(count(), "3–3 / 4");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
  }
});
test("approved 602px feed and original-aspect photo styling remain scoped to LOG", () => {
  const css = readFileSync(new URL("./log.css", import.meta.url), "utf8");
  assert.match(css, /--feed:\s*602px/);
  assert.match(
    css,
    /\.pos-log \.media-slide img\s*\{[^}]*object-fit:\s*contain/,
  );
  assert.match(css, /\.pos-log \.viewer img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(
    css,
    /\.pos-log \.pending-photo img\s*\{\s*object-fit:\s*contain/,
  );
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*1fr\)/);
});

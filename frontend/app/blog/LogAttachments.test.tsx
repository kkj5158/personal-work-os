import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AttachmentEditor,
  useAttachments,
  useFileDrop,
  usePreventFileNavigation,
} from "./LogAttachments";

const photo = (name: string) =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, {
    type: "image/png",
    lastModified: 1,
  });
test("composer/editor attachment interaction supports file drops, picker append, retry, order, cancel and outside-drop protection", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    createImageBitmap: globalThis.createImageBitmap,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    createImageBitmap: async () => ({ width: 1, height: 1, close() {} }),
  });
  let fail = false;
  const reservations: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.endsWith("/images")) {
      const body = JSON.parse(String(init?.body));
      reservations.push(body.id);
      return Response.json({ id: body.id });
    }
    if (path.endsWith("/bytes"))
      return new Response(null, { status: fail ? 503 : 204 });
    if (path.endsWith("/complete")) return Response.json({ ready: true });
    return new Response(new Uint8Array([1]), {
      headers: { "Content-Type": "image/png" },
    });
  };
  function Harness() {
    const [images, change] = useState(["historical"]);
    const queue = useAttachments(
      "synthetic-owner",
      "synthetic-profile",
      images,
      change,
    );
    const drop = useFileDrop((files) => queue.add(files), false);
    usePreventFileNavigation();
    return (
      <>
        <section id="composer" {...drop.handlers}>
          {drop.active && <span>사진을 여기에 놓으세요</span>}
          <AttachmentEditor
            queue={queue}
            owner="synthetic-owner"
            profile="synthetic-profile"
          />
          <input
            type="file"
            multiple
            onChange={(event) =>
              queue.add(Array.from(event.target.files ?? []))
            }
          />
          <button id="publish" disabled={queue.blocked}>
            게시
          </button>
          <button id="cancel" onClick={() => queue.reset(["historical"])}>
            취소
          </button>
          <output>{JSON.stringify(images)}</output>
        </section>
        <div id="outside">outside</div>
      </>
    );
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const dispatch = (
    target: Element | Window,
    type: string,
    files: File[],
    types = ["Files"],
  ) => {
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "dataTransfer", {
      value: { files, types, dropEffect: "none" },
    });
    target.dispatchEvent(event);
    return event;
  };
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  };
  const ids = () =>
    JSON.parse(dom.window.document.querySelector("output")!.textContent!);
  const button = (label: string) =>
    dom.window.document.querySelector<HTMLButtonElement>(
      `[aria-label="${label}"]`,
    )!;
  try {
    await act(async () => root.render(<Harness />));
    const composer = dom.window.document.querySelector("#composer")!;
    assert.deepEqual(ids(), ["historical"]);
    await act(async () => {
      dispatch(composer, "dragenter", [photo("one.png")]);
    });
    assert.match(composer.textContent!, /사진을 여기에 놓으세요/);
    await act(async () => {
      dispatch(composer, "drop", [photo("one.png"), photo("two.png")]);
    });
    await flush();
    assert.equal(ids().length, 3);
    assert.equal(composer.querySelectorAll(".attachment-card").length, 3);
    assert.equal(
      composer.querySelectorAll(".attachment-preview img").length,
      3,
    );
    const input = composer.querySelector("input")!;
    assert.equal(input.multiple, true);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [photo("three.png")],
    });
    await act(async () => {
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await flush();
    assert.equal(ids().length, 4);
    const last = ids()[3];
    await act(async () => button("사진 4 앞으로").click());
    assert.equal(ids()[2], last);
    await act(async () => button("사진 1 제거").click());
    assert.equal(ids().includes("historical"), false);
    await act(async () => {
      dispatch(composer, "drop", [photo("one.png")]);
    });
    assert.match(composer.textContent!, /이미 선택/);
    fail = true;
    await act(async () => {
      dispatch(composer, "drop", [photo("retry.png")]);
    });
    await flush();
    assert.equal(
      composer.querySelector<HTMLButtonElement>("#publish")!.disabled,
      true,
    );
    const reservation = reservations.at(-1);
    fail = false;
    await act(async () => button("사진 4 다시 시도").click());
    await flush();
    assert.equal(reservations.at(-1), reservation);
    assert.equal(
      composer.querySelector<HTMLButtonElement>("#publish")!.disabled,
      false,
    );
    await act(async () =>
      composer.querySelector<HTMLButtonElement>("#cancel")!.click(),
    );
    assert.deepEqual(ids(), ["historical"]);
    const outside = dom.window.document.querySelector("#outside")!;
    assert.equal(
      dispatch(outside, "drop", [photo("outside.png")]).defaultPrevented,
      true,
    );
    assert.equal(
      dispatch(outside, "drop", [], ["text/plain"]).defaultPrevented,
      false,
    );
    assert.deepEqual(ids(), ["historical"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
  }
});

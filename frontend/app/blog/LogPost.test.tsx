import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Post, Profile } from "@/lib/log/api";
import { LogPost } from "./LogPost";

test("inline reorder focus loss and removal stay local until save; cancel preserves post; outside pointer and Tab still autosave", async () => {
  const dom = new JSDOM(
    "<div id='root'></div><div id='outside'>outside surface</div><button id='tab-target'>outside focus</button>",
    { url: "http://localhost" },
  );
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // React is imported before this test installs a document; its legacy input
  // event fallback may call these methods when autoFocus runs in JSDOM.
  Object.assign(dom.window.HTMLElement.prototype, {
    attachEvent() {},
    detachEvent() {},
  });
  const profile: Profile = {
    id: "profile",
    name: "Synthetic",
    handle: "synthetic",
    bio: "",
    avatar: null,
    revision: 1,
  };
  let persisted: Post = {
    id: "post",
    text: "historical text",
    images: ["one", "two", "three", "four"],
    createdAt: Date.now(),
    updatedAt: null,
    revision: 1,
    liked: false,
    saved: false,
    pinned: false,
    archived: false,
    repostedAt: null,
    replies: [],
    replyCount: 0,
  };
  const writes: { images: string[]; text: string; revision: number }[] = [];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") {
      const payload = JSON.parse(String(init.body));
      writes.push(payload);
      persisted = {
        ...persisted,
        ...payload,
        revision: persisted.revision + 1,
      };
      return Response.json(persisted);
    }
    return new Response(new Uint8Array([1]), {
      headers: { "Content-Type": "image/png" },
    });
  };
  function Harness() {
    const [post, update] = useState(persisted);
    return (
      <LogPost
        owner="inline-focus-owner"
        profile={profile}
        post={post}
        update={update}
        remove={() => {}}
        refresh={() => {}}
        notify={() => {}}
        openImage={() => {}}
        setGuard={() => {}}
        beforeChange={async () => true}
      />
    );
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const editor = () => dom.window.document.querySelector(".inline-edit");
  const control = (name: string) =>
    dom.window.document.querySelector<HTMLButtonElement>(
      `[aria-label="${name}"]`,
    )!;
  const begin = async () => {
    await act(async () =>
      dom.window.document.querySelector<HTMLElement>(".post-body")!.click(),
    );
    assert.ok(editor());
  };
  const nullBlur = (target: HTMLElement) =>
    target.dispatchEvent(
      new dom.window.FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: null,
      }),
    );
  try {
    await act(async () => root.render(<Harness />));
    await begin();
    await act(async () => {
      control("사진 2 앞으로").focus();
      control("사진 2 앞으로").click();
    });
    // Moving the focused card to the first position disables its forward button.
    await act(async () => nullBlur(control("사진 1 앞으로")));
    assert.ok(editor());
    assert.equal(writes.length, 0);
    await act(async () => control("사진 3 앞으로").click());
    await act(async () => nullBlur(control("사진 2 앞으로")));
    await act(async () => control("사진 3 제거").click());
    assert.ok(editor());
    assert.equal(writes.length, 0);
    const cancel = Array.from(editor()!.querySelectorAll("button")).find(
      (button) => button.textContent === "취소",
    )!;
    await act(async () => cancel.click());
    assert.equal(editor(), null);
    assert.deepEqual(persisted.images, ["one", "two", "three", "four"]);
    assert.equal(writes.length, 0);
    await begin();
    await act(async () => control("사진 2 앞으로").click());
    await act(async () =>
      dom.window.document
        .querySelector("#outside")!
        .dispatchEvent(
          new dom.window.MouseEvent("pointerdown", {
            bubbles: true,
            button: 0,
          }),
        ),
    );
    assert.equal(editor(), null);
    assert.equal(writes.length, 1);
    assert.deepEqual(persisted.images, ["two", "one", "three", "four"]);
    await begin();
    await act(async () => control("사진 4 앞으로").click());
    await act(async () =>
      control("사진 3 앞으로").dispatchEvent(
        new dom.window.FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: dom.window.document.querySelector("#tab-target"),
        }),
      ),
    );
    assert.equal(editor(), null);
    assert.equal(writes.length, 2);
    assert.deepEqual(persisted.images, ["two", "one", "four", "three"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
  }
});

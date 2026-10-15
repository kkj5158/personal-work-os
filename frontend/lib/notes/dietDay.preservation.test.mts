import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

test("managed DIET refresh roundtrips in one atom while adjacent NOTE text and media remain separate", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const { Editor } = await import("@tiptap/core");
  const { default: StarterKit } = await import("@tiptap/starter-kit");
  const { Markdown } = await import("@tiptap/markdown");
  const { DietDay, MediaRow } = await import("../../app/notes/editor/extensions.ts");
  const originalPayload = JSON.stringify({ v: 1, date: "2026-09-26", measurements: { morningWeight: 98 }, note: "DIET 전용 메모\n[[일반 NOTE 링크 아님]]" });
  const media = { images: [{ src: "media:12345678-1234-1234-1234-123456789012", caption: "보존할 첨부", ratio: 100 }], width: 66, align: "center" };
  const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit, Markdown, DietDay, MediaRow], contentType: "markdown", content: `:::diet ${originalPayload}\n:::\n\n**내 NOTE 내용**\n\n:::images ${JSON.stringify(media)}\n:::\n\n첨부 뒤 내용` });
  try {
    const block = editor.state.doc.firstChild!;
    assert.equal(block.type.name, "dietDay");
    assert.equal(block.type.spec.atom, true);
    assert.equal(block.attrs.payload, originalPayload);
    const restBefore = editor.getJSON().content!.slice(1);
    const refreshedPayload = JSON.stringify({ ...JSON.parse(originalPayload), measurements: { morningWeight: 97.5 }, note: "DIET 새 메모" });
    // Refreshing the existing managed atom changes its attributes only. This is
    // editor preservation evidence, not a claim of live backend sync or browser QA.
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { payload: refreshedPayload }));
    assert.deepEqual(editor.getJSON().content!.slice(1), restBefore);
    const saved = editor.getMarkdown();
    assert.equal((saved.match(/:::diet /g) ?? []).length, 1);
    assert.ok(saved.startsWith(`:::diet ${refreshedPayload}\n:::`));
    assert.ok(saved.includes("**내 NOTE 내용**"));
    assert.ok(saved.includes("media:12345678-1234-1234-1234-123456789012"));
    assert.ok(saved.includes("보존할 첨부"));
    editor.commands.setContent(saved, { contentType: "markdown" });
    assert.equal(editor.state.doc.firstChild!.attrs.payload, refreshedPayload);
    assert.deepEqual(editor.getJSON().content!.slice(1), restBefore);
    assert.equal(editor.getMarkdown(), saved);
  } finally {
    editor.destroy();
    dom.window.close();
  }
});

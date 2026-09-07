import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "getComputedStyle", {
  value: dom.window.getComputedStyle,
  configurable: true,
});
const { Editor } = await import("@tiptap/core");
const { default: StarterKit } = await import("@tiptap/starter-kit");
const { Markdown } = await import("@tiptap/markdown");
const { default: TaskList } = await import("@tiptap/extension-task-list");
const { default: TaskItem } = await import("@tiptap/extension-task-item");
const { WikiLink, MediaRow, NoteFind, findKey } = await import(
  "../../app/notes/editor/extensions.ts"
);
const row = {
  images: [
    {
      src: "media:12345678-1234-1234-1234-123456789012",
      caption: "한글 설명",
      ratio: 100,
    },
  ],
  width: 66,
  align: "center",
};
const source = `# 제목\n\n**굵게** *기울임* ~~취소선~~\n\n[[방향성]]\n\n- [x] 확인\n\n> 인용\n\n:::images ${JSON.stringify(row)}\n:::\n\n본문 검색 본문`;
const editor = new Editor({
  element: document.createElement("div"),
  extensions: [
    StarterKit,
    Markdown,
    TaskList,
    TaskItem,
    WikiLink,
    MediaRow,
    NoteFind,
  ],
  content: source,
  contentType: "markdown",
});
const json = JSON.stringify(editor.getJSON());
assert.ok(json.includes('"wikiLink"'));
assert.ok(json.includes('"mediaRow"'));
assert.ok(json.includes('"taskItem"'));
const markdown = editor.getMarkdown();
assert.ok(markdown.includes("[[방향성]]"));
assert.ok(markdown.includes("media:12345678"));
assert.ok(markdown.includes("한글 설명"));
editor.commands.setContent(markdown, { contentType: "markdown" });
assert.equal(editor.getMarkdown(), markdown);
editor.view.dispatch(
  editor.state.tr.setMeta(findKey, { query: "본문", current: 1 }),
);
assert.equal(findKey.getState(editor.state)?.matches.length, 2);
assert.equal(findKey.getState(editor.state)?.current, 1);
editor.commands.setContent("`[[코드]]`\n\n```\n[[코드블록]]\n```", {
  contentType: "markdown",
});
assert.ok(!JSON.stringify(editor.getJSON()).includes('"wikiLink"'));
editor.destroy();
dom.window.close();
console.log(
  "Rich Markdown roundtrip, Wiki nodes/code exclusion, media metadata, checklist and current-note find: passed",
);

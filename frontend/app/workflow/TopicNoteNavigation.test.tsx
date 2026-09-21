import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { TopicNote } from "../../lib/api/workflow";
import type { Note } from "../../lib/notes/types";

test("wiki resolution and ambiguous choices flush edits made while navigation waits", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/workflow/today" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { NoteContext } = await import("../notes/NoteContext");
  // Model the shared editor's existing flush/dirty registration contract. This
  // isolates the panel's asynchronous navigation race from editor internals.
  function RegisteredEditor({ initial, source }: { initial: Note; source: { save: (note: Note) => Promise<Note> } }) {
    const env = React.useContext(NoteContext);
    const draft = React.useRef(initial.content), saved = React.useRef(initial.content);
    const current = React.useRef({ env, source }); current.current = { env, source };
    React.useEffect(() => current.current.env.register(initial.id, async () => {
      if (draft.current !== saved.current) {
        await current.current.source.save({ ...initial, content: draft.current });
        saved.current = draft.current;
      }
    }, () => draft.current !== saved.current), [initial]);
    return <div data-note-id={initial.id}><button onClick={() => { draft.current = "typed while resolving " + initial.id; }}>Edit current note</button><button onClick={() => env.openWiki("Target")}>Open wiki target</button></div>;
  }
  const editorPath = require.resolve("../notes/editor/NoteEditor");
  const cachedEditor = require.cache[editorPath];
  require.cache[editorPath] = { id: editorPath, filename: editorPath, loaded: true, exports: { __esModule: true, NoteEditor: RegisteredEditor } } as NodeModule;
  const { default: TopicNotePanel } = await import("./TopicNotePanel");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { createRoot } = await import("react-dom/client");
  const first: TopicNote = { id: crypto.randomUUID(), title: "First", workspaceId: null, scope: "WORK FLOW", content: "original", version: 0 };
  const second: TopicNote = { ...first, id: crypto.randomUUID(), title: "Second" };
  const writes: { id: string; content: string }[] = [];
  let failSave = false, finishResolve!: (notes: TopicNote[]) => void;
  workflowApi.getNote = async () => first;
  workflowApi.backlinks = async () => [];
  workflowApi.resolveNote = () => new Promise(resolve => { finishResolve = resolve; });
  workflowApi.saveNote = async note => {
    if (failSave) throw new Error("Save blocked; keep this note");
    writes.push({ id: note.id, content: note.content }); return { ...note, version: note.version + 1 };
  };
  const root = createRoot(document.getElementById("root")!);
  const click = async (label: string) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent?.startsWith(label));
    assert.ok(button, `${label} exists`); await act(async () => button.click());
  };
  try {
    await act(async () => root.render(<TopicNotePanel id={first.id} onClose={() => {}}/>));
    await click("Open wiki target");
    await click("Edit current note");
    await act(async () => finishResolve([second]));
    assert.equal(document.querySelector("[data-note-id]")?.getAttribute("data-note-id"), second.id);
    assert.deepEqual(writes, [{ id: first.id, content: "typed while resolving " + first.id }]);
    await click("Open wiki target");
    await act(async () => finishResolve([first, second]));
    assert.ok(document.querySelector('[aria-label="Choose a note"]'));
    await click("Edit current note");
    failSave = true;
    await click("First ·");
    assert.equal(document.querySelector("[data-note-id]")?.getAttribute("data-note-id"), second.id);
    assert.match(document.body.textContent!, /Save blocked; keep this note/);
    assert.equal(writes.length, 1);
    failSave = false;
    await click("First ·");
    assert.equal(document.querySelector("[data-note-id]")?.getAttribute("data-note-id"), first.id);
    assert.deepEqual(writes[1], { id: second.id, content: "typed while resolving " + second.id });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    if (cachedEditor) require.cache[editorPath] = cachedEditor; else delete require.cache[editorPath];
  }
});

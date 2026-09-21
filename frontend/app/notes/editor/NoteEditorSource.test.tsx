import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Editor } from "@tiptap/core";
import type { Note } from "@/lib/notes/types";
import type { NoteEditorSource } from "./NoteEditor";

test("direct-owned notes use the shared editor with serialized source persistence and guarded drafts", async () => {
  const dom = new JSDOM("<div id='root'></div><input id='outside'>", { url: "https://orbit.local/workflow/today", pretendToBeVisual: true });
  Object.assign(globalThis, {
    React, window: dom.window, document: dom.window.document, location: dom.window.location,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, sessionStorage: dom.window.sessionStorage,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
  const copied: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async (text: string) => { copied.push(text); } } });
  const { createRoot } = await import("react-dom/client");
  const { NoteEditor } = await import("./NoteEditor");
  const { NoteContext } = await import("../NoteContext");
  const { notesApi } = await import("@/lib/api/notes");
  const { DEFAULT_SETTINGS } = await import("@/lib/notes/types");
  const originalApi = { ...notesApi };
  const workspaceCalls: string[] = [];
  Object.assign(notesApi, Object.fromEntries(Object.keys(notesApi).map(name => [name, async () => {
    workspaceCalls.push(name);
    throw new Error(`Workspace API ${name} must not handle a direct-owned note`);
  }])));
  const initial: Note = {
    id: "direct-owned-note", workspaceId: "", type: "NOTE", journalDate: null,
    title: "Subject", content: "Original text", version: 7,
    createdAt: "2026-09-21T00:00:00Z", updatedAt: "", pinnedAt: null, deletedAt: null, aliases: [], tags: [],
  };
  let server = structuredClone(initial), failSave = false;
  let saveGate: Promise<void> | undefined, releaseSave = () => {};
  const calls: { kind: "save" | "rename"; note: Note; title?: string }[] = [];
  const suggestions: string[] = [], errors: unknown[] = [], acknowledgements: Note[] = [];
  const source: NoteEditorSource = {
    save: async note => {
      calls.push({ kind: "save", note: structuredClone(note) });
      if (saveGate) await saveGate;
      if (failSave) throw new Error("Source temporarily unavailable");
      assert.equal(note.id, initial.id);
      assert.equal(note.workspaceId, "", "empty view membership never becomes a fake Workspace");
      assert.equal(note.version, server.version, "every mutation starts with the last acknowledged version");
      server = { ...note, version: note.version + 1 };
      return structuredClone(server);
    },
    rename: async (note, title) => {
      calls.push({ kind: "rename", note: structuredClone(note), title });
      assert.equal(note.version, server.version);
      assert.equal(note.content, server.content, "rename waits for pending body persistence");
      server = { ...note, title, version: note.version + 1 };
      return structuredClone(server);
    },
    suggestions: async query => { suggestions.push(query); return []; },
    href: "/workflow/today?note=direct-owned-note",
  };
  const handles = new Map<string, { flush: () => Promise<void>; dirty: () => boolean }>();
  const root = createRoot(document.getElementById("root")!);
  const until = async (condition: () => boolean, description: string) => {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    assert.ok(condition(), description);
  };
  const button = (label: string) => {
    const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(element => element.textContent === label || element.getAttribute("aria-label") === label);
    assert.ok(found, `button ${label} exists`);
    return found;
  };
  try {
    await act(async () => root.render(<NoteContext.Provider value={{
      workspace: "", settings: { ...DEFAULT_SETTINGS, autosaveDelay: 20 },
      openWiki: () => {}, changed: () => {}, error: error => errors.push(error),
      register: (id, flush, dirty) => { handles.set(id, { flush, dirty }); return () => { handles.delete(id); }; },
    }}><NoteEditor initial={initial} source={source} onSaved={note => acknowledgements.push(note)} /></NoteContext.Provider>));
    const body = document.querySelector<HTMLElement & { editor: Editor }>(".tiptap")!;
    const editor = body.editor;
    const handle = handles.get(initial.id)!;
    assert.ok(handle);
    assert.equal(calls.length, 0, "mounting an existing note does not mutate it");
    assert.ok(document.querySelector('[aria-label="문단 서식"]'));
    assert.ok(document.querySelector('[aria-label="체크리스트"]'));
    assert.equal(document.querySelector('[aria-label="태그 추가"]'), null);
    assert.equal(document.querySelector('[aria-label="이미지 추가"]'), null);

    saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
    await act(() => {
      body.focus();
      editor.commands.setContent("# Subject heading\n\nParagraph text\n\n- [ ] Follow up", { contentType: "markdown" });
    });
    await until(() => calls.length === 1, "autosave invokes the source adapter without an explicit flush");
    assert.equal(calls[0].note.version, 7);
    assert.match(calls[0].note.content, /^# Subject heading/m);
    assert.match(calls[0].note.content, /Paragraph text/);
    assert.match(calls[0].note.content, /- \[ \] Follow up/);
    assert.equal(body.querySelector("h1")?.textContent, "Subject heading");
    assert.ok(body.querySelector('[data-type="taskList"]'));

    await act(() => editor.commands.setContent("## Later heading\n\nNewer text\n\n- [x] Follow up", { contentType: "markdown" }));
    assert.equal(handle.dirty(), true);
    const latestDraft = editor.getMarkdown();
    assert.equal(sessionStorage.getItem("notes.draft..direct-owned-note"), latestDraft);
    await act(async () => { releaseSave(); saveGate = undefined; await handle.flush(); });
    assert.deepEqual(calls.map(call => call.note.version), [7, 8]);
    assert.equal(server.version, 9);
    assert.equal(server.content, latestDraft);
    assert.equal(editor.getMarkdown(), latestDraft, "an older save response never overwrites a newer editor document");
    assert.match(server.content, /^## Later heading/m);
    assert.match(server.content, /- \[x\] Follow up/);
    assert.equal(handle.dirty(), false);
    assert.equal(sessionStorage.getItem("notes.draft..direct-owned-note"), null);

    const title = document.querySelector<HTMLInputElement>('[aria-label="노트 제목"]')!;
    await act(() => {
      editor.commands.insertContent(" pending before rename");
      title.focus();
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(title, "Renamed subject");
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(() => document.getElementById("outside")!.focus());
    await until(() => calls.some(call => call.kind === "rename"), "title blur persists through the source rename adapter");
    await act(async () => { await handle.flush(); });
    assert.deepEqual(calls.slice(2).map(call => [call.kind, call.note.version]), [["save", 9], ["rename", 10]]);
    assert.equal(server.title, "Renamed subject");
    assert.equal(server.version, 11);
    await act(async () => button("링크 복사").click());
    assert.deepEqual(copied, ["https://orbit.local/workflow/today?note=direct-owned-note"]);

    await act(() => {
      editor.commands.setContent("");
      body.focus();
      editor.commands.insertContent("[[Other");
    });
    await until(() => suggestions.includes("Other"), "wiki suggestions use the source adapter");
    await act(async () => { await handle.flush(); });
    assert.deepEqual(workspaceCalls, [], "editing, focus, title, copy and suggestions do not call Workspace APIs");

    failSave = true;
    await act(() => editor.commands.setContent("# Retained heading\n\nUnsaved text\n\n- [ ] Retained task", { contentType: "markdown" }));
    const failedDraft = editor.getMarkdown(), acknowledgedContent = server.content;
    await act(async () => { await assert.rejects(handle.flush(), /Source temporarily unavailable/); });
    assert.equal(handle.dirty(), true, "navigation remains guarded while persistence fails");
    assert.equal(editor.getMarkdown(), failedDraft);
    assert.equal(server.content, acknowledgedContent);
    assert.equal(sessionStorage.getItem("notes.draft..direct-owned-note"), failedDraft);
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Source temporarily unavailable/);
    failSave = false;
    await act(async () => { await handle.flush(); });
    assert.equal(server.content, failedDraft);
    assert.equal(handle.dirty(), false);
    assert.equal(sessionStorage.getItem("notes.draft..direct-owned-note"), null);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(acknowledgements.at(-1)?.version, server.version);
    assert.deepEqual(workspaceCalls, []);
    assert.deepEqual(errors, []);
  } finally {
    failSave = false;
    releaseSave();
    await act(async () => root.unmount());
    Object.assign(notesApi, originalApi);
    dom.window.close();
  }
});

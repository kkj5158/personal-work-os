import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Editor } from "@tiptap/core";
import type { Note } from "@/lib/notes/types";

test("compact editors isolate focus, recover empty drafts and finish uploads before navigation", async () => {
  const dom = new JSDOM("<div id='root'></div><input id='outside'>", { url: "https://orbit.local/notes", pretendToBeVisual: true });
  Object.assign(globalThis, {
    React, window: dom.window, document: dom.window.document,
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
  const { createRoot } = await import("react-dom/client");
  const { NoteEditor } = await import("./NoteEditor");
  const { NoteContext } = await import("../NoteContext");
  const { notesApi } = await import("@/lib/api/notes");
  const { DEFAULT_SETTINGS } = await import("@/lib/notes/types");
  const original = { ...notesApi };
  const notes: Note[] = ["a", "b"].map((id, i) => ({
    id, workspaceId: id, type: "DAILY", journalDate: "2026-09-13", title: "2026-09-13",
    content: i ? "" : "Saved text", createdAt: i ? "" : "2026-09-13T00:00:00Z",
    updatedAt: "", version: 1, pinnedAt: null, deletedAt: null, aliases: [], tags: [],
  }));
  const handles = new Map<string, { flush: () => Promise<void>; dirty: () => boolean }>();
  const saved: { workspace: string; content: string }[] = [];
  const errors: unknown[] = [];
  let resolveUpload!: (value: Awaited<ReturnType<typeof notesApi.upload>>) => void;
  notesApi.tags = async () => [];
  notesApi.visit = async () => {};
  notesApi.wikiSuggestions = async () => [];
  notesApi.save = async (workspace, note) => {
    saved.push({ workspace, content: note.content });
    return { ...notes.find(n => n.workspaceId === workspace)!, ...note, version: note.version + 1, createdAt: "2026-09-13T00:00:00Z" };
  };
  notesApi.upload = () => new Promise(resolve => { resolveUpload = resolve; });
  sessionStorage.setItem("notes.draft.a.2026-09-13", "");
  const root = createRoot(document.getElementById("root")!);
  const event = (key: string, ctrlKey = false) => new dom.window.KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true });
  try {
    await act(async () => root.render(<NoteContext.Provider value={{ workspace: "a", settings: { ...DEFAULT_SETTINGS, autosaveDelay: 60000 }, openWiki: () => {}, changed: () => {}, error: e => errors.push(e), register: (id, flush, dirty) => { handles.set(id, { flush, dirty }); return () => { handles.delete(id); }; } }}>
      {notes.map(note => <NoteEditor key={note.id} initial={note} compact bodyLabel={`${note.workspaceId} 본문`} />)}
    </NoteContext.Provider>));
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".note-editor"));
    assert.equal(cards.length, 2);
    const bodies = cards.map(card => card.querySelector<HTMLElement & { editor: Editor }>(".tiptap")!);
    assert.equal(bodies[0].getAttribute("aria-label"), "a 본문");
    assert.ok(cards[0].querySelector('[aria-label="태그 추가"]'));
    assert.equal(cards[1].querySelector('[aria-label="태그 추가"]'), null);
    assert.equal(saved.length, 0, "mounting empty editors must not save a note");
    const restore = Array.from(cards[0].querySelectorAll("button")).find(button => button.textContent === "초안 복원")!;
    assert.ok(restore, "an empty draft is still recoverable");
    await act(async () => { restore.click(); await handles.get("a")!.flush(); });
    assert.equal(saved.at(-1)?.content, "");
    assert.equal(sessionStorage.getItem("notes.draft.a.2026-09-13"), null);

    await act(() => { bodies[0].focus(); bodies[0].editor.commands.insertContent("[[first"); });
    assert.equal(document.querySelectorAll('[role="listbox"]').length, 1);
    await act(() => bodies[1].focus());
    assert.equal(document.querySelectorAll('[role="listbox"]').length, 0, "blur closes the other editor's portal");
    await act(() => bodies[1].dispatchEvent(event("f", true)));
    assert.equal(cards[0].querySelector(".note-find"), null);
    assert.ok(cards[1].querySelector(".note-find"));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    await act(() => document.getElementById("outside")!.focus());
    const externalFind = event("f", true);
    await act(() => document.getElementById("outside")!.dispatchEvent(externalFind));
    assert.equal(externalFind.defaultPrevented, false, "outside Ctrl+F remains browser find");

    const input = cards[1].querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new dom.window.File(["image"], "x.png", { type: "image/png" })] });
    await act(() => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
    assert.equal(handles.get("b")!.dirty(), true, "pending upload participates in navigation guard");
    let flushed = false;
    const flushing = handles.get("b")!.flush().then(() => { flushed = true; });
    await act(async () => { await Promise.resolve(); });
    assert.equal(flushed, false);
    await act(async () => {
      resolveUpload({ id: "12345678-1234-1234-1234-123456789012" } as Awaited<ReturnType<typeof notesApi.upload>>);
      await flushing;
    });
    assert.equal(flushed, true);
    assert.ok(saved.find(row => row.workspace === "b" && row.content.includes("media:12345678")), "flush persists the inserted image before returning");
    assert.equal(handles.get("b")!.dirty(), false);
    assert.ok(cards[1].querySelector('[aria-label="태그 추가"]'), "tags become available after first persisted content");
    assert.equal(document.activeElement?.id, "outside", "upload completion does not steal another editor's focus");
    assert.deepEqual(errors, []);
  } finally {
    await act(async () => root.unmount());
    Object.assign(notesApi, original);
    dom.window.close();
  }
});

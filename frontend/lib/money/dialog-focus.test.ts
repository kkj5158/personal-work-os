import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { trapDialogFocus } from "./dialog-focus";

test("dialog Tab cycles visible enabled controls in both directions, including a collapsed summary", () => {
  const dom = new JSDOM('<dialog tabindex="-1"><button id="first">Close</button><button disabled>Disabled</button><fieldset disabled><button>Disabled fieldset</button></fieldset><button hidden>Hidden</button><button style="visibility:hidden">Invisible</button><button tabindex="-1">Non-tabbable</button><details><summary tabindex="0" id="last">Evidence</summary><a href="/" id="collapsed">Hidden detail link</a></details></dialog>');
  const document = dom.window.document;
  const dialog = document.querySelector("dialog")!;
  // JSDOM has no layout; model browser rects for visible controls explicitly.
  for (const node of Array.from(dialog.querySelectorAll<HTMLElement>("*"))) node.getClientRects = () => ({ length: node.id === "collapsed" ? 0 : 1 } as DOMRectList);
  const first = document.getElementById("first")!, last = document.getElementById("last")!;
  let prevented = 0;
  const tab = (shiftKey = false) => trapDialogFocus(dialog, { key: "Tab", shiftKey, preventDefault: () => { prevented++; } });
  first.focus(); tab(); assert.equal(document.activeElement, last);
  tab(); assert.equal(document.activeElement, first);
  tab(true); assert.equal(document.activeElement, last);
  tab(true); assert.equal(document.activeElement, first);
  assert.equal(prevented, 4);
  trapDialogFocus(dialog, { key: "Escape", shiftKey: false, preventDefault: () => { prevented++; } });
  assert.equal(prevented, 4);
  dom.window.close();
});

test("dialog keeps focus when no enabled controls remain during a save", () => {
  const dom = new JSDOM('<dialog tabindex="-1"><button disabled>Saving</button></dialog>');
  const dialog = dom.window.document.querySelector("dialog")!;
  let prevented = false;
  trapDialogFocus(dialog, { key: "Tab", shiftKey: false, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(dom.window.document.activeElement, dialog);
  dom.window.close();
});

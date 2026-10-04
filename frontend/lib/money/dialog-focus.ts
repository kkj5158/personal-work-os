type TabEvent = Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">;

export function trapDialogFocus(dialog: HTMLDialogElement, event: TabEvent) {
  if (event.key !== "Tab") return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], summary, [tabindex]"))
    .filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest("[hidden], [inert]") && node.getClientRects().length > 0)
    .filter(node => dialog.ownerDocument.defaultView?.getComputedStyle(node).visibility !== "hidden");
  event.preventDefault();
  if (!controls.length) { dialog.focus(); return; }
  const active = controls.indexOf(dialog.ownerDocument.activeElement as HTMLElement);
  const next = active < 0 ? event.shiftKey ? controls.length - 1 : 0 : (active + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
  controls[next].focus();
}

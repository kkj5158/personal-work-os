/** Capture before App Router replaces a dirty calendar editor on Back/Forward. */
export function guardCalendarHistory(dirty: () => boolean, allow: () => boolean) {
  const entryIndex = () => { const index = (window as Window & { navigation?: { currentEntry?: { index?: number } | null } }).navigation?.currentEntry?.index; return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null; };
  let lastUrl = window.location.href, lastState = window.history.state, lastIndex = entryIndex(), restoringTo: number | null = null;
  const pop = (event: PopStateEvent) => {
    const targetIndex = entryIndex();
    if (restoringTo !== null) {
      event.stopImmediatePropagation();
      if (targetIndex === restoringTo) restoringTo = null;
      else if (targetIndex !== null) window.history.go(restoringTo - targetIndex);
      else restoringTo = null;
      return;
    }
    if (!dirty() || allow()) { lastUrl = window.location.href; lastState = window.history.state; lastIndex = targetIndex; return; }
    event.stopImmediatePropagation();
    if (lastIndex !== null && targetIndex !== null && lastIndex !== targetIndex) {
      restoringTo = lastIndex;
      window.history.go(lastIndex - targetIndex);
    } else {
      // Older browsers cannot identify the traversed entry. Keep the editor's
      // known URL/state without truncating any remaining Forward destinations.
      window.history.replaceState(lastState, "", lastUrl);
    }
  };
  window.addEventListener("popstate", pop, true);
  return () => window.removeEventListener("popstate", pop, true);
}

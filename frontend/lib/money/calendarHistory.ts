/** Capture before App Router replaces a dirty calendar editor on Back/Forward. */
export function guardCalendarHistory(dirty: () => boolean, allow: () => boolean) {
  const navigation = (window as Window & { navigation?: { currentEntry?: { index?: number } | null; addEventListener?: (type: string, listener: EventListener) => void; removeEventListener?: (type: string, listener: EventListener) => void } }).navigation;
  const entryIndex = () => { const index = navigation?.currentEntry?.index; return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null; };
  // React may intercept public Navigation API traversal before popstate. Cancel
  // at this earlier browser boundary so no editor can be replaced first.
  const navigate = (event: Event) => {
    const traversal = event as Event & { navigationType?: string; destination?: { sameDocument?: boolean } };
    if (traversal.navigationType !== "traverse" || !traversal.destination?.sameDocument || !event.cancelable || !dirty()) return;
    if (!allow()) event.preventDefault();
  };
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
  navigation?.addEventListener?.("navigate", navigate);
  return () => { window.removeEventListener("popstate", pop, true); navigation?.removeEventListener?.("navigate", navigate); };
}

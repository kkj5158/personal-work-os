/** Capture before App Router replaces a dirty calendar editor on Back/Forward. */
export function guardCalendarHistory(dirty: () => boolean, allow: () => boolean) {
  const lastUrl = window.location.href, lastState = window.history.state;
  const pop = (event: PopStateEvent) => {
    if (!dirty() || allow()) return;
    event.stopImmediatePropagation();
    // Preserve the original router state while keeping the rejected editor mounted.
    window.history.pushState(lastState, "", lastUrl);
  };
  window.addEventListener("popstate", pop, true);
  return () => window.removeEventListener("popstate", pop, true);
}

/** Delay App Router's popstate handling until pending note writes have settled. */
export function guardNoteHistory(flush: () => Promise<void>, dirty: () => boolean, report: (error: unknown) => void, transition: (work: () => void | Promise<void>) => void = work => { void work(); }) {
  let replaying = false, sequence = 0;
  let lastUrl = window.location.href;
  let lastState = window.history.state;
  const remember = () => { lastUrl = window.location.href; lastState = window.history.state; };
  const pop = (event: PopStateEvent) => {
    if (replaying || !dirty()) { remember(); return; }
    event.stopImmediatePropagation();
    const ticket = ++sequence, target = window.location.href, state = event.state;
    transition(async () => { try {
      await flush();
      if (ticket !== sequence) return;
      lastUrl = target;
      lastState = state;
      transition(() => {
        replaying = true;
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
        replaying = false;
      });
    } catch (error) {
      if (ticket !== sequence) return;
      // Keep the failed editor mounted and its draft available for retry.
      window.history.pushState(lastState, "", lastUrl);
      report(error);
    } });
  };
  window.addEventListener("popstate", pop, true);
  return { remember, dispose: () => { sequence++; window.removeEventListener("popstate", pop, true); } };
}

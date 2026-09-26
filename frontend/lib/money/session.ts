import { MoneyCache } from "./cache";
type Session = { user: { id: string }; access_token: string };
type Auth = {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  onAuthStateChange(callback: (event: string, session: Session | null) => void): { data: { subscription: { unsubscribe(): void } } };
};
/** Subscribe before resolving initial auth; a late initial read must not undo logout. */
export function bindMoneySession(cache: MoneyCache, auth: Auth) {
  let active = true, events = 0, fallback = 0;
  const apply = (session: Session | null) => {
    if (!active) return;
    let sessionId = "";
    if (session) {
      try { sessionId = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id || ""; } catch { /* No session identity: use a fresh lifetime. */ }
    }
    cache.setScope(session ? session.user.id + ":" + (sessionId || ++fallback) : null);
  };
  const { data: { subscription } } = auth.onAuthStateChange((_event, session) => { events++; apply(session); });
  const version = events;
  void auth.getSession().then(({ data, error }) => { if (events === version) apply(error ? null : data.session); }).catch(() => { if (events === version) apply(null); });
  return () => { active = false; subscription.unsubscribe(); cache.setScope(null); };
}

import type { Graph, ImageRow, Note } from "./types.ts";
export const normalize = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function shiftDate(date: string, by: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function emptyDaily(w: string, date: string): Note {
  return {
    id: crypto.randomUUID(),
    workspaceId: w,
    type: "DAILY",
    journalDate: date,
    title: date,
    content: "",
    version: 0,
    pinnedAt: null,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
    aliases: [],
    tags: [],
  };
}
export function filterGraph(graph: Graph, daily: boolean, orphans: boolean) {
  const nodes = graph.nodes.filter(
    (n) => (daily || n.type !== "DAILY") && (orphans || !n.orphan),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}
export function validRow(row: unknown): row is ImageRow {
  if (!row || typeof row !== "object") return false;
  const r = row as ImageRow;
  return (
    Array.isArray(r.images) &&
    r.images.length > 0 &&
    r.images.length <= 3 &&
    r.images.every(
      (i) =>
        /^media:[0-9a-f-]{36}$/i.test(i.src) &&
        typeof i.caption === "string" &&
        Number.isFinite(i.ratio) &&
        i.ratio >= 10 &&
        i.ratio <= 100,
    ) &&
    Number.isFinite(r.width) &&
    r.width >= 25 &&
    r.width <= 100 &&
    ["left", "center", "right"].includes(r.align)
  );
}

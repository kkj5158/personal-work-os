export const MODULES = [
  "DAILY_NOTES",
  "ALL_NOTES",
  "RECENT_NOTES",
  "TAGS",
  "CONNECTED_NOTES",
  "GRAPH",
] as const;
export type Module = (typeof MODULES)[number];
export const MODULE_LABELS: Record<Module, string> = {
  DAILY_NOTES: "데일리 노트",
  ALL_NOTES: "모든 노트",
  RECENT_NOTES: "최근 노트",
  TAGS: "태그",
  CONNECTED_NOTES: "연결된 노트",
  GRAPH: "그래프",
};
export type ModuleSetting = {
  module: Module;
  enabled: boolean;
  position: number;
  isDefault: boolean;
};
export type Workspace = {
  id: string;
  name: string;
  description: string;
  icon: string;
  archivedAt: string | null;
  modules: ModuleSetting[];
};
export type Settings = {
  autosaveDelay: number;
  markdownAssistance: boolean;
  imagePaste: boolean;
  wikiAutocomplete: boolean;
  graphDaily: boolean;
  graphOrphans: boolean;
  searchLimit: number;
};
export const DEFAULT_SETTINGS: Settings = {
  autosaveDelay: 800,
  markdownAssistance: true,
  imagePaste: true,
  wikiAutocomplete: true,
  graphDaily: false,
  graphOrphans: false,
  searchLimit: 30,
};
export type Tag = { id: string; name: string; usageCount: number };
export type Note = {
  id: string;
  workspaceId: string;
  type: "DAILY" | "NOTE";
  journalDate: string | null;
  title: string;
  content: string;
  version: number;
  pinnedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  aliases: string[];
  tags: Tag[];
};
export type Summary = Pick<
  Note,
  "id" | "type" | "journalDate" | "title" | "updatedAt" | "pinnedAt" | "tags"
> & { excerpt: string; lastOpenedAt: string | null };
export type Page<T> = { items: T[]; offset: number; hasMore: boolean };
export type Reference = {
  sourceNoteId: string;
  title: string;
  journalDate: string | null;
  context: string;
  position: number;
  createdAt: string;
};
export type Metric = {
  id: string;
  title: string;
  type: string;
  connectedNotes: number;
  dailyDates: number;
  mentions: number;
  growth30Days: number;
  lastConnection: string | null;
  incoming: number;
  outgoing: number;
};
export type Pending = {
  title: string;
  normalizedTitle: string;
  mentions: number;
  firstMention: string;
  latestMention: string;
};
export type GraphNode = {
  id: string;
  title: string;
  type: string;
  connectedNotes: number;
  orphan: boolean;
};
export type Graph = {
  nodes: GraphNode[];
  edges: { source: string; target: string; weight: number }[];
};
export type SearchResult = {
  id: string;
  type: string;
  title: string;
  excerpt: string;
};
export type Media = {
  id: string;
  width: number;
  height: number;
  mimeType: string;
};
export type ImageItem = { src: string; caption: string; ratio: number };
export type ImageRow = {
  images: ImageItem[];
  width: number;
  align: "left" | "center" | "right";
};

import type { BookPage } from "@/app/money/MoneyWebData";
import type { Category } from "./model";
import { categoryIndex } from "./categories";
import { categoryChartColor } from "./categoryChartColor";

export type SummaryGroup = { id: string; label: string; amount: number; count: number; color: string };
export type SummaryCategory = SummaryGroup & { children: (SummaryGroup & { sources: SummaryGroup[] })[] };
export type ChartGroup = SummaryGroup & { members?: SummaryGroup[] };
const expenseColors = ["#d16b82", "#b37b56", "#a278af", "#c39a44", "#688fac", "#7e8d63", "#8f7b91"];
const incomeColors = ["#218b79", "#548ea2", "#6a9264", "#707faf", "#a08a4b", "#5b9693", "#8d7ca0"];
function stableColor(id: string, income: boolean) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const palette = income ? incomeColors : expenseColors;
  return palette[hash % palette.length];
}
const sortGroups = <T extends SummaryGroup>(rows: T[]) => rows.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id, "en"));
function add<T extends SummaryGroup>(map: Map<string, T>, group: T, amount: number, count: number): T {
  const value = map.get(group.id) ?? group;
  value.amount += amount; value.count += count; map.set(value.id, value);
  return value;
}

/** The server's eligible category/source buckets are the only financial input.
 * Each bucket contributes once to each independent grouping dimension. */
export function calendarSummaryGroups(composition: BookPage["composition"], categories: Category[], income: boolean) {
  const { byId } = categoryIndex(categories);
  const roots = new Map<string, SummaryGroup & { children: Map<string, SummaryGroup & { sources: Map<string, SummaryGroup> }> }>();
  const sources = new Map<string, SummaryGroup>();
  for (const item of composition) {
    const category = item.categoryId ? byId.get(item.categoryId) : undefined;
    const root = category?.parentId ? byId.get(category.parentId) : category;
    const rootId = root?.id ?? item.categoryId ?? "uncategorized";
    const color = root ? categoryChartColor(root.id, categories, stableColor(rootId, income)) : item.categoryId ? stableColor(rootId, income) : "#8794a5";
    const group = add(roots, { id: rootId, label: root?.name ?? (item.categoryId ? "이전 분류" : "미분류"), amount: 0, count: 0, color, children: new Map() }, item.amount, item.count);
    const childId = category?.parentId ? category.id : `direct:${rootId}`;
    const child = add(group.children, { id: childId, label: category?.parentId ? category.name : item.categoryId ? "소분류 없음" : "미분류", amount: 0, count: 0, color, sources: new Map() }, item.amount, item.count);
    // Source attribution is the persisted counterparty dimension, independent of category.
    const sourceId = JSON.stringify(item.counterpartyText);
    const source = { id: sourceId, label: item.counterpartyText || "수입원 미상", amount: 0, count: 0, color: stableColor(sourceId, true) };
    add(sources, { ...source }, item.amount, item.count);
    add(child.sources, { ...source }, item.amount, item.count);
  }
  const ranking: SummaryCategory[] = sortGroups([...roots.values()]).map(group => ({ ...group, children: sortGroups([...group.children.values()]).map(child => ({ ...child, sources: sortGroups([...child.sources.values()]) })) }));
  return { ranking, sources: sortGroups([...sources.values()]), total: composition.reduce((sum, row) => sum + row.amount, 0), count: composition.reduce((sum, row) => sum + row.count, 0) };
}

/** Keep the full ranking; only the visual ring/legend combines the smaller tail. */
export function calendarChartGroups(groups: SummaryGroup[]): ChartGroup[] {
  if (groups.length <= 8 || groups.some(row => row.amount < 0)) return groups;
  const tail = groups.slice(7);
  return [...groups.slice(0, 7), { id: "chart:other", label: "기타", amount: tail.reduce((sum, row) => sum + row.amount, 0), count: tail.reduce((sum, row) => sum + row.count, 0), color: "#8794a5", members: tail }];
}

export function calendarChartSectors(groups: ChartGroup[], total: number | null) {
  // A net sum with negative groups is not a partition: normalizing positive values
  // would suggest shares of a different total. Keep the signed rows, omit that ring.
  const available = total !== null && total > 0 && groups.every(row => row.amount >= 0) && Math.abs(groups.reduce((sum, row) => sum + row.amount, 0) - total) < 0.01;
  let start = 0;
  return { available, sectors: groups.map(row => { const share = available ? row.amount / total! : 0; const sector = { ...row, start, share }; start += share; return sector; }) };
}

export function calendarSummaryShare(amount: number, total: number | null) {
  return total !== null && total > 0 ? `${(amount / total * 100).toFixed(1)}%` : "—";
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAchievementByItem,
  getItemTrend,
  getOverallAchievementTrend,
  listChecklistCategories,
  listChecklistItemHistory,
  listChecklistItemVersions,
} from "@/lib/api/checklist";
import type { AchievementPointDto, ChecklistCategoryDto, ChecklistItemDto, ChecklistItemVersionDto, ItemBreakdownEntryDto, ItemTrendPointDto, ChecklistPriority } from "@/lib/api/types";
import { addDays, startOfWeek, toDateKey } from "@/lib/date";
import { seoulToday } from "@/lib/seoulDate";
import { AchievementTrendChart } from "./AchievementTrendChart";
import { describeApiError } from "./errorMessages";
import { itemCategoryLabel, sortItemsCanonically } from "./checklistLogic";
import { FOCUS_VISIBLE } from "./format";

type Preset = "week" | "month" | "quarter" | "year" | "custom";
type View = "overall" | "byItem" | "item";
type Series = "overall" | "core" | "secondary";

interface AnalyticsFilterState {
  priority: "ALL" | ChecklistPriority;
  includeDeleted: boolean;
  categoryIds: string[];
}
const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = { priority: "ALL", includeDeleted: false, categoryIds: [] };

function startMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function computeRange(preset: Preset, anchor: Date, custom: { from: string; to: string }) {
  if (preset === "custom") return custom;
  if (preset === "week") {
    const from = startOfWeek(anchor);
    return { from: toDateKey(from), to: toDateKey(addDays(from, 6)) };
  }
  if (preset === "month") return { from: toDateKey(startMonth(anchor)), to: toDateKey(endMonth(anchor)) };
  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    return { from: toDateKey(new Date(anchor.getFullYear(), quarterStartMonth, 1)), to: toDateKey(new Date(anchor.getFullYear(), quarterStartMonth + 3, 0)) };
  }
  return { from: `${anchor.getFullYear()}-01-01`, to: `${anchor.getFullYear()}-12-31` };
}
function periodLabel(preset: Preset, anchor: Date, r: { from: string; to: string }) {
  if (preset === "week" || preset === "custom") return `${r.from} – ${r.to}`;
  if (preset === "month") return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`;
  if (preset === "quarter") return `${anchor.getFullYear()}년 ${Math.floor(anchor.getMonth() / 3) + 1}분기`;
  return `${anchor.getFullYear()}년`;
}

interface LifecycleBand {
  from: string;
  to: string;
  kind: "inactive" | "deleted";
}

// Version-interval-aware lifecycle bands — an item can be deactivated and
// later reactivated more than once, so this walks every inactive version and
// closes each band at whichever comes first: the next version's start, the
// item's own deletion date, or the visible range's end.
function lifecycleBands(versions: ChecklistItemVersionDto[], deletedAt: string | null, rangeTo: string): LifecycleBand[] {
  const sorted = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const horizon = deletedAt ?? rangeTo;
  const bands: LifecycleBand[] = [];
  sorted.forEach((version, i) => {
    if (version.active) return;
    const next = sorted[i + 1]?.effectiveFrom ?? rangeTo;
    const to = next < horizon ? next : horizon;
    if (version.effectiveFrom < to) bands.push({ from: version.effectiveFrom, to, kind: "inactive" });
  });
  if (deletedAt != null && deletedAt <= rangeTo) bands.push({ from: deletedAt, to: rangeTo, kind: "deleted" });
  return bands;
}

// Three analytics views (§30-38): 전체 추이 / 항목별 달성률 / 항목 추적, each
// answering a different question — never combined into one dashboard.
// Canonical order everywhere (§34): no rate-based sort, no leaderboard, no
// DnD here (reordering is Settings' job — see docs/backend/checklist.md;
// Analytics only ever displays the order Settings already defines).
export function ChecklistAnalyticsContent() {
  const today = seoulToday();
  const [preset, setPreset] = useState<Preset>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: toDateKey(addDays(today, -29)), to: toDateKey(today) });
  const [view, setView] = useState<View>("overall");
  const [series, setSeries] = useState<Series>("overall");

  const [filters, setFilters] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [overall, setOverall] = useState<AchievementPointDto[]>([]);
  const [breakdown, setBreakdown] = useState<ItemBreakdownEntryDto[]>([]);
  const [trend, setTrend] = useState<ItemTrendPointDto[]>([]);
  const [allItems, setAllItems] = useState<ChecklistItemDto[]>([]);
  const [categories, setCategories] = useState<ChecklistCategoryDto[]>([]);
  const [selected, setSelected] = useState("");
  const [versions, setVersions] = useState<ChecklistItemVersionDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => computeRange(preset, anchor, custom), [preset, anchor, custom]);

  useEffect(() => {
    void Promise.all([listChecklistItemHistory(), listChecklistCategories()])
      .then(([itemHistory, cats]) => {
        setAllItems(itemHistory);
        setCategories(cats);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    void getOverallAchievementTrend(range.from, range.to)
      .then(setOverall)
      .catch((e) => setError(describeApiError(e, "전체 추이를 불러오지 못했습니다.")));
  }, [range.from, range.to]);
  useEffect(() => {
    void getAchievementByItem(range.from, range.to, filters.priority === "ALL" ? undefined : filters.priority, filters.includeDeleted)
      .then(setBreakdown)
      .catch((e) => setError(describeApiError(e, "항목별 달성률을 불러오지 못했습니다.")));
  }, [range.from, range.to, filters.priority, filters.includeDeleted]);
  useEffect(() => {
    if (!selected) return;
    void Promise.all([getItemTrend(selected, range.from, range.to), listChecklistItemVersions(selected)])
      .then(([t, v]) => {
        setTrend(t);
        setVersions(v);
      })
      .catch((e) => setError(describeApiError(e, "항목 추이를 불러오지 못했습니다.")));
  }, [selected, range.from, range.to]);

  function move(n: number) {
    setAnchor((d) => {
      const next = new Date(d);
      if (preset === "week") next.setDate(next.getDate() + 7 * n);
      else if (preset === "month") next.setMonth(next.getMonth() + n);
      else if (preset === "quarter") next.setMonth(next.getMonth() + 3 * n);
      else next.setFullYear(next.getFullYear() + n);
      return next;
    });
  }

  function openFilters() {
    setDraftFilters(filters);
    setFiltersOpen(true);
  }
  function applyFilters() {
    setFilters(draftFilters);
    setFiltersOpen(false);
  }
  function resetFilters() {
    setDraftFilters(DEFAULT_ANALYTICS_FILTERS);
    setFilters(DEFAULT_ANALYTICS_FILTERS);
    setFiltersOpen(false);
  }

  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const filteredBreakdown = breakdown.filter((e) => filters.categoryIds.length === 0 || filters.categoryIds.includes(e.categoryId ?? "none"));
  // Backend already returns canonical (category, item) order; category
  // grouping here only partitions that already-ordered list, never re-sorts it.
  const groupsInOrder: string[] = [];
  const byCategory = new Map<string, ItemBreakdownEntryDto[]>();
  for (const entry of filteredBreakdown) {
    const key = entry.categoryId ?? "none";
    if (!byCategory.has(key)) {
      byCategory.set(key, []);
      groupsInOrder.push(key);
    }
    byCategory.get(key)!.push(entry);
  }

  const canonicalSelectableItems = sortItemsCanonically(
    allItems.filter((i) => filters.includeDeleted || !i.deleted),
    categories,
  );
  const selectedItem = itemById.get(selected);
  const activeVersion = [...versions].filter((v) => v.effectiveFrom <= range.to).at(-1);
  const bands = selectedItem ? lifecycleBands(versions, selectedItem.deletedAt, range.to) : [];
  const bandLeft = (d: string) => {
    const span = new Date(range.to).getTime() - new Date(range.from).getTime();
    if (span <= 0) return 0;
    return Math.max(0, Math.min(100, ((new Date(d).getTime() - new Date(range.from).getTime()) / span) * 100));
  };
  const totals = trend.reduce((acc, p) => ({ achieved: acc.achieved + (p.achievedCount ?? 0), applicable: acc.applicable + (p.applicableCount ?? 0) }), { achieved: 0, applicable: 0 });

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger-fg">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex h-9 rounded-md border border-control-border bg-control-bg p-0.5 text-xs">
          {(["week", "month", "quarter", "year", "custom"] as Preset[]).map((p) => (
            <button key={p} onClick={() => setPreset(p)} className={`rounded px-3 ${preset === p ? "bg-surface-default shadow-sm" : "text-fg-muted"}`}>
              {{ week: "주", month: "월", quarter: "분기", year: "연", custom: "사용자 지정" }[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {preset !== "custom" && (
            <button onClick={() => move(-1)} className="h-9 rounded border border-control-border px-3 text-sm">
              ‹ 이전
            </button>
          )}
          {preset === "custom" ? (
            <div className="flex gap-1">
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-9 rounded border border-control-border px-2 text-sm" />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-9 rounded border border-control-border px-2 text-sm" />
            </div>
          ) : (
            <label className="relative h-9 min-w-40 cursor-pointer rounded border border-control-border px-3 text-center text-sm font-medium leading-9">
              {periodLabel(preset, anchor, range)}
              <input
                type="date"
                value={toDateKey(anchor)}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setAnchor(new Date(y, m - 1, d));
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          )}
          {preset !== "custom" && (
            <>
              <button onClick={() => move(1)} className="h-9 rounded border border-control-border px-3 text-sm">
                다음 ›
              </button>
              <button onClick={() => setAnchor(today)} className="h-9 rounded border border-control-border px-3 text-sm">
                현재 기간
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-9 rounded-md border border-control-border bg-control-bg p-0.5 text-xs">
          {(["overall", "byItem", "item"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded px-3 ${view === v ? "bg-surface-default shadow-sm" : "text-fg-muted"}`}>
              {{ overall: "전체 추이", byItem: "항목별 달성률", item: "항목 추적" }[v]}
            </button>
          ))}
        </div>
        <div className="relative">
          <button type="button" onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())} className={`h-8 rounded border border-control-border px-3 text-xs ${FOCUS_VISIBLE}`}>
            상세 필터
          </button>
          {filtersOpen && (
            <div role="dialog" aria-label="상세 필터" className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-border-default bg-surface-default p-4 shadow-lg text-xs">
              <p className="mb-1.5 font-semibold text-fg-muted">우선순위</p>
              <select
                value={draftFilters.priority}
                onChange={(e) => setDraftFilters({ ...draftFilters, priority: e.target.value as "ALL" | ChecklistPriority })}
                className="mb-3 h-8 w-full rounded border border-control-border px-2"
              >
                <option value="ALL">전체</option>
                <option value="CORE">CORE</option>
                <option value="SECONDARY">SECONDARY</option>
              </select>
              <label className="mb-3 flex items-center gap-2">
                <input type="checkbox" checked={draftFilters.includeDeleted} onChange={(e) => setDraftFilters({ ...draftFilters, includeDeleted: e.target.checked })} />
                삭제된 항목 포함
              </label>
              <p className="mb-1.5 font-semibold text-fg-muted">카테고리</p>
              <div className="mb-3 flex max-h-28 flex-col gap-1 overflow-auto">
                {[...categories, { id: "none", name: "미분류", position: 9999 }].map((c) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draftFilters.categoryIds.includes(c.id)}
                      onChange={(e) =>
                        setDraftFilters({
                          ...draftFilters,
                          categoryIds: e.target.checked ? [...draftFilters.categoryIds, c.id] : draftFilters.categoryIds.filter((x) => x !== c.id),
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetFilters} className="h-8 px-2 text-fg-muted">
                  초기화
                </button>
                <button onClick={applyFilters} className="h-8 rounded bg-primary-emphasis px-3 text-white">
                  적용
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {view === "overall" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(["overall", "core", "secondary"] as Series[]).map((s) => (
              <button key={s} onClick={() => setSeries(s)} className={`h-7 rounded px-2.5 text-xs ${series === s ? "bg-primary-subtle text-primary-fg" : "text-fg-muted"}`}>
                {{ overall: "전체", core: "Core", secondary: "Secondary" }[s]}
              </button>
            ))}
          </div>
          <AchievementTrendChart points={overall.map((p) => ({ label: p.label, rate: series === "overall" ? p.overallRate : series === "core" ? p.coreRate : p.secondaryRate, goalPercent: p.goalPercent }))} />
          <div className="flex gap-5 text-xs text-fg-muted">
            <span>● 실제 달성률</span>
            <span>– – 목표 달성률</span>
          </div>
        </div>
      )}

      {view === "byItem" && (
        <div className="flex flex-col gap-3">
          {groupsInOrder.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">표시할 항목이 없습니다.</p>
          ) : (
            groupsInOrder.map((categoryKey) => (
              <div key={categoryKey} className="rounded-md border border-border-default">
                <div className="bg-canvas-subtle px-3 py-2 text-sm font-semibold">{categories.find((c) => c.id === categoryKey)?.name ?? "미분류"}</div>
                {byCategory.get(categoryKey)!.map((entry) => (
                  <div key={entry.itemId} className="flex w-full items-center gap-3 border-t border-border-default px-3 py-2.5">
                    <span className="w-44 shrink-0 truncate text-sm">
                      {entry.emoji} {entry.name}
                    </span>
                    <span className="w-24 shrink-0 truncate text-xs text-fg-muted">
                      {itemCategoryLabel(entry, categories)} · {entry.priority}
                    </span>
                    <div className="relative h-3 flex-1 rounded-full bg-canvas-subtle">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${entry.rate >= entry.effectiveGoalPercent / 100 ? "bg-success-emphasis" : "bg-danger-emphasis"}`}
                        style={{ width: `${entry.rate * 100}%` }}
                      />
                      <span className="absolute inset-y-[-2px] w-px bg-fg-default" style={{ left: `${entry.effectiveGoalPercent}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs">{Math.round(entry.rate * 100)}%</span>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {entry.achievedCount}/{entry.applicableCount}일
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {view === "item" && (
        <div className="flex flex-col gap-4">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-9 w-72 rounded border border-control-border px-2 text-sm">
            <option value="">항목 선택</option>
            {canonicalSelectableItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.emoji} {i.name}
                {i.deleted ? " · 삭제됨" : ""}
              </option>
            ))}
          </select>
          {selected && selectedItem && (
            <>
              <div className="rounded-md border border-border-default p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">
                    {selectedItem.emoji} {selectedItem.name}
                  </h3>
                  <span className="text-xs text-fg-muted">
                    {itemCategoryLabel(selectedItem, categories)} · {selectedItem.priority} · {selectedItem.deleted ? "삭제됨" : selectedItem.active ? "활성" : "비활성"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-6 text-sm">
                  <span>
                    달성률 <b>{totals.applicable ? Math.round((totals.achieved / totals.applicable) * 100) : 0}%</b>
                  </span>
                  <span>
                    달성 <b>{totals.achieved} / 적용 {totals.applicable}일</b>
                  </span>
                  <span>
                    목표 <b>{activeVersion?.goalOverridePercent ?? trend.filter((p) => p.goalPercent != null).at(-1)?.goalPercent ?? "—"}%</b>
                  </span>
                  {bands.some((b) => b.kind === "inactive") && <span>비활성화 {bands.find((b) => b.kind === "inactive")!.from}</span>}
                  {selectedItem.deletedAt && <span>삭제됨 {selectedItem.deletedAt}</span>}
                </div>
              </div>
              <div className="relative overflow-hidden rounded-md">
                {bands.map((b, i) => (
                  <div
                    key={i}
                    className={`absolute bottom-9 top-0 z-0 border-l ${b.kind === "deleted" ? "border-fg-muted bg-canvas-subtle/80" : "border-border-muted bg-canvas-subtle/50"}`}
                    style={{ left: `${bandLeft(b.from)}%`, right: `${100 - bandLeft(b.to)}%` }}
                  >
                    <span className="ml-2 text-[10px] text-fg-muted">{b.kind === "deleted" ? "삭제 이후" : "비활성 기간"}</span>
                  </div>
                ))}
                <div className="relative z-10">
                  <AchievementTrendChart points={trend.map((p) => ({ label: p.label, rate: p.state === "ACTIVE" ? p.rate : null, goalPercent: p.goalPercent }))} accentColor="var(--chart-score-emphasis)" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

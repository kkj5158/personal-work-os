"use client";

import { useEffect, useMemo, useState } from "react";
import { getAchievementByItem, getItemTrend, getOverallAchievementTrend, listChecklistItems } from "@/lib/api/checklist";
import type { AchievementPointDto, ChecklistItemDto, ItemBreakdownEntryDto, ItemTrendPointDto } from "@/lib/api/types";
import { toDateKey } from "@/lib/date";
import { AchievementTrendChart } from "./AchievementTrendChart";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";

type RangePreset = "week" | "month" | "quarter" | "year";
type View = "overall" | "byItem" | "item";
type OverallSeries = "overall" | "core" | "secondary";
type ByItemFilter = "ALL" | "CORE" | "SECONDARY";
type ByItemSort = "lowest" | "highest";

function computeRange(preset: RangePreset): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  if (preset === "week") from.setDate(to.getDate() - 6);
  else if (preset === "month") from.setDate(to.getDate() - 29);
  else if (preset === "quarter") from.setDate(to.getDate() - 89);
  else from.setDate(to.getDate() - 364);
  return { from, to };
}

// Checklist analytics (REQ-05 §10.14–10.17), extracted from the retired
// ChecklistAnalyticsModal so it can render directly inside the 근무
//체크리스트 page as a full-width section instead of a modal — same three
// connected views (Overall Achievement Trend / Achievement by Item /
// Individual Item Tracking), same shared range, same calculation policies
// (equal-day weighting, non-work exclusion, effective-dated goal history,
// deleted-item support); only the presentation shell changed.
export function ChecklistAnalyticsContent() {
  const [preset, setPreset] = useState<RangePreset>("month");
  const [view, setView] = useState<View>("overall");
  const { from, to } = useMemo(() => computeRange(preset), [preset]);

  const [overallSeries, setOverallSeries] = useState<OverallSeries>("overall");
  const [overallPoints, setOverallPoints] = useState<AchievementPointDto[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);

  const [byItemFilter, setByItemFilter] = useState<ByItemFilter>("ALL");
  const [byItemSort, setByItemSort] = useState<ByItemSort>("lowest");
  const [byItemIncludeDeleted, setByItemIncludeDeleted] = useState(false);
  const [byItemEntries, setByItemEntries] = useState<ItemBreakdownEntryDto[]>([]);
  const [byItemLoading, setByItemLoading] = useState(true);

  const [allItems, setAllItems] = useState<ChecklistItemDto[]>([]);
  const [itemIncludeDeleted, setItemIncludeDeleted] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [itemPoints, setItemPoints] = useState<ItemTrendPointDto[]>([]);
  const [itemLoading, setItemLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);

  useEffect(() => {
    (async () => {
      setOverallLoading(true);
      try {
        setOverallPoints(await getOverallAchievementTrend(fromKey, toKey));
      } catch (e) {
        setError(describeApiError(e, "전체 달성 추이를 불러오지 못했습니다."));
      } finally {
        setOverallLoading(false);
      }
    })();
  }, [fromKey, toKey]);

  useEffect(() => {
    (async () => {
      setByItemLoading(true);
      try {
        const priority = byItemFilter === "ALL" ? undefined : byItemFilter;
        setByItemEntries(await getAchievementByItem(fromKey, toKey, priority, byItemIncludeDeleted));
      } catch (e) {
        setError(describeApiError(e, "항목별 달성률을 불러오지 못했습니다."));
      } finally {
        setByItemLoading(false);
      }
    })();
  }, [fromKey, toKey, byItemFilter, byItemIncludeDeleted]);

  useEffect(() => {
    (async () => {
      try {
        setAllItems(await listChecklistItems());
      } catch {
        // Item selector can stay empty; the by-item view still works.
      }
    })();
  }, []);

  useEffect(() => {
    // No selection: nothing to fetch. The render below gates on
    // `!selectedItemId` itself, so stale `itemPoints` from a previous
    // selection is simply never shown — no need to clear it here.
    if (!selectedItemId) return;
    (async () => {
      setItemLoading(true);
      try {
        setItemPoints(await getItemTrend(selectedItemId, fromKey, toKey));
      } catch (e) {
        setError(describeApiError(e, "항목 추이를 불러오지 못했습니다."));
      } finally {
        setItemLoading(false);
      }
    })();
  }, [selectedItemId, fromKey, toKey]);

  function openItemView(itemId: string) {
    setSelectedItemId(itemId);
    setView("item");
  }

  const overallChartPoints = overallPoints.map((p) => ({
    label: p.label,
    rate: overallSeries === "overall" ? p.overallRate : overallSeries === "core" ? p.coreRate : p.secondaryRate,
    goalPercent: p.goalPercent,
  }));

  const sortedByItem = [...byItemEntries].sort((a, b) => (byItemSort === "lowest" ? a.rate - b.rate : b.rate - a.rate));

  const itemChartPoints = itemPoints.map((p) => ({
    label: p.label,
    rate: p.state === "ACTIVE" ? p.rate : null,
    goalPercent: p.goalPercent,
  }));

  const selectableItems = allItems.filter((i) => itemIncludeDeleted || !i.deleted);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex h-9 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
          {(["week", "month", "quarter", "year"] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded px-3 ${preset === p ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
            >
              {p === "week" ? "주" : p === "month" ? "월" : p === "quarter" ? "분기" : "연"}
            </button>
          ))}
        </div>
        <div className="flex h-9 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
          {([
            ["overall", "전체 추이"],
            ["byItem", "항목별 달성률"],
            ["item", "항목 추적"],
          ] as [View, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 ${view === v ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger-fg">{error}</p>}

      {view === "overall" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {(["overall", "core", "secondary"] as OverallSeries[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setOverallSeries(s)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium ${overallSeries === s ? "bg-primary-subtle text-primary-fg" : "text-fg-muted hover:bg-canvas-subtle"} ${FOCUS_VISIBLE}`}
              >
                {s === "overall" ? "전체" : s === "core" ? "Core" : "Secondary"}
              </button>
            ))}
          </div>
          {overallLoading ? <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p> : <AchievementTrendChart points={overallChartPoints} />}
        </div>
      )}

      {view === "byItem" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex h-8 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
              {(["ALL", "CORE", "SECONDARY"] as ByItemFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setByItemFilter(f)}
                  className={`rounded px-2.5 ${byItemFilter === f ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
                >
                  {f === "ALL" ? "전체" : f === "CORE" ? "Core" : "Secondary"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-fg-muted">
                <input type="checkbox" checked={byItemIncludeDeleted} onChange={(e) => setByItemIncludeDeleted(e.target.checked)} />
                삭제된 항목 포함
              </label>
              <button type="button" onClick={() => setByItemSort((s) => (s === "lowest" ? "highest" : "lowest"))} className={`h-7 rounded-md border border-control-border bg-surface-default px-2.5 font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
                {byItemSort === "lowest" ? "낮은 순" : "높은 순"}
              </button>
            </div>
          </div>

          {byItemLoading ? (
            <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
          ) : sortedByItem.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">표시할 데이터가 없습니다</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedByItem.map((entry) => (
                <button
                  key={entry.itemId}
                  type="button"
                  onClick={() => openItemView(entry.itemId)}
                  className={`flex items-center gap-3 rounded-md border border-border-default px-3 py-2 text-left hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                >
                  <span className="text-base">{entry.emoji}</span>
                  <span className="w-32 shrink-0 truncate text-sm text-fg-default">{entry.name}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-canvas-subtle">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${entry.rate >= entry.effectiveGoalPercent / 100 ? "bg-success-emphasis" : "bg-danger-emphasis"}`}
                      style={{ width: `${Math.round(entry.rate * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-default">{Math.round(entry.rate * 100)}%</span>
                  <span className="w-24 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-muted">
                    {entry.achievedCount}/{entry.applicableCount}일
                  </span>
                  <span className="w-16 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-muted">목표 {entry.effectiveGoalPercent}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "item" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            >
              <option value="">항목 선택</option>
              {selectableItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.emoji} {i.name}
                  {i.deleted ? " (삭제됨)" : ""}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted">
              <input type="checkbox" checked={itemIncludeDeleted} onChange={(e) => setItemIncludeDeleted(e.target.checked)} />
              삭제된 항목 포함
            </label>
          </div>

          {!selectedItemId ? (
            <p className="py-8 text-center text-sm text-fg-muted">추적할 항목을 선택해 주세요.</p>
          ) : itemLoading ? (
            <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
          ) : (
            <AchievementTrendChart points={itemChartPoints} accentColor="var(--chart-score-emphasis)" />
          )}
        </div>
      )}
    </div>
  );
}

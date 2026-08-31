"use client";

import { useEffect, useState } from "react";
import { listChecklistCategories, listChecklistItemHistory, listChecklistItems } from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto } from "@/lib/api/types";
import { ChecklistRecordContent } from "../ChecklistRecordContent";
import { ChecklistAnalyticsContent } from "../ChecklistAnalyticsContent";
import { ChecklistSettingsSection } from "../ChecklistSettingsSection";
import { describeApiError } from "../errorMessages";

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItemDto[]>([]);
  const [history, setHistory] = useState<ChecklistItemDto[]>([]);
  const [categories, setCategories] = useState<ChecklistCategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function reloadCatalog() {
    try {
      const [active, all, cats] = await Promise.all([listChecklistItems(), listChecklistItemHistory(), listChecklistCategories()]);
      setItems(active); setHistory(all); setCategories(cats); setError(null);
    } catch (e) { setError(describeApiError(e, "체크리스트 설정을 불러오지 못했습니다.")); }
  }
  useEffect(() => { void (async () => { await Promise.resolve(); await reloadCatalog(); })(); }, []);
  return <div className="flex min-h-screen flex-col bg-canvas-default">
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-16 px-8 py-8">
      <header><h1 className="text-lg font-semibold text-fg-default">근무 체크리스트</h1><p className="mt-1 text-sm text-fg-muted">일별 실행부터 기간 분석, 설정까지 한 곳에서 관리합니다.</p></header>
      {error&&<p className="rounded-md border border-danger-fg bg-danger-subtle px-4 py-2 text-sm text-danger-fg">{error}</p>}
      <section className="flex flex-col gap-5"><div><h2 className="text-lg font-semibold">체크리스트 기록</h2><p className="mt-1 text-sm text-fg-muted">일·주·월 단위로 적용 항목과 완료 현황을 확인합니다.</p></div><div className="border-t border-border-default"/><ChecklistRecordContent items={items} categories={categories}/></section>
      <section className="flex flex-col gap-5"><div><h2 className="text-lg font-semibold">체크리스트 분석</h2><p className="mt-1 text-sm text-fg-muted">기간별 달성 추이와 항목별 성과를 확인합니다.</p></div><div className="border-t border-border-default"/><ChecklistAnalyticsContent/></section>
      <section className="flex flex-col gap-5"><div><h2 className="text-lg font-semibold">체크리스트 설정</h2><p className="mt-1 text-sm text-fg-muted">항목과 카테고리를 관리하고 삭제 이력을 확인합니다.</p></div><div className="border-t border-border-default"/><ChecklistSettingsSection items={items} historicalItems={history} categories={categories} onItemsChanged={setItems} onCategoriesChanged={setCategories} onReload={reloadCatalog}/></section>
    </main>
  </div>;
}

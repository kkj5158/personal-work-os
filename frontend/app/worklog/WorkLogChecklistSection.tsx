"use client";

import { useEffect, useState } from "react";
import { listChecklistCategories, listChecklistItems } from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto } from "@/lib/api/types";
import { ChecklistRecordContent } from "./ChecklistRecordContent";
import { describeApiError } from "./errorMessages";

// Keep the standalone checklist page intact. Both routes render the same
// interactive record component against the same persisted checklist entries.
export function WorkLogChecklistSection() {
  const [items, setItems] = useState<ChecklistItemDto[]>([]);
  const [categories, setCategories] = useState<ChecklistCategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextItems, nextCategories] = await Promise.all([
          listChecklistItems(),
          listChecklistCategories(),
        ]);
        if (cancelled) return;
        setItems(nextItems);
        setCategories(nextCategories);
      } catch (e) {
        if (!cancelled) {
          setError(describeApiError(e, "체크리스트 설정을 불러오지 못했습니다."));
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-fg-default">체크리스트 기록</h2>
        <p className="mt-1 text-sm text-fg-muted">일·주·월 단위로 적용 항목과 완료 현황을 확인합니다.</p>
      </div>
      <div className="border-t border-border-default" />
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
      <ChecklistRecordContent items={items} categories={categories} />
    </section>
  );
}

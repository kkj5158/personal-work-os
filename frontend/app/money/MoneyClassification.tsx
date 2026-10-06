"use client";
import { CategoryManagement } from "./MoneyCategoryManagement";
import { categoryIndex } from "@/lib/money/categories";
import { useState } from "react";
import { moneyApi as api } from "@/lib/money/model";
import {
  type MeaningRule,
  type MeaningKind,
  ruleStatuses,
  conditionFields,
  conditionOperators,
} from "@/lib/money/meaning";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { type Props } from "./MoneyWebViews";
import { useSearchParams } from "next/navigation";
import { AiMerchants, AiOperations } from "./MoneyAiWorkspace";
import { AiCategories } from "./MoneyAiCategories";
import {MoneyConversation} from './MoneyConversation';
import {HistoricalClassification} from './MoneyHistoricalClassification';

export function Classification(p: Props) {
  const [savedTab, setTab] = useMoneyViewState(
    "classification-tab",
    () => "categories",
  );
  const query = useSearchParams();
  const requested = ["categories", "ai"].includes(query.get("ai") || "") ? "aiCategories" : query.get("ai");
  const selectedTab = ["merchants", "aiCategories", "operations", "conversation"].includes(requested || "") ? requested : savedTab;
  const tab = selectedTab === "conversation" ? "ai" : selectedTab;
  const [kind, setKind] = useMoneyViewState<MeaningKind>(
    "category-kind",
    () => "EXPENSE",
  );
  const rules = useMoneyData<MeaningRule[]>("/classification-rules");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const cache = useMoneyCache();
  async function reorder(id: string, target: string) {
    if (!rules.data || id === target || busy) return;
    const all = [...rules.data];
    const moved = all.find((r) => r.id === id);
    if (!moved) return;
    all.splice(all.indexOf(moved), 1);
    all.splice(
      all.findIndex((r) => r.id === target),
      0,
      moved,
    );
    setBusy(true);
    try {
      await api.put("/classification-rules/order", {
        ids: all.map((r) => r.id),
        versions: Object.fromEntries(rules.data.map((r) => [r.id, r.version])),
      });
      cache.mutate("classificationRule");
    } catch (e) {
      setError(e instanceof Error ? e.message : "순서 변경 실패");
    } finally {
      setBusy(false);
      setDrag(null);
    }
  }
  const categoryTree = categoryIndex(p.categories);
  return (
    <>
      <div
        className="money-toolbar meaning-tabs"
        role="tablist"
        aria-label="분류 관리"
      >
        {[
          ["categories", "카테고리"],
          ["rules", "자동 분류 규칙"],
          ["ai", "AI 대화"],
          ["merchants", "거래처 확인"],
          ["aiCategories", "AI 카테고리"],
          ["operations", "학습 · 운영"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              if (tab !== key && p.changeContext?.() !== false) { setTab(key); if (query.size) p.navigate?.("/money/classification"); }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <LoadState error={rules.error || error} loading={rules.loading} />
      {tab === "categories" && <CategoryManagement {...p} kind={kind} setKind={setKind} rules={rules.data??[]} />}
      {tab === "rules" && (
        <section className="money-card">
          <div className="money-section-heading">
            <h2>자동 분류 규칙</h2>
            <button
              className="money-primary"
              onClick={() =>
                p.select({ kind: "classificationRule", value: null })
              }
            >
              규칙 추가
            </button>
          </div>
          <p className="money-muted">
            위쪽 규칙이 필드별로 우선합니다. 기본 적용 대상은 앞으로 생성되는
            기록이며 사용자 수정값은 유지됩니다.
          </p>
          <div className="money-table-wrap">
            <table className="money-table meaning-ledger">
              <thead>
                <tr>
                  <th>우선순위</th>
                  <th>규칙</th>
                  <th>모든 조건 충족 (AND)</th>
                  <th>적용할 기본값</th>
                  <th>상태 / 출처</th>
                </tr>
              </thead>
              <tbody>
                {rules.data?.map((r, i) => (
                  <tr
                    key={r.id}
                    draggable={!busy}
                    onDragStart={() => setDrag(r.id!)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag) void reorder(drag, r.id!);
                    }}
                    onClick={() =>
                      p.select({ kind: "classificationRule", value: r })
                    }
                    aria-selected={p.selected === r.id}
                  >
                    <td>
                      <button
                        title="위로 이동"
                        aria-label={(r.name || r.merchant) + " 위로"}
                        disabled={!i || busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void reorder(r.id!, rules.data![i - 1].id!);
                        }}
                      >
                        ↑
                      </button>{" "}
                      {i + 1}
                    </td>
                    <td>
                      <button
                        className="meaning-text-button"
                        onClick={() =>
                          p.select({ kind: "classificationRule", value: r })
                        }
                      >
                        {r.name || r.merchant}
                      </button>
                      {r.legacy && <small>기존 정확 일치 규칙</small>}
                    </td>
                    <td>
                      {r.conditions.map((c, index) => (
                        <small key={index}>
                          {conditionFields[c.field]}{" "}
                          {conditionOperators[c.operator]}{" "}
                          {c.field === "accountId"
                            ? p.accounts.find((a) => a.id === c.value)
                                ?.displayName || "보관 계좌"
                            : c.value}
                        </small>
                      ))}
                    </td>
                    <td>
                      {r.categoryId && (
                        <small>
                          {categoryTree.path(r.categoryId)}
                        </small>
                      )}
                      {r.titleDefault && <small>제목: {r.titleDefault}</small>}
                      {r.memoDefault && <small>메모 기본값</small>}
                    </td>
                    <td>
                      {ruleStatuses[r.status]}
                      {r.categoryId && categoryTree.byId.has(r.categoryId) && !categoryTree.active(categoryTree.byId.get(r.categoryId)!) && <small role="status">확인 필요 · 비활성 분류</small>}
                      <small>
                        {r.origin === "AI_APPROVED"
                          ? "AI 추천 · 사용자 승인"
                          : "직접 작성"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rules.data?.length && (
              <p className="money-empty">
                등록된 규칙이 없습니다. 검토 결과 또는 직접 입력으로 규칙을
                작성하세요.
              </p>
            )}
          </div>
          <HistoricalClassification rules={rules.data??[]} categories={p.categories} accounts={p.accounts}/>
        </section>
      )}
      {tab === "merchants" && <AiMerchants {...p} />}
      {tab === "ai" && <MoneyConversation {...p}/>}
      {tab === "aiCategories" && <AiCategories {...p} />}
      {tab === "operations" && <AiOperations {...p} />}
    </>
  );
}

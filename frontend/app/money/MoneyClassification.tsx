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

export function Classification(p: Props) {
  const [tab, setTab] = useMoneyViewState(
    "classification-tab",
    () => "categories",
  );
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
          ["ai", "AI 추천"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              if (tab !== key && p.changeContext?.() !== false) setTab(key);
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
          <RuleHistory />
        </section>
      )}
      {tab === "ai" && <AiAvailability />}
    </>
  );
}
function AiAvailability() {
  const { data, error, loading } = useMoneyData<{
    available: boolean;
    reason: string;
  }>("/classification-rules/ai-status");
  return (
    <section className="money-card">
      <h2>AI 규칙 추천</h2>
      <LoadState error={error} loading={loading} />
      <p>{data?.reason}</p>
      <p className="money-muted">
        현재는 추천 생성과 자동 적용을 제공하지 않습니다. 외부 AI 서비스로 금융
        정보가 전송되지 않습니다.
      </p>
      <button disabled>추천 생성 · 제공자 미설정</button>
    </section>
  );
}
function RuleHistory() {
  const cache = useMoneyCache();
  const [open, setOpen] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    count: number;
    fingerprint: string;
    examples: { id: string; result: { defaults: Record<string, string> } }[];
  } | null>(null);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="meaning-history"
    >
      <summary>기존 기록에 적용 · 미리보기 후 확인</summary>
      <p>
        기간 내 일치하는 가계부 기본값만 변경합니다. 금융 사실과 사용자 수정값은
        유지됩니다.
      </p>
      <div className="money-toolbar">
        <input
          aria-label="규칙 적용 시작일"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPreview(null);
          }}
        />
        <input
          aria-label="규칙 적용 종료일"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPreview(null);
          }}
        />
        <button
          disabled={busy || !from || !to}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setPreview(
                await api.post("/classification-rules/history/preview", {
                  from,
                  to,
                }),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "미리보기 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          영향 미리보기
        </button>
      </div>
      {preview && (
        <div>
          <strong>변경 대상 {preview.count}건</strong>
          <ul>
            {preview.examples.map((e) => (
              <li key={e.id}>
                {Object.entries(e.result.defaults)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || !preview.count}
            onClick={async () => {
              if (
                !window.confirm(
                  `${preview.count}건의 가계부 기본값을 적용할까요? 사용자 수정값과 금융 원장은 유지됩니다.`,
                )
              )
                return;
              setBusy(true);
              try {
                await api.post("/classification-rules/history/apply", {
                  from,
                  to,
                  fingerprint: preview.fingerprint,
                });
                cache.mutate("ruleHistory");
                setPreview(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "적용 실패");
              } finally {
                setBusy(false);
              }
            }}
          >
            확인한 {preview.count}건에 적용
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

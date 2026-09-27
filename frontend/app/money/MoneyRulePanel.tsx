"use client";
import { CategoryPicker } from "./MoneyCategoryPicker";
import { useContext, useState } from "react";
import { moneyApi as api } from "@/lib/money/model";
import {
  type MeaningRule,
  type RuleCondition,
  conditionFields,
  conditionOperators,
  ruleStatuses,
} from "@/lib/money/meaning";
import { EditorForm, type Props } from "./MoneyEditors";
import { Field } from "./MoneyForms";
import { PanelContext } from "./MoneyPanel";
export function RulePanel(p: Props & { value: MeaningRule | null }) {
  const r = p.value;
  const [name, setName] = useState(r?.name || r?.merchant || ""),
    [conditions, setConditions] = useState<RuleCondition[]>(
      r?.conditions ?? [
        { field: "type", operator: "EXACT", value: "EXPENSE" },
        { field: "merchant", operator: "CONTAINS", value: "" },
      ],
    );
  const [categoryId, setCategory] = useState(r?.categoryId || ""),
    [title, setTitle] = useState(r?.titleDefault ?? ""),
    [memo, setMemo] = useState(r?.memoDefault ?? ""),
    [status, setStatus] = useState<MeaningRule["status"]>(
      r?.status || "ACTIVE",
    );
  const { setDirty } = useContext(PanelContext);
  const kind = conditions.find((c) => c.field === "type")?.value;
  function condition(index: number, next: RuleCondition) {
    setConditions(conditions.map((c, i) => (i === index ? next : c)));
    setDirty(true);
  }
  return (
    <EditorForm
      title={r?.id ? "분류 규칙 수정" : "분류 규칙 만들기"}
      onClose={p.onClose}
      onSave={async () => {
        const input = {
          name,
          conditions,
          categoryId: categoryId || null,
          titleDefault: title || null,
          memoDefault: memo || null,
          status,
          expectedVersion: r?.version,
        };
        if (r?.id) await api.put("/classification-rules/" + r.id, input);
        else await api.post("/classification-rules", input);
        p.onSaved();
      }}
    >
      <p className="meaning-notice">
        가계부 기본값만 지정합니다. 금액, 계좌, 대출 연결 등 금융 사실은 바꾸지
        않습니다.
      </p>
      {r?.legacy && (
        <p>
          기존 규칙을 저장하면 가계부 기본값 규칙으로 전환됩니다. 이미 분류된
          원거래는 유지됩니다.
        </p>
      )}
      <Field label="규칙 이름">
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <h3>조건 · 모두 충족</h3>
      {conditions.map((c, i) => (
        <div className="meaning-condition" key={i}>
          <label>
            <span>조건 {i + 1}</span>
            <select
              aria-label={`조건 ${i + 1} 필드`}
              value={c.field}
              onChange={(e) => {
                const field = e.target.value as RuleCondition["field"];
                condition(i, {
                  field,
                  operator:
                    field === "type" || field === "accountId"
                      ? "EXACT"
                      : c.operator,
                  value: field === "type" ? "EXPENSE" : "",
                });
              }}
            >
              {Object.entries(conditionFields).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label={`조건 ${i + 1} 비교`}
            value={c.operator}
            disabled={c.field === "type" || c.field === "accountId"}
            onChange={(e) =>
              condition(i, {
                ...c,
                operator: e.target.value as RuleCondition["operator"],
              })
            }
          >
            {Object.entries(conditionOperators).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          {c.field === "type" ? (
            <select
              aria-label={`조건 ${i + 1} 값`}
              value={c.value}
              onChange={(e) => {
                condition(i, { ...c, value: e.target.value });
                setCategory("");
              }}
            >
              <option value="EXPENSE">지출</option>
              <option value="INCOME">수입</option>
            </select>
          ) : c.field === "accountId" ? (
            <select
              required
              aria-label={`조건 ${i + 1} 값`}
              value={c.value}
              onChange={(e) => condition(i, { ...c, value: e.target.value })}
            >
              <option value="">계좌 선택</option>
              {p.accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
            </select>
          ) : (
            <input
              required
              maxLength={500}
              aria-label={`조건 ${i + 1} 값`}
              value={c.value}
              onChange={(e) => condition(i, { ...c, value: e.target.value })}
            />
          )}
          <button
            type="button"
            disabled={conditions.length === 1}
            onClick={() => {
              setConditions(conditions.filter((_, j) => i !== j));
              setDirty(true);
            }}
          >
            조건 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={conditions.length >= 8}
        onClick={() => {
          setConditions([
            ...conditions,
            { field: "title", operator: "CONTAINS", value: "" },
          ]);
          setDirty(true);
        }}
      >
        AND 조건 추가
      </button>
      <h3>일치할 때 적용할 기본값</h3>
      <Field label="분류 카테고리">
        <CategoryPicker label="분류 카테고리" value={categoryId} onChange={setCategory} categories={p.categories.filter(c=>c.kind===kind)} />
        <small>미분류 선택 시 카테고리 기본값을 변경하지 않습니다.</small>
      </Field>
      <Field label="기본 제목">
        <input
          maxLength={240}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="기본 메모">
        <textarea
          maxLength={2000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>
      <Field label="규칙 상태">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MeaningRule["status"])}
        >
          {Object.entries(ruleStatuses).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <p className="money-muted">
        저장하면 앞으로 생성되는 기록에 적용합니다. 기존 기록에는 목록 아래
        미리보기와 별도 확인이 필요합니다.
      </p>
    </EditorForm>
  );
}

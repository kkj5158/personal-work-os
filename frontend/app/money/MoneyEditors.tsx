"use client";
import { useContext, useState, type ReactNode } from "react";
import {
  moneyApi as api,
  type Account,
  type Category,
  type Transaction,
  type Raw,
  type Attempt,
  type AccountDetail,
  type Rule,
  seoul,
  iso,
  won,
  kinds,
  provenance,
} from "@/lib/money/model";
import { type Selection } from "./MoneyWebViews";
import {
  type BookFields,
  type BookRow,
  type Loan,
  useMoneyData,
  LoadState,
} from "./MoneyWebData";
import { PanelContext, MoneyPanel } from "./MoneyPanel";
import {
  AccountForm,
  EntryForm,
  Field,
  AccountOptions,
  CategoryOptions,
} from "./MoneyForms";

type Props = {
  selection: Selection;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  select: (s: Selection) => void;
};
export function MoneyEditor(p: Props) {
  switch (p.selection.kind) {
    case "account":
      return <AccountEditor {...p} value={p.selection.value} />;
    case "transaction":
      return <TransactionEditor {...p} value={p.selection.value} />;
    case "book":
      return <BookEditor {...p} value={p.selection.value} />;
    case "loan":
      return <LoanEditor {...p} value={p.selection.value} />;
    case "review":
      return <ReviewEditor {...p} value={p.selection.value} />;
    case "rule":
      return <RuleEditor {...p} value={p.selection.value} />;
    case "category":
      return <CategoryEditor {...p} value={p.selection.value} />;
  }
}
function AccountEditor(p: Props & { value: Account | null }) {
  const [balance, setBalance] = useState(""),
    [note, setNote] = useState(""),
    [at, setAt] = useState(seoul(new Date().toISOString())),
    [error, setError] = useState("");
  const a = p.value;
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      p.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <AccountForm
      value={a}
      accounts={p.accounts}
      onClose={p.onClose}
      onSave={async (input) => {
        if (a)
          await api.put("/accounts/" + a.id, {
            expectedVersion: a.version,
            account: input,
          });
        else await api.post("/accounts", input);
        p.onSaved();
      }}
    >
      {a && (
        <>
          <AccountHistory account={a} />
          <details>
            <summary>잔액 확인 / 보정</summary>
            <p className="money-muted">
              확인 잔액을 기준점으로 저장합니다. 수입·지출 거래를 만들지
              않습니다.
            </p>
            <Field label="확인 잔액">
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </Field>
            <Field label="잔액 확인 시각">
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </Field>
            <Field label="잔액 확인 메모">
              <input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <button
              type="button"
              disabled={!balance || !at}
              onClick={() =>
                void action(() =>
                  api.post("/accounts/" + a.id + "/balance-checkpoints", {
                    amount: Number(balance),
                    verifiedAt: iso(at),
                    note: note || null,
                    expectedVersion: a.version,
                  }),
                )
              }
            >
              확인 잔액 저장
            </button>
          </details>
          <div className="money-destructive">
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    a.archived
                      ? "계좌를 다시 사용하시겠습니까?"
                      : "계좌를 보관할까요? 기존 금융 기록은 유지됩니다.",
                  )
                )
                  void action(() =>
                    api.put("/accounts/" + a.id + "/archive", {
                      expectedVersion: a.version,
                      archived: !a.archived,
                    }),
                  );
              }}
            >
              {a.archived ? "계좌 다시 사용" : "계좌 보관"}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </AccountForm>
  );
}
function AccountHistory({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const { data, error, loading } = useMoneyData<AccountDetail>(
    open
      ? "/accounts/" +
          account.id +
          "/detail?month=" +
          seoul(new Date().toISOString()).slice(0, 7)
      : null,
  );
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) setOpen(true);
      }}
    >
      <summary>잔액 근거 · 이번 달 집계</summary>
      <LoadState error={error} loading={loading} />
      {data && (
        <>
          <p>
            {won(data.balance.amount)} · {provenance(data.balance)}
          </p>
          <p>
            유입 {won(data.inflow)} / 유출 {won(data.outflow)}
          </p>
          {data.checkpoints.map((c) => (
            <p key={c.id}>
              {seoul(c.verifiedAt).replace("T", " ")} · {won(c.amount)}
              {c.note ? " · " + c.note : ""}
            </p>
          ))}
        </>
      )}
    </details>
  );
}
function SystemInfo({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data, error, loading } = useMoneyData<Transaction>(
    open ? "/transactions/" + id : null,
  );
  const history = useMoneyData<{ action: string; createdAt: string }[]>(
    open ? "/transactions/" + id + "/corrections" : null,
  );
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) setOpen(true);
      }}
    >
      <summary>시스템 정보</summary>
      <p className="money-muted">원본 알림과 해석 이력은 읽기 전용입니다.</p>
      <LoadState error={error || history.error} loading={loading} />
      {data && (
        <>
          <p>정규 거래 ID: {data.id}</p>
          <p>
            근거 {data.sources.length}건 · {data.manual ? "수동" : "알림 기반"}
          </p>
          {data.sources.map((s) => (
            <RawEvidence key={s.rawEventId} id={s.rawEventId} />
          ))}
          {history.data?.map((h, i) => (
            <p key={i}>
              {h.action} · {seoul(h.createdAt).replace("T", " ")}
            </p>
          ))}
        </>
      )}
    </details>
  );
}
function RawEvidence({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data, error, loading } = useMoneyData<Raw>(
    open ? "/notifications/" + id : null,
  );
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) setOpen(true);
      }}
    >
      <summary>원본 알림 확인</summary>
      <LoadState error={error} loading={loading} />
      {data && (
        <div className="money-raw">
          <p>
            {data.sourcePackage} · {seoul(data.postedAt)}
          </p>
          <p>{data.title}</p>
          <pre>{data.bigText || data.text}</pre>
        </div>
      )}
    </details>
  );
}
function TransactionEditor(p: Props & { value: Partial<Transaction> | null }) {
  const t = p.value;
  const { data } = useMoneyData<{ items: Transaction[] }>(
    "/transactions?type=EXPENSE&limit=200",
  );
  const [error, setError] = useState("");
  return (
    <EntryForm
      value={t}
      accounts={p.accounts}
      categories={p.categories}
      refunds={data?.items || []}
      onClose={p.onClose}
      title={t?.id ? "거래 수정" : "수동 거래 추가"}
      onSave={async (input) => {
        if (t?.id) await api.put("/transactions/" + t.id, input);
        else await api.post("/transactions", input);
        p.onSaved();
      }}
    >
      {t?.id && (
        <>
          <SystemInfo id={t.id} />
          {t.type === "EXPENSE" && !t.excluded && (
            <button
              type="button"
              onClick={() =>
                p.select({
                  kind: "transaction",
                  value: {
                    type: "REFUND",
                    toAccountId: t.fromAccountId,
                    amount: t.amount,
                    refundOf: t.id,
                    categoryId: t.categoryId,
                    occurredAt: new Date().toISOString(),
                  },
                })
              }
            >
              이 소비에 대한 환불 기록
            </button>
          )}
          <TransferLinks transaction={t as Transaction} onSaved={p.onSaved} />
          <div className="money-destructive">
            <button
              type="button"
              disabled={!!t.excluded}
              onClick={async () => {
                if (
                  !window.confirm(
                    "거래를 장부·통계에서 제외할까요? 원본과 이력은 보존됩니다.",
                  )
                )
                  return;
                try {
                  await api.put("/transactions/" + t.id, {
                    ...t,
                    excluded: true,
                    expectedVersion: t.version,
                  });
                  p.onSaved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "제외 실패");
                }
              }}
            >
              거래 제외
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </EntryForm>
  );
}
function TransferLinks({
  transaction: t,
  onSaved,
}: {
  transaction: Transaction;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [other, setOther] = useState(""),
    [error, setError] = useState("");
  const { data } = useMoneyData<{ items: Transaction[] }>(
    open && t.type !== "TRANSFER"
      ? "/transactions?limit=200&type=" +
          (t.type === "EXPENSE" ? "INCOME" : "EXPENSE")
      : null,
  );
  async function run(path: string, payload: unknown) {
    try {
      await api.post(path, payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 실패");
    }
  }
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) setOpen(true);
      }}
    >
      <summary>이체 연결 / 분리</summary>
      {t.type === "TRANSFER" ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이체를 독립 지출·수입으로 분리할까요?"))
              void run("/transactions/" + t.id + "/unlink-transfer", {
                expectedVersion: t.version,
              });
          }}
        >
          이체 분리
        </button>
      ) : (
        <>
          <select
            aria-label="연결할 반대 거래"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          >
            <option value="">같은 금액의 반대 거래 선택</option>
            {data?.items
              .filter((x) => x.amount === t.amount && x.id !== t.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {seoul(x.occurredAt)} ·{" "}
                  {x.title || x.counterpartyText || kinds[x.type]}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!other}
            onClick={() => {
              const b = data?.items.find((x) => x.id === other);
              if (
                b &&
                window.confirm("두 거래를 하나의 내부 이체로 연결할까요?")
              )
                void run("/transactions/" + t.id + "/link-transfer", {
                  otherId: b.id,
                  expectedVersion: t.version,
                  otherVersion: b.version,
                });
            }}
          >
            이체로 연결
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
function EditorForm({
  title,
  children,
  onClose,
  onSave,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => Promise<void>;
  actions?: ReactNode;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <MoneyPanel title={title} onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave();
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="money-primary" disabled={busy} type="submit">
            {busy ? "저장 중…" : "저장"}
          </button>
        </footer>
        {actions && <div className="money-destructive">{actions}</div>}
      </form>
    </MoneyPanel>
  );
}
function BookEditor(p: Props & { value: BookRow }) {
  const b = p.value,
    [overrides, setOverrides] = useState<Partial<BookFields>>(b.overrides);
  const { setDirty } = useContext(PanelContext);
  const source = b.source;
  const effective = { ...source, ...overrides };
  function change<K extends keyof BookFields>(key: K, value: BookFields[K]) {
    setOverrides((o) => ({ ...o, [key]: value }));
    setDirty(true);
  }
  function reset(key?: keyof BookFields) {
    setOverrides((o) => {
      if (!key) return {};
      const next = { ...o };
      delete next[key];
      return next;
    });
    setDirty(true);
  }
  function marker(key: keyof BookFields) {
    return (
      <span className="money-inheritance">
        {key in overrides ? (
          <button type="button" onClick={() => reset(key)}>
            수정됨 · 원거래 값으로
          </button>
        ) : (
          "원거래 상속"
        )}
      </span>
    );
  }
  return (
    <EditorForm
      title={"가계부 " + (b.type === "INCOME" ? "수입" : "지출") + " 수정"}
      onClose={p.onClose}
      onSave={async () => {
        await api.put("/bookkeeping/" + b.id, {
          expectedVersion: b.version,
          expectedTransactionVersion: b.transactionVersion,
          overrides,
        });
        p.onSaved();
      }}
    >
      <p className="money-muted">
        이곳의 수정은 가계부에만 적용됩니다. 원거래의 금융 사실은 바뀌지
        않습니다.
      </p>
      <Field label="가계부 날짜">
        <input aria-label="가계부 날짜"
          type="datetime-local"
          value={seoul(effective.occurredAt)}
          onChange={(e) => change("occurredAt", iso(e.target.value))}
        />
        {marker("occurredAt")}
      </Field>
      <Field label="가계부 제목">
        <input aria-label="가계부 제목"
          required
          maxLength={240}
          value={effective.title}
          onChange={(e) => change("title", e.target.value)}
        />
        {marker("title")}
      </Field>
      <Field label="가계부 메모">
        <textarea aria-label="가계부 메모"
          maxLength={2000}
          value={effective.memo || ""}
          onChange={(e) => change("memo", e.target.value || null)}
        />
        {marker("memo")}
      </Field>
      <Field label="가계부 카테고리">
        <select aria-label="가계부 카테고리"
          value={effective.categoryId || ""}
          onChange={(e) => change("categoryId", e.target.value || null)}
        >
          <CategoryOptions categories={p.categories} />
        </select>
        {marker("categoryId")}
      </Field>
      <Field label="가계부 계좌">
        <select aria-label="가계부 계좌"
          required
          value={effective.accountId}
          onChange={(e) => change("accountId", e.target.value)}
        >
          <AccountOptions accounts={p.accounts} />
        </select>
        {marker("accountId")}
      </Field>
      <Field label="가계부 거래처 / 수입원">
        <input aria-label="가계부 거래처 / 수입원"
          maxLength={500}
          value={effective.counterpartyText || ""}
          onChange={(e) => change("counterpartyText", e.target.value || null)}
        />
        {marker("counterpartyText")}
      </Field>
      <Field label="가계부 금액">
        <input aria-label="가계부 금액"
          required
          type="number"
          min="0.01"
          step="0.01"
          value={effective.amount}
          onChange={(e) => change("amount", Number(e.target.value))}
        />
        {marker("amount")}
      </Field>
      <label className="money-check">
        <input
          type="checkbox"
          checked={effective.excluded}
          onChange={(e) => change("excluded", e.target.checked)}
        />
        가계부에서 제외
      </label>
      <button type="button" onClick={() => reset()}>
        원거래 값으로 되돌리기
      </button>
      <details>
        <summary>연결된 원거래</summary>
        <p>
          {source.title} · {won(source.amount)}
        </p>
        <p>
          상속된 항목은 원거래 수정 시 따라 변경됩니다. 수정한 항목은
          유지됩니다.
        </p>
      </details>
    </EditorForm>
  );
}
function LoanEditor(p: Props & { value: Loan | null }) {
  const l = p.value;
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "name",
        "lender",
        "type",
        "originalPrincipal",
        "remainingPrincipal",
        "interestRate",
        "monthlyPayment",
        "paymentDay",
        "nextDueDate",
        "paymentAccountId",
        "startDate",
        "maturityDate",
        "status",
        "memo",
      ].map((k) => [
        k,
        String(l?.[k as keyof Loan] ?? (k === "status" ? "ACTIVE" : "")),
      ]),
    ),
  );
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <EditorForm
      title={l ? "대출 정보 수정" : "대출 추가"}
      onClose={p.onClose}
      onSave={async () => {
        const payload: Record<string, unknown> = {
          ...form,
          expectedVersion: l?.version,
        };
        for (const k of [
          "originalPrincipal",
          "remainingPrincipal",
          "interestRate",
          "monthlyPayment",
          "paymentDay",
        ])
          payload[k] = form[k] === "" ? null : Number(form[k]);
        for (const k of [
          "nextDueDate",
          "paymentAccountId",
          "startDate",
          "maturityDate",
          "memo",
        ])
          payload[k] = form[k] || null;
        if (l) await api.put("/loans/" + l.id, payload);
        else await api.post("/loans", payload);
        p.onSaved();
      }}
      actions={
        l && (
          <button
            type="button"
            onClick={async () => {
              if (window.confirm("대출 항목을 목록에서 삭제할까요?")) {
                try {
                  await api.delete(
                    "/loans/" + l.id + "?expectedVersion=" + l.version,
                  );
                  p.onSaved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "삭제 실패");
                }
              }
            }}
          >
            대출 삭제
          </button>
        )
      }
    >
      {error && <p role="alert">{error}</p>}
      {(
        [
          ["name", "대출명"],
          ["lender", "금융사"],
          ["type", "대출 유형"],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label}>
          <input
            required
            maxLength={k === "type" ? 80 : 120}
            value={form[k]}
            onChange={(e) => update(k, e.target.value)}
          />
        </Field>
      ))}
      {(
        [
          ["remainingPrincipal", "남은 원금"],
          ["originalPrincipal", "최초 원금 (선택)"],
          ["interestRate", "금리 % (선택)"],
          ["monthlyPayment", "월 / 최소 납부액 (선택)"],
          ["paymentDay", "납부일 (1–31, 선택)"],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label}>
          <input
            required={k === "remainingPrincipal"}
            type="number"
            min={k === "paymentDay" ? 1 : 0}
            max={
              k === "paymentDay" ? 31 : k === "interestRate" ? 100 : undefined
            }
            step={
              k === "paymentDay" ? 1 : k === "interestRate" ? "0.0001" : "0.01"
            }
            value={form[k]}
            onChange={(e) => update(k, e.target.value)}
          />
        </Field>
      ))}
      {(
        [
          ["nextDueDate", "다음 납부일"],
          ["startDate", "시작일"],
          ["maturityDate", "만기일"],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label}>
          <input
            type="date"
            value={form[k]}
            onChange={(e) => update(k, e.target.value)}
          />
        </Field>
      ))}
      <Field label="납부 계좌">
        <select
          value={form.paymentAccountId}
          onChange={(e) => update("paymentAccountId", e.target.value)}
        >
          <AccountOptions accounts={p.accounts} />
        </select>
      </Field>
      <Field label="대출 상태">
        <select
          value={form.status}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="ACTIVE">상환 중</option>
          <option value="COMPLETED">완료 (남은 원금 0)</option>
        </select>
      </Field>
      <Field label="대출 메모">
        <textarea
          maxLength={2000}
          value={form.memo}
          onChange={(e) => update("memo", e.target.value)}
        />
      </Field>
      <p className="money-muted">
        현재 원금을 직접 확인해 저장합니다. 원금·이자 자동 배분은 하지 않습니다.
      </p>
    </EditorForm>
  );
}
function RuleEditor(p: Props & { value: Rule | null }) {
  const [error, setError] = useState("");
  const r = p.value,
    [merchant, setMerchant] = useState(r?.merchant || ""),
    [category, setCategory] = useState(r?.categoryId || ""),
    [title, setTitle] = useState(r?.titleDefault || ""),
    [memo, setMemo] = useState(r?.memoDefault || ""),
    [enabled, setEnabled] = useState(r?.enabled !== false);
  return (
    <EditorForm
      title={r ? "규칙 수정" : "규칙 추가"}
      onClose={p.onClose}
      onSave={async () => {
        const input = {
          merchant,
          categoryId: category,
          titleDefault: title || null,
          memoDefault: memo || null,
          enabled,
          expectedVersion: r?.version,
        };
        if (r) await api.put("/category-rules/" + r.id, input);
        else await api.post("/category-rules", input);
        p.onSaved();
      }}
      actions={
        r && (
          <button
            type="button"
            onClick={async () => {
              if (
                window.confirm(
                  "규칙을 삭제할까요? 기존 금융 기록은 유지됩니다.",
                )
              ) {
                try {
                  await api.delete(
                    "/category-rules/" + r.id + "?expectedVersion=" + r.version,
                  );
                  p.onSaved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "삭제 실패");
                }
              }
            }}
          >
            규칙 삭제
          </button>
        )
      }
    >
      {error && <p role="alert">{error}</p>}
      <Field label="거래처 정확히 일치">
        <input
          required
          maxLength={500}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
      </Field>
      <Field label="규칙 카테고리">
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <CategoryOptions categories={p.categories} />
        </select>
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
      <label className="money-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        활성
      </label>
    </EditorForm>
  );
}
function CategoryEditor(p: Props & { value: Category | null }) {
  const c = p.value,
    [name, setName] = useState(c?.name || ""),
    [color, setColor] = useState(c?.color || "#64748b"),
    [archived, setArchived] = useState(c?.archived || false);
  return (
    <EditorForm
      title="카테고리 수정"
      onClose={p.onClose}
      onSave={async () => {
        const input = { name, color, archived, expectedVersion: c?.version };
        if (c) await api.put("/categories/" + c.id, input);
        else await api.post("/categories", input);
        p.onSaved();
      }}
    >
      <Field label="카테고리 이름">
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="카테고리 색상">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </Field>
      <label className="money-check">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        보관
      </label>
    </EditorForm>
  );
}
function ReviewEditor(p: Props & { value: Raw }) {
  const r = p.value,
    { data, error, loading } = useMoneyData<Attempt[]>(
      "/notifications/" + r.id + "/parse-attempts",
    );
  const [actionError, setActionError] = useState("");
  if (!data)
    return (
      <MoneyPanel title="검토 항목 처리" onClose={p.onClose}>
        <LoadState error={error} loading={loading} />
      </MoneyPanel>
    );
  const c = data.at(-1)?.candidate;
  const resolve = (hint: string | undefined) => {
    const matches = p.accounts.filter(
      (a) =>
        !a.archived &&
        hint &&
        ((a.suffix && hint.includes(a.suffix)) ||
          (a.maskedReference && hint.includes(a.maskedReference))),
    );
    return matches.length === 1 ? matches[0].id : null;
  };
  const value: Partial<Transaction> = {
    type:
      c?.sourceAccountHint && c?.destinationAccountHint
        ? "TRANSFER"
        : c?.direction === "IN"
          ? "INCOME"
          : "EXPENSE",
    fromAccountId: resolve(c?.sourceAccountHint),
    toAccountId: resolve(c?.destinationAccountHint),
    amount: c?.amount,
    occurredAt: c?.occurredAt || r.postedAt,
    counterpartyText: c?.counterpartyText,
    title: r.title || undefined,
  };
  async function action(kind: string) {
    try {
      await api.post("/notifications/" + r.id + "/" + kind, {
        expectedVersion: r.processingVersion,
      });
      p.onSaved();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "처리 실패");
    }
  }
  return (
    <EntryForm
      key={r.id + (data.at(-1)?.id || "")}
      value={value}
      accounts={p.accounts}
      categories={p.categories}
      refunds={[]}
      title="검토 항목 처리"
      onClose={p.onClose}
      onSave={async (input) => {
        await api.post("/review/confirm", {
          transaction: input,
          rawIds: [r.id],
          expectedVersions: [r.processingVersion],
        });
        p.onSaved();
      }}
    >
      <p className="money-muted">
        {r.processingReason} · 계좌와 금액을 확인해 승인하세요.
      </p>
      <RawEvidence id={r.id} />
      <div className="money-review-actions">
        <button className="money-primary" type="submit">
          승인
        </button>
        <button type="submit">수정 후 승인</button>
        <button type="button" onClick={() => void action("defer")}>
          보류
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "자동 처리에서 제외할까요? 원본 알림은 유지됩니다.",
              )
            )
              void action("exclude");
          }}
        >
          거절
        </button>
      </div>
      {actionError && <p role="alert">{actionError}</p>}
    </EntryForm>
  );
}

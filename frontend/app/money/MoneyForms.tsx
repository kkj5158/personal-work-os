"use client";
import { categoryIndex } from "@/lib/money/categories";
import Image from "next/image";
import { MoneyPanel as Dialog, PanelContext } from "./MoneyPanel";
import { useState, useContext, useId, Children, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { Button } from "@/components/ui/Button";
import {activeCategories,baseDirection} from "@/lib/money/categorySemantics";
import {loanAllocation,type UnifiedRow} from "@/lib/money/unified";
import {useMoneyData,type Loan} from "./MoneyWebData";
import { CategoryPicker } from "./MoneyCategoryPicker";
import {
  Account,
  Category,
  Transaction,
  Role,
  Kind,
  roles,
  providers,
  kinds,
  accountName,
  seoul,
  iso,
} from "@/lib/money/model";
export { MoneyPanel as Dialog } from "./MoneyPanel";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <label className="money-field">
      <span id={labelId}>{label}</span>
      {Children.map(children, child => isValidElement(child) && typeof child.type === 'string' && ['input','select','textarea'].includes(child.type)
        ? cloneElement(child as ReactElement<{ 'aria-labelledby'?: string }>, { 'aria-labelledby': labelId }) : child)}
    </label>
  );
}
/** Archived accounts are hidden from new choices, but an existing historical reference stays visible and selectable. */
export function AccountOptions({
  accounts,
  includeArchived = false,
  keep = [],
}: {
  accounts: Account[];
  includeArchived?: boolean;
  keep?: (string | null | undefined)[];
}) {
  return (
    <>
      <option value="">계좌 선택</option>
      {accounts
        .filter((a) => includeArchived || !a.archived || keep.includes(a.id))
        .map((a) => (
          <option value={a.id} key={a.id}>
            {accountName(a)}
            {a.archived ? " (보관됨)" : ""}
          </option>
        ))}
    </>
  );
}
export function CategoryOptions({ categories }: { categories: Category[] }) {
  const tree=categoryIndex(categories);
  return (
    <>
      <option value="">미분류</option>
      {categories
        .filter(tree.active)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {tree.path(c.id)}
          </option>
        ))}
    </>
  );
}
export function AccountForm({
  value,
  accounts,
  onSave,
  onClose,
  children,
}: {
  value: Account | null;
  accounts: Account[];
  onSave: (input: unknown) => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { setDirty } = useContext(PanelContext);
  const [name, setName] = useState(value?.displayName ?? ""),
    [provider, setProvider] = useState(value?.provider ?? "SHINHAN"),
    [role, setRole] = useState<Role>(value?.role ?? "SPENDING"),
    [suffix, setSuffix] = useState(value?.suffix ?? ""),
    [masked, setMasked] = useState(value?.maskedReference ?? ""),
    [emoji, setEmoji] = useState(value?.emoji ?? ""),
    [image, setImage] = useState(value?.imageData ?? ""),
    [parent, setParent] = useState(value?.fundingAccountId ?? ""),
    [accountMemo,setAccountMemo]=useState(value?.memo??""),
    [includeAssets, setIncludeAssets] = useState(
      value?.includeInAssets ?? true,
    ),
    [includeStatistics, setIncludeStatistics] = useState(
      value?.includeInStatistics ?? true,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        ) ||
        file.size > 10485760
      )
        throw Error("10MB 이하의 이미지를 선택하세요.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext("2d")!
        .drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
      bitmap.close();
      setDirty(true);
      setImage(canvas.toDataURL("image/png"));
      setEmoji("");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Dialog
      title={value ? "계좌 수정" : "계좌 등록"}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({
              provider: role === "CASH" ? "CASH" : provider,
              displayName: name,
              role,
              suffix: role === "CASH" ? null : suffix || null,
              maskedReference: role === "CASH" ? null : masked || null,
              emoji: emoji || null,
              imageData: image || null,
              fundingAccountId: parent || null,
              memo: accountMemo,
              includeInAssets: includeAssets,
              includeInStatistics: includeStatistics,
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="money-form-grid">
          <Field label="은행 / 제공자">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={role === "CASH"}
            >
              {Object.entries(providers)
                .filter(([k]) => k !== "CASH" || role === "CASH")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="계좌 별명">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="생활비"
            />
          </Field>
          <Field label="용도">
            <select
              value={role}
              onChange={(e) => {
                const r = e.target.value as Role;
                setRole(r);
                if (r === "CASH") setProvider("CASH");
                else if (provider === "CASH") setProvider("SHINHAN");
              }}
            >
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="주 자금 출발 계좌 (구조)">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">지정하지 않음</option>
              {accounts
                .filter((a) => !a.archived && a.id !== value?.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountName(a)}
                  </option>
                ))}
            </select>
          </Field>
          {role !== "CASH" && (
            <>
              <Field label="끝자리 (최대 4자리)">
                <input
                  inputMode="numeric"
                  pattern="[0-9]{1,4}"
                  maxLength={4}
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="알림에 표시되는 끝자리"
                />
              </Field>
              <Field label="마스킹 계좌 힌트">
                <input
                  maxLength={100}
                  value={masked}
                  onChange={(e) => setMasked(e.target.value)}
                  placeholder="알림과 동일한 * 포함 표기"
                />
              </Field>
            </>
          )}
        </div>
        <p className="money-muted">
          전체 계좌번호를 입력하지 마세요. 목적별 저축은 중간출금 가능, 목적별
          적금은 중간출금 불가 상품을 뜻합니다.
        </p>
        <Field label="계좌 메모"><textarea maxLength={2000} value={accountMemo} onChange={e=>setAccountMemo(e.target.value)}/></Field>
        <Field label="대표 이모지">
          <input
            maxLength={32}
            value={emoji}
            onChange={(e) => {
              setEmoji(e.target.value);
              setImage("");
            }}
            placeholder="💳"
          />
        </Field>
        <div className="money-emoji">
          {["💳", "🌱", "🏠", "✈️", "🎯", "💰", "🎁", "🪙"].map((icon) => (
            <button
              type="button"
              key={icon}
              aria-label={icon}
              onClick={() => {
                setDirty(true);
                setEmoji(icon);
                setImage("");
              }}
            >
              {icon}
            </button>
          ))}
        </div>
        <Field label="대표 이미지 · 중앙 정사각형으로 자르기">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </Field>
        {image && (
          <Image
            unoptimized
            src={image}
            alt="대표 이미지 미리보기"
            width={64}
            height={64}
          />
        )}
        <button
          type="button"
          className="money-link"
          onClick={() => {
            setDirty(true);
            setEmoji("");
            setImage("");
          }}
        >
          기본 아이콘 사용
        </button>
        <label className="money-check">
          <input
            type="checkbox"
            checked={includeAssets}
            onChange={(e) => setIncludeAssets(e.target.checked)}
          />
          자산 합계에 포함
        </label>
        <label className="money-check">
          <input
            type="checkbox"
            checked={includeStatistics}
            onChange={(e) => setIncludeStatistics(e.target.checked)}
          />
          가계부 · 행동 통계에 포함
        </label>
        {children}
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button type="button" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "저장 중…" : "계좌 저장"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
/** Categories are meaning for income or consumption only; refunds offset the consumption dictionary. */
export function categoryKind(type: Kind): "INCOME" | "EXPENSE" | null {
  return type === "INCOME" ? "INCOME" : type === "EXPENSE" || type === "REFUND" ? "EXPENSE" : null;
}
function SimilarEntries({account,at,amount}:{account:string;at:string;amount:number}){
  const day=at.slice(0,10);
  const query=new URLSearchParams({accountId:account,from:day,to:day,minAmount:String(amount),maxAmount:String(amount),limit:"5"});
  const rows=useMoneyData<{items:Transaction[]}>(account&&day&&Number.isFinite(amount)&&amount>0?"/transactions?"+query:null);
  return rows.data?.items.length?<details><summary>같은 날짜·계좌·금액의 기존 거래 {rows.data.items.length}건 확인</summary><ul>{rows.data.items.map(t=><li key={t.id}>{seoul(t.occurredAt)} · {t.title||t.counterpartyText||kinds[t.type]}</li>)}</ul><p>별도 등록하면 새 거래가 생성됩니다.</p></details>:null;
}

export function EntryForm({
  value,
  accounts,
  categories,
  refunds,
  onTypeChange,
  onSave,
  onClose,
  manual = false,
  loans=[],loanError,
  onRefundSearch,
  title = "거래 기록",
  children,
}: {
  value: Partial<Transaction> | null;
  accounts: Account[];
  categories: Category[];
  refunds: Transaction[];
  manual?: boolean;
  loans?: Loan[];loanError?:string|null;
  onRefundSearch?: (search:string)=>void;
  onTypeChange?: (type: Kind) => void;
  onSave: (input: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}) {
  const [type, setType] = useState<Kind>(value?.type ?? "EXPENSE"),
    [from, setFrom] = useState(value?.fromAccountId ?? ""),
    [to, setTo] = useState(value?.toAccountId ?? ""),
    [amount, setAmount] = useState(String(value?.amount ?? "")),
    [at, setAt] = useState(
      seoul(value?.occurredAt ?? new Date().toISOString()),
    ),
    [cp, setCp] = useState(value?.counterpartyText ?? ""),
    [cat, setCat] = useState(value?.type==="REFUND"&&!value.id
      ? activeCategories(categories,"INCOME").find(c=>c.semanticCode==="REFUND")?.id??"" : value?.categoryId??""),
    [memo, setMemo] = useState(value?.memo ?? ""),
    [entryTitle, setEntryTitle] = useState(value?.title ?? ""),
    [excluded, setExcluded] = useState(value?.excluded ?? false),
    [refund, setRefund] = useState(value?.refundOf ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const direction=baseDirection({type});
  const selected=categories.find(c=>c.id===cat);
  const special=selected?.semanticCode;
  const [loanId,setLoanId]=useState(""),[principal,setPrincipal]=useState(""),[interest,setInterest]=useState(""),[fee,setFee]=useState("");
  const [approve,setApprove]=useState(false);
  const loanType=type==="LOAN_PAYMENT"||type==="LOAN_RECEIPT";
  const loan=loans.find(l=>l.id===loanId && l.status!=="INACTIVE");
  function chooseCategory(id:string) {
    const category=activeCategories(categories,direction).find(c=>c.id===id);
    if(id&&!category)return;
    if(value?.id && (category?.semanticCode || value.type==="REFUND")) {
      setError("연결된 거래의 금융 의미는 거래장 상세 편집에서 영향을 확인한 뒤 정정하세요.");
      return;
    }
    const next=category?.semanticCode??direction;
    setCat(id);setType(next);if(category?.semanticCode)setExcluded(false);onTypeChange?.(next);setRefund("");setLoanId("");setPrincipal("");setInterest("");setFee("");setApprove(false);
  }
  return (
    <Dialog title={title} onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if(special && (!Number.isInteger(selected?.semanticPolicyVersion)||value?.id)) throw Error("거래장 상세 편집에서 최신 분류 정책을 확인하세요.");
            if(!value?.id && ["REFUND","LOAN_PAYMENT","LOAN_RECEIPT"].includes(type) && !special)throw Error("적용 가능한 금융 분류를 먼저 선택하세요.");
            const pending=!!special&&!approve;
            if (approve && loanType && !loan) throw Error("연결할 대출을 확인하세요.");
            if (approve && type==="LOAN_PAYMENT") {
              const allocation=loanAllocation({amount:Number(amount)} as UnifiedRow,{principal,interest,fee});
              if(!allocation.valid || allocation.unknown) throw Error("원금·이자·수수료 합계를 출금액과 맞춰 주세요.");
            }
            if (approve && type==="REFUND" && !refund) throw Error("환불을 확정할 원소비를 선택하세요.");
            await onSave({
              type: pending ? direction : type,
              ...(special?{semanticCategoryId:cat,semanticPolicyVersion:selected?.semanticPolicyVersion}:{}),
              ...(approve&&loanType?{loanId,loanVersion:loan?.version,principal,interest,fee}:{}),
              fromAccountId:
                direction === "EXPENSE" || direction === "TRANSFER" ? from || null : null,
              toAccountId: direction !== "EXPENSE" ? to || null : null,
              amount: Number(amount),
              occurredAt: value?.occurredAt && at === seoul(value.occurredAt) ? value.occurredAt : iso(at),
              counterpartyText: cp || null,
              categoryId:
                special ? null : cat || null,
              memo: memo || null,
              title: entryTitle || null,
              excluded,
              refundOf: !pending&&type === "REFUND" ? refund || null : null,
              expectedVersion: value?.version,
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="money-form-grid">
          <Field label="유형">
            <select disabled={!!(value?.id&&value.type==="REFUND")} value={direction} onChange={e=>{
              const next=e.target.value as Kind;
              if(categories.find(c=>c.id===cat)?.kind!==categoryKind(next))setCat("");
              setType(next);setRefund("");setApprove(false);onTypeChange?.(next);
            }}>
              <option value="INCOME">입금</option><option value="EXPENSE">출금</option><option value="TRANSFER">이체</option>
            </select>
          </Field>
          <Field label="금액 (KRW)">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="거래 시각 · 한국 시간">
            <input
              required
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          {(direction === "EXPENSE" || direction === "TRANSFER") && (
            <Field label="출금 계좌">
              <select
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <AccountOptions accounts={accounts} keep={[value?.fromAccountId]} />
              </select>
            </Field>
          )}
          {direction !== "EXPENSE" && (
            <Field label="입금 계좌">
              <select
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <AccountOptions accounts={accounts} keep={[value?.toAccountId]} />
              </select>
            </Field>
          )}
          <Field label="거래처 / 상대">
            <input
              maxLength={500}
              value={cp}
              onChange={(e) => setCp(e.target.value)}
            />
          </Field>
          {direction!=="TRANSFER"&&<Field label={direction==="INCOME"?"수입 카테고리":"소비 카테고리"}>
            <CategoryPicker label={direction==="INCOME"?"수입 카테고리":"소비 카테고리"} value={cat} onChange={chooseCategory}
              categories={activeCategories(categories,direction).filter(c=>!value?.id || !c.semanticCode)}/>
          </Field>}
        </div>
        {loanType&&<section><Field label="연결 대출"><select value={loanId} onChange={e=>{setLoanId(e.target.value);setApprove(false);}}>
          <option value="">대출 연결 대기</option>{loans.filter(l=>l.status!=="INACTIVE").map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          {loanError&&<p role="alert">{loanError}</p>}
          {type==="LOAN_PAYMENT"&&<div className="money-form-grid">{([["원금",principal,setPrincipal],["이자",interest,setInterest],["수수료",fee,setFee]] as const).map(([name,value,set])=><Field key={name} label={name}><input type="number" min="0" step="0.01" value={value} onChange={e=>{set(e.target.value);setApprove(false);}}/></Field>)}</div>}
        </section>}
        {type === "TRANSFER" && <p className="money-financial-notice">내 소유 계좌 사이의 이동입니다. 수입·소비로 합산하지 않으며 저축 영역을 넘는 순이동만 순저축에 반영합니다.</p>}
        {type === "REFUND" && <p className="money-financial-notice">연결한 소비를 상쇄하는 환불입니다. 일반 수입으로 합산하지 않습니다.</p>}
        {type === "REFUND" && (
          <><Field label="원소비 검색"><input onChange={e=>onRefundSearch?.(e.target.value)}/></Field><Field label="원 소비 연결 (선택)">
            <select value={refund} onChange={(e) => setRefund(e.target.value)}>
              <option value="">연결 없이 환불로 기록</option>
              {refunds.map((t) => (
                <option key={t.id} value={t.id}>
                  {seoul(t.occurredAt).slice(0, 10)} ·{" "}
                  {t.counterpartyText ?? "소비"} · {t.amount}원
                </option>
              ))}
              {refund && !refunds.some((t) => t.id === refund) && (
                <option value={refund}>연결된 원 소비</option>
              )}
            </select>
          </Field></>
        )}
        {special&&<label className="money-check"><input type="checkbox" checked={approve} onChange={e=>setApprove(e.target.checked)}/>관계와 금액을 확인하여 금융 원장에 반영</label>}
        {special&&!approve&&<p role="status">연결 대기로 저장합니다. 계좌 이동을 기록하고 부채와 환불 차감은 보류합니다.</p>}
        {manual&&<SimilarEntries account={direction==="EXPENSE"||direction==="TRANSFER"?from:to} at={at} amount={Number(amount)}/>}
        <Field label="제목">
          <input
            maxLength={240}
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            placeholder="비워 두면 출발 → 도착 자동 제목"
          />
        </Field>
        <Field label="메모">
          <textarea
            maxLength={2000}
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </Field>
        <label className="money-check">
          <input
            type="checkbox"
            checked={excluded}
            disabled={!!special}
            onChange={(e) => setExcluded(e.target.checked)}
          />{" "}
          장부 및 통계에서 제외
        </label>
        <p className="money-muted">
          이체는 장부 기록입니다. 실제 송금은 실행하지 않습니다. 원본 알림은
          수정되지 않습니다.
        </p>
        {children}
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button type="button" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

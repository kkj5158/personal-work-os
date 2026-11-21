"use client";

import { useEffect, useState, type ReactNode } from "react";
import { moneyAmount } from "@/lib/money/accounts";
import { seoul } from "@/lib/money/model";
import { filterLoans, loanColumns, loanMetrics, loanOutstanding, loanStatuses, type LoanColumn, type LoanFilters } from "@/lib/money/loans";
import { useMoneyViewState } from "./MoneyDataProvider";
import { LoanSaveFeedback, useLoanFieldSave } from "./MoneyLoanActions";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import type { Props, Selection } from "./MoneyWebViews";
import "./money-accounts-v3.css";
import "./money-loans.css";

const initialFilters: LoanFilters = { status: "ACTIVE", search: "", lender: "", allocation: "all", sort: "high" };
const columnEntries = Object.entries(loanColumns) as [LoanColumn, string][];
const count = (value: number | null) => value == null ? "—" : `${value.toLocaleString("ko-KR")}건`;

export function LoansView({ detail, selection, onboarding, hasDraft = false, ...props }: Props & {
  detail: ReactNode;
  selection: Selection | null;
  onboarding: ReactNode;
  hasDraft?: boolean;
}) {
  const result = useMoneyData<Loan[]>("/loans");
  const [filters, setFilters] = useMoneyViewState("loans-filters", () => initialFilters);
  const [hidden, setHidden] = useMoneyViewState<LoanColumn[]>("loans-hidden-columns", () => []);
  const [checked, setChecked] = useState<string[]>([]);
  const action = useLoanFieldSave();
  const data = result.data;
  const loans = data ?? [];
  const rows = filterLoans(loans, filters);
  const metrics = loanMetrics(data);
  const lenders = [...new Set(loans.map(loan => loan.lender))].sort((a, b) => a.localeCompare(b, "ko"));
  const checkedRows = rows.filter(loan => checked.includes(loan.id));
  const allChecked = rows.length > 0 && checkedRows.length === rows.length;
  const readSelection = selection?.kind === "loan" && !selection.edit ? selection.value?.id : undefined;
  const selectionHidden = Boolean(readSelection && data && !rows.some(loan => loan.id === readSelection));
  const { clearSelection } = props;

  useEffect(() => {
    if (selectionHidden && !hasDraft) clearSelection?.();
  }, [selectionHidden, hasDraft, clearSelection]);

  function filter<K extends keyof LoanFilters>(key: K, value: LoanFilters[K]) {
    const next = { ...filters, [key]: value };
    if (readSelection && !filterLoans(loans, next).some(loan => loan.id === readSelection)
        && props.changeContext?.() === false) return;
    setFilters(next);
  }

  const visible = (key: LoanColumn) => !hidden.includes(key);
  const open = (loan: Loan) => props.select({ kind: "loan", value: loan });
  return <section className="money-v3 money-loans" aria-label="대출 관리">
    <div className="money-toolbar money-loans-toolbar">
      <div role="group" aria-label="대출 상태 필터">
        {([...Object.entries(loanStatuses), ["all", "전체"]] as [LoanFilters["status"], string][]).map(([status, label]) =>
          <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => filter("status", status)}>{label}</button>)}
      </div>
      <input type="search" aria-label="대출 검색" placeholder="대출 · 금융기관 · 상품 검색" value={filters.search} onChange={event => filter("search", event.target.value)} />
      <select aria-label="금융기관 필터" value={filters.lender} onChange={event => filter("lender", event.target.value)}>
        <option value="">모든 금융기관</option>
        {filters.lender && !lenders.includes(filters.lender) && <option value={filters.lender}>{filters.lender}</option>}
        {lenders.map(lender => <option key={lender} value={lender}>{lender}</option>)}
      </select>
      <select aria-label="상환 배분 필터" value={filters.allocation} onChange={event => filter("allocation", event.target.value as LoanFilters["allocation"])}>
        <option value="all">모든 배분 상태</option><option value="pending">미확정 있음</option><option value="clear">미확정 없음</option>
      </select>
      <select aria-label="대출 정렬" value={filters.sort} onChange={event => filter("sort", event.target.value as LoanFilters["sort"])}>
        <option value="high">잔액 높은 순</option><option value="low">잔액 낮은 순</option><option value="name">이름 순</option>
      </select>
      <button type="button" className="money-primary" onClick={() => props.select({ kind: "loan", value: null })}>+ 대출 추가</button>
      <details className="money-v3-columns money-loan-columns">
        <summary>열 설정</summary>
        <div>{columnEntries.map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={visible(key)} onChange={event => {
            const show = event.target.checked;
            setHidden(old => show ? old.filter(column => column !== key) : [...old, key]);
          }} />{label}
        </label>)}</div>
      </details>
    </div>
    <dl className="money-loans-kpis" aria-label="대출 요약">
      <div><dt>전체 남은 원금</dt><dd>{moneyAmount(metrics.outstanding)}</dd><small>일시 중지·비활성 부채 포함</small></div>
      <div><dt>잔여 부채</dt><dd>{count(metrics.remaining)}</dd><small>상환 중 대출 {count(metrics.active)}</small></div>
      <div><dt>상환 배분 미확정</dt><dd>{count(metrics.unresolved)}</dd><small>원금·소비 추정 제외</small></div>
    </dl>
    <LoadState {...result} hideLastChecked />
    <LoanSaveFeedback action={action} />
    <div className="money-loans-summary">
      <span role="status">{data && `${rows.length.toLocaleString("ko-KR")}건 표시`}</span>
      {checkedRows.length > 0 && <span>{count(checkedRows.length)} 선택 <button type="button" onClick={() => setChecked([])}>선택 해제</button></span>}
    </div>
    <div className="money-workspace persistent">
      <div className="money-workspace-list">
        <div className="money-v3-scroll money-loans-scroll" role="region" aria-label="대출 표 스크롤" tabIndex={0}>
          <table aria-label="대출 목록" className="money-v3-table money-loans-table">
            <thead><tr>
              <th scope="col"><input aria-label="표시된 대출 모두 선택" type="checkbox" checked={allChecked} disabled={!rows.length}
                ref={node => { if (node) node.indeterminate = checkedRows.length > 0 && !allChecked; }}
                onChange={event => setChecked(event.target.checked ? rows.map(loan => loan.id) : [])} /></th>
              <th scope="col">대출 · 금융기관</th><th scope="col">대출 상태</th>
              {visible("rate") && <th scope="col">{loanColumns.rate}</th>}
              {visible("original") && <th scope="col">{loanColumns.original}</th>}
              <th scope="col">남은 원금</th>
              {visible("allocation") && <th scope="col">{loanColumns.allocation}</th>}
              {visible("latest") && <th scope="col">{loanColumns.latest}</th>}
              <th scope="col">상세</th>
            </tr></thead>
            <tbody>{rows.map(loan => <tr key={loan.id} data-selected={readSelection === loan.id} onClick={() => open(loan)}>
              <td onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`${loan.name} 선택`} checked={checked.includes(loan.id)}
                onChange={event => { const next = event.target.checked; setChecked(old => next ? [...old, loan.id] : old.filter(id => id !== loan.id)); }} /></td>
              <td><button type="button" className="money-v3-name money-loan-identity" aria-label={`${loan.name} 상세 열기`}
                onClick={event => { event.stopPropagation(); open(loan); }}>
                <span aria-hidden="true" className="money-loan-icon">{Array.from(loan.lender)[0]}</span>
                <span><strong>{loan.name}</strong><small>{loan.lender} · {loan.type}</small></span>
              </button></td>
              <td onClick={event => event.stopPropagation()}>
                <select aria-label={`${loan.name} 대출 상태`} value={loan.status} disabled={Boolean(action.pending || action.needsRefresh || result.error)}
                  onChange={event => void action.save(loan.id, loan.version, { status: event.target.value as Loan["status"] })}>
                  {Object.entries(loanStatuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                </select>
              </td>
              {visible("rate") && <td><strong>{loan.interestRate == null ? "—" : `${loan.interestRate}%`}</strong><small>{loan.interestRate == null ? "미등록" : "연 금리"}</small></td>}
              {visible("original") && <td><strong>{moneyAmount(loan.facilityLimit ?? loan.originalPrincipal)}</strong><small>{loan.facilityLimit != null ? "대출 한도" : loan.originalPrincipal == null ? "최초 원금 미등록" : "최초 원금"}</small></td>}
              <td><strong>{moneyAmount(loanOutstanding(loan))}</strong><small>{loan.facilityLimit != null ? "은행 잔액 기준 사용액" : "확정 남은 원금"}</small></td>
              {visible("allocation") && <td>{(loan.unresolvedAllocationCount ?? 0) > 0
                ? <span className="money-v3-status" data-bucket="CHECK">미확정 {count(loan.unresolvedAllocationCount ?? null)}</span>
                : <small>{loan.unresolvedAllocationCount === 0 ? "미확정 없음" : "확인 불가"}</small>}</td>}
              {visible("latest") && <td>{loan.latestConfirmedRepayment
                ? <><strong>{moneyAmount(loan.latestConfirmedRepayment.amount)}</strong><small>{seoul(loan.latestConfirmedRepayment.occurredAt).slice(0, 10)}</small></>
                : <><strong>—</strong><small>{loan.latestConfirmedRepayment === undefined ? "확인 불가" : "확정 기록 없음"}</small></>}</td>}
              <td><button type="button" aria-label={`${loan.name} 상세 보기`} onClick={event => { event.stopPropagation(); open(loan); }}>상세 보기</button></td>
            </tr>)}
            {rows.length === 0 && (data || result.error) && <tr><td colSpan={9 - hidden.length}>
              <p className="money-empty">{data ? loans.length ? "조건에 맞는 대출이 없습니다." : "등록된 대출이 없습니다." : "대출 목록을 조회할 수 없습니다."}</p>
            </td></tr>}
            </tbody>
          </table>
        </div>
        <p className="money-muted money-loans-note">확정 원금만 차감합니다. 배분 미확정 건은 상환 내역에서 연결 거래를 확인할 수 있습니다.</p>
        {onboarding}
      </div>
      {detail}
    </div>
  </section>;
}

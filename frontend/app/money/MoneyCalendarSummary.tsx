"use client";
import { useId, useState } from "react";
import { calendarChartGroups, calendarChartSectors, calendarSummaryGroups, calendarSummaryShare, type ChartGroup } from "@/lib/money/calendarSummary";
import { won, type Category } from "@/lib/money/model";
import type { BookPage } from "./MoneyWebData";

export type MoneyCalendarSummaryProps = {
  composition: BookPage["composition"];
  categories: Category[];
  total: number | null;
  month: string;
  filterContext: string;
  income: boolean;
  analyticsUnavailable?: boolean;
};

/** One chart and one complete category ranking, both from the same filtered ledger. */
export function MoneyCalendarSummary({ composition, categories, total, month, filterContext, income, analyticsUnavailable }: MoneyCalendarSummaryProps) {
  const headingId = useId(), detailId = useId();
  const [selected, setSelected] = useState<string | null>(null), [hovered, setHovered] = useState<string | null>(null);
  const data = calendarSummaryGroups(composition, categories, income);
  const groups = calendarChartGroups(income ? data.sources : data.ranking);
  const { available, sectors } = calendarChartSectors(groups, total);
  const active = groups.find(row => row.id === (hovered ?? selected));
  const tone = income ? "mc-income" : "mc-expense", circumference = 2 * Math.PI * 112;
  const label = income ? "수입원" : "중분류", title = income ? "수입원별 구성" : "소비 분류 요약";
  const description = (row: ChartGroup) => `${row.label} · ${won(row.amount)} · ${calendarSummaryShare(row.amount, total)} · ${row.count}건`;
  const choose = (id: string) => setSelected(old => old === id ? null : id);
  return <section className={`mc-card mc-below mc-breakdown ${income ? "mc-breakdown-income" : "mc-breakdown-expense"}`} aria-labelledby={headingId}>
    <h2 id={headingId}>{title} <small>현재 월 · 현재 필터</small></h2>
    {analyticsUnavailable ? <p className="mc-hint">여러 통화의 금액을 원화 구성비로 합산하지 않습니다. 당일 거래에서 통화를 확인하세요.</p> : <>
      <p className="mc-breakdown-caption">{income ? "도넛은 수입원별 · 아래 순위는 중분류별 구성입니다." : "중분류별 순지출 · 환불 차감 후 금액입니다."}</p>
      <div className="mc-breakdown-chart">
        <div className="mc-breakdown-ring">
          <svg viewBox="0 0 300 300" aria-label={`${label}별 ${income ? "확정 수입" : "순지출"} 구성`}>
            <circle cx="150" cy="150" r="112" fill="none" stroke="var(--money-border, #e2e8f0)" strokeWidth="39" />
            {available && sectors.map(row => row.share > 0 && <circle key={row.id} className="mc-breakdown-sector" cx="150" cy="150" r="112" fill="none" stroke={row.color} strokeWidth={active?.id === row.id ? 46 : 39} strokeDasharray={`${row.share * circumference} ${circumference}`} strokeDashoffset={-row.start * circumference} transform="rotate(-90 150 150)" role="button" tabIndex={0} aria-label={description(row)} aria-describedby={detailId} aria-pressed={selected === row.id} onMouseEnter={() => setHovered(row.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(row.id)} onBlur={() => setHovered(null)} onClick={() => choose(row.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(row.id); } }}><title>{description(row)}</title></circle>)}
          </svg>
          <div className="mc-breakdown-center"><small>{month.slice(0, 4)}년 {Number(month.slice(5))}월</small><span>{income ? "총 확정 수입" : "총 순지출"}</span><strong className={tone}>{total === null ? "—" : won(total)}</strong><small>{filterContext}</small></div>
        </div>
        <div className="mc-breakdown-legend"><h3>{label}별 구성</h3>{groups.length ? <ul>{groups.map(row => <li key={row.id}><button type="button" aria-pressed={selected === row.id} aria-describedby={detailId} onClick={() => choose(row.id)} onMouseEnter={() => setHovered(row.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(row.id)} onBlur={() => setHovered(null)}><i style={{ background: row.color }} /><span>{row.label}</span><b className={tone}>{won(row.amount)}</b><small>{calendarSummaryShare(row.amount, total)}</small></button></li>)}</ul> : <p className="mc-hint">표시할 구성 내역이 없습니다.</p>}</div>
      </div>
      <div className="mc-breakdown-focus" id={detailId} aria-live="polite">{active ? <><strong>{description(active)}</strong>{active.members && <span>{active.members.map(row => `${row.label} ${won(row.amount)} (${row.count}건)`).join(" · ")}</span>}</> : "구성 항목에 마우스를 올리거나 키보드로 선택하면 금액·비중·거래 수를 확인할 수 있습니다."}</div>
      {!available && groups.length > 0 && <p className="mc-breakdown-note" role="note">{groups.some(row => row.amount < 0) ? "환불 차감 후 음수인 항목이 있어 비중을 도넛으로 표시하지 않습니다. 아래 순금액과 거래 수를 확인하세요." : total === null || Math.abs(data.total - total) >= 0.01 ? "합계와 구성 내역을 확인할 수 없어 도넛 비중을 표시하지 않습니다." : "합계가 0원 이하인 경우 도넛 비중을 표시하지 않습니다."}</p>}
      <div className="mc-breakdown-ranking"><h3>{income ? "수입 중분류별 순위" : "소비 중분류별 순위"} <small>금액 내림차순 · 전체 {data.ranking.length}개</small></h3>
        {data.ranking.length ? <table><thead><tr><th scope="col">순위</th><th scope="col">분류{income ? " / 소분류·수입원" : " / 소분류"}</th><th scope="col">{income ? "수입" : "순지출"}</th><th scope="col">비중</th><th scope="col">거래</th></tr></thead><tbody>{data.ranking.map((row, index) => <tr key={row.id}><td>{index + 1}</td><th scope="row"><span className="mc-breakdown-category"><i style={{ background: row.color }} />{row.label}</span><details><summary>{income ? "소분류·수입원 상세" : "소분류 상세"}</summary><ul>{row.children.map(child => <li key={child.id}><span>{child.label} <b>{won(child.amount)}</b> · {child.count}건</span>{income && <ul>{child.sources.map(source => <li key={source.id}>{source.label} · {won(source.amount)} · {source.count}건</li>)}</ul>}</li>)}</ul></details></th><td className={tone}>{won(row.amount)}</td><td>{calendarSummaryShare(row.amount, total)}</td><td>{row.count}건</td></tr>)}</tbody></table> : <p className="mc-hint">이 달 또는 현재 필터에 해당하는 기록이 없습니다.</p>}
      </div>
    </>}
  </section>;
}

"use client";
import { useRef, useState } from "react";
import type { Account, Category } from "@/lib/money/model";
import { categoryIndex } from "@/lib/money/categories";
import { calendarCategorySelected, toggleCalendarCategory } from "@/lib/money/calendarFilters";
import { MoneyAnchoredPopover } from "./MoneyCategoryTree";
import { GroupedAccountFilter } from "./MoneyGroupedAccountFilter";
import "./money-calendar-filters.css";

export function MoneyCalendarFilters({ categories, accounts, categoryIds, accountIds, onCategories, onAccounts, onReset }: {
  categories: Category[]; accounts: Account[]; categoryIds: string[] | null; accountIds: string[] | null;
  onCategories: (ids: string[] | null) => void; onAccounts: (ids: string[] | null) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState<"categories" | "accounts" | null>(null), [search, setSearch] = useState("");
  const categoryTrigger = useRef<HTMLButtonElement>(null), accountTrigger = useRef<HTMLButtonElement>(null);
  const close = () => { (open === "categories" ? categoryTrigger : accountTrigger).current?.focus(); setOpen(null); };
  const tree = categoryIndex(categories), query = search.trim().toLocaleLowerCase();
  const chosen = (id: string) => calendarCategorySelected(categories, categoryIds, id);
  const checkbox = (id: string, name: string) => <label key={id}><input type="checkbox" checked={chosen(id)} onChange={() => onCategories(toggleCalendarCategory(categories, categoryIds, id))} />{name}</label>;
  return <div className="mc-filter-bar" role="group" aria-label="분류·계좌 필터">
    <div><button ref={categoryTrigger} type="button" aria-expanded={open === "categories"} onClick={() => { setOpen(open === "categories" ? null : "categories"); setSearch(""); }}>분류 선택 {categoryIds === null ? "· 전체" : `· ${categoryIds.length}개 조건`} ▾</button>
      {open === "categories" && <MoneyAnchoredPopover label="달력 분류 필터" className="mc-category-filter" onClose={() => setOpen(null)}>
        <header><strong>분류 선택</strong><button type="button" aria-label="분류 필터 닫기" onClick={close}>×</button></header>
        <input aria-label="달력 분류 검색" placeholder="중분류·소분류 이름 검색" value={search} onChange={event => setSearch(event.target.value)} />
        <button type="button" aria-pressed={categoryIds === null} onClick={() => onCategories(null)}>전체 분류</button>
        <div className="mc-category-options">{tree.roots.filter(root => root.name.toLocaleLowerCase().includes(query) || "소분류 없음".includes(query) || (tree.children.get(root.id) ?? []).some(child => child.name.toLocaleLowerCase().includes(query))).map(root => <fieldset key={root.id}>
          <legend>{checkbox(root.id, root.name)}</legend>
          <div>{(!query || root.name.toLocaleLowerCase().includes(query) || "소분류 없음".includes(query)) && checkbox(`direct:${root.id}`, "소분류 없음")}{(tree.children.get(root.id) ?? []).filter(child => root.name.toLocaleLowerCase().includes(query) || child.name.toLocaleLowerCase().includes(query)).map(child => checkbox(child.id, child.name))}</div>
        </fieldset>)}{(!query || "미분류".includes(query)) && checkbox("uncategorized", "미분류")}</div>
        <small>여러 분류 선택 가능 · 중분류는 하위 분류 포함 · 즉시 반영</small>
        {categoryIds?.length === 0 && <p role="status">선택한 분류가 없습니다.</p>}
      </MoneyAnchoredPopover>}
    </div>
    <div><button ref={accountTrigger} type="button" aria-expanded={open === "accounts"} onClick={() => setOpen(open === "accounts" ? null : "accounts")}>계좌 선택 {accountIds === null ? "· 전체" : `· ${accountIds.length}개`} ▾</button>
      {open === "accounts" && <MoneyAnchoredPopover label="달력 계좌 필터" className="mc-account-filter" onClose={() => setOpen(null)}><header><strong>계좌 선택</strong><button type="button" aria-label="계좌 필터 닫기" onClick={close}>×</button></header><GroupedAccountFilter accounts={accounts} value={accountIds} onChange={onAccounts} /></MoneyAnchoredPopover>}
    </div>
    <button type="button" disabled={categoryIds === null && accountIds === null} onClick={onReset}>초기화</button>
    {(categoryIds !== null || accountIds !== null) && <small className="mc-filter-active" role="status">필터 적용 중</small>}
  </div>;
}

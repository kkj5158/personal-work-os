"use client";
import { useState } from "react";
import { ICON_CATEGORIES, searchIcons, type IconCategory } from "./icons";

/** Lightweight category + search icon picker shared by every checklist item editor. */
export function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [category, setCategory] = useState<IconCategory | "all">("all");
  const [query, setQuery] = useState("");
  const icons = searchIcons(query, category);
  return (
    <div className="ckc-iconpicker">
      <div className="ckc-iconpicker-tools">
        <input type="search" aria-label="아이콘 검색" placeholder="아이콘 검색 (예: 물, 독서)" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="아이콘 분류" value={category} onChange={e => setCategory(e.target.value as IconCategory | "all")}>
          <option value="all">전체 분류</option>
          {ICON_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <div className="ckc-iconpicker-grid" role="radiogroup" aria-label="아이콘">
        {icons.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} aria-label={`${label} 아이콘`} title={label} onClick={() => onChange(key)}>
            <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
        {!icons.length && <p>일치하는 아이콘이 없습니다.</p>}
      </div>
    </div>
  );
}

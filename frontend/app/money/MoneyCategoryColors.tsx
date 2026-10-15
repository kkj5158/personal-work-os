"use client";
import { useMoneyViewState } from "./MoneyDataProvider";
export const CATEGORY_COLORS = ["#5b8def", "#2563eb", "#57abc3", "#45ae99", "#0f766e", "#84a64d", "#e1a34a", "#d97706", "#e9788d", "#D86F72", "#be4563", "#9771d7", "#6d4fb3", "#718096", "#475569"];
export function CategoryColorPalette({value,onChange}:{value:string;onChange:(color:string)=>void}) {
  const [recent] = useMoneyViewState<string[]>("category-recent-colors",()=>[]);
  const swatches = (colors:string[]) => <div className="money-color-swatches">{colors.map(color=><button type="button" key={color} aria-label={`색상 ${color}`} aria-pressed={value.toLowerCase()===color.toLowerCase()} style={{background:color}} onClick={()=>onChange(color)}><span aria-hidden="true">{value.toLowerCase()===color.toLowerCase()?"✓":""}</span></button>)}</div>;
  return <div className="money-category-palette"><small>대표 색상 · 선택 후 분류 저장</small>{swatches(CATEGORY_COLORS)}{recent.length>0&&<><small>최근 저장 색상</small>{swatches(recent)}</>}<details><summary>맞춤 팔레트</summary><input aria-label="맞춤 카테고리 색상" type="color" value={value} onChange={e=>onChange(e.target.value)}/><span>{value}</span></details></div>;
}

"use client";
import { useState } from "react";
import { Utensils, Soup, Pizza, Salad, Coffee, CupSoda, Croissant, Cookie, House, Building, BedDouble, Sofa, Car, Bus, TrainFront, Bike, ShoppingBag, ShoppingCart, Shirt, Store, Pill, Hospital, Stethoscope, HeartPulse, Dumbbell, Trophy, Volleyball, Activity, BookOpen, GraduationCap, School, Pencil, Clapperboard, Music, Headphones, Palette, Plane, Luggage, Hotel, Tent, Gift, Cake, Flower, Handshake, BriefcaseBusiness, Monitor, Laptop, Printer, Tv, Smartphone, Repeat, Bell, Lightbulb, Plug, Droplets, Flame, Banknote, Coins, Receipt, Wallet, Factory, ClipboardList, ChartColumn, Phone, PiggyBank, Landmark, Vault, Target, TrendingUp, TrendingDown, ChartNoAxesCombined, Scale, ArrowLeftRight, Send, CreditCard, ArrowDownUp, FileText, ScrollText, Hourglass, CircleAlert, Tag } from "lucide-react";
import type { CategoryIcon, TreeCategory } from "@/lib/money/categories";
import { ICON_CANDIDATES, ICON_DOMAINS, readCategoryIcon, searchCategoryIcons } from "@/lib/money/categoryIcons";
import { useMoneyViewState } from "./MoneyDataProvider";
import { MoneyAnchoredPopover } from "./MoneyCategoryTree";
import "./money-category.css";

const internalIcons = { Utensils, Soup, Pizza, Salad, Coffee, CupSoda, Croissant, Cookie, House, Building, BedDouble, Sofa, Car, Bus, TrainFront, Bike, ShoppingBag, ShoppingCart, Shirt, Store, Pill, Hospital, Stethoscope, HeartPulse, Dumbbell, Trophy, Volleyball, Activity, BookOpen, GraduationCap, School, Pencil, Clapperboard, Music, Headphones, Palette, Plane, Luggage, Hotel, Tent, Gift, Cake, Flower, Handshake, BriefcaseBusiness, Monitor, Laptop, Printer, Tv, Smartphone, Repeat, Bell, Lightbulb, Plug, Droplets, Flame, Banknote, Coins, Receipt, Wallet, Factory, ClipboardList, ChartColumn, Phone, PiggyBank, Landmark, Vault, Target, TrendingUp, TrendingDown, ChartNoAxesCombined, Scale, ArrowLeftRight, Send, CreditCard, ArrowDownUp, FileText, ScrollText, Hourglass, CircleAlert };
export function CategoryIconView({ icon, category, label = "분류" }: { icon?: CategoryIcon | null; category?: TreeCategory; label?: string }) {
  const ref = icon === undefined ? readCategoryIcon(category) : icon;
  if (ref?.type === "EMOJI") return <span className="money-category-icon" aria-hidden="true" title={label}>{ref.value}<Tag className="emoji-fallback" size={17}/></span>;
  const Icon = ref?.type === "ICON" ? internalIcons[ref.value as keyof typeof internalIcons] ?? Tag : Tag;
  return <span className="money-category-icon" aria-hidden="true" title={label}><Icon size={18}/></span>;
}
export function IconPicker({ value, onChange, categoryName = "" }: { value: CategoryIcon | null; onChange: (value: CategoryIcon | null) => void; categoryName?: string }) {
  const [open,setOpen] = useState(false), [type,setType] = useState<"EMOJI" | "ICON">("EMOJI"), [search,setSearch] = useState(""), [domain,setDomain] = useState("");
  const [recent,setRecent] = useMoneyViewState<CategoryIcon[]>("category-icon-recent", () => []);
  const choose = (icon: CategoryIcon | null) => { onChange(icon); if(icon) setRecent([icon,...recent.filter(c => c.type !== icon.type || c.value !== icon.value)].slice(0,12)); setOpen(false); };
  const recommendations = searchCategoryIcons(categoryName,type).slice(0,8);
  const candidates = searchCategoryIcons(search,type,domain || undefined);
  return <div className="money-icon-picker"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}><CategoryIconView icon={value}/> 아이콘 변경 ▾</button>
    {open && <MoneyAnchoredPopover className="money-icon-popover" label="아이콘 선택" onClose={() => setOpen(false)}>
      <div className="money-section-heading"><strong>아이콘 선택</strong><button type="button" aria-label="아이콘 선택 닫기" onClick={() => setOpen(false)}>×</button></div>
      <div className="meaning-tabs">{(["EMOJI","ICON"] as const).map(t => <button type="button" key={t} aria-pressed={type===t} onClick={() => setType(t)}>{t==="EMOJI"?"이모지":"아이콘"}</button>)}<button type="button" disabled title="저장소·권한 정책 확정 후 지원">이미지 · 추후 지원</button></div>
      <input autoFocus aria-label="아이콘 한글 영어 검색" placeholder="커피 · 카페 · coffee · cafe" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="money-icon-domains"><button type="button" aria-pressed={!domain} onClick={()=>setDomain("")}>전체</button>{ICON_DOMAINS.map(d=><button type="button" key={d.key} aria-pressed={domain===d.key} onClick={()=>setDomain(domain===d.key?"":d.key)}>{d.label}</button>)}</div>
      {!search && !domain && <><small>{categoryName ? "분류에 맞는 추천" : "추천"}</small><div className="money-icon-grid">{(recommendations.length?recommendations:ICON_CANDIDATES.filter(c=>c.type===type).slice(0,8)).map(c=><button type="button" key={c.key} aria-label={c.label} title={c.label} onClick={()=>choose(c)}><CategoryIconView icon={c}/></button>)}</div></>}
      {!!recent.length && !search && <><small>최근 사용</small><div className="money-icon-grid">{recent.map(c=><button type="button" key={`${c.type}:${c.value}`} aria-label={`최근 ${c.value}`} onClick={()=>choose(c)}><CategoryIconView icon={c}/></button>)}</div></>}
      <div className="money-icon-grid money-icon-results">{candidates.map(c=><button type="button" key={c.key} aria-label={c.label} title={`${c.label} · ${c.key}`} aria-pressed={value?.type===c.type&&value.value===c.value} onClick={()=>choose(c)}><CategoryIconView icon={c}/></button>)}</div>
      {!candidates.length&&<p>검색과 일치하는 아이콘이 없습니다.</p>}<button type="button" onClick={()=>choose(null)}>아이콘 없음</button><small>한글·영어 별칭으로 검색 · 최근 12개는 현재 세션에 저장</small>
    </MoneyAnchoredPopover>}
  </div>;
}

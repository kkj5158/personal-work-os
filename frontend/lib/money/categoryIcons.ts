import type { CategoryIcon, TreeCategory } from "./categories";

export type IconCandidate = CategoryIcon & { key: string; label: string; aliases: string[]; domain: string };
// Bundled Unicode and Lucide IDs only. ASSET references are a future read seam, never URLs.
const domains: [string, string, string, string, string][] = [
  ["food", "음식", "food meal restaurant 식비 식사 외식", "🍽️ 🍚 🍜 🍲 🍱 🍔 🍕 🥗", "Utensils Soup Pizza Salad"],
  ["coffee", "카페", "coffee cafe 커피 카페 음료 간식", "☕ 🍵 🧋 🥤 🥐 🍰 🍪 🍩", "Coffee CupSoda Croissant Cookie"],
  ["housing", "주거", "housing home rent 주거 집 월세", "🏠 🏡 🏢 🛋️ 🛏️ 🪑 🚪 🔑", "House Building BedDouble Sofa"],
  ["transport", "교통", "transport car bus 교통 자동차 버스", "🚗 🚌 🚇 🚕 🚆 🚲 🛵 ⛽", "Car Bus TrainFront Bike"],
  ["shopping", "쇼핑", "shopping clothes buy 쇼핑 구매 의류", "🛍️ 🛒 👕 👖 👗 👟 👜 💄", "ShoppingBag ShoppingCart Shirt Store"],
  ["health", "건강", "health medical hospital 건강 병원 의료", "💊 🏥 🩺 🩹 🦷 🧴 🧼 😷", "Pill Hospital Stethoscope HeartPulse"],
  ["fitness", "운동", "fitness sports gym 운동 체육 헬스", "🏋️ ⚽ 🏀 🎾 🏊 🏃 🥊 🧘", "Dumbbell Trophy Volleyball Activity"],
  ["education", "교육", "education school books 교육 학교 책 학원", "📚 📖 🎓 🏫 ✏️ 📝 🧮 🔬", "BookOpen GraduationCap School Pencil"],
  ["culture", "문화", "culture music movie 문화 음악 영화 취미", "🎬 🎵 🎧 🎭 🎨 🎮 🎤 🎻", "Clapperboard Music Headphones Palette"],
  ["travel", "여행", "travel holiday hotel 여행 휴가 숙박", "✈️ 🧳 🏨 🏖️ 🏕️ 🗺️ 🚢 🛂", "Plane Luggage Hotel Tent"],
  ["relationship", "관계·경조", "gift family wedding 관계 경조 선물 가족", "🎁 🎂 💐 💍 💌 🥳 👪 🤝", "Gift Cake Flower Handshake"],
  ["work", "업무", "work office business 업무 사무 회사", "💼 🖥️ 💻 ⌨️ 🖨️ 📎 📁 📅", "BriefcaseBusiness Monitor Laptop Printer"],
  ["subscription", "구독", "subscription membership 구독 회원 정기", "📺 📱 📡 🎟️ 📰 📦 🔔 🔄", "Tv Smartphone Repeat Bell"],
  ["utilities", "공과금", "utilities electricity water 공과금 전기 수도", "💡 🔌 🚿 💧 🔥 🧯 🛠️ 🧹", "Lightbulb Plug Droplets Flame"],
  ["salary", "급여", "salary wage payroll 급여 월급 소득", "💰 💵 💴 💶 💷 🪙 🧾 🏧", "Banknote Coins Receipt Wallet"],
  ["business", "사업", "freelance business sales 프리랜서 사업 매출", "🏪 🏭 📋 📊 📈 🧑‍💼 📞 📨", "Factory ClipboardList ChartColumn Phone"],
  ["savings", "저축", "savings deposit 저축 적금 예금", "🐷 🏦 🏺 🔒 🗄️ 💎 🌱 🎯", "PiggyBank Landmark Vault Target"],
  ["investment", "투자", "investment stocks securities 투자 주식 증권", "📉 💹 🏅 🥇 🧠 🧭 🌐 ⚖️", "TrendingUp TrendingDown ChartNoAxesCombined Scale"],
  ["transfer", "이체", "transfer exchange payment 이체 송금 결제", "🔁 ↔️ ➡️ ⬅️ 🔀 💳 📤 📲", "ArrowLeftRight Send CreditCard ArrowDownUp"],
  ["debt", "부채", "debt loan repayment 부채 대출 상환", "📃 📜 ⏳ 🕰️ 🗓️ ✅ ⚠️ 🧱", "FileText ScrollText Hourglass CircleAlert"],
];
export const ICON_DOMAINS = domains.map(([key,label]) => ({ key,label }));
const emojiNames: Record<string,string[]> = {
 food:["식사","밥","면 요리","국·찌개","도시락","햄버거","피자","샐러드"],coffee:["커피","차","버블티","음료","크루아상","케이크","쿠키","도넛"],housing:["집","주택","건물","가구","침대","의자","문","열쇠"],transport:["자동차","버스","지하철","택시","기차","자전거","오토바이","주유"],shopping:["쇼핑백","장보기","상의","바지","원피스","신발","가방","화장품"],health:["약","병원","진료","치료","치과","스킨케어","위생","마스크"],fitness:["헬스","축구","농구","테니스","수영","달리기","복싱","요가"],education:["책","독서","학위","학교","학용품","필기","수학","과학"],culture:["영화","음악","음향","공연","미술","게임","노래","악기"],travel:["항공","짐","호텔","바다","캠핑","지도","크루즈","출입국"],relationship:["선물","생일","꽃","결혼","편지","축하","가족","모임"],work:["업무 가방","컴퓨터","노트북","키보드","인쇄","문구","파일","일정"],subscription:["TV","통신","인터넷","티켓","신문","배송","알림","정기 구독"],utilities:["조명","전기","샤워","수도","가스","소방","수리","청소"],salary:["돈","달러","엔화","유로","파운드","동전","영수증","ATM"],business:["상점","공장","사무","보고서","매출","사업자","전화","우편"],savings:["저금통","은행","보관","잠금","금고","귀금속","목표 저축","목표"],investment:["하락","증시","수익","금","전략","방향","해외 투자","균형"],transfer:["반복 이체","교환","보내기","받기","계좌 이동","카드","송금","모바일 결제"],debt:["청구서","계약","기한","상환 시각","상환 일정","상환 완료","주의","담보"]
};
export const ICON_CANDIDATES: IconCandidate[] = domains.flatMap(([domain,label,words,emoji,icons]) => {
  const aliases = [domain,label,...words.split(" ")];
  return [
    ...emoji.split(" ").map((value,i) => ({ type: "EMOJI" as const, value, key: domain === "coffee" && i === 0 ? "coffee-cup" : `${domain}-emoji-${i+1}`, label: emojiNames[domain][i], aliases: [...aliases,emojiNames[domain][i]], domain })),
    ...icons.split(" ").map((value,i) => ({ type: "ICON" as const, value, key: domain === "coffee" && i === 0 ? "coffee-cup-icon" : `${domain}-icon-${i+1}`, label: `${label} · ${value}`, aliases: [...aliases,value,value.replace(/([a-z])([A-Z])/g,"$1 $2")], domain })),
  ];
});
export const normalizeIconQuery = (value: string) => {
  const query = value.normalize("NFC").trim().toLowerCase().replace(/\s+/g," ");
  return query.replace(/coffee|cafe|커피|카페/g,"coffee");
};
export function searchCategoryIcons(query: string, type?: CategoryIcon["type"], domain?: string) {
  const q = normalizeIconQuery(query);
  return ICON_CANDIDATES.filter(c => (!type || c.type === type) && (!domain || c.domain === domain)).map((c,index) => {
    const words = [c.key,c.label,...c.aliases].map(normalizeIconQuery);
    const rank = !q ? 0 : words.some(v => v === q) ? 0 : words.some(v => v.startsWith(q)) ? 1 : words.some(v => v.includes(q)) ? 2 : 3;
    return { c,index,rank };
  }).filter(v => v.rank < 3).sort((a,b) => a.rank-b.rank || a.index-b.index).map(v => v.c);
}
export function readCategoryIcon(value?: Pick<TreeCategory,"iconType" | "iconValue" | "emoji"> | null): CategoryIcon | null {
  if (value?.iconType && value.iconValue) return { type: value.iconType, value: value.iconValue };
  return value?.emoji ? { type: "EMOJI", value: value.emoji } : null;
}
export function categoryIconPayload(icon: CategoryIcon | null) {
  if (icon?.type === "ASSET") throw new Error("이미지 업로드는 추후 지원합니다.");
  if (icon?.type === "ICON" && !ICON_CANDIDATES.some(c => c.type === "ICON" && c.value === icon.value)) throw new Error("지원하지 않는 내부 아이콘입니다.");
  if (icon?.value && /https?:|data:|\//i.test(icon.value)) throw new Error("외부 이미지 주소를 저장할 수 없습니다.");
  return { iconType: icon?.type ?? null, iconValue: icon?.value ?? null, emoji: icon?.type === "EMOJI" ? icon.value : null };
}

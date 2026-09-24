import {
  Activity, AlarmClock, Apple, Baby, Bath, Bed, BedDouble, Beef, Bike, BookOpen, Bookmark, Brain, Briefcase, Brush, CalendarDays,
  Camera, Candy, Carrot, ChartLine, Check, Church, Circle, CircleCheck, CigaretteOff, Clapperboard, ClipboardList, Clock, Code, Coffee,
  Coins, Compass, CookingPot, CupSoda, Dog, Droplet, Dumbbell, Egg, Eye, Feather, FileText, Film, Fish, Flame, Flower2, Footprints,
  Gamepad2, Gift, GlassWater, GraduationCap, Guitar, HandHeart, Handshake, Hash, Headphones, Heart, HeartPulse, Hourglass, House,
  Inbox, Keyboard, Languages, Laptop, Leaf, Library, Lightbulb, ListChecks, Mail, Map as MapIcon, MessageCircle, Milk, Moon, Mountain, Music,
  Newspaper, NotebookPen, Palette, PenLine, PersonStanding, Phone, PiggyBank, Pill, Plane, Presentation, Receipt, Recycle, Rocket,
  Salad, Scale, Search, ShieldCheck, Shirt, ShoppingCart, Smartphone, Smile, Snowflake, Sofa, Soup, Sparkles, Sprout, Square,
  SquareCheck, Star, Stethoscope, Sun, Sunrise, Syringe, Target, Tent, Thermometer, Timer, TreePine, TrendingUp, Trophy, Tv, Users,
  Utensils, Wallet, WashingMachine, Waves, Wheat, WineOff, Zap, type LucideIcon,
} from "lucide-react";

export type IconCategory = "food" | "health" | "sleep" | "exercise" | "work" | "writing" | "learning" | "relationships" | "lifestyle" | "hobbies" | "growth" | "general";

export const ICON_CATEGORIES: { id: IconCategory; label: string }[] = [
  { id: "food", label: "식사" }, { id: "health", label: "건강" }, { id: "sleep", label: "수면" }, { id: "exercise", label: "운동" },
  { id: "work", label: "업무" }, { id: "writing", label: "기록·메모" }, { id: "learning", label: "학습" }, { id: "relationships", label: "관계" },
  { id: "lifestyle", label: "생활" }, { id: "hobbies", label: "취미" }, { id: "growth", label: "자기계발" }, { id: "general", label: "일반" },
];

type IconDef = { key: string; label: string; category: IconCategory; Icon: LucideIcon };

/** Small, simple line icons; the key is what persists on the item. */
export const CHECKLIST_ICONS: IconDef[] = [
  { key: "utensils", label: "식사", category: "food", Icon: Utensils }, { key: "salad", label: "샐러드", category: "food", Icon: Salad },
  { key: "apple", label: "과일", category: "food", Icon: Apple }, { key: "carrot", label: "채소", category: "food", Icon: Carrot },
  { key: "egg", label: "단백질", category: "food", Icon: Egg }, { key: "beef", label: "고기", category: "food", Icon: Beef },
  { key: "fish", label: "생선", category: "food", Icon: Fish }, { key: "wheat", label: "곡물", category: "food", Icon: Wheat },
  { key: "milk", label: "우유", category: "food", Icon: Milk }, { key: "soup", label: "국", category: "food", Icon: Soup },
  { key: "cooking-pot", label: "요리", category: "food", Icon: CookingPot }, { key: "coffee", label: "커피", category: "food", Icon: Coffee },
  { key: "glass-water", label: "물", category: "food", Icon: GlassWater }, { key: "cup-soda", label: "음료", category: "food", Icon: CupSoda },
  { key: "candy", label: "간식", category: "food", Icon: Candy }, { key: "wine-off", label: "금주", category: "food", Icon: WineOff },
  { key: "heart-pulse", label: "심박", category: "health", Icon: HeartPulse }, { key: "heart", label: "마음", category: "health", Icon: Heart },
  { key: "activity", label: "컨디션", category: "health", Icon: Activity }, { key: "pill", label: "영양제", category: "health", Icon: Pill },
  { key: "droplet", label: "수분", category: "health", Icon: Droplet }, { key: "scale", label: "체중", category: "health", Icon: Scale },
  { key: "stethoscope", label: "진료", category: "health", Icon: Stethoscope }, { key: "thermometer", label: "체온", category: "health", Icon: Thermometer },
  { key: "syringe", label: "혈당", category: "health", Icon: Syringe }, { key: "eye", label: "눈", category: "health", Icon: Eye },
  { key: "cigarette-off", label: "금연", category: "health", Icon: CigaretteOff },
  { key: "moon", label: "밤", category: "sleep", Icon: Moon }, { key: "bed-double", label: "수면", category: "sleep", Icon: BedDouble },
  { key: "bed", label: "취침", category: "sleep", Icon: Bed }, { key: "sunrise", label: "기상", category: "sleep", Icon: Sunrise },
  { key: "alarm-clock", label: "알람", category: "sleep", Icon: AlarmClock }, { key: "sun", label: "햇빛", category: "sleep", Icon: Sun },
  { key: "dumbbell", label: "근력", category: "exercise", Icon: Dumbbell }, { key: "footprints", label: "걷기", category: "exercise", Icon: Footprints },
  { key: "bike", label: "자전거", category: "exercise", Icon: Bike }, { key: "person-standing", label: "스트레칭", category: "exercise", Icon: PersonStanding },
  { key: "waves", label: "수영", category: "exercise", Icon: Waves }, { key: "mountain", label: "등산", category: "exercise", Icon: Mountain },
  { key: "flame", label: "유산소", category: "exercise", Icon: Flame }, { key: "timer", label: "타이머", category: "exercise", Icon: Timer },
  { key: "briefcase", label: "업무", category: "work", Icon: Briefcase }, { key: "laptop", label: "노트북", category: "work", Icon: Laptop },
  { key: "clipboard-list", label: "계획", category: "work", Icon: ClipboardList }, { key: "list-checks", label: "할 일", category: "work", Icon: ListChecks },
  { key: "calendar-days", label: "일정", category: "work", Icon: CalendarDays }, { key: "mail", label: "메일", category: "work", Icon: Mail },
  { key: "inbox", label: "정리", category: "work", Icon: Inbox }, { key: "presentation", label: "발표", category: "work", Icon: Presentation },
  { key: "code", label: "코드", category: "work", Icon: Code }, { key: "keyboard", label: "타이핑", category: "work", Icon: Keyboard },
  { key: "pen-line", label: "쓰기", category: "writing", Icon: PenLine }, { key: "notebook-pen", label: "일기", category: "writing", Icon: NotebookPen },
  { key: "file-text", label: "문서", category: "writing", Icon: FileText }, { key: "feather", label: "글쓰기", category: "writing", Icon: Feather },
  { key: "bookmark", label: "북마크", category: "writing", Icon: Bookmark }, { key: "newspaper", label: "신문", category: "writing", Icon: Newspaper },
  { key: "book-open", label: "독서", category: "learning", Icon: BookOpen }, { key: "graduation-cap", label: "공부", category: "learning", Icon: GraduationCap },
  { key: "languages", label: "언어", category: "learning", Icon: Languages }, { key: "library", label: "도서관", category: "learning", Icon: Library },
  { key: "lightbulb", label: "아이디어", category: "learning", Icon: Lightbulb }, { key: "brain", label: "생각", category: "learning", Icon: Brain },
  { key: "users", label: "사람", category: "relationships", Icon: Users }, { key: "message-circle", label: "대화", category: "relationships", Icon: MessageCircle },
  { key: "phone", label: "연락", category: "relationships", Icon: Phone }, { key: "hand-heart", label: "배려", category: "relationships", Icon: HandHeart },
  { key: "handshake", label: "약속", category: "relationships", Icon: Handshake }, { key: "gift", label: "선물", category: "relationships", Icon: Gift },
  { key: "baby", label: "육아", category: "relationships", Icon: Baby }, { key: "dog", label: "반려동물", category: "relationships", Icon: Dog },
  { key: "house", label: "집", category: "lifestyle", Icon: House }, { key: "brush", label: "청소", category: "lifestyle", Icon: Brush },
  { key: "washing-machine", label: "빨래", category: "lifestyle", Icon: WashingMachine }, { key: "bath", label: "샤워", category: "lifestyle", Icon: Bath },
  { key: "shirt", label: "옷", category: "lifestyle", Icon: Shirt }, { key: "shopping-cart", label: "장보기", category: "lifestyle", Icon: ShoppingCart },
  { key: "wallet", label: "지출", category: "lifestyle", Icon: Wallet }, { key: "piggy-bank", label: "저축", category: "lifestyle", Icon: PiggyBank },
  { key: "receipt", label: "가계부", category: "lifestyle", Icon: Receipt }, { key: "coins", label: "돈", category: "lifestyle", Icon: Coins },
  { key: "recycle", label: "분리수거", category: "lifestyle", Icon: Recycle }, { key: "smartphone", label: "휴대폰", category: "lifestyle", Icon: Smartphone },
  { key: "sofa", label: "휴식", category: "lifestyle", Icon: Sofa }, { key: "sprout", label: "식물", category: "lifestyle", Icon: Sprout },
  { key: "music", label: "음악", category: "hobbies", Icon: Music }, { key: "headphones", label: "듣기", category: "hobbies", Icon: Headphones },
  { key: "guitar", label: "악기", category: "hobbies", Icon: Guitar }, { key: "palette", label: "그림", category: "hobbies", Icon: Palette },
  { key: "camera", label: "사진", category: "hobbies", Icon: Camera }, { key: "film", label: "영화", category: "hobbies", Icon: Film },
  { key: "clapperboard", label: "영상", category: "hobbies", Icon: Clapperboard }, { key: "gamepad", label: "게임", category: "hobbies", Icon: Gamepad2 },
  { key: "tv", label: "TV", category: "hobbies", Icon: Tv }, { key: "plane", label: "여행", category: "hobbies", Icon: Plane },
  { key: "tent", label: "캠핑", category: "hobbies", Icon: Tent }, { key: "tree-pine", label: "자연", category: "hobbies", Icon: TreePine },
  { key: "flower", label: "꽃", category: "hobbies", Icon: Flower2 }, { key: "snowflake", label: "계절", category: "hobbies", Icon: Snowflake },
  { key: "target", label: "목표", category: "growth", Icon: Target }, { key: "trending-up", label: "성장", category: "growth", Icon: TrendingUp },
  { key: "trophy", label: "성취", category: "growth", Icon: Trophy }, { key: "rocket", label: "도전", category: "growth", Icon: Rocket },
  { key: "sparkles", label: "습관", category: "growth", Icon: Sparkles }, { key: "compass", label: "방향", category: "growth", Icon: Compass },
  { key: "chart-line", label: "지표", category: "growth", Icon: ChartLine }, { key: "shield-check", label: "지키기", category: "growth", Icon: ShieldCheck },
  { key: "church", label: "명상·기도", category: "growth", Icon: Church }, { key: "smile", label: "감사", category: "growth", Icon: Smile },
  { key: "leaf", label: "비움", category: "growth", Icon: Leaf }, { key: "map", label: "계획", category: "growth", Icon: MapIcon },
  { key: "check", label: "체크", category: "general", Icon: Check }, { key: "circle-check", label: "완료", category: "general", Icon: CircleCheck },
  { key: "square-check", label: "확인", category: "general", Icon: SquareCheck }, { key: "circle", label: "원", category: "general", Icon: Circle },
  { key: "square", label: "사각", category: "general", Icon: Square }, { key: "star", label: "별", category: "general", Icon: Star },
  { key: "zap", label: "에너지", category: "general", Icon: Zap }, { key: "clock", label: "시간", category: "general", Icon: Clock },
  { key: "hourglass", label: "기다림", category: "general", Icon: Hourglass }, { key: "hash", label: "번호", category: "general", Icon: Hash },
  { key: "search", label: "점검", category: "general", Icon: Search },
];

const BY_KEY = new Map(CHECKLIST_ICONS.map(icon => [icon.key, icon]));
export const DEFAULT_ICON = "check";

export function ChecklistIcon({ name, size = 15, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const Icon = BY_KEY.get(name ?? "")?.Icon ?? Check;
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

export function searchIcons(query: string, category: IconCategory | "all") {
  const q = query.trim().toLowerCase();
  return CHECKLIST_ICONS.filter(icon => (category === "all" || icon.category === category) && (!q || icon.key.includes(q) || icon.label.includes(q)));
}

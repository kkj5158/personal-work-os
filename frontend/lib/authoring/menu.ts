/** Presentation only. Stable API keys and frozen session definitions never change. */
export const writingAreas = [
  { key: "CORE", title: "핵심 글쓰기", emoji: "📖" },
  { key: "TOPIC", title: "주제 글쓰기", emoji: "✍️" },
] as const;
export type WritingArea = typeof writingAreas[number]["key"];
export const writingCategories = [
  { key: "now", area: "CORE", title: "지금의 삶", emoji: "🌿", description: "현재의 나를 이해하고 삶을 회복하며 누리는 글쓰기", programs: ["recovery", "reality", "present-life"] },
  { key: "direction", area: "CORE", title: "삶의 기록과 방향", emoji: "🧭", description: "지나온 시간을 돌아보고 앞으로의 방향을 설계하는 글쓰기", programs: ["past", "review", "grounded-future"] },
  { key: "recovery", area: "TOPIC", title: "회복과 자립", emoji: "🌱", description: "삶을 회복하고 독립적이고 책임 있는 삶을 만드는 글쓰기", programs: ["sexual-pattern", "responsibility"] },
  { key: "career", area: "TOPIC", title: "삶과 커리어", emoji: "💼", description: "원하는 삶과 나에게 맞는 일하는 방식을 탐색하는 글쓰기", programs: ["present-future-identity", "earning-a-living", "career-temperament"] },
  { key: "body", area: "TOPIC", title: "신체와 자기관리", emoji: "💪", description: "몸과 운동, 신체적 성장을 꾸준히 다루는 글쓰기", programs: ["light-body-free-style", "ren-daily-training", "desired-physique"] },
] as const;

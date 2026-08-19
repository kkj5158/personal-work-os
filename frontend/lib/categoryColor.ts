// Deterministic color assignment so a category always renders the same
// color without needing a stored color column (out of scope for V1).
const PALETTE = [
  { bg: "bg-sky-100", border: "border-sky-400", text: "text-sky-900" },
  { bg: "bg-emerald-100", border: "border-emerald-400", text: "text-emerald-900" },
  { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-900" },
  { bg: "bg-violet-100", border: "border-violet-400", text: "text-violet-900" },
  { bg: "bg-rose-100", border: "border-rose-400", text: "text-rose-900" },
  { bg: "bg-teal-100", border: "border-teal-400", text: "text-teal-900" },
];

const UNCATEGORIZED = { bg: "bg-zinc-100", border: "border-zinc-400", text: "text-zinc-900" };

export function colorForCategory(categoryId: string | null): { bg: string; border: string; text: string } {
  if (!categoryId) {
    return UNCATEGORIZED;
  }
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

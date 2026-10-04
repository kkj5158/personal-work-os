export const amountPresets = [
  { id: "all", label: "전체", min: "", max: "" },
  { id: "small", label: "1만원 미만", min: "0", max: "9999" },
  { id: "medium", label: "1만–5만원 미만", min: "10000", max: "49999" },
  { id: "large", label: "5만원 이상", min: "50000", max: "" },
];
export function validateAmountRange(min: string, max: string) {
  if ([min, max].some(v => v !== "" && (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))))) return "금액은 0 이상의 원 단위 정수로 입력하세요.";
  if (min !== "" && max !== "" && Number(min) > Number(max)) return "최소 금액은 최대 금액보다 클 수 없습니다.";
  return "";
}

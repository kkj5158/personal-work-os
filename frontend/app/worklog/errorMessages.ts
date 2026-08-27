// Translates the backend's own English validation/not-found messages
// (ApiExceptionHandler deliberately echoes InvalidRequestException/
// ResourceNotFoundException messages verbatim — see its class comment) into
// the concise Korean messages this UI otherwise always shows. Never lets a
// raw backend string, stack trace, or exception class name reach the user —
// an unrecognized message always falls back to a generic Korean sentence.
//
// Matching is prefix-based for messages the backend builds with a dynamic
// suffix (an id, a date, a category name) — the Korean translation never
// needs that suffix, so exact-vs-prefix is decided per entry below.
import { ApiError } from "@/lib/api/client";

const EXACT_MESSAGES: Record<string, string> = {
  "Category name must not be blank": "카테고리 이름을 입력해 주세요.",
  "Criterion name must not be blank": "기준 이름을 입력해 주세요.",
  "Start time is required": "출근 시간을 입력해 주세요.",
  "A root category cannot be set as a default": "대분류는 기본으로 설정할 수 없습니다.",
  "An inactive category cannot be set as a default": "비활성 카테고리는 기본으로 설정할 수 없습니다.",
  "Category has child categories and cannot be deleted": "하위 중분류가 있는 대분류는 삭제할 수 없습니다.",
  "Category is referenced by existing records and cannot be deleted": "사용 기록이 있는 카테고리는 삭제할 수 없습니다. 비활성화를 사용해주세요.",
  "isActive must not be null": "요청 값이 올바르지 않습니다.",
  "A root category cannot be assigned to a work-time entry": "대분류는 업무시간 항목에 지정할 수 없습니다.",
  "Only an active category can be newly assigned to a work-time entry": "비활성 카테고리는 새 업무시간 항목에 지정할 수 없습니다.",
  "categoryId is required for every work-time entry": "카테고리를 선택해 주세요.",
  "item must not be blank": "항목을 입력해 주세요.",
  "minutes must be positive": "시간을 올바르게 입력해 주세요.",
  "Only a record whose current status is ABSENT can be corrected": "결근 상태인 기록만 정정할 수 있습니다.",
  "Status is required": "출결 상태를 선택해 주세요.",
  "Work score must be between 0 and 100": "근무 점수는 0~100 사이여야 합니다.",
  "Only an active start time criterion can be newly applied": "비활성 출근 기준은 새로 적용할 수 없습니다.",
  "Non-working attendance cannot include clock times or an applied start time criterion":
    "휴무 상태에는 출퇴근 시간이나 출근 기준을 남겨둘 수 없습니다.",
  "Non-working attendance cannot contain work-time entries": "휴무 상태에는 업무시간 기록을 남겨둘 수 없습니다.",
  "Only a workday status can be clocked in": "근무 상태에서만 출근할 수 있습니다.",
  "Already clocked in for this date": "이미 출근 처리되었습니다.",
  "An active start-time criterion must be applied before clocking in": "출근하려면 먼저 출근 기준을 적용해 주세요.",
  "Only a workday status can be clocked out": "근무 상태에서만 퇴근할 수 있습니다.",
  "Cannot clock out before clocking in": "출근 기록이 있어야 퇴근할 수 있습니다.",
  "Already clocked out for this date": "이미 퇴근 처리되었습니다.",
  "No clock times to clear for this date": "삭제할 출퇴근 시간이 없습니다.",
  "Remove this date's work-time entries before clearing its clock times": "출퇴근 시간을 지우려면 먼저 업무시간 기록을 삭제해 주세요.",
  "Clock-out requires a clock-in time": "출근 시간이 있어야 퇴근을 기록할 수 있습니다.",
  "Clock-in and clock-out cannot be the same time": "출근/퇴근 시간이 같을 수 없습니다.",
  "On-time override is not eligible: a workday clock-in with an applied start-time criterion is required":
    "정시 출근 처리를 적용할 수 없는 상태입니다.",
  "On-time override is not eligible: this clock-in is not late": "지각이 아니어서 정시 출근 처리를 적용할 수 없습니다.",
  "Cannot reuse a work-time entry id that belongs to another record": "다른 기록의 업무시간 항목은 재사용할 수 없습니다.",
  "This request conflicts with existing data": "기존 데이터와 충돌하는 요청입니다.",
  "Malformed request": "요청 형식이 올바르지 않습니다.",
  "An unexpected error occurred": "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

const PREFIX_MESSAGES: [string, string][] = [
  ["Parent category not found", "상위 카테고리를 찾을 수 없습니다."],
  ["Category not found", "카테고리를 찾을 수 없습니다."],
  ["Category depth cannot exceed 2 levels", "하위 카테고리 아래에는 카테고리를 추가할 수 없습니다."],
  ["Start time criterion not found", "출근 기준을 찾을 수 없습니다."],
  ["No work record exists for", "해당 날짜의 근무 기록이 아직 없습니다."],
  ["is only allowed for the current date", "오늘 날짜에서만 가능합니다."],
];

const GENERIC_FALLBACK = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function translateApiErrorMessage(message: string): string {
  if (message in EXACT_MESSAGES) return EXACT_MESSAGES[message];
  for (const [prefix, translated] of PREFIX_MESSAGES) {
    if (message.startsWith(prefix)) return translated;
  }
  return GENERIC_FALLBACK;
}

// Shared catch-block helper: an ApiError's message is always a backend
// string (translated here); anything else (network failure, JS error) never
// had a backend message to translate, so it goes straight to the fallback.
export function describeApiError(error: unknown, fallback: string = GENERIC_FALLBACK): string {
  if (error instanceof ApiError) return translateApiErrorMessage(error.message);
  return fallback;
}

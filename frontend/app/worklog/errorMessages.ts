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
  "Grace minutes must not be negative": "지각 유예는 0분 이상이어야 합니다.",
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
  "Non-working attendance cannot have a work score": "휴무 상태에는 근무 점수를 남겨둘 수 없습니다.",
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

  // Leave allowance / half-day (post-production iteration 1)
  "Remove this date's work-time entries before changing to a non-working status": "업무시간 기록을 먼저 삭제해주세요.",
  "Configure this month's leave allowance first.": "이번 달 연차 허용량을 먼저 설정해 주세요.",
  "Not enough remaining leave this month.": "이번 달 남은 연차가 부족합니다.",
  "Allowance must not be negative": "허용량은 0 이상이어야 합니다.",
  "Allowance must be in half-day increments": "허용량은 0.5일 단위로 입력해 주세요.",
  "Allowance is required": "허용량을 입력해 주세요.",
  "Month must be between 1 and 12": "월 값이 올바르지 않습니다.",

  // Default start-time criterion (post-production iteration 1)
  "Only an active start time criterion can be set as default": "활성 기준만 기본으로 설정할 수 있습니다.",

  // Activity category ordering/move (post-production iteration 1)
  "orderedIds must not be empty": "순서 정보가 올바르지 않습니다.",
  "orderedIds must contain exactly the current sibling set, no more and no fewer": "순서 정보가 최신 목록과 일치하지 않습니다. 새로고침 후 다시 시도해 주세요.",
  "A root category cannot be moved": "대분류는 이동할 수 없습니다.",
  "A target parent is required": "이동할 대분류를 선택해 주세요.",
  "Target parent must itself be a root category": "대상은 대분류여야 합니다.",

  // Work chart reference lines (post-production iteration 1, batch 2)
  "scope is required": "기준선 범위가 올바르지 않습니다.",
  "label must not be blank": "라벨을 입력해 주세요.",
  "label must be at most 20 characters": "라벨은 20자 이내로 입력해 주세요.",
  "value is required": "값을 입력해 주세요.",
  "color is required": "색상을 선택해 주세요.",
  "A chart/metric scope may have at most 3 reference lines": "기준선은 최대 3개까지 추가할 수 있습니다.",
  "Daily time value must be between 1 and 1440 minutes": "하루 시간 값은 00:01~24:00 사이여야 합니다.",
  "Weekly time value must be between 1 and 10080 minutes": "주간 시간 값이 올바르지 않습니다.",
  "Score value must be between 0 and 100": "점수 값은 0~100 사이여야 합니다.",

  // Checklist (post-production iteration 1)
  "Checklist item name must not be blank": "체크리스트 항목 이름을 입력해 주세요.",
  "An emoji is required": "이모지를 선택해 주세요.",
  "Priority (CORE or SECONDARY) is required": "중요도를 선택해 주세요.",
  "At most 6 checklist items can be active at once": "활성 체크리스트 항목은 최대 6개까지 가능합니다.",
  "Effective date must not be in the past": "적용 시작일은 과거로 설정할 수 없습니다.",
  "A deleted checklist item cannot be modified": "삭제된 항목은 수정할 수 없습니다.",
  "Only a version that has not begun applying yet can be deleted": "이미 적용된 변경 이력은 삭제할 수 없습니다.",
  "A goal version that has already applied cannot be deleted": "이미 적용된 목표는 삭제할 수 없습니다.",
  "Goal must be between 0 and 100": "목표 달성률은 0~100 사이여야 합니다.",
  "Goal override must be between 0 and 100": "목표 달성률은 0~100 사이여야 합니다.",
  "Checklist is not applicable for this date's current attendance status": "현재 출결 상태에서는 체크리스트를 적용할 수 없습니다.",
};

const PREFIX_MESSAGES: [string, string][] = [
  ["Grace minutes must not exceed", "지각 유예는 120분을 초과할 수 없습니다."],
  ["Parent category not found", "상위 카테고리를 찾을 수 없습니다."],
  ["Category not found", "카테고리를 찾을 수 없습니다."],
  ["Category depth cannot exceed 2 levels", "하위 카테고리 아래에는 카테고리를 추가할 수 없습니다."],
  ["Start time criterion not found", "출근 기준을 찾을 수 없습니다."],
  ["No work record exists for", "해당 날짜의 근무 기록이 아직 없습니다."],
  ["is only allowed for the current date", "오늘 날짜에서만 가능합니다."],
  ["Allowance must not be set below leave already used this month", "이미 사용한 연차보다 적게 설정할 수 없습니다."],
  ["Checklist item not found", "체크리스트 항목을 찾을 수 없습니다."],
  ["Checklist category not found", "체크리스트 카테고리를 찾을 수 없습니다."],
  ["Checklist item version not found", "변경 이력을 찾을 수 없습니다."],
  ["Checklist daily entry not found", "체크리스트 기록을 찾을 수 없습니다."],
  ["Goal version not found", "목표 이력을 찾을 수 없습니다."],
  ["Reference line not found", "기준선을 찾을 수 없습니다."],
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

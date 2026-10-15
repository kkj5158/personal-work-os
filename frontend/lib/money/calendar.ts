import type { BookPage } from "@/app/money/MoneyWebData";

export const calendarSections = ["spending-calendar", "income-calendar", "coupang-work-calendar"] as const;
export type CalendarSection = typeof calendarSections[number];
export const workStatuses = { SCHEDULED: "근무 예정", COMPLETED: "근무 완료", OFF: "휴무", CANCELLED: "취소" };
export type AmountPreset = { id: string; name: string; amount: number; active: boolean };
export type WorkTemplate = { id: string; version: number; name: string; durationMinutes: number; startTime: string | null; endTime: string | null; breakMinutes: number; overnight: boolean; shiftDescription: string; groupName: string; active: boolean; defaultPresetId: string | null; presets: AmountPreset[] };
export type WorkPayment = { id: string; depositDate: string; amount: number; workDate?: string; workRecordId?: string };
export type WorkRecord = { id: string; version: number; workDate: string; status: keyof typeof workStatuses; templateId: string | null; presetId: string | null; templateName: string; presetName: string; presetAmount: number; startTime: string | null; endTime: string | null; overnight: boolean; breakMinutes: number; durationMinutes: number; expectedAmount: number; memo: string; payments: WorkPayment[] };
export const allowances = [["specialWorkAllowance", "특근수당"], ["weeklyHolidayAllowance", "주휴수당"], ["publicHolidayAllowance", "공휴일수당"], ["incentive", "인센티브(인센)"]] as const;
export type AllowanceKey = typeof allowances[number][0];
export type CalendarWeek = { start: string; end: string; version: number; totalPay: number; basePay: number | null; allowancesConfirmed: boolean; needsReview: boolean; payments: WorkPayment[]; completedWorkdays: number; completedMinutes: number; outstandingAmount: number } & Record<AllowanceKey, number | null>;
export type WorkMonth = { records: WorkRecord[]; payments: WorkPayment[]; weeks: CalendarWeek[]; summary: { completedWorkdays: number; completedMinutes: number; receivedAmount: number; outstandingAmount: number; scheduledAmount: number } };
export type CalendarLedger = Omit<BookPage, "summary"> & { summary: BookPage["summary"] & { spendingDayCount: number; incomeDayCount: number; refundCount: number; transactionCount: number; averageDailySpending: number | null } };
export function calendarComposition(items: BookPage["composition"], income: boolean) {
  if (income) return items;
  const grouped = new Map<string | null, BookPage["composition"][number]>();
  for (const item of items) { const previous = grouped.get(item.categoryId); grouped.set(item.categoryId, { categoryId: item.categoryId, counterpartyText: null, amount: (previous?.amount ?? 0) + item.amount, count: (previous?.count ?? 0) + item.count }); }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount);
}

export function kstDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
function utc(date: string) { return new Date(date + "T00:00:00Z"); }
export function addDays(date: string, amount: number) { const day = utc(date); day.setUTCDate(day.getUTCDate() + amount); return day.toISOString().slice(0, 10); }
export function monday(date: string) { return addDays(date, -((utc(date).getUTCDay() + 6) % 7)); }
export function changeCalendarMonth(month: string, amount: number) { const date = utc(month + "-01"); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7); }
export function calendarDates(month: string) { const start = monday(month + "-01"), end = addDays(changeCalendarMonth(month, 1) + "-01", -1); const count = Math.ceil((+utc(end) - +utc(start) + 86400000) / 604800000) * 7; return Array.from({ length: count }, (_, index) => addDays(start, index)); }
export function workMinutes(start: string | null, end: string | null, breaks: number, overnight: boolean) {
  const minutes = (time: string | null) => time && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : NaN;
  const span = minutes(end) - minutes(start) + (overnight ? 1440 : 0);
  const result = span - breaks;
  return Number.isInteger(breaks) && breaks >= 0 && span > 0 && span <= 1440 && result > 0 ? result : NaN;
}
export function validKrw(value: number) { return Number.isSafeInteger(value) && value >= 0 && value <= 999999999999; }
export function settlement(total: number, values: (number | null)[]) { const sum = values.reduce<number>((sum, value) => sum + (value ?? 0), 0); return { sum, base: total - sum, valid: values.length === 4 && values.every(value => value !== null && validKrw(value)) && sum <= total }; }
export function validateWork(record: WorkRecord, today: string) {
  if (!validKrw(record.expectedAmount)) return "예상액은 0 이상의 원 단위 정수로 입력하세요.";
  if (["COMPLETED", "SCHEDULED"].includes(record.status) && !Number.isFinite(workMinutes(record.startTime, record.endTime, record.breakMinutes, record.overnight))) return "시작·종료·휴게를 확인하세요. 자정을 넘으면 익일 종료를 선택하세요.";
  if (record.status === "COMPLETED" && record.workDate > today) return "미래 근무는 예정 상태로 기록하세요.";
  if (record.payments.length && record.status !== "COMPLETED") return "입금 내역이 있는 근무는 완료 상태여야 합니다.";
  if (new Set(record.payments.map(payment => payment.id)).size !== record.payments.length) return "중복된 입금 기록을 확인하세요.";
  if (record.payments.some(payment => !validKrw(payment.amount) || payment.amount === 0 || !payment.depositDate || payment.depositDate < record.workDate || payment.depositDate > today)) return "입금액은 1원 이상, 입금일은 근무일부터 오늘까지 입력하세요.";
  return "";
}
export function applyTemplate(record: WorkRecord, template: WorkTemplate): WorkRecord {
  const preset = template.presets.find(preset => preset.active && preset.id === template.defaultPresetId) ?? template.presets.find(preset => preset.active);
  return { ...record, templateId: template.id, templateName: template.name, presetId: preset?.id ?? null, presetName: preset?.name ?? "", presetAmount: preset?.amount ?? 0, expectedAmount: preset?.amount ?? 0, startTime: template.startTime?.slice(0, 5) ?? "", endTime: template.endTime?.slice(0, 5) ?? "", breakMinutes: template.breakMinutes, overnight: template.overnight, durationMinutes: template.durationMinutes };
}
export function newWorkRecord(date: string, today: string, id: string, template?: WorkTemplate): WorkRecord { const record: WorkRecord = { id, version: 0, workDate: date, status: date > today ? "SCHEDULED" : "COMPLETED", templateId: null, presetId: null, templateName: "", presetName: "", presetAmount: 0, startTime: "09:00", endTime: "13:00", overnight: false, breakMinutes: 0, durationMinutes: 240, expectedAmount: 0, memo: "", payments: [] }; return template ? applyTemplate(record, template) : record; }

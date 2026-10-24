import { apiClient } from "./client";
export type ReviewFields = {
  title: string;
  score: number | null;
  mood: number | null;
  memo: string;
};
export type DailyReview = ReviewFields & {
  date: string;
  status: "EDITING" | "COMPLETED";
  version: number;
};
export type WeeklyFields = ReviewFields & {
  strengths: string;
  regrets: string;
  nextWeekDirection: string;
};
export type WeeklyReview = WeeklyFields & {
  id: string;
  weekStart: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type DayMetrics = {
  date: string;
  workMinutes: number | null;
  workScore: number | null;
  reflection: DailyReview | null;
};
export type ReviewRange = { days: DayMetrics[]; weeks: WeeklyReview[] };
export const EMPTY_REVIEW: ReviewFields = {
  title: "",
  score: null,
  mood: null,
  memo: "",
};
export const EMPTY_WEEK: WeeklyFields = {
  ...EMPTY_REVIEW,
  strengths: "",
  regrets: "",
  nextWeekDirection: "",
};
export const getWeeklyReview = async (date: string) =>
  (await apiClient.get<WeeklyReview | undefined>(
    `/api/calendar/reviews/weeks/${date}`,
  )) ?? null;
export const saveWeeklyReview = (
  date: string,
  body: WeeklyFields,
  expectedVersion: number,
) =>
  apiClient.put<WeeklyReview>(`/api/calendar/reviews/weeks/${date}`, {
    ...body,
    expectedVersion,
  });
export const getReviewRange = (from: string, to: string) =>
  apiClient.get<ReviewRange>(
    `/api/calendar/reviews?${new URLSearchParams({ from, to })}`,
  );

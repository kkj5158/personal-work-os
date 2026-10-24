"use client";
import type { ComponentProps } from "react";
import RecordSurface from "./RecordSurface";

/** One weekly editor module shared by Sleep Web and the Calendar host. */
export default function SleepWeeklyTimetable(props: ComponentProps<typeof RecordSurface>) {
  const { weeklyOnly = false, ...surface } = props;
  return <RecordSurface {...surface} mode="week" integrated={false} weeklyOnly={weeklyOnly}/>;
}

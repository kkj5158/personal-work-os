"use client";
import type { StudyDataPort } from "@/lib/study/model";
import { CoachOperations } from "./CoachOperations";
/** Compatibility entry for the secondary operational workspace. */
export function EngineTools({
  port,
  area,
}: {
  port: StudyDataPort;
  area: "materials" | "workbooks" | "coach";
}) {
  return area === "coach" ? <CoachOperations port={port} /> : null;
}

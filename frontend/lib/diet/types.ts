export type Importance = "CORE" | "SECONDARY" | "OPTIONAL";
// morning/bedtimeMeasuredAt: slot measured times (Seoul local "YYYY-MM-DDTHH:mm:ss"), set by diet-sys-mobile; carried through unchanged by day saves.
export type DailyRecord = { date: string; morningMeasuredAt?: string | null; bedtimeMeasuredAt?: string | null } & Partial<Record<MeasurementKey, number | null>>;
export const measurements = [
  ["morningWeight", "아침 체중", "kg", "CORE"], ["targetWeight", "목표 체중", "kg", "CORE"],
  ["morningGlucose", "아침 혈당", "mg/dL", "CORE"], ["morningBreathKetone", "아침 호흡 케톤", "ppm", "CORE"],
  ["bedtimeGlucose", "취침 혈당", "mg/dL", "SECONDARY"], ["bedtimeBreathKetone", "취침 호흡 케톤", "ppm", "SECONDARY"],
  ["morningBloodKetone", "아침 혈액 케톤", "mmol/L", "OPTIONAL"], ["bedtimeBloodKetone", "취침 혈액 케톤", "mmol/L", "OPTIONAL"],
  ["waistCircumference", "허리둘레", "cm", "OPTIONAL"], ["fastingHours", "공복 시간", "hours", "SECONDARY"],
] as const;
export type MeasurementKey = typeof measurements[number][0];
export type ChecklistItem = { id:string; title:string; importance:Importance; keyPoint:string; sortOrder:number; weeklyReference:number|null; monthlyReference:number|null; active:boolean; startDate:string };
export type DailyCheck = { date:string; itemId:string; state:"SUCCESS"|"FAILURE"|"MISSING"|"UNRECORDED"; memo:string };
export type ChallengeRole = "CURRENT_FOCUS"|"NEXT_FOCUS"|"FINAL_GOAL";
export type Challenge = { id:string; role:ChallengeRole; homeSortOrder:number; title:string; type:"WEIGHT"|"CHECKLIST"|"MANUAL"; status:"WAITING"|"ACTIVE"|"COMPLETED"|"STOPPED"; startDate:string; endDate:string; color:string; keyPoint:string; notes:string[]; sortOrder:number; startWeight:number|null; targetWeight:number|null; itemIds:string[]; goalMode:"RATE"|"COUNT"; includeMissing:boolean; currentValue:number|null; targetValue:number|null };
export type WeightGoal = { id:string; kind:"SHORT_TERM"|"WEEKLY"|"MONTHLY"|"FINAL"; targetDate:string; targetWeight:number; baselineDate?:string|null; baselineWeight?:number|null; core:string; memoItems:string[] };
export type Milestone = { id:string; challengeId:string; date:string; value:number; title:string; memoItems:string[]; memo?:string };
export type ReferenceLine = { id:string; name:string; value:number; visible:boolean; color?:string; goalKind?:WeightGoal["kind"] };
export type ReferenceBand = { id:string; name:string; min:number; max:number; visible:boolean; color:string };
export type MetabolicKey = "glucose"|"breath"|"blood";
export type DietSettings = { hero?:{backgroundImage:string; primaryText:string; secondaryText:string}; measurementImportance?:Partial<Record<MeasurementKey,Importance>>; measurementOrder?:MeasurementKey[]; weightLines?:ReferenceLine[]; hiddenGoalLines?:WeightGoal["kind"][]; metabolic?:Partial<Record<MetabolicKey,{lines:ReferenceLine[];bands:ReferenceBand[]}>> };
export type DietData = { days:DailyRecord[]; items:ChecklistItem[]; checks:DailyCheck[]; challenges:Challenge[]; goals:WeightGoal[]; milestones:Milestone[]; settings:DietSettings };
export type EntityMap = {items:ChecklistItem;challenges:Challenge;goals:WeightGoal;milestones:Milestone};
export type DietStore = { data:DietData; busy:boolean; pendingChecks?:number; error:string; save:<K extends keyof EntityMap>(kind:K,value:EntityMap[K])=>Promise<void>; remove:(kind:keyof EntityMap,id:string)=>Promise<void>; saveDay:(day:DailyRecord)=>Promise<void>; saveCheck:(check:DailyCheck)=>Promise<void>; saveSettings:(settings:DietSettings)=>Promise<void>; reorderHome:(type:"WEIGHT"|"CHECKLIST",ids:string[])=>Promise<void>; reorder:(kind:"items"|"challenges",ids:string[])=>Promise<void> };

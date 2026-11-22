import type { QuestionKind, StudyPolicy } from "./model";
export type EngineGoals = {
  goal: string;
  interests: string;
  weeklyTarget: { new: number; review: number; application: number };
};
export type PlanPreview = {
  date: string;
  policy: StudyPolicy;
  questionFormat: Record<
    "required" | "extension",
    Partial<Record<QuestionKind, number>>
  >;
  minutes: { required: number; extension: number };
  goals: EngineGoals;
  sourceLimit: number;
};
export type EngineJob = {
  campaign?: {canRepairKey?:boolean;authoringPolicy?:string;calls:number;tokens:number;status:string;slots:{previouslyAccepted?:boolean;objectiveTier?:string;kind:string;order:number;stage:string;cycles:number;replans:number;issue:string}[]};
  id: string;
  kind: "PLAN" | "INDEX" | "GENERATE" | "COACH" | "RENDER";
  state: string;
  date?: string;
  week?: string;
  batchId?: string;
  materialId?: string;
  materialVersion?: number;
  assetId?: string;
  attempts: number;
  checkpoint: number;
  createdAt?: string;
  updatedAt: string;
  workbookId?: string;
  workbookVersion?: number;
  plan?: Partial<PlanPreview> & {
    batchId?: string;
    batchDays?: number;
    weeklyTarget?: EngineGoals["weeklyTarget"];
    history?: string;
    materialIds?: string[];
    blueprint?: { learningObjective: string; testedConcepts: Record<string, { section: string }> };
  };
  receipt: {
    warnings?: string[];
    error?: string;
    classification?: string;
    quality?: {
      issues?: string[];
      warnings?: string[];
      learningObjective?: string;
      estimatedMinutes?: Record<string, number>;
      questions?: { part: "required" | "extension"; order: number; pageRefs: string[]; conceptIds: string[]; issues: string[] }[];
    };
    [key: string]: unknown;
  };
};
export type EngineSource = {
  materialId: string;
  materialVersion: number;
  assetId?: string;
  jobId?: string;
  state:
    | "missing"
    | "queued"
    | "processing"
    | "ready"
    | "needs_source_check"
    | "failed";
  usableExcerptCount: number;
  physicalPages?: number;
  included: boolean;
  active: boolean;
};
export type EngineHistory = {
  jobs: EngineJob[];
  page: number;
  totalPages: number;
  totalElements: number;
};
export type EngineStatus = {
  ownerAuthoringPilot?: boolean;
  engineEnabled: boolean;
  workerOnline: boolean;
  provider: string;
  paidProvider: string;
  pdf: string;
  version: string;
  goals: EngineGoals;
  jobs: EngineJob[];
  jobsTruncated?: boolean;
  sources?: EngineSource[];
  workers: {
    id: string;
    label: string;
    expiresAt: string;
    online: boolean;
    revoked: boolean;
    lastSeenAt?: string | null;
  }[];
  schedule: { enabled: boolean; time: string; zone: string; nextRun: string };
};
export type SourceExcerpt = {
  id: string;
  materialId: string;
  materialVersion: number;
  pageIndex: number;
  pageLabel?: string;
  ordinal: number;
  sourceHash: string;
  text: string;
  quality: string;
  parserVersion: string;
};
export type EngineAction =
  | "goals"
  | "plan"
  | `index/${string}`
  | `jobs/${string}/approve`
  | `jobs/${string}/reissue`
  | `jobs/${string}/retry`
  | `jobs/${string}/cancel`
  | `jobs/${string}/run`
  | `feedback/${string}/analyze`
  | "workers"
  | `workers/${string}/revoke`;
export type HistoryFilters = {
  kind?: string;
  state?: string;
  date?: string;
  week?: string;
};
export type StudyEnginePort = {
  status(): Promise<EngineStatus>;
  action(action: EngineAction, data?: unknown): Promise<unknown>;
  search(
    material: string,
    q: string,
    page: number,
    job?: string,
  ): Promise<SourceExcerpt[]>;
  history?(page: number, filters?: HistoryFilters): Promise<EngineHistory>;
  preview?(date: string): Promise<PlanPreview>;
};

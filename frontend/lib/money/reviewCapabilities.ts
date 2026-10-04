import type { AiItem } from "./ai";
import type { Category } from "./model";
import { categoryIndex } from "./categories";

export function reviewCapabilities(row: AiItem, categories: Category[]) {
  const known = row.kind === "RAW" || row.kind === "TRANSACTION";
  const versions = [row.version, row.overrideVersion, row.projectionVersion].every(v => Number.isInteger(v) && v >= 0);
  const pending = ["PENDING", "DEFERRED"].includes(row.state);
  const financial = row.kind === "TRANSACTION";
  const classify = financial && versions && pending && row.reason === "CATEGORY_UNCONFIRMED" && row.reviewType === "CLASSIFICATION" && ["EXPENSE", "INCOME"].includes(row.type || "") && !row.excluded;
  const index = categoryIndex(categories);
  const proposal = row.proposal?.categoryId ? index.byId.get(row.proposal.categoryId) : undefined;
  const validProposal = classify && !!proposal && proposal.kind === row.type && index.active(proposal);
  return {
    known, classify, validProposal, financial,
    financialEditor: known && pending && (row.kind === "RAW" && row.reviewType !== "NOISE" || financial && !classify && row.reviewType !== "TRANSFER"),
    transfer: financial && pending && row.reviewType === "TRANSFER",
    nonTransaction: known && versions && pending && (row.kind === "RAW" || financial && ["EXPENSE", "INCOME"].includes(row.type || "") && !row.excluded),
    defer: known && versions && pending,
    undo: known && versions && row.state === "COMPLETED" && row.canUndo === true && !!row.eventId && row.reviewType !== "TRANSFER",
  };
}

export function reviewDecision(row: AiItem, action: string, categoryId?: string | null) {
  return { id: row.id, kind: row.kind, action, transactionVersion: row.transactionVersion ?? row.version, overrideVersion: row.overrideVersion, projectionVersion: row.projectionVersion, version: row.version, overrides: action === "CONFIRM" ? { categoryId } : {} };
}

export const proposalBasis: Record<string, string> = { NONE: "제안 없음", EXPLICIT_RULE: "명시 규칙", CONFIRMED_HISTORY: "확정 이력", EXTERNAL_EVIDENCE: "외부 검색 근거" };

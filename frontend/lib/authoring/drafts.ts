import type { Draft, Session } from "./types";
export type StoredDraft = Draft & { version: number };
export function draftDiffers(draft: StoredDraft | null, session: Session): draft is StoredDraft {
  return !!draft && (JSON.stringify(draft.answers) !== JSON.stringify(session.answers) || draft.currentSectionKey !== session.currentSectionKey);
}
/** Title and memo travel with the writing draft so one serialized queue owns the session version. */
export const draftOf = (session: Pick<Session, "answers" | "currentSectionKey" | "title" | "memo">): Draft =>
  ({ answers: session.answers, currentSectionKey: session.currentSectionKey, title: session.title ?? null, memo: session.memo ?? null });
export function metadataDiffers(draft: StoredDraft | null, session: Session): draft is StoredDraft {
  return !!draft && ((draft.title !== undefined && (draft.title ?? "") !== (session.title ?? ""))
    || (draft.memo !== undefined && (draft.memo ?? "") !== (session.memo ?? "")));
}

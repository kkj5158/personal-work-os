import type { Draft, Session } from "./types";
export type StoredDraft = Draft & { version: number };
export function draftDiffers(draft: StoredDraft | null, session: Session): draft is StoredDraft {
  return !!draft && (JSON.stringify(draft.answers) !== JSON.stringify(session.answers) || draft.currentSectionKey !== session.currentSectionKey);
}

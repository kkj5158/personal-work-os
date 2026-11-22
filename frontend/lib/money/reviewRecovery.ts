import type {ReviewAction} from './reviewWorkflow';

// Only opaque command identifiers and optimistic guards survive a tab reload.
// The owner-scoped cache retains source evidence, search text and receipts in memory.
export type ReviewSubmission =
  | {kind: 'single'; id: string; version: number; admissionFingerprint?: string}
  | {kind: 'batch'; previewId: string};
export type StoredReviewCommand = {requestId: string; action: ReviewAction; keys: string[]; submission: ReviewSubmission};

function valid(x: unknown): x is StoredReviewCommand {
  if (!x || typeof x !== 'object') return false;
  const c = x as StoredReviewCommand;
  if (typeof c.requestId !== 'string' || !['MOVE_TO_BOOKKEEPING','DEFER','REOPEN'].includes(c.action)
    || !Array.isArray(c.keys) || !c.keys.every(key => typeof key === 'string' && key.startsWith('RAW:'))) return false;
  const s = c.submission;
  return s?.kind === 'batch' ? typeof s.previewId === 'string' :
    s?.kind === 'single' && typeof s.id === 'string' && c.keys.length === 1 && c.keys[0] === 'RAW:'+s.id
      && Number.isSafeInteger(s.version) && (c.action !== 'MOVE_TO_BOOKKEEPING' || typeof s.admissionFingerprint === 'string');
}
const key = (owner: string) => 'money-review-requests-v1:'+owner;
export function storedReviewCommands(owner: string | null): StoredReviewCommand[] {
  if (!owner || typeof window === 'undefined') return [];
  try {
    const values: unknown = JSON.parse(window.sessionStorage.getItem(key(owner)) ?? '[]');
    return Array.isArray(values) ? values.filter(valid) : [];
  } catch {return [];}
}
export function persistReviewCommand(owner: string | null, requestId: string, command?: StoredReviewCommand) {
  if (!owner) return false;
  try {
    const values = storedReviewCommands(owner).filter(c => c.requestId !== requestId);
    if (command) {
      const {action, keys, submission} = command;
      values.push({requestId, action, keys, submission});
    }
    if (values.length) window.sessionStorage.setItem(key(owner), JSON.stringify(values));
    else window.sessionStorage.removeItem(key(owner));
    return true;
  } catch {return false;}
}

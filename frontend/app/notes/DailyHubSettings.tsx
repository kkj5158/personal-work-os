"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { notesApi } from "@/lib/api/notes";
import type { DailyHubSettings as Preferences } from "@/lib/notes/dailyHub";
import type { Workspace } from "@/lib/notes/types";
import { workspaceIcon } from "./WorkspaceIconPicker";

export function DailyHubSettings({ workspaces, initial, flush, saved, close }: {
  workspaces: Workspace[]; initial: Preferences; flush: () => Promise<void>;
  saved: (value: Preferences) => void; close: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal open title="데일리 허브 설정" onClose={() => { if (!busy) close(); }}>
    <form className="daily-hub-settings" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await flush(); saved(await notesApi.saveDailyHubSettings(draft)); close(); }
      catch (e) { setError(e instanceof Error ? e.message : "설정 저장 실패"); }
      finally { setBusy(false); }
    }}>
      <p>포함할 Workspace를 선택하세요. 표시 순서는 공통 Workspace 순서를 따릅니다.</p>
      {workspaces.filter(w => !w.archivedAt).map(w => <label key={w.id}>
        <input type="checkbox" disabled={busy} checked={draft.includedWorkspaceIds.includes(w.id)} onChange={event => setDraft(previous => ({ ...previous, includedWorkspaceIds: event.target.checked ? [...previous.includedWorkspaceIds, w.id] : previous.includedWorkspaceIds.filter(id => id !== w.id) }))}/>
        <span>{workspaceIcon(w.icon)} {w.name}</span>
      </label>)}
      <hr/>
      <label><input type="checkbox" disabled={busy} checked={draft.autoIncludeNewWorkspaces} onChange={event => setDraft(previous => ({ ...previous, autoIncludeNewWorkspaces: event.target.checked }))}/>새 Workspace 자동 포함</label>
      <p className="note-muted">제외해도 Workspace와 기존 기록은 유지됩니다.</p>
      {error && <p role="alert">{error}</p>}
      <div className="daily-hub-settings-actions"><button type="button" disabled={busy} onClick={close}>취소</button><button className="primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div>
    </form>
  </Modal>;
}

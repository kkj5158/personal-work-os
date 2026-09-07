"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
export function DeleteConfirmation({
  name,
  description,
  close,
  remove,
}: {
  name: string;
  description: string;
  close: () => void;
  remove: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      title="영구삭제 확인"
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (confirmation !== name || busy) return;
          setBusy(true);
          setError("");
          try {
            await remove();
            close();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "삭제하지 못했습니다.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{description} 복구할 수 없습니다.</p>
        <label>
          확인하려면 <strong>{name}</strong>을 그대로 입력하세요.
          <input
            autoFocus
            aria-label="영구삭제 확인 이름"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing && e.key === "Enter")
                e.preventDefault();
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="delete-confirm-actions">
          <button type="button" disabled={busy} onClick={close}>
            취소
          </button>
          <button
            className="danger"
            type="submit"
            disabled={confirmation !== name || busy}
          >
            {busy ? "삭제 중…" : "영구삭제"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

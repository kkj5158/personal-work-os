"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { getLeaveMonthSummary, setLeaveMonthAllowance } from "@/lib/api/leaveAllowances";
import type { LeaveMonthSummaryDto } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE } from "./format";

interface LeaveAllowanceModalProps {
  initialMonth: Date;
  onClose: () => void;
  /** Called after a successful save, so page.tsx can refresh the summary
   *  strip shown near the donut without this modal needing to own it. */
  onSaved: () => void;
}

const TITLE_ID = "worklog-leave-allowance-title";

function formatDays(value: number | null): string {
  if (value == null) return "–";
  return Number.isInteger(value) ? `${value}일` : `${value}일`;
}

// Monthly leave allowance configuration (post-production iteration 1,
// REQ-01) — button-opened modal, deliberately not the future unified
// Settings page. The form/domain logic (lib/api/leaveAllowances.ts) is kept
// separate from this modal shell so it can be lifted into Settings later
// without rework.
export function LeaveAllowanceModal({ initialMonth, onClose, onSaved }: LeaveAllowanceModalProps) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [summary, setSummary] = useState<LeaveMonthSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowanceInput, setAllowanceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const dto = await getLeaveMonthSummary(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1);
        if (cancelled) return;
        setSummary(dto);
        setAllowanceInput(dto.allowanceDays == null ? "" : String(dto.allowanceDays));
      } catch (err) {
        if (!cancelled) setError(describeApiError(err, "연차 정보를 불러오지 못했습니다."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthAnchor]);

  function changeMonth(delta: number) {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  async function handleSave() {
    const parsed = Number(allowanceInput);
    if (allowanceInput.trim() === "" || Number.isNaN(parsed) || parsed < 0) {
      setError("허용량을 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    if (Math.round(parsed * 2) !== parsed * 2) {
      setError("허용량은 0.5일 단위로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await setLeaveMonthAllowance(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, parsed);
      setSummary(updated);
      onSaved();
    } catch (err) {
      setError(describeApiError(err, "연차 허용량을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="연차 설정"
      onClose={onClose}
      size="compact"
      footer={
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            data-autofocus
            className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className={`h-9 rounded-md bg-success-emphasis px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="이전 달"
            className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <ChevronLeftIcon size={16} aria-hidden="true" />
          </button>
          <span className="w-24 text-center text-sm font-semibold text-fg-default">
            {monthAnchor.getFullYear()}년 {monthAnchor.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="다음 달"
            className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <ChevronRightIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-fg-muted">불러오는 중…</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="leave-allowance-input" className="text-xs text-fg-muted">
                이번 달 연차 허용량
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="leave-allowance-input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={allowanceInput}
                  onChange={(e) => setAllowanceInput(e.target.value)}
                  placeholder="예: 1.5"
                  className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                />
                <span className="text-sm text-fg-muted">일</span>
              </div>
              {summary?.allowanceDays == null && (
                <p className="text-xs text-fg-muted">아직 이번 달 연차 허용량이 설정되지 않았습니다.</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border-default bg-canvas-subtle px-4 py-3 text-sm">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs text-fg-muted">허용량</span>
                <span className="font-semibold text-fg-default">{formatDays(summary?.allowanceDays ?? null)}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs text-fg-muted">사용</span>
                <span className="font-semibold text-fg-default">{formatDays(summary?.usedDays ?? 0)}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs text-fg-muted">잔여</span>
                <span className="font-semibold text-primary-fg">{formatDays(summary?.remainingDays ?? null)}</span>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger-fg">{error}</p>}
      </div>
    </WorkLogModal>
  );
}

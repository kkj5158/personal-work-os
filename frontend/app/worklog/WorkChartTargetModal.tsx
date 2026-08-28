"use client";

import { useEffect, useState } from "react";
import { getWorkChartTargets, setWorkChartTargets } from "@/lib/api/workChartTargets";
import { describeApiError } from "./errorMessages";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes } from "./format";

const TITLE_ID = "worklog-work-chart-target-title";

interface WorkChartTargetModalProps {
  onClose: () => void;
  /** Called with the saved targets so the Daily Work chart updates its
   *  baselines immediately without a separate refetch. */
  onSaved: (targetWorkMinutes: number, targetScore: number) => void;
}

// Daily Work chart target settings (REQ-04 §9.3) — simple CURRENT values
// only, no effective-dated history (explicit scope limit for this
// iteration). Form logic kept independent of this modal shell, matching
// every other button-opened settings modal in this batch.
export function WorkChartTargetModal({ onClose, onSaved }: WorkChartTargetModalProps) {
  const [loading, setLoading] = useState(true);
  const [workTimeText, setWorkTimeText] = useState("08:00");
  const [scoreText, setScoreText] = useState("80");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dto = await getWorkChartTargets();
        if (cancelled) return;
        setWorkTimeText(formatHoursMinutes(dto.targetWorkMinutes));
        setScoreText(String(dto.targetScore));
      } catch (err) {
        if (!cancelled) setError(describeApiError(err, "목표 설정을 불러오지 못했습니다."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const targetWorkMinutes = parseHoursMinutes(workTimeText);
    const targetScore = Number(scoreText);
    if (targetWorkMinutes == null || targetWorkMinutes <= 0) {
      setError("실근무 목표를 HH:MM 형식으로 입력해 주세요 (예: 08:00).");
      return;
    }
    if (!Number.isInteger(targetScore) || targetScore < 0 || targetScore > 100) {
      setError("근무 점수 목표는 0~100 사이의 정수로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await setWorkChartTargets({ targetWorkMinutes, targetScore });
      onSaved(saved.targetWorkMinutes, saved.targetScore);
      onClose();
    } catch (err) {
      setError(describeApiError(err, "목표 설정을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="목표 설정"
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
      {loading ? (
        <p className="py-4 text-center text-sm text-fg-muted">불러오는 중…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-work-time" className="text-xs text-fg-muted">
              실근무 목표 (HH:MM)
            </label>
            <input
              id="target-work-time"
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={workTimeText}
              onChange={(e) => setWorkTimeText(e.target.value)}
              placeholder="08:00"
              className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-score" className="text-xs text-fg-muted">
              근무 점수 목표
            </label>
            <input
              id="target-score"
              type="number"
              min={0}
              max={100}
              value={scoreText}
              onChange={(e) => setScoreText(e.target.value)}
              className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
          </div>
          <p className="text-xs text-fg-muted">현재 시점의 단순 목표값입니다. 과거 데이터에도 항상 최신 목표가 기준선으로 표시됩니다.</p>
          {error && <p className="text-sm text-danger-fg">{error}</p>}
        </div>
      )}
    </WorkLogModal>
  );
}

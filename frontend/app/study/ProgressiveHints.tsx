"use client";

import { useEffect, useId, useRef, useState } from "react";
import { responseKey, type Binding, type HintState, type StudyDataPort } from "@/lib/study/model";

export function ProgressiveHints({ port, binding }: { port: StudyDataPort; binding: Binding }) {
  const [state, setState] = useState<HintState>(() =>
    port.cachedHints?.(binding) ?? { revealedHintCount: 0, hints: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);
  const progressId = useId();
  const tuple = responseKey(binding);
  const exactBinding = useRef(binding);
  useEffect(() => {
    let current = true;
    void port.readHints?.(exactBinding.current).then(result => {
      if (current) setState(previous => result.revealedHintCount >= previous.revealedHintCount ? result : previous);
    }).catch(() => {
      // The learner can still view previously confirmed stages and retry a reveal.
    });
    return () => { current = false; };
  }, [port, tuple]);

  async function reveal() {
    if (requestInFlight.current || state.revealedHintCount >= 3 || !port.revealHint) return;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = (state.revealedHintCount + 1) as 1 | 2 | 3;
      const result = await port.revealHint(binding, next);
      setState(previous => result.revealedHintCount >= previous.revealedHintCount ? result : previous);
    } catch {
      setError("힌트를 불러오지 못했습니다. 같은 단계로 다시 시도할 수 있습니다.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="study-hints">
    <button type="button" aria-controls={progressId} aria-disabled={busy || state.revealedHintCount === 3}
      onMouseDown={event => event.preventDefault()} onClick={() => void reveal()}>
      {busy ? "힌트 불러오는 중…" : state.revealedHintCount === 3 ? "힌트 3단계 확인 완료"
        : state.revealedHintCount === 0 ? "힌트 보기" : `다음 힌트 보기 (${state.revealedHintCount + 1}/3)`}
    </button>
    <div id={progressId} aria-live="polite">
      {state.hints.length > 0 && <ol>{state.hints.map((hint, index) => <li key={index}>{hint}</li>)}</ol>}
      {error && <p role="status">{error}</p>}
    </div>
  </div>;
}

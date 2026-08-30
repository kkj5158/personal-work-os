"use client";

import { useEffect, useRef, useState } from "react";
import { bulletsToText, textToBullets } from "./checklistLogic";
import { FOCUS_VISIBLE } from "./format";

const AUTOSAVE_DEBOUNCE_MS = 700;

interface ChecklistMemoEditorProps {
  entryId: string;
  memo: string | null;
  onSave: (entryId: string, memo: string | null) => Promise<void>;
}

// Per-date x per-item bullet memo (§18). Local draft state renders
// immediately; persistence is debounced (never per-keystroke) and flushed
// on blur. Enter adds the next bullet; Backspace on an empty bullet removes
// it; removing every bullet returns to the "+ 메모" affordance. No Save
// button — failure is surfaced only if the debounced/flushed save itself
// fails.
export function ChecklistMemoEditor({ entryId, memo, onSave }: ChecklistMemoEditorProps) {
  const [bullets, setBullets] = useState<string[]>(() => (textToBullets(memo).length > 0 ? textToBullets(memo) : []));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const lastSavedRef = useRef<string | null>(memo);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleSave(nextBullets: string[]) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush(nextBullets);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function flush(nextBullets: string[]) {
    const text = bulletsToText(nextBullets);
    if (text === lastSavedRef.current) return;
    try {
      await onSave(entryId, text);
      lastSavedRef.current = text;
      setError(null);
    } catch {
      setError("메모를 저장하지 못했습니다.");
    }
  }

  function updateBullet(index: number, value: string) {
    const next = bullets.map((b, i) => (i === index ? value : b));
    setBullets(next);
    scheduleSave(next);
  }

  function startMemo() {
    setEditing(true);
    setBullets([""]);
    requestAnimationFrame(() => inputRefs.current.get(0)?.focus());
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...bullets.slice(0, index + 1), "", ...bullets.slice(index + 1)];
      setBullets(next);
      scheduleSave(next);
      requestAnimationFrame(() => inputRefs.current.get(index + 1)?.focus());
    } else if (e.key === "Backspace" && bullets[index] === "" && bullets.length > 0) {
      e.preventDefault();
      const next = bullets.filter((_, i) => i !== index);
      setBullets(next);
      scheduleSave(next);
      if (next.length === 0) {
        setEditing(false);
      } else {
        requestAnimationFrame(() => inputRefs.current.get(Math.max(0, index - 1))?.focus());
      }
    }
  }

  function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current);
    void flush(bullets);
  }

  if (bullets.length === 0 && !editing) {
    return (
      <button type="button" onClick={startMemo} className={`text-xs text-fg-muted hover:text-fg-default ${FOCUS_VISIBLE}`}>
        + 메모
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && handleBlur()}>
      {bullets.map((bullet, index) => (
        <div key={index} className="flex items-start gap-1.5 text-sm text-fg-muted">
          <span className="mt-1.5 select-none">•</span>
          <input
            ref={(el) => {
              if (el) inputRefs.current.set(index, el);
              else inputRefs.current.delete(index);
            }}
            type="text"
            value={bullet}
            onChange={(e) => updateBullet(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`h-7 flex-1 rounded border border-transparent bg-transparent px-1 text-sm text-fg-default hover:border-control-border focus:border-primary-emphasis focus:bg-control-bg focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </div>
      ))}
      {error && <span className="text-xs text-danger-fg">{error}</span>}
    </div>
  );
}

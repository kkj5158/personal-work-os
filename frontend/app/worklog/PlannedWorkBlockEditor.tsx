"use client";

import { useState } from "react";
import { TrashIcon } from "@primer/octicons-react";
import { parseLocalDateTime, toLocalDateTimeString } from "@/lib/date";
import { createPlannedBlock, deletePlannedBlock } from "@/lib/api/plannedBlocks";
import type { ActivityCategory, PlannedTimeBlock } from "@/lib/api/types";
import { buildChildOptions, buildRootOptions, resolveCategoryLabel } from "./activityCategory";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, formatHoursMinutes, parseTimeOfDayMinutes } from "./format";
import { combineDateAndMinutes } from "./mapping";
import { TimeTextInput } from "./TimeTextInput";

function blockMinutes(block: PlannedTimeBlock): number {
  return Math.round((parseLocalDateTime(block.endAt).getTime() - parseLocalDateTime(block.startAt).getTime()) / 60000);
}

interface PlannedWorkBlockEditorProps {
  date: Date;
  /** Shared work-category taxonomy (§11/§17) — the same
   *  buildRootOptions/buildChildOptions/resolveCategoryLabel policy Work
   *  Record's own WorkTimeEntryEditor uses: inactive categories never offered
   *  for a NEW selection, but a block that already references one still
   *  resolves to a readable label. Never a second "planning categories" list. */
  categories: ActivityCategory[];
  /** Already scoped to this component's own date by the caller. */
  blocks: PlannedTimeBlock[];
  /** false for a past date — historical PlannedTimeBlocks are read-only, no
   *  add form, no delete controls (§13 past-plan immutability). */
  editable: boolean;
  onBlockUpserted: (block: PlannedTimeBlock) => void;
  onBlockDeleted: (id: string) => void;
}

// Reusable planned-work-block list/editor (§19 reuse architecture) — reads/
// writes the canonical PlannedTimeBlock records directly through the same
// create/delete endpoints the Planning page's own editor uses. Deliberately
// a compact add/delete-only editor, not full in-place editing (moving/
// resizing stays the Planning workspace's job).
export function PlannedWorkBlockEditor({ date, categories, blocks, editable, onBlockUpserted, onBlockDeleted }: PlannedWorkBlockEditorProps) {
  const [blockTitle, setBlockTitle] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [blockCategoryId, setBlockCategoryId] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  const rootOptions = buildRootOptions(categories);
  const childOptions = parentCategoryId !== "" ? buildChildOptions(categories, parentCategoryId) : [];

  function handleParentChange(nextParentId: string) {
    setParentCategoryId(nextParentId);
    setBlockCategoryId("");
  }

  const sortedBlocks = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const totalBlockMinutes = sortedBlocks.reduce((sum, b) => sum + blockMinutes(b), 0);
  const latestBlockEnd = sortedBlocks.reduce((latest, b) => (b.endAt > latest ? b.endAt : latest), sortedBlocks[0]?.endAt ?? "");

  async function handleAddBlock() {
    const trimmedTitle = blockTitle.trim();
    if (!trimmedTitle) {
      setBlockError("업무 내용을 입력해 주세요.");
      return;
    }
    const startMinutes = parseTimeOfDayMinutes(blockStart);
    const endMinutes = parseTimeOfDayMinutes(blockEnd);
    if (startMinutes == null || endMinutes == null) {
      setBlockError("시간 형식이 올바르지 않습니다 (예: 09:30).");
      return;
    }
    if (endMinutes <= startMinutes) {
      setBlockError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }

    setAddingBlock(true);
    setBlockError(null);
    try {
      const created = await createPlannedBlock({
        title: trimmedTitle,
        startAt: toLocalDateTimeString(combineDateAndMinutes(date, startMinutes)),
        endAt: toLocalDateTimeString(combineDateAndMinutes(date, endMinutes)),
        categoryId: blockCategoryId || null,
        memo: null,
      });
      onBlockUpserted(created);
      setBlockTitle("");
      setBlockStart("");
      setBlockEnd("");
      setParentCategoryId("");
      setBlockCategoryId("");
    } catch (err) {
      setBlockError(describeApiError(err, "업무 블록을 추가하지 못했습니다."));
    } finally {
      setAddingBlock(false);
    }
  }

  async function handleDeleteBlock(id: string) {
    setDeletingBlockId(id);
    setBlockError(null);
    try {
      await deletePlannedBlock(id);
      onBlockDeleted(id);
    } catch (err) {
      setBlockError(describeApiError(err, "업무 블록을 삭제하지 못했습니다."));
    } finally {
      setDeletingBlockId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg-muted">계획 업무 블록</span>
        {sortedBlocks.length > 0 && (
          <span className="text-xs font-medium text-fg-default">계획 업무시간 {formatHoursMinutes(totalBlockMinutes)}</span>
        )}
      </div>

      {sortedBlocks.length > 0 ? (
        <>
          <p className="text-[11px] text-fg-muted">
            예정 시간 {sortedBlocks[0].startAt.slice(11, 16)} ~ {latestBlockEnd.slice(11, 16)}
          </p>
          <ul className="flex flex-col gap-1">
            {sortedBlocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-border-default px-2 py-1 text-xs">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg-default">{b.title}</span>
                  <span className="text-fg-muted">
                    {b.startAt.slice(11, 16)}–{b.endAt.slice(11, 16)}
                    {b.categoryId && ` · ${resolveCategoryLabel(b.categoryId, categories)}`}
                  </span>
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(b.id)}
                    disabled={deletingBlockId === b.id}
                    aria-label={`${b.title} 블록 삭제`}
                    className={`shrink-0 rounded p-1 text-fg-muted hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                  >
                    <TrashIcon size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-fg-muted">계획된 업무 블록이 없습니다.</p>
      )}

      {editable && (
        <div className="flex flex-col gap-3 rounded-md border border-border-default bg-canvas-subtle p-3 pt-2.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fg-muted" htmlFor="planned-block-title">
              업무 내용
            </label>
            <input
              id="planned-block-title"
              type="text"
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              placeholder="예: Project Orbit 설계"
              className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
          </div>

          {/* Comfortable planning-workspace layout (§4): time and category
              controls each get a real column on desktop widths instead of
              being squeezed into a single narrow row — the dialog is 820px
              wide specifically so these have room to breathe. */}
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">시작 시간</span>
              <TimeTextInput value={blockStart} onChange={setBlockStart} aria-label="블록 시작 시간" className="w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">종료 시간</span>
              <TimeTextInput value={blockEnd} onChange={setBlockEnd} aria-label="블록 종료 시간" className="w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">대분류</span>
              <select
                value={parentCategoryId}
                onChange={(e) => handleParentChange(e.target.value)}
                aria-label="업무 블록 대분류"
                className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              >
                <option value="">대분류 선택</option>
                {rootOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">중분류</span>
              <select
                value={blockCategoryId}
                onChange={(e) => setBlockCategoryId(e.target.value)}
                disabled={parentCategoryId === ""}
                aria-label="업무 블록 중분류"
                className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                <option value="">중분류 선택</option>
                {childOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {blockError && <p className="text-xs text-danger-fg">{blockError}</p>}
          <button
            type="button"
            onClick={handleAddBlock}
            disabled={addingBlock}
            className={`h-9 w-fit rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {addingBlock ? "추가 중…" : "+ 블록 추가"}
          </button>
        </div>
      )}
    </div>
  );
}

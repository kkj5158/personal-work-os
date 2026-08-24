"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import type { ActivityCategory } from "@/lib/api/types";
import { formatDayHeader } from "@/lib/date";

export interface BlockEditValue {
  title: string;
  date: Date;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  categoryId: string | null;
  memo: string;
}

interface BlockEditDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValue: BlockEditValue | null;
  categories: ActivityCategory[];
  onSave: (value: BlockEditValue) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  onCreateCategory: (name: string, parentId: string | null) => Promise<ActivityCategory>;
}

export function BlockEditDialog({
  open,
  mode,
  initialValue,
  categories,
  onSave,
  onDelete,
  onClose,
  onCreateCategory,
}: BlockEditDialogProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [categoryId, setCategoryId] = useState("");
  const [memo, setMemo] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialValue) {
      setTitle(initialValue.title);
      setStartTime(initialValue.startTime);
      setEndTime(initialValue.endTime);
      setCategoryId(initialValue.categoryId ?? "");
      setMemo(initialValue.memo);
      setError(null);
      setNewCategoryName("");
    }
  }, [initialValue]);

  if (!open || !initialValue) {
    return null;
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (endTime <= startTime) {
      setError("End time must be after start time");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        date: initialValue!.date,
        startTime,
        endTime,
        categoryId: categoryId || null,
        memo,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const created = await onCreateCategory(newCategoryName.trim(), null);
      setCategoryId(created.id);
      setNewCategoryName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create category");
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? "New planned block" : "Edit planned block"}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">{formatDayHeader(initialValue.date)}</p>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you planning?"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Start</label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">End</label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Category</label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </Select>
          <div className="mt-1.5 flex gap-1.5">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
            />
            <Button type="button" variant="ghost" onClick={handleAddCategory} className="shrink-0">
              + Add
            </Button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Memo</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="mt-1 flex items-center justify-between">
          <div>
            {mode === "edit" && onDelete && (
              <Button variant="danger" onClick={handleDelete} disabled={saving} type="button">
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} type="button" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

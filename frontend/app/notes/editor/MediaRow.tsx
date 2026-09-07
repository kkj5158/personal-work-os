"use client";
import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { notesApi } from "@/lib/api/notes";
import { useNoteEnvironment } from "../NoteContext";
import type { ImageRow } from "@/lib/notes/types";

function PrivateImage({ src, caption }: { src: string; caption: string }) {
  const { workspace } = useNoteEnvironment();
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false,
      objectUrl = "";
    notesApi
      .media(workspace, src.slice(6))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!gone) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workspace, src]);
  return url ? (
    <img src={url} alt={caption || "노트 이미지"} draggable={false} />
  ) : (
    <div className="image-placeholder">
      {failed ? "이미지 불러오기 실패" : "이미지 불러오는 중…"}
    </div>
  );
}
export function MediaRowView({
  node,
  updateAttributes,
  editor,
  getPos,
  selected,
  deleteNode,
}: NodeViewProps) {
  const row = node.attrs as ImageRow;
  const [active, setActive] = useState(0);
  const update = (next: Partial<ImageRow>) => updateAttributes(next);
  function resize(event: React.PointerEvent, index: number | null) {
    if (!editor.isEditable) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const start = event.clientX,
      width = target.closest(".media-row")!.getBoundingClientRect().width;
    const initial = row.width,
      ratios = row.images.map((i) => i.ratio);
    const move = (e: PointerEvent) => {
      const delta = ((e.clientX - start) / width) * 100;
      if (index === null)
        update({
          width: Math.round(Math.max(25, Math.min(100, initial + delta))),
        });
      else {
        const sum = ratios[index] + ratios[index + 1],
          value = Math.max(15, Math.min(sum - 15, ratios[index] + delta));
        update({
          images: row.images.map((image, i) => ({
            ...image,
            ratio:
              i === index ? value : i === index + 1 ? sum - value : image.ratio,
          })),
        });
      }
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  function drop(event: React.DragEvent, index: number) {
    if (!editor.isEditable) return;
    const payload = event.dataTransfer.getData("application/x-note-image");
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    const from = JSON.parse(payload) as { pos: number; index: number };
    const to = getPos();
    if (to === undefined) return;
    const source = editor.state.doc.nodeAt(from.pos);
    if (source?.type.name !== "mediaRow") return;
    const images = [...source.attrs.images] as ImageRow["images"];
    const [item] = images.splice(from.index, 1);
    if (!item) return;
    if (from.pos === to) {
      images.splice(index, 0, item);
      update({ images });
      return;
    }
    const tr = editor.state.tr;
    if (images.length)
      tr.setNodeMarkup(from.pos, undefined, { ...source.attrs, images });
    else tr.delete(from.pos, from.pos + source.nodeSize);
    const mapped = tr.mapping.map(to);
    if (row.images.length >= 3)
      tr.insert(
        mapped + node.nodeSize,
        node.type.create({
          images: [{ ...item, ratio: 100 }],
          width: 100,
          align: "left",
        }),
      );
    else {
      const next = [...row.images];
      next.splice(index, 0, item);
      tr.setNodeMarkup(mapped, undefined, {
        ...row,
        images: next.map((i) => ({ ...i, ratio: 100 / next.length })),
      });
    }
    editor.view.dispatch(tr);
  }
  return (
    <NodeViewWrapper
      className={`media-row ${selected ? "media-selected" : ""}`}
      contentEditable={false}
      data-drag-handle
    >
      <div
        className="media-row-images"
        style={{
          width: `${row.width}%`,
          marginLeft:
            row.align === "right"
              ? "auto"
              : row.align === "center"
                ? "auto"
                : 0,
          marginRight: row.align === "center" ? "auto" : 0,
        }}
      >
        {row.images.map((image, index) => (
          <div
            key={image.src + index}
            className={`media-cell ${active === index ? "active" : ""}`}
            style={{ flex: image.ratio }}
            draggable={editor.isEditable}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                "application/x-note-image",
                JSON.stringify({ pos: getPos(), index }),
              );
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-note-image"))
                e.preventDefault();
            }}
            onDrop={(e) => drop(e, index)}
            onClick={() => setActive(index)}
          >
            <PrivateImage src={image.src} caption={image.caption} />
            {editor.isEditable && index < row.images.length - 1 && (
              <button
                className="media-ratio-handle"
                aria-label="이미지 비율 조절"
                onPointerDown={(e) => resize(e, index)}
              />
            )}
          </div>
        ))}
        {editor.isEditable && (
          <button
            className="media-width-handle"
            aria-label="이미지 행 너비 조절"
            onPointerDown={(e) => resize(e, null)}
          />
        )}
      </div>
      {editor.isEditable && (
        <div className="media-controls">
          <span title="행 끌어 이동" data-drag-handle>
            ⠿
          </span>
          <input
            aria-label="이미지 설명"
            placeholder="이미지 설명 (선택)"
            value={row.images[active]?.caption ?? ""}
            onChange={(e) =>
              update({
                images: row.images.map((i, n) =>
                  n === active ? { ...i, caption: e.target.value } : i,
                ),
              })
            }
          />
          <select
            aria-label="이미지 너비"
            value={row.width}
            onChange={(e) => update({ width: Number(e.target.value) })}
          >
            {[
              25,
              33,
              50,
              66,
              75,
              100,
              ...([25, 33, 50, 66, 75, 100].includes(row.width)
                ? []
                : [row.width]),
            ].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
          <select
            aria-label="이미지 정렬"
            value={row.align}
            onChange={(e) =>
              update({ align: e.target.value as ImageRow["align"] })
            }
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </select>
          <button
            aria-label="선택 이미지 제거"
            onClick={() => {
              if (row.images.length === 1) deleteNode();
              else {
                update({ images: row.images.filter((_, i) => i !== active) });
                setActive(0);
              }
            }}
          >
            삭제
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { uploadImage } from "@/lib/log/api";
import {
  AttachmentQueue,
  DEFAULT_IMAGE_LIMIT,
  MAX_IMAGE_BYTES,
  type UploadPhase,
} from "@/lib/log/attachments";
import { PrivateImage } from "./LogMedia";

export function useAttachments(
  owner: string,
  profile: string,
  images: string[],
  change: (ids: string[]) => void,
  limit = DEFAULT_IMAGE_LIMIT,
  maxBytes = MAX_IMAGE_BYTES,
) {
  const [, render] = useState(0),
    changeRef = useRef(change),
    idsRef = useRef(images);
  useLayoutEffect(() => {
    changeRef.current = change;
  });
  // Ref reads below are deferred queue notifications; the constructor never calls them during render.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState(() => {
    const queue: AttachmentQueue = new AttachmentQueue(
      (file, id, phase, signal) =>
        uploadImage(owner, profile, file, {
          id,
          phase,
          signal,
          maxBytes: queue.maxBytes,
        }),
      () => {
        render((value) => value + 1);
        const ids = queue.ids;
        if (JSON.stringify(ids) !== JSON.stringify(idsRef.current)) {
          idsRef.current = ids;
          changeRef.current(ids);
        }
      },
      limit,
      maxBytes,
    );
    queue.items = images.map((id) => ({ key: id, id, phase: "ready" }));
    return queue;
  });
  useEffect(() => {
    queue.resume();
    return () => queue.dispose();
  }, [queue]);
  useEffect(() => {
    queue.configure(limit, maxBytes);
    if (
      !queue.blocked &&
      JSON.stringify(images) !== JSON.stringify(idsRef.current)
    ) {
      idsRef.current = images;
      queue.reset(images);
    }
  }, [images, queue, limit, maxBytes]);
  return queue;
}

const hasFiles = (event: { dataTransfer: DataTransfer | null }) =>
  !!event.dataTransfer &&
  Array.from(event.dataTransfer.types).includes("Files");
export function useFileDrop(add: (files: File[]) => void, disabled: boolean) {
  const [active, setActive] = useState(false),
    depth = useRef(0);
  return {
    active,
    handlers: {
      "data-log-file-drop": true,
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current++;
        if (!disabled) setActive(true);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (--depth.current <= 0) {
          depth.current = 0;
          setActive(false);
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current = 0;
        setActive(false);
        if (!disabled) add(Array.from(event.dataTransfer.files));
      },
    },
  };
}

/** File drops outside any registered app target must never navigate away from LOG. Text drags are untouched. */
export function usePreventFileNavigation() {
  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => {
      if (!event.defaultPrevented && event.dataTransfer && hasFiles(event))
        event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
}

const labels: Record<UploadPhase, string> = {
  queued: "대기 중",
  validating: "사진 확인 중…",
  uploading: "전송 중…",
  finalizing: "저장 확인 중…",
  ready: "첨부 완료",
  error: "전송 실패",
};
export function AttachmentEditor({
  queue,
  owner,
  profile,
  disabled = false,
}: {
  queue: AttachmentQueue;
  owner: string;
  profile: string;
  disabled?: boolean;
}) {
  return (
    <div className="log-attachments">
      <div className="attachment-count" role="status">
        사진 {queue.items.length}/{queue.limit}장
        {queue.blocked
          ? " · 전송을 완료하거나 실패한 사진을 제거해주세요."
          : ""}
      </div>
      {!!queue.items.length && (
        <ol className="attachment-list" aria-label="첨부 사진 순서">
          {queue.items.map((item, index) => (
            <li className="attachment-card" key={item.key}>
              <div className="attachment-preview">
                {item.preview /* authenticated local File preview, revoked on remove/unmount */ ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview}
                    alt={`첨부 사진 ${index + 1}`}
                    draggable={false}
                  />
                ) : item.id ? (
                  <PrivateImage
                    owner={owner}
                    profile={profile}
                    id={item.id}
                    alt={`첨부 사진 ${index + 1}`}
                  />
                ) : null}
                <span className="attachment-number">{index + 1}</span>
                <button
                  type="button"
                  className="attachment-remove"
                  disabled={disabled}
                  aria-label={`사진 ${index + 1} 제거`}
                  onClick={() => queue.remove(item.key)}
                >
                  ×
                </button>
              </div>
              <div className="attachment-order">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`사진 ${index + 1} 앞으로`}
                  onClick={() => queue.move(item.key, index - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={disabled || index === queue.items.length - 1}
                  aria-label={`사진 ${index + 1} 뒤로`}
                  onClick={() => queue.move(item.key, index + 1)}
                >
                  →
                </button>
              </div>
              <small
                className={item.phase === "error" ? "attachment-error" : ""}
              >
                {item.error ?? labels[item.phase]}
              </small>
              {item.phase === "error" && (
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={disabled}
                  onClick={() => queue.retry(item.key)}
                  aria-label={`사진 ${index + 1} 다시 시도`}
                >
                  다시 시도
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {!!queue.errors.length && (
        <ul className="attachment-rejections" role="alert">
          {queue.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

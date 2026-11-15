"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { type Profile } from "@/lib/log/api";
import { acquireImage } from "@/lib/log/media-cache";

export function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true">
      <use href={`#log-i-${name}`} />
    </svg>
  );
}
export function AutoTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(75, Math.min(el.scrollHeight + 2, 430))}px`;
    }
  }, [props.value]);
  return <textarea {...props} ref={ref} />;
}
export function Modal({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {children}
    </dialog>
  );
}
export function PrivateImage({
  owner,
  profile,
  id,
  alt,
  onClick,
  retryButton = false,
}: {
  owner: string;
  profile: string;
  id: string;
  alt: string;
  onClick?: () => void;
  retryButton?: boolean;
}) {
  const [retry, setRetry] = useState(0),
    [result, setResult] = useState<{
      key: string;
      src: string;
      failed: boolean;
    } | null>(null);
  const key = `${owner}:${profile}:${id}:${retry}`;
  useEffect(() => {
    let live = true;
    const image = acquireImage(owner, profile, id);
    image.url
      .then((url) => {
        if (live) setResult({ key, src: url, failed: false });
      })
      .catch(() => {
        if (live) setResult({ key, src: "", failed: true });
      });
    return () => {
      live = false;
      image.release();
    };
  }, [owner, profile, id, key]);
  if (result?.key === key && result.failed && !retryButton)
    return (
      <span className="image-error">
        사진을 불러오지 못했습니다. 확대해서 다시 시도해주세요.
      </span>
    );
  if (result?.key === key && result.failed)
    return (
      <button
        className="btn-quiet image-error"
        onClick={(e) => {
          e.stopPropagation();
          setRetry((n) => n + 1);
        }}
      >
        사진 다시 불러오기
      </button>
    );
  // These are authenticated memory-only blob URLs; Next's public image optimizer cannot access them.
  return result?.key === key && result.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={result.src} alt={alt} onClick={onClick} draggable={false} />
  ) : (
    <span className="image-loading" role="status">
      사진 로딩…
    </span>
  );
}
export function Avatar({
  owner,
  profile,
  size = "avatar-feed",
}: {
  owner: string;
  profile: Profile;
  size?: string;
}) {
  return (
    <div className={`avatar ${size}`} aria-label="프로필 이미지">
      {profile.avatar ? (
        <PrivateImage
          owner={owner}
          profile={profile.id}
          id={profile.avatar}
          alt="프로필 사진"
        />
      ) : (
        "🐥"
      )}
    </div>
  );
}
const mobileSubscribe = (fn: () => void) => {
  const mq = window.matchMedia("(max-width:620px)");
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};
const mobileSnapshot = () => window.matchMedia("(max-width:620px)").matches;
export function Carousel({
  owner,
  profile,
  images,
  open,
}: {
  owner: string;
  profile: string;
  images: string[];
  open: (index: number) => void;
}) {
  const [index, setIndex] = useState(0),
    mobile = useSyncExternalStore(mobileSubscribe, mobileSnapshot, () => false),
    visible = mobile ? 1 : 3;
  const count = Math.min(visible, images.length),
    start = Math.min(index, Math.max(0, images.length - count));
  if (!images.length) return null;
  return (
    <div
      className={`post-media-carousel ${images.length === 1 ? "single-photo" : ""}`}
    >
      <div
        className="media-carousel-stage"
        style={{ "--visible-media": count } as React.CSSProperties}
      >
        {images.slice(start, start + count).map((id, i) => (
          <button
            key={id}
            className="media-slide"
            onClick={() => open(start + i)}
            aria-label={`사진 ${start + i + 1} 확대`}
          >
            <PrivateImage
              owner={owner}
              profile={profile}
              id={id}
              alt={`첨부 사진 ${start + i + 1}`}
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <div className="media-carousel-controls">
          <button
            className="media-carousel-arrow"
            aria-label="이전 사진"
            disabled={start === 0}
            onClick={() => setIndex(start - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <span className="media-carousel-count" aria-live="polite">
            {start + 1}
            {count > 1
              ? `–${Math.min(start + count, images.length)}`
              : ""} / {images.length}
          </span>
          <button
            className="media-carousel-arrow"
            aria-label="다음 사진"
            disabled={start + count >= images.length}
            onClick={() => setIndex(start + 1)}
          >
            <Icon name="chevron" />
          </button>
        </div>
      )}
    </div>
  );
}
export function PhotoEditor({
  owner,
  profile,
  images,
  change,
  disabled = false,
}: {
  owner: string;
  profile: string;
  images: string[];
  change: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-photos">
      {images.map((id, i) => (
        <div key={id} className="pending-photo">
          <PrivateImage
            owner={owner}
            profile={profile}
            id={id}
            alt={`첨부 사진 ${i + 1}`}
          />
          <button
            aria-label={`사진 ${i + 1} 제거`}
            disabled={disabled}
            onClick={() => change(images.filter((_, n) => i !== n))}
          >
            ×
          </button>
          <div className="photo-order">
            {i > 0 && (
              <button
                aria-label={`사진 ${i + 1} 앞으로`}
                disabled={disabled}
                onClick={() => {
                  const next = [...images];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  change(next);
                }}
              >
                ←
              </button>
            )}
            {i < images.length - 1 && (
              <button
                aria-label={`사진 ${i + 1} 뒤로`}
                disabled={disabled}
                onClick={() => {
                  const next = [...images];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  change(next);
                }}
              >
                →
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
export function ImageViewer({
  owner,
  profile,
  images,
  index,
  close,
}: {
  owner: string;
  profile: string;
  images: string[];
  index: number;
  close: () => void;
}) {
  return (
    <Modal title="미디어 보기" className="viewer" close={close}>
      <div className="viewer-head">
        <strong>미디어 보기</strong>
        <button className="icon-btn" onClick={close} aria-label="닫기">
          <Icon name="x" />
        </button>
      </div>
      <PrivateImage
        retryButton
        owner={owner}
        profile={profile}
        id={images[index]}
        alt={`선택한 사진 ${index + 1}`}
      />
      <div className="viewer-foot">
        사진 {index + 1}/{images.length}
      </div>
    </Modal>
  );
}

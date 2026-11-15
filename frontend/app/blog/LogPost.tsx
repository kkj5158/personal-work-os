"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  errorText,
  logRequest,
  profilePath,
  uploadImage,
  type Post,
  type Profile,
  type Reply,
} from "@/lib/log/api";
import { AutoTextarea, Avatar, Carousel, Icon, PhotoEditor } from "./LogMedia";

export const age = (value: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  return minutes < 1
    ? "방금"
    : minutes < 60
      ? `${minutes}분`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}시간`
        : new Date(value).toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
          });
};
type Guard = (() => Promise<boolean>) | null;
type GuardSink = (id: string, guard: Guard) => void;
type Props = {
  owner: string;
  profile: Profile;
  post: Post;
  update: (post: Post) => void;
  remove: (id: string) => void;
  refresh: () => void;
  notify: (message: string) => void;
  openImage: (images: string[], index: number) => void;
  setGuard: GuardSink;
  beforeChange: () => Promise<boolean>;
  repliesOnly?: boolean;
};

export function ReplyCard({
  owner,
  profile,
  reply,
  post,
  jump,
  refresh,
  setGuard,
}: {
  owner: string;
  profile: Profile;
  reply: Reply;
  post: Post;
  jump: () => void;
  refresh: () => void;
  setGuard: GuardSink;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(reply.text),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null);
  async function save() {
    if (pending.current) return pending.current;
    const work = (async () => {
      setBusy(true);
      try {
        await logRequest(
          owner,
          `${profilePath(profile.id)}/posts/${post.id}/replies/${reply.id}`,
          "PUT",
          { text, revision: reply.revision },
        );
        setEditing(false);
        setGuard(`reply:${reply.id}`, null);
        refresh();
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setBusy(false);
        pending.current = null;
      }
    })();
    pending.current = work;
    return work;
  }
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (editing) {
      setGuard(`reply:${reply.id}`, () => saveRef.current());
      return () => setGuard(`reply:${reply.id}`, null);
    }
  }, [editing, setGuard, reply.id]);
  async function remove() {
    if (!confirm("이 답글을 삭제할까요?")) return;
    setBusy(true);
    try {
      await logRequest(
        owner,
        `${profilePath(profile.id)}/posts/${post.id}/replies/${reply.id}/delete`,
        "POST",
        { revision: reply.revision, confirm: true },
      );
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="post">
      <div className="subtle-line">
        내가 작성한 답글 · {age(reply.createdAt)}
      </div>
      <div className="post-grid">
        <Avatar owner={owner} profile={profile} />
        <div>
          <div className="post-meta-line">
            <b className="post-name">{profile.name}</b>
            <time className="post-date">{age(reply.createdAt)}</time>
          </div>
          {editing ? (
            <div className="inline-edit">
              <AutoTextarea
                aria-label="답글 수정"
                disabled={busy}
                autoFocus
                value={text}
                maxLength={3000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditing(false);
                    setGuard(`reply:${reply.id}`, null);
                  }
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <div className="inline-edit-footer">
                <button
                  disabled={busy}
                  className="btn-outline"
                  onClick={() => {
                    setEditing(false);
                    setGuard(`reply:${reply.id}`, null);
                  }}
                >
                  취소
                </button>
                <button
                  disabled={busy || !text.trim()}
                  className="btn-dark"
                  onClick={() => void save()}
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <div className="post-body">{reply.text}</div>
          )}
          <div className="reply-parent">
            <div>
              원글 · {new Date(post.createdAt).toLocaleDateString("ko-KR")}
            </div>
            <p>{post.text}</p>
          </div>
          <button className="btn-quiet" disabled={busy} onClick={jump}>
            원글에서 보기 →
          </button>
          {!editing && (
            <>
              <button
                className="btn-quiet"
                disabled={busy}
                onClick={() => {
                  setText(reply.text);
                  setEditing(true);
                }}
              >
                수정
              </button>
              <button
                className="btn-quiet"
                disabled={busy}
                onClick={() => void remove()}
              >
                삭제
              </button>
            </>
          )}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function ReplyItem({
  reply,
  owner,
  profile,
  postId,
  refresh,
  notify,
  setGuard,
}: {
  reply: Reply;
  owner: string;
  profile: Profile;
  postId: string;
  refresh: () => void;
  notify: (message: string) => void;
  setGuard: GuardSink;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(reply.text),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const base = `${profilePath(profile.id)}/posts/${postId}/replies/${reply.id}`;
  async function save() {
    if (busy) return false;
    setBusy(true);
    try {
      await logRequest(owner, base, "PUT", { revision: reply.revision, text });
      setEditing(false);
      refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (editing) {
      setGuard("reply:" + reply.id, () => saveRef.current());
      return () => setGuard("reply:" + reply.id, null);
    }
  }, [editing, setGuard, reply.id]);
  async function remove() {
    if (!confirm("이 답글을 삭제할까요?")) return;
    setBusy(true);
    try {
      await logRequest(owner, `${base}/delete`, "POST", {
        revision: reply.revision,
        confirm: true,
      });
      refresh();
      notify("답글을 삭제했습니다.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reply-item">
      <Avatar owner={owner} profile={profile} size="avatar-sm" />
      <div className="reply-content">
        <div className="post-meta-line">
          <b className="post-name">{profile.name}</b>
          <time className="post-date">{age(reply.createdAt)}</time>
          <button
            className="reply-op"
            disabled={busy}
            onClick={() => {
              setText(reply.text);
              setEditing(true);
            }}
          >
            수정
          </button>
          <button
            className="reply-op"
            disabled={busy}
            onClick={() => void remove()}
          >
            삭제
          </button>
        </div>
        {editing ? (
          <div className="inline-edit">
            <AutoTextarea
              aria-label="답글 수정"
              disabled={busy}
              maxLength={3000}
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <div className="inline-edit-footer">
              <button
                className="btn-outline"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                취소
              </button>
              <button
                className="btn-dark"
                disabled={busy || !text.trim()}
                onClick={() => void save()}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          <p className="reply-text">{reply.text}</p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function LogPost({
  owner,
  profile,
  post: p,
  update,
  remove,
  refresh,
  notify,
  openImage,
  setGuard,
  beforeChange,
  repliesOnly = false,
}: Props) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(p.text),
    [images, setImages] = useState(p.images),
    [menu, setMenu] = useState(false),
    [expanded, setExpanded] = useState(repliesOnly),
    [replies, setReplies] = useState<Reply[]>([]),
    [replyNext, setReplyNext] = useState<number | null>(null),
    [reply, setReply] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    editor = useRef<HTMLDivElement>(null),
    saving = useRef<Promise<boolean> | null>(null),
    version = useRef(p.revision),
    alive = useRef(true),
    picking = useRef(false),
    replyId = useRef(crypto.randomUUID());
  const base = `${profilePath(profile.id)}/posts/${p.id}`;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const el = file.current;
    const cancel = () => {
      picking.current = false;
    };
    el?.addEventListener("cancel", cancel);
    return () => el?.removeEventListener("cancel", cancel);
  }, []);
  const loadReplies = useCallback(
    async (offset = 0) => {
      try {
        const result = await logRequest<{
          replies: Reply[];
          nextOffset: number | null;
        }>(owner, `${base}/replies?offset=${offset}`);
        if (alive.current) {
          setReplies((old) =>
            offset ? [...old, ...result.replies] : result.replies,
          );
          setReplyNext(result.nextOffset);
        }
      } catch (e) {
        if (alive.current) setError(errorText(e));
      }
    },
    [owner, base],
  );
  useEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => void loadReplies(), 0);
      return () => clearTimeout(timer);
    }
  }, [expanded, p.replyCount, loadReplies]); // owner/profile are immutable for this keyed card
  const draft = useRef({ text, images });
  useLayoutEffect(() => {
    draft.current = { text, images };
  }, [text, images]);
  async function save(): Promise<boolean> {
    if (saving.current) return saving.current;
    if (uploading || picking.current) return false;
    const next = draft.current;
    if (
      next.text === p.text &&
      JSON.stringify(next.images) === JSON.stringify(p.images)
    ) {
      setEditing(false);
      setGuard(`post:${p.id}`, null);
      return true;
    }
    const work = (async () => {
      setBusy(true);
      setError("");
      try {
        const result = await logRequest<Post>(owner, base, "PUT", {
          revision: version.current,
          ...next,
        });
        if (alive.current) {
          update(result);
          setEditing(false);
          setGuard(`post:${p.id}`, null);
          notify("글을 수정했습니다.");
        }
        return true;
      } catch (e) {
        if (alive.current) setError(errorText(e));
        return false;
      } finally {
        if (alive.current) setBusy(false);
        saving.current = null;
      }
    })();
    saving.current = work;
    return work;
  }
  const currentSave = useRef(save);
  useLayoutEffect(() => {
    currentSave.current = save;
  });
  useEffect(() => {
    if (editing) {
      setGuard(`post:${p.id}`, () => currentSave.current());
      return () => setGuard(`post:${p.id}`, null);
    }
  }, [editing, setGuard, p.id]);
  async function edit() {
    if (busy || editing || !(await beforeChange())) return;
    version.current = p.revision;
    setText(p.text);
    setImages(p.images);
    setError("");
    setEditing(true);
    setMenu(false);
  }
  function cancel() {
    if (busy) return;
    setEditing(false);
    setError("");
    setGuard(`post:${p.id}`, null);
  }
  async function action(name: string, value: boolean) {
    if (busy || editing) return;
    setBusy(true);
    try {
      const next = await logRequest<Post>(owner, base, "PATCH", {
        revision: p.revision,
        action: name,
        value,
      });
      if (alive.current) {
        update(next);
        setMenu(false);
        refresh();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function deletePost() {
    if (
      !confirm("이 기록과 답글을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.")
    )
      return;
    setBusy(true);
    try {
      await logRequest(owner, `${base}/delete`, "POST", {
        revision: p.revision,
        confirm: true,
      });
      if (alive.current) {
        remove(p.id);
        notify("글을 삭제했습니다.");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function attach(files: FileList | null) {
    picking.current = false;
    if (!files) return;
    setUploading(true);
    setError("");
    let next = [...draft.current.images];
    try {
      if (next.length + files.length > 4)
        throw new Error("한 글에는 최대 4장까지 첨부할 수 있습니다.");
      for (const item of Array.from(files)) {
        const id = await uploadImage(owner, profile.id, item);
        next = [...next, id];
        if (alive.current) setImages(next);
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function addReply() {
    if (busy || !reply.trim()) return;
    setBusy(true);
    try {
      await logRequest(owner, `${base}/replies`, "POST", {
        id: replyId.current,
        text: reply,
      });
      if (alive.current) {
        setReply("");
        replyId.current = crypto.randomUUID();
        await loadReplies();
        const next = await logRequest<Post>(owner, base);
        update(next);
        refresh();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const visibleReplies = expanded ? replies : p.replies.slice(0, 1);
  return (
    <article className="post" data-post={p.id}>
      <div className="post-grid">
        <Avatar owner={owner} profile={profile} />
        <div>
          <div className="post-meta-line">
            <b className="post-name">{profile.name}</b>
            <time
              className="post-date"
              title={new Date(p.createdAt).toLocaleString("ko-KR")}
            >
              {age(p.createdAt)}
            </time>
            {p.updatedAt && <span className="post-date">· 수정됨</span>}
            <div className="post-menu-wrap">
              <button
                className="icon-btn"
                aria-label="게시글 메뉴"
                aria-expanded={menu}
                disabled={busy}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="more" />
              </button>
              {menu && (
                <div className="post-options">
                  <button onClick={edit} disabled={busy}>
                    <Icon name="edit" />글 수정
                  </button>
                  <button
                    disabled={busy || editing}
                    onClick={() => void action("pinned", !p.pinned)}
                  >
                    <Icon name="pin" />
                    {p.pinned ? "고정 해제" : "프로필에 고정"}
                  </button>
                  <button
                    disabled={busy || editing}
                    onClick={() => void action("saved", !p.saved)}
                  >
                    <Icon name="bookmark" />
                    {p.saved ? "저장 취소" : "저장"}
                  </button>
                  <button
                    disabled={busy || editing}
                    onClick={() => void action("archived", !p.archived)}
                  >
                    <Icon name="archive" />
                    {p.archived ? "보관 해제" : "보관"}
                  </button>
                  <button
                    className="danger"
                    disabled={busy || editing}
                    onClick={() => void deletePost()}
                  >
                    <Icon name="x" />
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
          {p.pinned && (
            <div className="subtle-line pinmark">
              <Icon name="pin" />
              고정된 기록
            </div>
          )}
          {editing ? (
            <div
              className="inline-edit"
              ref={editor}
              onBlur={(e) => {
                if (
                  !e.currentTarget.contains(e.relatedTarget as Node | null) &&
                  !picking.current &&
                  !uploading &&
                  !busy
                )
                  void save();
              }}
            >
              <AutoTextarea
                className="post-edit-input"
                aria-label="게시글 인라인 수정"
                autoFocus
                maxLength={50000}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <PhotoEditor
                owner={owner}
                profile={profile.id}
                images={images}
                disabled={busy || uploading}
                change={setImages}
              />
              <div className="edit-photo-actions">
                <button
                  disabled={uploading || busy || images.length >= 4}
                  onClick={() => {
                    picking.current = true;
                    file.current?.click();
                  }}
                >
                  ＋ 사진 추가
                </button>
              </div>
              <div className="inline-edit-footer">
                <small>
                  Esc 취소 · Ctrl/⌘ + Enter 저장 · 바깥 클릭 자동 저장
                </small>
                <button
                  className="btn-outline"
                  disabled={busy || uploading}
                  onClick={cancel}
                >
                  취소
                </button>
                <button
                  className="btn-dark"
                  disabled={
                    busy || uploading || (!text.trim() && !images.length)
                  }
                  onClick={() => void save()}
                >
                  {busy ? "저장 중…" : "수정 완료"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="post-body editable"
                role="button"
                tabIndex={0}
                title="클릭하여 바로 수정"
                onClick={edit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    edit();
                  }
                }}
              >
                {p.text || "사진 기록"}
              </div>
              <Carousel
                owner={owner}
                profile={profile.id}
                images={p.images}
                open={(i) => openImage(p.images, i)}
              />
            </>
          )}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => void attach(e.target.files)}
          />
          {uploading && (
            <p className="busy-banner" role="status">
              사진 전송 중…
            </p>
          )}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="post-actions-row">
            <button
              className={`act-btn ${p.liked ? "liked" : ""}`}
              disabled={busy || editing}
              title={p.liked ? "좋아요 취소" : "좋아요"}
              onClick={() => void action("liked", !p.liked)}
            >
              <Icon name="heart" />
              {p.liked && <span>1</span>}
            </button>
            <button
              className="act-btn"
              title="답글"
              onClick={() =>
                void beforeChange().then((ok) => {
                  if (ok) setExpanded(!expanded);
                })
              }
            >
              <Icon name="comment" />
              {p.replyCount > 0 && <span>{p.replyCount}</span>}
            </button>
            <button
              className={`act-btn ${p.repostedAt ? "reposted" : ""}`}
              disabled={busy || editing}
              title="내 기록 다시 공유"
              onClick={() => void action("reposted", !p.repostedAt)}
            >
              <Icon name="repost" />
            </button>
            <button
              className="act-btn"
              title="텍스트 공유/복사"
              onClick={() =>
                navigator.clipboard
                  .writeText(p.text)
                  .then(() => notify("텍스트를 복사했습니다."))
                  .catch(() => notify("클립보드에 접근할 수 없습니다."))
              }
            >
              <Icon name="share" />
            </button>
            {p.saved && (
              <span
                style={{ marginLeft: "auto", color: "#888" }}
                title="저장된 기록"
              >
                <Icon name="bookmark" />
              </span>
            )}
          </div>
          {visibleReplies.length > 0 && (
            <div className="replies-preview">
              {visibleReplies.map((r) => (
                <ReplyItem
                  key={`${r.id}:${r.revision}`}
                  reply={r}
                  owner={owner}
                  profile={profile}
                  postId={p.id}
                  refresh={() => {
                    void loadReplies();
                    refresh();
                  }}
                  setGuard={setGuard}
                  notify={notify}
                />
              ))}
              {!expanded && p.replyCount > 1 && (
                <button className="btn-quiet" onClick={() => setExpanded(true)}>
                  답글 {p.replyCount - 1}개 더 보기
                </button>
              )}
              {expanded && replyNext !== null && (
                <button
                  className="btn-quiet"
                  onClick={() => void loadReplies(replyNext)}
                >
                  답글 더 보기
                </button>
              )}
              {expanded && !repliesOnly && (
                <button
                  className="btn-quiet"
                  onClick={() =>
                    void beforeChange().then((ok) => {
                      if (ok) setExpanded(false);
                    })
                  }
                >
                  접기
                </button>
              )}
            </div>
          )}
          {expanded && (
            <form
              className="reply-form"
              onSubmit={(e) => {
                e.preventDefault();
                void addReply();
              }}
            >
              <input
                aria-label="내 글에 답글 작성"
                disabled={busy}
                placeholder="이 기록에 답글 달기…"
                maxLength={3000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <button className="btn-outline" disabled={busy || !reply.trim()}>
                게시
              </button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

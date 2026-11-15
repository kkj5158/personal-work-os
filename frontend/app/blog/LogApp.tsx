"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useShellNavigationGuard } from "@/components/GlobalTabs";
import {
  errorText,
  loadState,
  logRequest,
  profilePath,
  uploadImage,
  type Draft,
  type Feed,
  type Post,
  type Profile,
  type State,
} from "@/lib/log/api";
import {
  exportBackup,
  importBackup,
  parseBackup,
  type Backup,
} from "@/lib/log/backup";
import {
  AutoTextarea,
  Avatar,
  Carousel,
  Icon,
  ImageViewer,
  Modal,
  PhotoEditor,
} from "./LogMedia";
import { LogSymbols } from "./LogSymbols";
import { LogPost, ReplyCard, age } from "./LogPost";
import { ProfileManager } from "./LogProfiles";
import "./log.css";

type Guard = (() => Promise<boolean>) | null;
const emptyFeed: Feed = {
  posts: [],
  nextOffset: null,
  total: 0,
  stats: { posts: 0, media: 0, replies: 0, liked: 0, days: [] },
};
function Empty({
  title = "아직 기록이 없습니다.",
  description = "새로운 글을 작성하거나 다른 탭을 확인해 보세요.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Icon name="comment" />
      <b>{title}</b>
      <p>{description}</p>
    </div>
  );
}

function Timeline({
  state,
  profile,
  register,
  manage,
  settings,
  notify,
}: {
  state: State;
  profile: Profile;
  register: (fn: Guard) => void;
  manage: (edit?: boolean) => Promise<void>;
  settings: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const owner = state.ownerId,
    pid = profile.id,
    base = profilePath(pid);
  const [view, setView] = useState("profile"),
    [tab, setTab] = useState("threads"),
    [query, setQuery] = useState(""),
    [feed, setFeed] = useState<Feed>(emptyFeed),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [composer, setComposer] = useState(false),
    [draft, setDraft] = useState<Draft>({ text: "", images: [], revision: 0 }),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [publishing, setPublishing] = useState(false),
    [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(
      null,
    );
  const draftRef = useRef(draft),
    dirty = useRef(false),
    sequence = useRef(0),
    saveChain = useRef<Promise<boolean>>(Promise.resolve(true)),
    editorGuards = useRef(new Map<string, () => Promise<boolean>>()),
    alive = useRef(true),
    requestSequence = useRef(0),
    file = useRef<HTMLInputElement>(null),
    postId = useRef(crypto.randomUUID()),
    draftError = useRef(false),
    pendingJump = useRef<string | null>(null);
  const setEditorGuard = useCallback((id: string, fn: Guard) => {
    if (fn) editorGuards.current.set(id, fn);
    else editorGuards.current.delete(id);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const filter =
    view === "profile"
      ? tab
      : ["saved", "liked", "archive"].includes(view)
        ? view
        : "threads";
  const refresh = useCallback(
    async (append = false) => {
      const seq = ++requestSequence.current;
      const cursor = append ? feed.nextOffset : 0;
      if (cursor === null) return;
      try {
        const result = await logRequest<Feed>(
          owner,
          filter === "replies"
            ? `${base}/reply-feed?offset=${cursor}`
            : `${base}/posts?filter=${filter}&q=${encodeURIComponent(view === "search" ? query : "")}&offset=${cursor}`,
        );
        const jump = filter === "threads" ? pendingJump.current : null;
        if (jump && !result.posts.some((p) => p.id === jump))
          result.posts.unshift(
            await logRequest<Post>(owner, `${base}/posts/${jump}`),
          );
        if (alive.current && seq === requestSequence.current) {
          setFeed((old) => ({
            ...result,
            posts: append
              ? [
                  ...old.posts,
                  ...result.posts.filter(
                    (p) => !old.posts.some((x) => x.id === p.id),
                  ),
                ]
              : result.posts,
            replyEntries: append
              ? [...(old.replyEntries ?? []), ...(result.replyEntries ?? [])]
              : result.replyEntries,
          }));
          setLoading(false);
          if (jump) {
            pendingJump.current = null;
            setTimeout(
              () =>
                document
                  .querySelector(`[data-post="${jump}"]`)
                  ?.scrollIntoView({ block: "center", behavior: "smooth" }),
              0,
            );
          }
        }
      } catch (e) {
        if (alive.current && seq === requestSequence.current) {
          setError(errorText(e));
          setLoading(false);
        }
      }
    },
    [owner, base, filter, view, query, feed.nextOffset],
  );
  const refreshRef = useRef(refresh);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setLoading(true);
        setFeed(emptyFeed);
        void refreshRef.current();
      },
      view === "search" ? 180 : 0,
    );
    return () => clearTimeout(timer);
  }, [view, tab, query]);
  useEffect(() => {
    let live = true;
    logRequest<Draft>(owner, `${base}/draft`)
      .then((result) => {
        if (live) {
          draftRef.current = result;
          setDraft(result);
          setComposer(!!result.text || !!result.images.length);
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [owner, base]);
  const saveDraft = useCallback(async (): Promise<boolean> => {
    saveChain.current = saveChain.current
      .catch(() => false)
      .then(async () => {
        if (!dirty.current) return true;
        if (!draftRef.current.revision) return false;
        const seq = sequence.current,
          copy = { ...draftRef.current };
        if (alive.current) setSaving(true);
        try {
          const result = await logRequest<Draft>(
            owner,
            `${base}/draft`,
            "PUT",
            copy,
          );
          draftRef.current = { ...draftRef.current, revision: result.revision };
          if (sequence.current === seq) {
            dirty.current = false;
            draftRef.current = result;
          }
          draftError.current = false;
          if (alive.current) setDraft({ ...draftRef.current });
          return true;
        } catch (e) {
          draftError.current = true;
          if (alive.current)
            setError(
              `임시저장 실패: ${errorText(e)}\n입력은 유지됩니다. 복사하거나 다시 저장해주세요.`,
            );
          return false;
        } finally {
          if (alive.current) setSaving(false);
        }
      });
    return saveChain.current;
  }, [owner, base]);
  function changeDraft(next: Partial<Draft>) {
    draftRef.current = { ...draftRef.current, ...next };
    dirty.current = true;
    sequence.current++;
    setDraft({ ...draftRef.current });
  }
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void saveDraft(), 700);
    return () => clearTimeout(timer);
  }, [draft.text, draft.images, saveDraft]);
  const guard = useCallback(async () => {
    if (uploading || publishing) return false;
    for (const save of editorGuards.current.values())
      if (!(await save())) return false;
    const ok = await saveDraft();
    return ok && !dirty.current;
  }, [saveDraft, uploading, publishing]);
  useEffect(() => {
    register(guard);
    return () => register(null);
  }, [register, guard]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || editorGuards.current.size || uploading) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden" && dirty.current)
        void saveDraft();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hide);
      if (dirty.current) void saveDraft();
    };
  }, [saveDraft, uploading]);
  useEffect(() => {
    const sync = async () => {
      if (
        document.hidden ||
        dirty.current ||
        editorGuards.current.size ||
        publishing ||
        uploading ||
        draftError.current
      )
        return;
      void refreshRef.current();
      try {
        const d = await logRequest<Draft>(owner, `${base}/draft`);
        if (
          alive.current &&
          !dirty.current &&
          !editorGuards.current.size &&
          d.revision >= draftRef.current.revision
        ) {
          draftRef.current = d;
          setDraft(d);
        }
      } catch {
        /* next foreground refresh retries */
      }
    };
    const timer = setInterval(() => void sync(), 15000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [owner, base, publishing, uploading]);
  async function navigate(next: string, nextTab?: string) {
    if (!(await guard())) {
      notify("저장이 끝나거나 오류를 해결한 뒤 이동해주세요.");
      return;
    }
    setError("");
    if (next === "compose") {
      setView("profile");
      setTab("threads");
      setComposer(true);
    } else {
      setView(next);
      if (nextTab) setTab(nextTab);
    }
  }
  async function jumpToPost(id: string) {
    if (!(await guard())) return;
    pendingJump.current = id;
    setView("profile");
    setTab("threads");
    setTimeout(() => void refreshRef.current(), 0);
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    if (draftRef.current.images.length + files.length > 4) {
      notify("한 글에는 최대 4장까지 첨부할 수 있습니다.");
      return;
    }
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const id = await uploadImage(owner, pid, f);
        if (!alive.current) return;
        changeDraft({ images: [...draftRef.current.images, id] });
      }
      await saveDraft();
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function publish() {
    if (publishing || uploading) return;
    setPublishing(true);
    setError("");
    try {
      if (!(await saveDraft())) return;
      const payload = {
        id: postId.current,
        text: draftRef.current.text,
        images: draftRef.current.images,
        draftRevision: draftRef.current.revision,
      };
      const post = await logRequest<Post>(
        owner,
        `${base}/posts`,
        "POST",
        payload,
      );
      if (!alive.current) return;
      postId.current = crypto.randomUUID();
      dirty.current = false;
      const d = await logRequest<Draft>(owner, `${base}/draft`);
      draftRef.current = d;
      setDraft(d);
      setComposer(false);
      setFeed((old) => ({
        ...old,
        posts: [post, ...old.posts.filter((x) => x.id !== post.id)],
      }));
      void refreshRef.current();
      notify("내 기록에 게시했습니다.");
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setPublishing(false);
    }
  }
  const nav = (name: string, label: string, icon: string) => (
    <button
      key={name}
      className={`nav-link ${view === name ? "active" : ""}`}
      onClick={() => void navigate(name)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
  const openImage = (images: string[], index: number) =>
    setViewer({ images, index });
  const update = (post: Post) =>
    setFeed((old) => ({
      ...old,
      posts: old.posts.map((x) => (x.id === post.id ? post : x)),
    }));
  const remove = (id: string) => {
    setFeed((old) => ({ ...old, posts: old.posts.filter((x) => x.id !== id) }));
    void refreshRef.current();
  };
  const postCards = feed.posts.map((p) => (
    <LogPost
      key={p.id}
      owner={owner}
      profile={profile}
      post={p}
      update={update}
      remove={remove}
      refresh={() => void refreshRef.current()}
      notify={notify}
      openImage={openImage}
      setGuard={setEditorGuard}
      beforeChange={guard}
      repliesOnly={view === "profile" && tab === "replies"}
    />
  ));
  return (
    <>
      <aside className="side" aria-label="LOG 탐색">
        <div className="side-brand">
          <div className="brandmark">
            <div className="log-glyph">L</div>
            <span>LOG</span>
          </div>
          <button
            title="메뉴"
            aria-label="메뉴"
            onClick={() => void settings()}
          >
            <Icon name="bars" />
          </button>
        </div>
        <nav className="side-nav">
          {nav("profile", "내 피드", "home")}
          {nav("search", "검색", "search")}
        </nav>
        <div className="side-bottom">
          <button
            className="profile-side-trigger"
            aria-label="프로필 전환 및 관리"
            onClick={() => void manage()}
          >
            <Avatar owner={owner} profile={profile} size="avatar-sm" />
            <span className="profile-side-title">
              <b>{profile.name}</b>
              <small>@{profile.handle}</small>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
      </aside>
      <header className="mobile-header">
        <button
          className="icon-btn mobile-profile-trigger"
          aria-label="프로필 전환"
          onClick={() => void manage()}
        >
          <Avatar owner={owner} profile={profile} size="avatar-sm" />
        </button>
        <button
          className="icon-btn"
          aria-label="검색"
          onClick={() => void navigate("search")}
        >
          <Icon name="search" />
        </button>
        <button
          className="mobile-logo"
          title="LOG 설정"
          onClick={() => void settings()}
        >
          LOG
        </button>
        <button
          className="icon-btn"
          aria-label="기록 쓰기"
          onClick={() => void navigate("compose")}
        >
          <Icon name="plus" />
        </button>
      </header>
      <main className="center-shell">
        <div className="page-header">
          <h1>
            {view === "profile"
              ? profile.handle
              : view === "search"
                ? "검색"
                : view === "insights"
                  ? "인사이트"
                  : "내 기록"}
          </h1>
          <div className="header-actions">
            <button
              className="profile-switch-small"
              aria-label="프로필 전환 및 관리"
              onClick={() => void manage()}
            >
              <Avatar owner={owner} profile={profile} size="avatar-sm" />
              <span>{profile.handle}</span>
              <Icon name="chevron" />
            </button>
            <button
              className="icon-btn"
              title="내 기록 검색"
              onClick={() => void navigate("search")}
            >
              <Icon name="search" />
            </button>
            <button
              className="icon-btn"
              title="LOG 설정"
              onClick={() => void settings()}
            >
              <Icon name="more" />
            </button>
          </div>
        </div>
        <div className="profile-frame">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="btn-quiet"
                onClick={() => {
                  setError("");
                  void refreshRef.current();
                }}
              >
                다시 불러오기
              </button>
              {
                <button className="btn-quiet" onClick={() => void saveDraft()}>
                  임시저장 다시 시도
                </button>
              }
            </div>
          )}
          {view === "profile" && (
            <>
              <section className="profile-cover">
                <div className="profile-main">
                  <div>
                    <h2 className="profile-title">{profile.name}</h2>
                    <div className="handle">@{profile.handle}</div>
                  </div>
                  <Avatar owner={owner} profile={profile} size="avatar-large" />
                </div>
                <p className="profile-bio">
                  {profile.bio || "나의 일상을 기록합니다."}
                </p>
                <div className="profile-stats">
                  <span className="mini-stack">◉◉</span>
                  <span>게시글 {feed.stats.posts}개</span>
                  <span>·</span>
                  <span>미디어 {feed.stats.media}개</span>
                  <span>·</span>
                  <span>답글 {feed.stats.replies}개</span>
                  <button
                    className="profile-switch-subtle"
                    onClick={() => void manage()}
                  >
                    프로필 전환 <Icon name="chevron" />
                  </button>
                </div>
                <div className="profile-cta">
                  <button
                    className="btn-outline"
                    onClick={() => void manage(true)}
                  >
                    프로필 편집
                  </button>
                  <button
                    className="btn-outline"
                    onClick={() => void navigate("insights")}
                  >
                    인사이트 보기
                  </button>
                </div>
              </section>
              <div
                className="profile-tabs"
                role="tablist"
                aria-label="내 기록 보기"
              >
                {[
                  ["threads", "스레드"],
                  ["replies", "답글"],
                  ["media", "미디어"],
                  ["reposts", "리포스트"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    className={`profile-tab ${tab === id ? "selected" : ""}`}
                    onClick={() => void navigate("profile", id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "threads" && (
                <section
                  className={`compose-area ${composer ? "expanded" : ""}`}
                >
                  <div className="compose-compact">
                    <Avatar owner={owner} profile={profile} />
                    <button
                      className="compose-trigger"
                      onClick={() => setComposer(true)}
                    >
                      새로운 소식을 공유해보세요.
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => setComposer(true)}
                    >
                      게시
                    </button>
                  </div>
                  <div className="compose-expanded">
                    <div className="compose-head">
                      <Avatar owner={owner} profile={profile} />
                      <div className="compose-field">
                        <div className="composer-name">{profile.name}</div>
                        <AutoTextarea
                          className="compose-textarea"
                          aria-label="새로운 글 작성"
                          placeholder="지금 떠오르는 생각을 기록하세요…"
                          maxLength={50000}
                          disabled={publishing || !draft.revision}
                          value={draft.text}
                          onChange={(e) =>
                            changeDraft({ text: e.target.value })
                          }
                          onBlur={() => {
                            if (dirty.current) void saveDraft();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              void publish();
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="photo-preview">
                      <PhotoEditor
                        owner={owner}
                        profile={pid}
                        images={draft.images}
                        change={(images) => changeDraft({ images })}
                      />
                    </div>
                    <div className="compose-tools">
                      <div className="compose-icons">
                        <button
                          title="사진 추가"
                          aria-label="사진 추가"
                          disabled={
                            publishing ||
                            uploading ||
                            draft.images.length >= 4 ||
                            !draft.revision
                          }
                          onClick={() => file.current?.click()}
                        >
                          <Icon name="image" />
                        </button>
                        <button
                          title="임시저장"
                          aria-label="임시저장"
                          disabled={publishing || uploading || !draft.revision}
                          onClick={() =>
                            void saveDraft().then((ok) => {
                              if (ok) notify("임시저장했습니다.");
                            })
                          }
                        >
                          <Icon name="bookmark" />
                        </button>
                      </div>
                      <div className="composer-actions">
                        <span className="count-info" role="status">
                          {uploading
                            ? "사진 전송 중…"
                            : saving
                              ? "저장 중…"
                              : `${draft.text.length.toLocaleString("ko-KR")}자`}
                        </span>
                        <button
                          className="btn-quiet"
                          disabled={publishing || uploading}
                          onClick={() =>
                            void saveDraft().then((ok) => {
                              if (ok) setComposer(false);
                            })
                          }
                        >
                          닫기
                        </button>
                        <button
                          className="btn-dark"
                          disabled={
                            publishing ||
                            uploading ||
                            !draft.revision ||
                            (!draft.text.trim() && !draft.images.length)
                          }
                          onClick={() => void publish()}
                        >
                          {publishing ? "게시 중…" : "게시"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <input
                    ref={file}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    hidden
                    onChange={(e) => void attach(e.target.files)}
                  />
                </section>
              )}
            </>
          )}
          {view === "search" && (
            <section className="search-page">
              <h2 className="page-intro">내 기록 검색</h2>
              <label className="search-wide">
                <Icon name="search" />
                <input
                  placeholder="글과 답글에서 검색…"
                  aria-label="내 기록 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={200}
                />
              </label>
              <div className="search-result-meta">
                {query
                  ? `검색 결과 ${feed.total}개`
                  : "전체 기록을 검색할 수 있습니다."}
              </div>
            </section>
          )}
          {["saved", "liked", "archive"].includes(view) && (
            <section className="search-page">
              <h2 className="page-intro">
                {
                  {
                    saved: "저장된 글",
                    liked: "좋아요한 글",
                    archive: "보관함",
                  }[view]
                }
              </h2>
              <button
                className="btn-quiet"
                onClick={() => void navigate("profile")}
              >
                내 피드로 돌아가기
              </button>
            </section>
          )}
          {view === "insights" ? (
            <section className="stat-sheet">
              <h2>내 기록 인사이트</h2>
              <p>소셜 인사이트 대신 오직 내가 쌓은 기록만 집계합니다.</p>
              <div className="stat-grid">
                {[
                  [feed.stats.posts, "전체 게시글"],
                  [feed.stats.replies, "내 답글"],
                  [feed.stats.media, "첨부한 사진"],
                  [feed.stats.liked, "좋아요 표시"],
                ].map(([n, label]) => (
                  <div className="stat-item" key={label}>
                    <b>{n}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <h2 style={{ fontSize: 15, marginTop: 35 }}>최근 7일 기록</h2>
              <div className="days-bars">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6 + i);
                  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    n = feed.stats.days.find((x) => x.day === date)?.count ?? 0;
                  return (
                    <div className="bar-col" key={date}>
                      <span>{n || ""}</span>
                      <div
                        className="bar"
                        style={{
                          height: Math.max(
                            5,
                            (n /
                              Math.max(
                                1,
                                ...feed.stats.days.map((x) => x.count),
                              )) *
                              105,
                          ),
                        }}
                      />
                      <span className="bar-label">
                        {d.toLocaleDateString("ko-KR", { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                className="btn-quiet"
                onClick={() => void navigate("profile")}
              >
                내 피드로 돌아가기
              </button>
              <div className="edit-photo-actions">
                <button onClick={() => void navigate("saved")}>
                  저장된 글
                </button>
                <button onClick={() => void navigate("liked")}>
                  좋아요한 글
                </button>
                <button onClick={() => void navigate("archive")}>보관함</button>
              </div>
            </section>
          ) : (
            <section className="feed" aria-label="LOG 기록">
              {loading && (
                <p className="busy-banner" role="status">
                  기록 불러오는 중…
                </p>
              )}
              {!loading && !feed.posts.length && !feed.replyEntries?.length && (
                <Empty />
              )}
              {view === "profile" && tab === "media"
                ? feed.posts.map((p) => (
                    <article key={p.id} className="media-album">
                      <div className="media-album-header">
                        <Avatar
                          owner={owner}
                          profile={profile}
                          size="avatar-sm"
                        />
                        <b>{profile.name}</b>
                        <time>{age(p.createdAt)}</time>
                      </div>
                      {p.text && (
                        <p className="media-album-summary">{p.text}</p>
                      )}
                      <Carousel
                        owner={owner}
                        profile={pid}
                        images={p.images}
                        open={(index) => openImage(p.images, index)}
                      />
                    </article>
                  ))
                : view === "profile" && tab === "replies"
                  ? (feed.replyEntries ?? []).map((entry) => (
                      <ReplyCard
                        key={`${entry.reply.id}:${entry.reply.revision}`}
                        owner={owner}
                        profile={profile}
                        {...entry}
                        refresh={() => void refreshRef.current()}
                        setGuard={setEditorGuard}
                        jump={() => void jumpToPost(entry.post.id)}
                      />
                    ))
                  : postCards}
              {feed.nextOffset !== null && (
                <button
                  className="btn-outline load-more"
                  disabled={loading}
                  onClick={() => void refresh(true)}
                >
                  더 보기
                </button>
              )}
            </section>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="모바일 탐색">
        <button
          aria-label="내 피드"
          className={view === "profile" ? "active" : ""}
          onClick={() => void navigate("profile")}
        >
          <Icon name="home" />
        </button>
        <button
          aria-label="검색"
          className={view === "search" ? "active" : ""}
          onClick={() => void navigate("search")}
        >
          <Icon name="search" />
        </button>
      </nav>
      {viewer && (
        <ImageViewer
          owner={owner}
          profile={pid}
          {...viewer}
          close={() => setViewer(null)}
        />
      )}
    </>
  );
}

function Settings({
  state,
  close,
  changed,
  notify,
}: {
  state: State;
  close: () => void;
  changed: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function prepare(text: string) {
    setError("");
    setDone(false);
    try {
      setBackup(parseBackup(JSON.parse(text)));
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function legacy() {
    try {
      const raw =
        localStorage.getItem("pos.log.threads-clone.v3") ||
        localStorage.getItem("pos.log.threads-clone.v2") ||
        localStorage.getItem("pos.log.mock.v1");
      if (!raw)
        throw new Error(
          "이 브라우저에 이전 LOG 기록이 없습니다. 다른 브라우저의 JSON 백업을 선택해주세요.",
        );
      await prepare(raw);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function runImport() {
    if (!backup) return;
    setBusy(true);
    setError("");
    try {
      const result = await importBackup(state, backup, setProgress);
      setDone(true);
      notify(`${result.imported}개 가져옴 · ${result.skipped}개 중복 건너뜀`);
      await changed();
    } catch (e) {
      setError(
        `${errorText(e)}\n완료된 항목은 유지됩니다. 같은 백업을 다시 실행하면 기존 기록을 덮어쓰지 않습니다.`,
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function runExport() {
    setBusy(true);
    setError("");
    try {
      await exportBackup(state, setProgress);
      notify("모든 프로필의 JSON 백업을 생성했습니다.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <Modal
      title="LOG 설정"
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="dialog-inside">
        <h2 className="dialog-title">LOG 설정</h2>
        <p className="dialog-sub">
          개인 전용 LOG · 모든 기록은 내 POS 계정에 저장됩니다.
        </p>
        <div style={{ display: "grid", gap: 9 }}>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => void runExport()}
          >
            JSON으로 백업하기
          </button>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            JSON 백업 가져오기
          </button>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => void legacy()}
          >
            이 브라우저의 이전 LOG 기록 가져오기
          </button>
        </div>
        <input
          type="file"
          ref={file}
          hidden
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 140 * 1024 * 1024)
                setError("백업은 140MB까지 가져올 수 있습니다.");
              else void f.text().then(prepare);
            }
            e.target.value = "";
          }}
        />
        {backup && (
          <div className="import-preview">
            <h3 style={{ marginTop: 20, fontWeight: 700 }}>
              가져오기 미리보기
            </h3>
            <p>
              프로필 {backup.profiles.length}개 · 게시글{" "}
              {backup.profiles.reduce((n, p) => n + p.posts.length, 0)}개 · 답글{" "}
              {backup.profiles.reduce(
                (n, p) => n + p.posts.reduce((m, x) => m + x.replies.length, 0),
                0,
              )}
              개
            </p>
            <p>
              기존 서버 기록은 덮어쓰지 않습니다. 같은 항목은 중복으로
              건너뜁니다. 이름 충돌 시 가져온 프로필 이름에 번호를 붙입니다.
              목업 샘플이 포함되었는지 확인하고, 먼저 현재 기록을 백업해주세요.
              이전 브라우저 저장 내용은 삭제하지 않습니다.
            </p>
            {backup.profiles.map((p, i) => (
              <p key={i}>
                • {p.name} (@{p.handle}) · {p.posts.length}개
              </p>
            ))}
            {backup.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            <div className="dialog-buttons">
              <button
                className="btn-outline"
                disabled={busy}
                onClick={() => setBackup(null)}
              >
                취소
              </button>
              <button
                className="btn-dark"
                disabled={busy || done}
                onClick={() => void runImport()}
              >
                {done ? "가져오기 완료" : "확인하고 가져오기"}
              </button>
            </div>
          </div>
        )}
        {progress && (
          <p className="busy-banner" role="status">
            {progress}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-buttons">
          <button className="btn-dark" disabled={busy} onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function LogApp() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [manager, setManager] = useState<{ edit?: string } | null>(null),
    [settings, setSettings] = useState(false),
    [toast, setToast] = useState(""),
    [epoch, setEpoch] = useState(0);
  const guard = useRef<Guard>(null),
    owner = useRef<string | null>(null),
    generation = useRef(0);
  const register = useCallback((fn: Guard) => {
    guard.current = fn;
  }, []);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    try {
      const result = await loadState();
      if (seq !== generation.current) return;
      if (owner.current && owner.current !== result.ownerId) {
        setEpoch((x) => x + 1);
        setManager(null);
        setSettings(false);
        guard.current = null;
      }
      owner.current = result.ownerId;
      setState(result);
      setError("");
    } catch (e) {
      if (seq === generation.current) setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (owner.current && session?.user.id !== owner.current) {
        generation.current++;
        owner.current = null;
        setState(null);
        setManager(null);
        setSettings(false);
        setEpoch((x) => x + 1);
        guard.current = null;
        void refresh();
      }
    }) ?? { data: null };
    return () => {
      clearTimeout(timer);
      data?.subscription.unsubscribe();
    };
  }, [refresh]);
  async function ready() {
    if (guard.current && !(await guard.current())) {
      notify("입력을 저장한 뒤 다시 시도해주세요.");
      return false;
    }
    return true;
  }
  useShellNavigationGuard(async (proceed) => {
    if (manager || settings) {
      notify("대화상자를 닫은 뒤 이동해주세요.");
      return;
    }
    if (await ready()) proceed();
  });
  async function activate(id: string) {
    if (!state || !(await ready())) return;
    const next = await logRequest<State>(
      state.ownerId,
      `${profilePath(id)}/active`,
      "PUT",
    );
    setState(next);
    setEpoch((x) => x + 1);
  }
  async function manage(edit = false) {
    if (!(await ready())) return;
    setManager({
      edit: edit ? (state?.activeProfileId ?? undefined) : undefined,
    });
  }
  async function openSettings() {
    if (!(await ready())) return;
    setSettings(true);
  }
  const profile =
    state?.profiles.find((p) => p.id === state.activeProfileId) ??
    state?.profiles[0];
  return (
    <div className="pos-log page">
      <LogSymbols />
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button className="btn-quiet" onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      )}
      {!state && !error && (
        <p className="busy-banner" role="status">
          LOG 불러오는 중…
        </p>
      )}
      {state && profile ? (
        <Timeline
          key={`${state.ownerId}:${profile.id}:${epoch}`}
          state={state}
          profile={profile}
          register={register}
          manage={manage}
          settings={openSettings}
          notify={notify}
        />
      ) : (
        state && (
          <main className="center-shell">
            <div className="page-header">
              <h1>LOG</h1>
              <button
                className="icon-btn"
                title="LOG 설정"
                onClick={() => setSettings(true)}
              >
                <Icon name="more" />
              </button>
            </div>
            <div className="profile-frame">
              <Empty
                title="나의 첫 번째 LOG 프로필"
                description="프로필을 만들고 나만의 기록을 시작하세요. 이전 브라우저 기록은 설정에서 직접 가져올 수 있습니다."
              />
              <button
                className="btn-dark load-more"
                onClick={() => setManager({})}
              >
                ＋ 새 프로필 추가
              </button>
            </div>
          </main>
        )
      )}
      {state && manager && (
        <ProfileManager
          state={state}
          initialEdit={manager.edit}
          close={() => setManager(null)}
          change={(next) => {
            const changed = next.activeProfileId !== state.activeProfileId;
            setState(next);
            if (changed) setEpoch((n) => n + 1);
          }}
          activate={activate}
        />
      )}{" "}
      {state && settings && (
        <Settings
          state={state}
          close={() => setSettings(false)}
          changed={refresh}
          notify={notify}
        />
      )}
      <div className="toast-host" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

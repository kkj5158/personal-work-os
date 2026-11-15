"use client";
import { useEffect, useRef, useState } from "react";
import {
  errorText,
  logRequest,
  profilePath,
  uploadImage,
  type Profile,
  type State,
} from "@/lib/log/api";
import { Avatar, Modal, PrivateImage } from "./LogMedia";

export function ProfileEditor({
  owner,
  profile,
  done,
  cancel,
}: {
  owner: string;
  profile?: Profile;
  done: (profile: Profile) => void;
  cancel: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? ""),
    [handle, setHandle] = useState(profile?.handle ?? ""),
    [bio, setBio] = useState(profile?.bio ?? ""),
    [avatar, setAvatar] = useState<string | null>(profile?.avatar ?? null),
    [avatarFile, setAvatarFile] = useState<File | null>(null),
    [avatarPreview, setAvatarPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const [id] = useState(() => profile?.id ?? crypto.randomUUID());
  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    const timer = setTimeout(() => setAvatarPreview(url), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [avatarFile]);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let next = profile
        ? await logRequest<Profile>(owner, profilePath(id), "PUT", {
            name,
            handle,
            bio,
            avatar,
            revision: profile.revision,
          })
        : await logRequest<Profile>(owner, "/api/log/profiles", "POST", {
            id: id,
            name,
            handle,
            bio,
          });
      if (!profile && avatarFile) {
        const image = await uploadImage(owner, next.id, avatarFile);
        next = await logRequest<Profile>(owner, profilePath(next.id), "PUT", {
          name,
          handle,
          bio,
          avatar: image,
          revision: next.revision,
        });
      }
      done(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function attach(value: File | undefined) {
    if (!value) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(value.type) ||
      value.size > 18 * 1024 * 1024
    ) {
      setError("PNG·JPEG·WebP 사진은 18MB까지 첨부할 수 있습니다.");
      return;
    }
    if (!profile) {
      setAvatarFile(value);
      return;
    }
    setBusy(true);
    try {
      setAvatar(await uploadImage(owner, id, value));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-manager-form">
      <h3>{profile ? "프로필 편집" : "새 프로필 추가"}</h3>
      {
        <div className="profile-manager-avatar">
          <div className="avatar avatar-large">
            {avatarFile && avatarPreview ? (
              // Avatar preview is a local, revocable blob URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="새 프로필 사진" />
            ) : avatar ? (
              <PrivateImage
                owner={owner}
                profile={id}
                id={avatar}
                alt="프로필 사진"
              />
            ) : (
              "🐥"
            )}
          </div>
          <button disabled={busy} onClick={() => file.current?.click()}>
            프로필 사진 변경
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setAvatar(null);
              setAvatarFile(null);
              setAvatarPreview("");
            }}
          >
            기본 이미지
          </button>
          <input
            type="file"
            hidden
            ref={file}
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void attach(e.target.files?.[0])}
          />
        </div>
      }
      <label className="field-label" htmlFor="log-profile-name">
        표시 이름
      </label>
      <input
        autoFocus
        className="field-input"
        id="log-profile-name"
        disabled={busy}
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field-label" htmlFor="log-profile-handle">
        사용자 이름
      </label>
      <input
        className="field-input"
        id="log-profile-handle"
        disabled={busy}
        maxLength={32}
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
      />
      <label className="field-label" htmlFor="log-profile-bio">
        소개
      </label>
      <textarea
        className="field-input"
        id="log-profile-bio"
        disabled={busy}
        rows={3}
        maxLength={300}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-buttons">
        <button className="btn-outline" disabled={busy} onClick={cancel}>
          취소
        </button>
        <button
          className="btn-dark"
          disabled={busy || !name.trim() || !handle.trim()}
          onClick={() => void save()}
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

export function ProfileManager({
  state,
  close,
  change,
  activate,
  initialEdit,
}: {
  state: State;
  close: () => void;
  change: (state: State) => void;
  activate: (id: string) => Promise<void>;
  initialEdit?: string;
}) {
  const [editor, setEditor] = useState<string | null>(
      initialEdit ?? (state.profiles.length ? null : "new"),
    ),
    [deleting, setDeleting] = useState<Profile | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const next = await logRequest<State>(
        state.ownerId,
        `${profilePath(deleting.id)}/delete`,
        "POST",
        { revision: deleting.revision, confirm: true },
      );
      change(next);
      setDeleting(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="LOG 프로필"
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="dialog-inside">
        <h2 className="dialog-title">LOG 프로필</h2>
        <p className="dialog-sub">
          프로필을 전환하면 게시글·답글·사진·보관함이 해당 프로필의 기록으로
          바뀝니다.
        </p>
        <div className="profile-manager-list">
          {state.profiles.map((p) => (
            <div
              key={p.id}
              className={`profile-manager-row ${p.id === state.activeProfileId ? "is-active" : ""}`}
            >
              <Avatar owner={state.ownerId} profile={p} size="avatar-sm" />
              <div className="profile-manager-detail">
                <b>{p.name}</b>
                <small>@{p.handle}</small>
              </div>
              <div className="profile-manager-ops">
                <button
                  disabled={busy || p.id === state.activeProfileId}
                  onClick={() =>
                    void activate(p.id)
                      .then(close)
                      .catch((e) => setError(errorText(e)))
                  }
                >
                  {p.id === state.activeProfileId ? "사용 중" : "전환"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditor(p.id);
                    setDeleting(null);
                  }}
                >
                  편집
                </button>
                <button
                  className="danger"
                  disabled={busy || state.profiles.length === 1}
                  onClick={() => {
                    setDeleting(p);
                    setEditor(null);
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
        {deleting && (
          <div className="profile-manager-confirm">
            <b>{deleting.name} 프로필을 삭제할까요?</b>
            <p>
              이 프로필의 게시글·답글·사진·임시저장에 접근할 수 없게 됩니다.
              다른 프로필은 유지됩니다. 삭제 후 복구를 위한 보존 기간은
              30일입니다.
            </p>
            <div className="dialog-buttons">
              <button
                className="btn-outline"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                취소
              </button>
              <button
                className="btn-dark"
                disabled={busy}
                onClick={() => void remove()}
              >
                프로필 삭제 확인
              </button>
            </div>
          </div>
        )}
        <button
          className="profile-manager-create"
          disabled={busy}
          onClick={() => {
            setEditor("new");
            setDeleting(null);
          }}
        >
          ＋ 새 프로필 추가
        </button>
        {editor && (
          <ProfileEditor
            key={editor}
            owner={state.ownerId}
            profile={state.profiles.find((p) => p.id === editor)}
            cancel={() => setEditor(null)}
            done={(p) => {
              change({
                ...state,
                profiles: state.profiles.some((x) => x.id === p.id)
                  ? state.profiles.map((x) => (x.id === p.id ? p : x))
                  : [...state.profiles, p],
                activeProfileId: state.activeProfileId ?? p.id,
              });
              setEditor(null);
            }}
          />
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <p className="manager-banner">
          POS 로그인은 그대로 유지됩니다. 기록은 내 계정의 서버에 안전하게
          저장됩니다.
        </p>
        <div className="dialog-buttons">
          <button className="btn-dark" disabled={busy} onClick={close}>
            완료
          </button>
        </div>
      </div>
    </Modal>
  );
}

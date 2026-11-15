import {
  imageBlob,
  logRequest,
  profilePath,
  uploadImage,
  type Draft,
  type Feed,
  type Post,
  type Profile,
  type Reply,
  type State,
} from "./api";

type RecordValue = Record<string, unknown>;
const obj = (v: unknown): RecordValue => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("올바른 LOG 백업이 아닙니다.");
  return v as RecordValue;
};
const str = (v: unknown, max: number, defaultValue = "") => {
  if (v == null) return defaultValue;
  if (typeof v !== "string" || v.length > max || v.includes("\0"))
    throw new Error("백업의 문자열 길이·형식을 확인해주세요.");
  return v;
};
const arr = (v: unknown, max: number) => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max)
    throw new Error("백업의 항목 수·형식을 확인해주세요.");
  return v;
};
function timestamp(v: unknown) {
  if (v == null) return Date.now();
  const time =
    typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  if (
    !Number.isFinite(time) ||
    time < Date.parse("1900-01-01") ||
    time > Date.now() + 86400000
  )
    throw new Error("백업 날짜를 확인해주세요.");
  return time;
}
export type BackupPost = {
  sourceId: string;
  text: string;
  images: string[];
  createdAt: number;
  updatedAt: number | null;
  replies: {
    sourceId: string;
    text: string;
    createdAt: number;
    updatedAt: number | null;
  }[];
  liked: boolean;
  saved: boolean;
  pinned: boolean;
  archived: boolean;
  repostedAt: number | null;
};
export type BackupProfile = {
  sourceId: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  draft: { text: string; images: string[] };
  posts: BackupPost[];
};
export type Backup = {
  profiles: BackupProfile[];
  warnings: string[];
  serverOwner: string | null;
};
export function parseBackup(value: unknown): Backup {
  const root = obj(value),
    warnings: string[] = [];
  const media = root.media ? obj(root.media) : {};
  const image = (v: unknown) => {
    const raw = str(v, 26 * 1024 * 1024);
    const source = media[raw] ?? raw;
    if (!source) return "";
    if (
      typeof source !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source)
    ) {
      warnings.push("해석할 수 없는 사진 참조 1개는 가져오지 않습니다.");
      return "";
    }
    if (source.length > 26 * 1024 * 1024)
      throw new Error("백업 사진이 18MB를 초과합니다.");
    return source;
  };
  const imageList = (v: unknown) => arr(v, 4).map(image).filter(Boolean);
  const sources = Array.isArray(root.profiles)
    ? arr(root.profiles, 30)
    : [root];
  if (!sources.length) throw new Error("백업에 프로필이 없습니다.");
  let total = 0;
  const profiles = sources.map((v, i) => {
    const entry = obj(v),
      p = obj(entry.profile ?? entry),
      sourceId = str(
        entry.id,
        180,
        `legacy:${str(p.handle, 32, str(p.name, 40))}:${i}`,
      ),
      rawDraft = entry.draft ?? "",
      draft =
        typeof rawDraft === "string"
          ? { text: str(rawDraft, 50000), images: [] }
          : obj(rawDraft);
    if (!Array.isArray(entry.posts) || !p.name)
      throw new Error("프로필과 게시글 목록이 필요합니다.");
    const posts = arr(entry.posts, 10000).map((v, j) => {
      const post = obj(v);
      const replies = arr(post.replies ?? post.comments, 5000).map((v, k) => {
        const r = obj(v);
        return {
          sourceId: str(r.id, 180, `reply-${k}`),
          text: str(r.text, 3000),
          createdAt: timestamp(r.createdAt),
          updatedAt: r.updatedAt ? timestamp(r.updatedAt) : null,
        };
      });
      if (replies.some((r) => !r.text.trim()))
        throw new Error("빈 답글은 가져올 수 없습니다.");
      total += 1 + replies.length;
      if (total > 20000)
        throw new Error("한 번에 20,000개 기록까지 가져올 수 있습니다.");
      const text = str(post.text, 50000),
        images = imageList(post.images ?? post.photos);
      if (!text.trim() && !images.length)
        throw new Error(
          "내용이 없는 기록이 있습니다. 원본 백업을 확인해주세요.",
        );
      return {
        sourceId: str(post.id, 180, `post-${j}`),
        text,
        images,
        createdAt: timestamp(post.createdAt),
        updatedAt: post.updatedAt ? timestamp(post.updatedAt) : null,
        replies,
        liked: post.liked === true,
        saved: post.saved === true,
        pinned: post.pinned === true,
        archived: post.archived === true,
        repostedAt: post.repostedAt ? timestamp(post.repostedAt) : null,
      };
    });
    return {
      sourceId,
      name: str(p.name, 40),
      handle: str(p.handle, 32, `import_${i + 1}`),
      bio: str(p.bio, 300),
      avatar: image(p.avatar),
      draft: { text: str(draft.text, 50000), images: imageList(draft.images) },
      posts,
    };
  });
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(
        `${label}에 중복 ID가 있습니다. 원본 백업을 확인해주세요.`,
      );
  };
  unique(
    profiles.map((p) => p.sourceId),
    "프로필",
  );
  for (const profile of profiles) {
    unique(
      profile.posts.map((p) => p.sourceId),
      "게시글",
    );
    for (const post of profile.posts)
      unique(
        post.replies.map((r) => r.sourceId),
        "답글",
      );
  }
  return {
    profiles,
    warnings,
    serverOwner: root.kind === "POS_LOG_SERVER" ? str(root.ownerId, 60) : null,
  };
}
export async function stableId(value: string) {
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function asDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}
export async function exportBackup(
  state: State,
  progress: (message: string) => void,
) {
  const profiles = [],
    media: Record<string, string> = {};
  let bytes = 0;
  for (const p of state.profiles) {
    progress(`${p.name} 백업 중…`);
    const posts: Post[] = [];
    for (const filter of ["threads", "archive"]) {
      let offset: number | null = 0;
      while (offset !== null) {
        const page: Feed = await logRequest(
          state.ownerId,
          `${profilePath(p.id)}/posts?filter=${filter}&limit=50&offset=${offset}`,
        );
        posts.push(...page.posts);
        offset = page.nextOffset;
      }
    }
    for (const post of posts) {
      const replies: Reply[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page: { replies: Reply[]; nextOffset: number | null } =
          await logRequest(
            state.ownerId,
            `${profilePath(p.id)}/posts/${post.id}/replies?offset=${offset}`,
          );
        replies.push(...page.replies);
        offset = page.nextOffset;
      }
      post.replies = replies;
    }
    const draft = await logRequest<Draft>(
      state.ownerId,
      `${profilePath(p.id)}/draft`,
    );
    const images = new Set([
      ...(p.avatar ? [p.avatar] : []),
      ...draft.images,
      ...posts.flatMap((x) => x.images),
    ]);
    for (const id of images) {
      if (media[id]) continue;
      const blob = await imageBlob(state.ownerId, p.id, id);
      bytes += blob.size;
      if (bytes > 100 * 1024 * 1024)
        throw new Error(
          "백업 사진 합계가 100MB를 초과합니다. 사진을 나누어 백업해주세요.",
        );
      media[id] = await asDataURL(blob);
    }
    profiles.push({ id: p.id, profile: p, draft, posts });
  }
  const blob = new Blob(
    [
      JSON.stringify(
        {
          kind: "POS_LOG_SERVER",
          version: 4,
          ownerId: state.ownerId,
          exportedAt: new Date().toISOString(),
          profiles,
          media,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `POS_LOG_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function importBackup(
  state: State,
  backup: Backup,
  progress: (message: string) => void,
) {
  let imported = 0,
    skipped = 0;
  const owner = state.ownerId;
  const identity = async (source: string) =>
    backup.serverOwner === owner && /^[a-f0-9-]{36}$/i.test(source)
      ? source
      : stableId(`pos-log-import:${owner}:${source}`);
  for (const [i, entry] of backup.profiles.entries()) {
    progress(`프로필 ${i + 1}/${backup.profiles.length} 준비 중…`);
    const pid = await identity(`profile:${entry.sourceId}`);
    const nativePid =
      backup.serverOwner === owner && /^[a-f0-9-]{36}$/i.test(entry.sourceId)
        ? entry.sourceId
        : pid;
    let p = state.profiles.find((p) => p.id === nativePid),
      created = false;
    if (!p) {
      let handle =
        entry.handle.replace(/^@/, "").replace(/[^a-zA-Z0-9_.가-힣]/g, "_") ||
        "import";
      let suffix = 0;
      const base = handle.slice(0, 22);
      while (
        state.profiles.some(
          (x) => x.handle.toLowerCase() === handle.toLowerCase(),
        )
      )
        handle = `${base}_import${++suffix}`;
      p = await logRequest<Profile>(owner, "/api/log/profiles", "POST", {
        id: nativePid,
        name: entry.name,
        handle,
        bio: entry.bio,
      });
      state = { ...state, profiles: [...state.profiles, p] };
      created = true;
    }
    const upload = async (source: string) => {
      const response = await fetch(source);
      const blob = await response.blob();
      return uploadImage(
        owner,
        p!.id,
        new File([blob], "import-photo", { type: blob.type }),
      );
    };
    const resumeLegacy = backup.serverOwner !== owner;
    if (
      (created || (resumeLegacy && p.revision === 1 && !p.avatar)) &&
      entry.avatar
    ) {
      const avatar = await upload(entry.avatar);
      p = await logRequest<Profile>(owner, profilePath(p.id), "PUT", {
        ...p,
        avatar,
      });
    }
    if (
      (created || resumeLegacy) &&
      (entry.draft.text || entry.draft.images.length)
    ) {
      const draft = await logRequest<Draft>(
        owner,
        `${profilePath(p.id)}/draft`,
      );
      if (draft.revision === 1 && !draft.text && !draft.images.length) {
        const images = [];
        for (const image of entry.draft.images)
          images.push(await upload(image));
        await logRequest(owner, `${profilePath(p.id)}/draft`, "PUT", {
          ...draft,
          text: entry.draft.text,
          images,
        });
      }
    }
    for (const [j, item] of entry.posts.entries()) {
      progress(`${entry.name} · 기록 ${j + 1}/${entry.posts.length}`);
      const id = await identity(`${entry.sourceId}:post:${item.sourceId}`);
      const postId =
        backup.serverOwner === owner && /^[a-f0-9-]{36}$/i.test(item.sourceId)
          ? item.sourceId
          : id;
      let existing: Post | null = null;
      try {
        existing = await logRequest<Post>(
          owner,
          `${profilePath(p.id)}/posts/${postId}`,
        );
      } catch (e) {
        if (!(e instanceof Error && "status" in e && e.status === 404)) throw e;
      }
      if (existing) {
        skipped++;
        continue;
      }
      const images = [];
      for (const image of item.images) images.push(await upload(image));
      const replies = [];
      for (const reply of item.replies) {
        const rid = await identity(
          `${entry.sourceId}:${item.sourceId}:reply:${reply.sourceId}`,
        );
        replies.push({
          id:
            backup.serverOwner === owner &&
            /^[a-f0-9-]{36}$/i.test(reply.sourceId)
              ? reply.sourceId
              : rid,
          text: reply.text,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
        });
      }
      await logRequest<Post>(owner, `${profilePath(p.id)}/posts`, "POST", {
        id: postId,
        text: item.text,
        images,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        legacyKey: `import:${postId}`,
        liked: item.liked,
        saved: item.saved,
        pinned: item.pinned,
        archived: item.archived,
        repostedAt: item.repostedAt,
        replies,
      });
      imported++;
    }
  }
  return { imported, skipped };
}

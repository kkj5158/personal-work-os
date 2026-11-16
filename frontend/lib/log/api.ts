import { apiClient, ApiError } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";
import { validateImage, type UploadPhase } from "./attachments";

export type Profile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string | null;
  revision: number;
};
export type Reply = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number | null;
  revision: number;
};
export type Post = {
  id: string;
  text: string;
  images: string[];
  createdAt: number;
  updatedAt: number | null;
  revision: number;
  liked: boolean;
  saved: boolean;
  pinned: boolean;
  archived: boolean;
  repostedAt: number | null;
  replies: Reply[];
  replyCount: number;
};
export type Draft = { text: string; images: string[]; revision: number };
export type State = {
  ownerId: string;
  profiles: Profile[];
  activeProfileId: string | null;
  storageEnabled: boolean;
  maxImagesPerPost?: number;
  maxImageBytes?: number;
};
export type Stats = {
  posts: number;
  media: number;
  replies: number;
  liked: number;
  days: { day: string; count: number }[];
};
export type Feed = {
  posts: Post[];
  replyEntries?: { reply: Reply; post: Post }[];
  nextOffset: number | null;
  total: number;
  stats: Stats;
};
export const profilePath = (id: string) =>
  `/api/log/profiles/${encodeURIComponent(id)}`;
export const logRequest = <T>(
  owner: string,
  path: string,
  method = "GET",
  body?: unknown,
) => apiClient.scoped<T>(owner, path, method, body);
export const loadState = () => apiClient.get<State>("/api/log/state");

/** Callers retain the same create ID until BOTH acknowledgements arrive. A draft read failure is safely replayable. */
export async function publishDraft(
  owner: string,
  profile: string,
  payload: {
    id: string;
    text: string;
    images: string[];
    draftRevision: number;
  },
) {
  const base = profilePath(profile);
  const post = await logRequest<Post>(owner, `${base}/posts`, "POST", payload);
  const draft = await logRequest<Draft>(owner, `${base}/draft`);
  return { post, draft };
}

export async function imageBlob(
  owner: string,
  profile: string,
  id: string,
): Promise<Blob> {
  const supabase = createSupabaseBrowserClient();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (isAuthRequired() && session?.user.id !== owner)
    throw new ApiError(401, "로그인 사용자가 바뀌었습니다.");
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}${profilePath(profile)}/images/${encodeURIComponent(id)}`,
    {
      headers: session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new ApiError(response.status, "사진을 불러오지 못했습니다.");
  return response.blob();
}

export async function uploadImage(
  owner: string,
  profile: string,
  file: File,
  options: {
    id?: string;
    phase?: (phase: UploadPhase) => void;
    signal?: AbortSignal;
    maxBytes?: number;
  } = {},
): Promise<string> {
  options.phase?.("validating");
  await validateImage(file, options.maxBytes);
  options.signal?.throwIfAborted();
  const sha256 = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[file.type];
  const ticket = await logRequest<{
    id: string;
    url: string;
    headers: Record<string, string>;
    ready?: boolean;
  }>(owner, `${profilePath(profile)}/images`, "POST", {
    id: options.id ?? crypto.randomUUID(),
    name: `photo.${extension}`,
    sizeBytes: file.size,
    mime: file.type,
    sha256,
  });
  options.signal?.throwIfAborted();
  if (ticket.ready) return ticket.id;
  const supabase = createSupabaseBrowserClient();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (isAuthRequired() && session?.user.id !== owner)
    throw new ApiError(401, "로그인 사용자가 바뀌었습니다.");
  options.phase?.("uploading");
  const put = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}${profilePath(profile)}/images/${ticket.id}/bytes`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: file,
      cache: "no-store",
      signal: options.signal,
    },
  );
  if (!put.ok)
    throw new Error("사진 전송에 실패했습니다. 사진의 다시 시도를 눌러주세요.");
  options.signal?.throwIfAborted();
  options.phase?.("finalizing");
  await logRequest(
    owner,
    `${profilePath(profile)}/images/${ticket.id}/complete`,
    "POST",
    {},
  );
  return ticket.id;
}

export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "저장하지 못했습니다. 다시 시도해주세요.";

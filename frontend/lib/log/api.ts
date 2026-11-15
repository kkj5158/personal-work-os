import { apiClient, ApiError } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

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
): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("PNG·JPEG·WebP 사진만 지원합니다.");
  if (!file.size || file.size > 18 * 1024 * 1024)
    throw new Error("18MB 이하의 사진만 첨부할 수 있습니다.");
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
  }>(owner, `${profilePath(profile)}/images`, "POST", {
    id: crypto.randomUUID(),
    name: `photo.${extension}`,
    sizeBytes: file.size,
    mime: file.type,
    sha256,
  });
  const supabase = createSupabaseBrowserClient();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (isAuthRequired() && session?.user.id !== owner)
    throw new ApiError(401, "로그인 사용자가 바뀌었습니다.");
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
    },
  );
  if (!put.ok) throw new Error("사진 전송에 실패했습니다. 다시 첨부해주세요.");
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

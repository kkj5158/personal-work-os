import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Attaches the current Supabase session's access token, when one exists.
// A no-op in DEV without Supabase configured (createSupabaseBrowserClient
// returns null) — the DEV backend profile ignores Authorization entirely,
// so an absent header there is expected, not an error.
async function authHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 401 && isAuthRequired() && typeof window !== "undefined") {
    // Expired/invalid session — the backend rejected authentication itself
    // (never a business-logic 401 today, since every endpoint requires
    // authentication uniformly). Return the user to login rather than
    // leaving the app stuck showing a request failure.
    window.location.href = new URL(`/login?next=${encodeURIComponent(window.location.pathname)}`, window.location.origin).toString();
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // response had no JSON body; fall back to statusText
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

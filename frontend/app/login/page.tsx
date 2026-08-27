"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSafeRedirectTarget } from "./safeRedirect";

// Minimal MVP login — email/password only, no signup UI, no social login,
// no MFA (see the pre-production auth fix's explicit non-goals). The
// Supabase project has public signup and anonymous login both disabled, so
// this page is intentionally the only way in: one production user was
// created manually.
function describeAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (normalized.includes("email not confirmed")) return "이메일 인증이 완료되지 않았습니다.";
  if (normalized.includes("rate limit")) return "잠시 후 다시 시도해 주세요.";
  return "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("로그인이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(describeAuthError(signInError.message));
        return;
      }
      router.replace(getSafeRedirectTarget(searchParams.get("next")));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Personal Work OS</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">로그인하여 계속하세요.</p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">이메일</span>
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">비밀번호</span>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" variant="primary" disabled={submitting} className="w-full justify-center">
          {submitting ? "로그인 중…" : "로그인"}
        </Button>
      </form>
    </div>
  );
}

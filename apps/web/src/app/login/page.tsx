"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { AuthPageSkeleton } from "@/components/page-skeletons";
import { Button } from "@/components/ui/button";
import type { TeamRole } from "@/lib/types/team";
import { API_URL, setSession } from "@/lib/api";
import { usePageReady } from "@/lib/use-page-ready";

export default function LoginPage() {
  const router = useRouter();
  const ready = usePageReady(400);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    if (!email || password.length < 8) {
      setError("E-posta ve en az 8 karakter şifre gerekli.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: {
          id: string;
          email: string;
          fullName: string;
          teamRole?: TeamRole;
          organization?: { id: string; name?: string; slug?: string } | null;
        };
        message?: string | string[];
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Giriş başarısız";
        throw new Error(msg);
      }
      if (!data.accessToken || !data.user) {
        throw new Error("Oturum açılamadı");
      }
      setSession(data.accessToken, data.user, data.refreshToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
      setLoading(false);
    }
  }

  if (!ready) return <AuthPageSkeleton />;

  return (
    <AuthShell
      title="Giriş yap"
      description="Hesabınızla panele girin."
      footer={
        <>
          Hesabın yok mu?{" "}
          <Link
            href="/register"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Kayıt ol
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <AuthField
          id="email"
          name="email"
          type="email"
          label="E-posta"
          required
          placeholder="eposta@firma.com"
          autoComplete="email"
        />
        <AuthField
          id="password"
          name="password"
          type="password"
          label="Şifre"
          required
          minLength={8}
          autoComplete="current-password"
        />
        {error ? (
          <div className="rounded-xl border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </AuthShell>
  );
}

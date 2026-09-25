"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { AuthPageSkeleton } from "@/components/page-skeletons";
import { Button } from "@/components/ui/button";
import { API_URL, setSession } from "@/lib/api";
import { usePageReady } from "@/lib/use-page-ready";

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const ready = usePageReady(400);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{
    organizationName: string;
    email: string;
    fullName: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    void (async () => {
      try {
        const res = await fetch(
          `${API_URL}/team/invites/peek?token=${encodeURIComponent(inviteToken)}`,
        );
        const data = (await res.json()) as {
          valid?: boolean;
          organizationName?: string;
          email?: string;
          fullName?: string;
          role?: string;
          message?: string;
        };
        if (data.valid && data.email && data.organizationName) {
          setInviteInfo({
            organizationName: data.organizationName,
            email: data.email,
            fullName: data.fullName || "",
            role: data.role || "ops",
          });
        } else {
          setError(data.message || "Davet geçersiz");
        }
      } catch {
        setError("Davet bilgisi alınamadı");
      }
    })();
  }, [inviteToken]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") || "");
    const email = String(form.get("email") || "");
    const companyName = String(form.get("companyName") || "") || "Yeni Mağaza";
    const password = String(form.get("password") || "");

    if (!fullName || !email || password.length < 8) {
      setError("Zorunlu alanları kontrol et.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          companyName: inviteToken ? undefined : companyName,
          inviteToken: inviteToken || undefined,
        }),
      });
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: {
          id: string;
          email: string;
          fullName: string;
          organization?: { id: string; name?: string } | null;
        };
        message?: string | string[];
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Kayıt başarısız";
        throw new Error(msg);
      }
      if (data.accessToken && data.user) {
        setSession(data.accessToken, data.user, data.refreshToken);
        router.push("/dashboard");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
      setLoading(false);
      return;
    }

    setError("Kayıt tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.");
    setLoading(false);
  }

  if (!ready) return <AuthPageSkeleton />;

  return (
    <AuthShell
      title={inviteInfo ? "Daveti kabul et" : "Kayıt ol"}
      description={
        inviteInfo
          ? `${inviteInfo.organizationName} ekibine katılıyorsunuz.`
          : "Hesap oluşturup panele geçin."
      }
      footer={
        <>
          Zaten hesabın var mı?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Giriş yap
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <AuthField
          id="fullName"
          name="fullName"
          label="Ad soyad"
          required
          autoComplete="name"
          defaultValue={inviteInfo?.fullName || undefined}
        />
        {!inviteToken ? (
          <AuthField
            id="companyName"
            name="companyName"
            label="Firma / mağaza"
            autoComplete="organization"
          />
        ) : null}
        <AuthField
          id="email"
          name="email"
          type="email"
          label="E-posta"
          required
          autoComplete="email"
          defaultValue={inviteInfo?.email || undefined}
          readOnly={Boolean(inviteInfo)}
        />
        <AuthField
          id="password"
          name="password"
          type="password"
          label="Şifre"
          required
          minLength={8}
          autoComplete="new-password"
        />
        {error ? (
          <div className="rounded-xl border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Kaydediliyor…" : inviteInfo ? "Katıl" : "Kayıt ol"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
      <RegisterInner />
    </Suspense>
  );
}

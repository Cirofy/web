"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { plans } from "@cirofy/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillingPageSkeleton } from "@/components/page-skeletons";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";

const planFeatures: Record<string, string[]> = {
  starter: [
    "1 mağaza bağlantısı",
    "Net kâr paneli",
    "Sipariş ve ürün listesi",
    "50 ürün tarife taraması",
    "E-posta destek",
  ],
  business: [
    "3 mağaza bağlantısı",
    "Hakediş fark takibi",
    "Maliyet toplu güncelleme",
    "250 ürün tarife taraması",
    "Öncelikli destek",
  ],
  enterprise: [
    "Sınırsız mağaza",
    "Özel raporlar",
    "Ekip kullanıcıları",
    "5000 ürün tarife taraması",
    "Özel başarı yöneticisi",
  ],
};

type Usage = {
  planId: string;
  planLabel: string;
  status: string;
  trialEndsAt: string | null;
  ordersThisMonth: number;
  orderLimit: number;
  orderUsagePct: number;
  storeCount: number;
  storeLimit: number;
  canConnectStore: boolean;
  canSync: boolean;
  blockedReason: string | null;
  nearOrderLimit?: boolean;
  nearStoreLimit?: boolean;
  nearTariffScanLimit?: boolean;
  warnReason?: string | null;
  daysLeftInPeriod?: number;
  tariffMismatchCount?: number;
  tariffScanUsed?: number;
  tariffScanLimit?: number;
  tariffScanUsagePct?: number;
  canScanTariffs?: boolean;
  tariffNote?: string | null;
};

type CheckoutResult = {
  mock: boolean;
  checkoutUrl: string;
  message?: string;
  planId?: string;
};

export default function BillingPage() {
  const ready = usePageReady();
  const [current, setCurrent] = useState("starter");
    const [usage, setUsage] = useState<Usage | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const refreshUsage = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const u = await apiFetch<Usage>("/billing/usage");
    setUsage(u);
    setCurrent(u.planId.toLowerCase());
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refreshUsage().catch(() => {
    });
  }, [ready, refreshUsage]);

  const ordersUsed = usage?.ordersThisMonth ?? 0;
  const orderLimit = usage?.orderLimit ?? 0;
  const usagePct = orderLimit > 0 ? Math.round((ordersUsed / orderLimit) * 100) : 0;
  const storeUsed = usage?.storeCount ?? 0;
  const storeLimit = usage?.storeLimit ?? 1;

  async function selectPlan(planId: string) {
    if (planId === (usage?.planId.toLowerCase() ?? current)) {
      toast("Mevcut planın zaten bu.");
      return;
    }

    const token = getToken();
    if (!token) {
      toast("Plan değiştirmek için giriş yapın.");
      return;
    }

    setBusyPlan(planId);
    
    try {
      const res = await apiFetch<CheckoutResult>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId, billingInterval: "month" }),
      });

      if (res.mock) {
        await refreshUsage();
        toast({ message: res.message ?? "Plan güncellendi. Kota anında uygulanır.", tone: "profit" });
        return;
      }

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }

      toast("Ödeme oturumu oluşturulamadı. Tekrar deneyin.");
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "İşlem tamamlanamadı.", tone: "loss" });
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Abonelik"
      description="Planını seç. Kota dolunca senkron ve yeni mağaza engellenir."
    >
      {!ready ? (
        <BillingPageSkeleton />
      ) : (
        <>
          

          {usage?.blockedReason ? (
            <div className="mb-4 rounded-xl border border-loss/30 bg-card px-4 py-3 text-sm">
              <p className="font-medium text-loss">{usage.blockedReason}</p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  const el = document.getElementById("plan-cards");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Planı yükselt
              </Button>
            </div>
          ) : usage?.warnReason ? (
            <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900">{usage.warnReason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dönemde kalan yaklaşık {usage.daysLeftInPeriod ?? "—"} gün.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  const el = document.getElementById("plan-cards");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Planı yükselt
              </Button>
            </div>
          ) : null}

          <Card className="mb-4">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Mevcut kullanım</CardTitle>
                <CardDescription>
                  {usage?.trialEndsAt
                    ? `Deneme bitiş: ${new Date(usage.trialEndsAt).toLocaleDateString("tr-TR")}`
                    : usage?.status === "ACTIVE"
                      ? "Aktif abonelik"
                      : "Henüz abonelik yok"}
                  {usage ? ` · ${usage.planLabel}` : null}
                  {usage?.daysLeftInPeriod != null
                    ? ` · dönem ~${usage.daysLeftInPeriod} gün`
                    : null}
                </CardDescription>
              </div>
              <Badge tone={usage?.status === "ACTIVE" ? "profit" : "warn"}>
                {usage?.status === "ACTIVE" ? "Aktif" : "Deneme"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sipariş kotası (ay)</span>
                  <span className="font-medium">
                    {ordersUsed} / {orderLimit}
                    {usage?.nearOrderLimit ? (
                      <span className="ml-2 text-amber-700">yaklaşıyor</span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      usagePct >= 100
                        ? "h-full rounded-full bg-loss"
                        : usagePct >= 80
                          ? "h-full rounded-full bg-amber-500"
                          : "h-full rounded-full bg-profit"
                    }
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mağaza kotası</span>
                  <span className="font-medium">
                    {storeUsed} / {storeLimit >= 999 ? "∞" : storeLimit}
                    {usage?.nearStoreLimit ? (
                      <span className="ml-2 text-amber-700">yaklaşıyor</span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      storeLimit < 999 &&
                      storeUsed / Math.max(storeLimit, 1) >= 1
                        ? "h-full rounded-full bg-loss"
                        : usage?.nearStoreLimit
                          ? "h-full rounded-full bg-amber-500"
                          : "h-full rounded-full bg-profit"
                    }
                    style={{
                      width: `${Math.min(
                        100,
                        storeLimit >= 999
                          ? 10
                          : Math.round((storeUsed / Math.max(storeLimit, 1)) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tarife tarama kotası</span>
                  <span className="font-medium">
                    {usage?.tariffScanUsed ?? "—"} /{" "}
                    {usage?.tariffScanLimit ?? "—"}
                    {usage?.nearTariffScanLimit ? (
                      <span className="ml-2 text-amber-700">yaklaşıyor</span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      (usage?.tariffScanUsagePct ?? 0) >= 100
                        ? "h-full rounded-full bg-loss"
                        : (usage?.tariffScanUsagePct ?? 0) >= 80
                          ? "h-full rounded-full bg-amber-500"
                          : "h-full rounded-full bg-profit"
                    }
                    style={{
                      width: `${Math.min(usage?.tariffScanUsagePct ?? 0, 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Plan, aktif ürün sayısına göre kaç ürünün tarife sapması
                  taranacağını sınırlar.
                </p>
              </div>

              {usage?.tariffMismatchCount && usage.tariffMismatchCount > 0 ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        Tarife sapması
                        <Badge tone="warn">{usage.tariffMismatchCount} ürün</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {usage.tariffNote ??
                          "Komisyon tarifeden sapıyor — kâr hesabını bozabilir; sipariş kotasını etkilemez."}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/products">Düzelt</Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div id="plan-cards" className="grid gap-4 md:grid-cols-3">
            {plans.map((p, i) => {
              const active = current === p.id;
              const features = planFeatures[p.id] ?? [];
              const busy = busyPlan === p.id;
              return (
                <Card
                  key={p.id}
                  className={
                    i === 1
                      ? "border-profit"
                      : active
                        ? "border-foreground/30"
                        : undefined
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{p.name}</CardTitle>
                      {active ? <Badge tone="profit">Aktif</Badge> : null}
                    </div>
                    <CardDescription>
                      {p.monthlyOrders} sipariş / ay · {p.productLimit.toLocaleString("tr-TR")}{" "}
                      ürün
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="font-display text-2xl font-bold">
                      {p.priceMonthlyTry.toLocaleString("tr-TR")} ₺
                      <span className="text-sm font-normal text-muted-foreground">
                        /ay
                      </span>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={active ? "outline" : "default"}
                      disabled={busy || !!busyPlan}
                      onClick={() => void selectPlan(p.id)}
                    >
                      {busy ? "İşleniyor…" : active ? "Mevcut plan" : "Bu plana geç"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </DashboardShell>
  );
}

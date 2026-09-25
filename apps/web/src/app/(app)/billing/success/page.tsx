"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillingPageSkeleton } from "@/components/page-skeletons";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getToken } from "@/lib/api";

type Usage = {
  planId: string;
  planLabel: string;
  status: string;
  orderLimit: number;
  storeLimit: number;
  ordersThisMonth: number;
  storeCount: number;
};

function BillingSuccessInner() {
  const ready = usePageReady();
  const params = useSearchParams();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planAppliedWithoutPayment = params.get("mock") === "1";
  const plan = params.get("plan");

  useEffect(() => {
    if (!ready) return;
    if (!getToken()) {
      setError("Oturum bulunamadı. Abonelik sayfasından giriş yapın.");
      return;
    }
    void apiFetch<Usage>("/billing/usage")
      .then(setUsage)
      .catch(() => setError("Kota bilgisi alınamadı."));
  }, [ready]);

  return (
    <DashboardShell
      loading={!ready}
      title="Ödeme sonucu"
      description="Plan ve kota durumu aşağıda."
    >
      {!ready ? (
        <BillingPageSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                {error ? "Tamamlanamadı" : planAppliedWithoutPayment ? "Plan güncellendi" : "Ödeme alındı"}
              </CardTitle>
              {!error ? <Badge tone="profit">Tamam</Badge> : null}
            </div>
            <CardDescription>
              {error
                ? error
                : planAppliedWithoutPayment
                  ? "Plan hemen uygulandı; kota anında geçerli."
                  : "Abonelik onaylandı. Kota bir sonraki senkronlarda geçerli."}
              {plan ? ` Seçilen plan: ${plan}.` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <div className="text-muted-foreground">Plan</div>
                  <div className="mt-1 font-semibold">{usage.planLabel}</div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="text-muted-foreground">Durum</div>
                  <div className="mt-1 font-semibold">
                    {usage.status === "ACTIVE" ? "Aktif" : usage.status}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="text-muted-foreground">Sipariş kotası</div>
                  <div className="mt-1 font-semibold">
                    {usage.ordersThisMonth} / {usage.orderLimit}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="text-muted-foreground">Mağaza kotası</div>
                  <div className="mt-1 font-semibold">
                    {usage.storeCount} /{" "}
                    {usage.storeLimit >= 999 ? "∞" : usage.storeLimit}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/billing">Aboneliğe dön</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Özete git</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingSuccessInner />
    </Suspense>
  );
}

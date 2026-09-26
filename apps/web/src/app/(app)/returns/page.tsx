"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { CategoryBarChart } from "@/components/charts";
import { MarketplaceLogo } from "@/components/marketplace-logo";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { analyzeReturnLoss } from "@/lib/profit-utils";
import { apiFetch, getToken } from "@/lib/api";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";

type PeriodDays = 7 | 30 | 90;

type TariffMismatchBrief = {
  productId: string;
  currentRatePct: number;
  suggestedRatePct: number;
  suggestedPlusRatePct: number;
  deltaPct: number;
  tariffCategory: string;
};

type ReturnSkuRow = {
  sku: string;
  title: string;
  category: string;
  brand: string;
  count: number;
  gross: number;
  netLoss: number;
  returnFeeEst: number;
  returnRatePct: number;
  tariffMismatch?: TariffMismatchBrief | null;
  tariffAdjustment?: number;
  netLossAtTariff?: number;
};

type ReturnRecentRow = {
  id: string;
  externalId: string;
  orderedAt: string;
  marketplace: string;
  storeName: string;
  sku: string;
  title: string;
  category: string;
  brand: string;
  grossAmount: number;
  netProfit: number;
  netLoss: number;
  returnFeeEst: number;
  costTotal: number;
  commission: number;
  tariffMismatch?: TariffMismatchBrief | null;
};

type ReturnAnalysis = {
  periodDays: number;
  hasData?: boolean;
  summary: {
    returnCount: number;
    orderCount: number;
    returnRatePct: number;
    netLoss: number;
    grossReturned: number;
    returnFees: number;
    avgLossPerReturn: number;
    tariffMismatchSkuCount?: number;
  };
  bySku: ReturnSkuRow[];
  byCategory: Array<{
    category: string;
    count: number;
    netLoss: number;
    gross: number;
  }>;
  byMarketplace: Array<{
    marketplace: string;
    count: number;
    netLoss: number;
    gross: number;
  }>;
  recent: ReturnRecentRow[];
};

export default function ReturnsPage() {
  const ready = usePageReady();
  const [days, setDays] = useState<PeriodDays>(30);
  const emptyAnalysis = (): ReturnAnalysis => ({
    periodDays: days,
    hasData: false,
    summary: {
      returnCount: 0,
      orderCount: 0,
      returnRatePct: 0,
      netLoss: 0,
      grossReturned: 0,
      returnFees: 0,
      avgLossPerReturn: 0,
    },
    bySku: [],
    byCategory: [],
    byMarketplace: [],
    recent: [],
  });
  const [data, setData] = useState<ReturnAnalysis>(() => emptyAnalysis());
  const [fromApi, setFromApi] = useState(false);
  const [mismatchBySku, setMismatchBySku] = useState<
    Map<string, TariffMismatchRow>
  >(() => new Map());

  useEffect(() => {
    if (!getToken()) {
      setData(emptyAnalysis());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [res, mismatches] = await Promise.all([
          apiFetch<ReturnAnalysis & { hasData?: boolean }>(
            `/returns/analysis?days=${days}`,
          ),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        setMismatchBySku(mismatches.bySku);
        setData({
          ...res,
          periodDays: res.periodDays ?? days,
          summary: res.summary ?? {
            returnCount: 0,
            orderCount: 0,
            returnRatePct: 0,
            netLoss: 0,
            grossReturned: 0,
            returnFees: 0,
            avgLossPerReturn: 0,
          },
          bySku: res.bySku ?? [],
          byCategory: res.byCategory ?? [],
          byMarketplace: res.byMarketplace ?? [],
          recent: res.recent ?? [],
        });
        setFromApi(true);
      } catch {
        if (!cancelled) {
          setData(emptyAnalysis());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const s = data.summary;
  const chartData = useMemo(
    () =>
      data.byCategory.map((c) => ({
        category: c.category,
        net: c.netLoss,
      })),
    [data.byCategory],
  );

  function mismatchForSku(sku: string, row?: { tariffMismatch?: TariffMismatchBrief | null }) {
    return row?.tariffMismatch ?? mismatchBySku.get(sku) ?? null;
  }

  const tariffHitCount = useMemo(() => {
    if (typeof s.tariffMismatchSkuCount === "number") {
      return s.tariffMismatchSkuCount;
    }
    let n = 0;
    for (const row of data.bySku) {
      if (mismatchForSku(row.sku, row)) n += 1;
    }
    return n;
  }, [data.bySku, mismatchBySku, s.tariffMismatchSkuCount]);

  return (
    <DashboardShell
      loading={!ready}
      title="İade zararı"
      description={
        fromApi
          ? "İade oranı, SKU ve kategori bazlı net zarar — operasyon odağı."
          : "Mağaza bağlandıktan sonra iade analizi burada görünür."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">Siparişler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">Yüksek iade ürünler</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {([7, 30, 90] as PeriodDays[]).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
              >
                Son {d} gün
              </Button>
            ))}
          </div>

          {tariffHitCount > 0 ? (
            <Card className="mb-4 border-amber-200/80 bg-amber-50/40">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Tarife sapması</span>
                    <Badge tone="warn">{tariffHitCount} SKU</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    İade zararı listesindeki ürünlerde komisyon tarifeden sapıyor —
                    net zarar abartılı veya eksik görünebilir.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/products">Ürünlerde düzelt</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">İade adedi</div>
                <div className="mt-1 font-display text-2xl font-bold">{s.returnCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {s.orderCount} siparişte · oran {formatPct(s.returnRatePct)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Net zarar</div>
                <div className="mt-1 font-display text-2xl font-bold text-loss">
                  {formatTry(s.netLoss)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Ort. {formatTry(s.avgLossPerReturn)} / iade
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Ek iade maliyeti</div>
                <div className="mt-1 font-display text-2xl font-bold text-loss">
                  {formatTry(s.returnFees)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife sapmalı SKU</div>
                <div
                  className={
                    tariffHitCount > 0
                      ? "mt-1 font-display text-2xl font-bold text-amber-700"
                      : "mt-1 font-display text-2xl font-bold"
                  }
                >
                  {tariffHitCount}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Kategori zararı</CardTitle>
                <CardDescription>İade net zararının kategori dağılımı</CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Bu dönemde iade yok.</p>
                ) : (
                  <CategoryBarChart data={chartData} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Kanal özeti</CardTitle>
                <CardDescription>Pazaryerine göre iade zararı</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byMarketplace.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Veri yok.</p>
                ) : (
                  data.byMarketplace.map((m) => (
                    <div
                      key={m.marketplace}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <MarketplaceLogo marketplace={m.marketplace} height={16} />
                        <div className="text-xs text-muted-foreground">{m.count} iade</div>
                      </div>
                      <div className="font-semibold text-loss">{formatTry(m.netLoss)}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>SKU bazlı zarar</CardTitle>
              <CardDescription>
                Önce yüksek zararlı SKU’ları maliyet veya liste fiyatından ele.
                {tariffHitCount > 0
                  ? " Tarife sapması olan satırlar işaretli."
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Kategori</th>
                      <th className="px-4 py-3 font-medium">Adet</th>
                      <th className="px-4 py-3 font-medium">İade oranı</th>
                      <th className="px-4 py-3 font-medium">Net zarar</th>
                      <th className="px-4 py-3 font-medium">Ek maliyet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySku.slice(0, 20).map((r) => {
                      const mm = mismatchForSku(r.sku, r);
                      return (
                        <tr key={r.sku} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{r.title}</div>
                              {mm ? <Badge tone="warn">Tarife sapması</Badge> : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.sku} · {r.brand}
                            </div>
                            {mm ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Komisyon %{mm.currentRatePct} → tarife %{mm.suggestedRatePct}
                                {typeof r.tariffAdjustment === "number" &&
                                r.tariffAdjustment !== 0
                                  ? ` · tarife düzeltme ${formatTry(r.tariffAdjustment)}`
                                  : ""}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                          <td className="px-4 py-3">{r.count}</td>
                          <td className="px-4 py-3">
                            <Badge tone={r.returnRatePct >= 5 ? "loss" : "warn"}>
                              {formatPct(r.returnRatePct)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-loss">
                            {formatTry(r.netLoss)}
                            {typeof r.netLossAtTariff === "number" &&
                            mm &&
                            r.netLossAtTariff !== r.netLoss ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                tarife {formatTry(r.netLossAtTariff)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTry(r.returnFeeEst)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Son iadeler</CardTitle>
              <CardDescription>Sipariş detayına siparişler sayfasından ulaşın</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {data.recent.slice(0, 12).map((r) => {
                  const mm = mismatchForSku(r.sku, r);
                  return (
                    <div key={r.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold">{r.title}</div>
                            {mm ? <Badge tone="warn">Tarife</Badge> : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.externalId} · {r.sku}
                          </div>
                        </div>
                        <MarketplaceLogo marketplace={r.marketplace} height={14} />
                      </div>
                      <div className="mt-3 flex justify-between text-sm">
                        <span className="text-muted-foreground">{formatTry(r.grossAmount)}</span>
                        <span className="font-semibold text-loss">{formatTry(r.netLoss)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Sipariş</th>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Kanal</th>
                      <th className="px-4 py-3 font-medium">Brüt</th>
                      <th className="px-4 py-3 font-medium">Net</th>
                      <th className="px-4 py-3 font-medium">Ek maliyet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.slice(0, 25).map((r) => {
                      const mm = mismatchForSku(r.sku, r);
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{r.externalId}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{r.title}</div>
                              {mm ? <Badge tone="warn">Tarife</Badge> : null}
                            </div>
                            <div className="text-xs text-muted-foreground">{r.sku}</div>
                          </td>
                          <td className="px-4 py-3">
                            <MarketplaceLogo marketplace={r.marketplace} height={14} />
                          </td>
                          <td className="px-4 py-3">{formatTry(r.grossAmount)}</td>
                          <td className="px-4 py-3 font-semibold text-loss">
                            {formatTry(r.netLoss)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTry(r.returnFeeEst)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}

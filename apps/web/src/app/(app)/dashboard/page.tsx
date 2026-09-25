"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  Download,
  Package,
  Percent,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatCard } from "@/components/stat-card";
import { ProfitChart, TariffHealthRing, type ChartPoint } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardPageSkeleton } from "@/components/page-skeletons";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getToken } from "@/lib/api";
import { loadTariffMismatches } from "@/lib/tariff-mismatches";

type PeriodDays = 7 | 30 | 90;

type DashboardAlert = {
  title: string;
  body: string;
  tone: "profit" | "loss" | "warn";
};
type RecentOrder = {
  id: string;
  product: string;
  profit: number;
  status: string;
};

type DashboardSummary = {
  netProfit: number;
  marginPct: number;
  orderCount: number;
  grossAmount: number;
  stores: number;
  connectedStores: number;
  hasData: boolean;
  chart: ChartPoint[];
  delta: {
    netProfit: number;
    marginPct: number;
    orderCount: number;
    grossAmount: number;
  };
  recentOrders: RecentOrder[];
  alerts: DashboardAlert[];
};

const PERIOD_HINT: Record<PeriodDays, string> = {
  7: "önceki 7 güne göre",
  30: "önceki 30 güne göre",
  90: "önceki 90 güne göre",
};

function emptyLiveSummary(days: PeriodDays): DashboardSummary {
  return {
    netProfit: 0,
    marginPct: 0,
    orderCount: 0,
    grossAmount: 0,
    stores: 0,
    connectedStores: 0,
    hasData: false,
    chart: [],
    delta: {
      netProfit: 0,
      marginPct: 0,
      orderCount: 0,
      grossAmount: 0,
    },
    recentOrders: [],
    alerts: [
      {
        title: "Veri yok",
        body: "Mağaza bağlayıp senkron başlatın — Ayarlar.",
        tone: "warn",
      },
    ],
  };
}

export default function DashboardPage() {
  const ready = usePageReady();
  const [days, setDays] = useState<PeriodDays>(7);
  const [summary, setSummary] = useState<DashboardSummary>(() => emptyLiveSummary(7));
  const [fromApi, setFromApi] = useState(false);
  const [tariffMismatchCount, setTariffMismatchCount] = useState(0);
  const [tariffMaxDelta, setTariffMaxDelta] = useState(0);
  const [tariffProductTotal, setTariffProductTotal] = useState(0);

  const tariffHealthScore = useMemo(() => {
    if (tariffMismatchCount <= 0) return 100;
    const dens =
      tariffProductTotal > 0
        ? tariffMismatchCount / tariffProductTotal
        : Math.min(1, tariffMismatchCount / 20);
    const fromCount = dens * 55;
    const fromDelta = Math.min(40, tariffMaxDelta * 8);
    return Math.max(0, Math.min(100, Math.round(100 - fromCount - fromDelta)));
  }, [tariffMismatchCount, tariffMaxDelta, tariffProductTotal]);

  const loading = !ready || !fromApi;

  useEffect(() => {
    setFromApi(false);
    if (!getToken()) {
      setSummary(emptyLiveSummary(days));
      setFromApi(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [res, mismatches] = await Promise.all([
          apiFetch<
            DashboardSummary & {
              periodDays?: number;
              recentOrders?: Array<{
                id: string;
                product: string;
                profit: number;
                status?: string;
              }>;
              alerts?: DashboardAlert[];
            }
          >(`/dashboard/summary?days=${days}`),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        setTariffMismatchCount(mismatches.items.length);
        setTariffMaxDelta(
          mismatches.items.reduce(
            (max, row) => Math.max(max, Math.abs(row.deltaPct)),
            0,
          ),
        );
        setTariffProductTotal(
          Math.max(mismatches.items.length, Number(res?.orderCount) > 0 ? 40 : 12),
        );
        if (!res?.hasData) {
          setSummary(emptyLiveSummary(days));
          setFromApi(true);
          return;
        }
        setSummary({
          netProfit: Number(res.netProfit) || 0,
          marginPct: Number(res.marginPct) || 0,
          orderCount: Number(res.orderCount) || 0,
          grossAmount: Number(res.grossAmount) || 0,
          stores: Number(res.stores) || 0,
          connectedStores: Number(res.connectedStores) || 0,
          hasData: !!res.hasData,
          chart:
            Array.isArray(res.chart) && res.chart.length
              ? res.chart
              : [],
          delta: res.delta ?? {
            netProfit: 0,
            marginPct: 0,
            orderCount: 0,
            grossAmount: 0,
          },
          recentOrders:
            res.recentOrders?.map((o) => ({
              id: o.id,
              product: o.product,
              profit: Number(o.profit) || 0,
              status: (o.status as RecentOrder["status"]) ?? "DELIVERED",
            })) ?? [],
          alerts: res.alerts?.length
            ? res.alerts
            : emptyLiveSummary(days).alerts,
        });
        setFromApi(true);
      } catch {
        if (!cancelled) {
          setSummary(emptyLiveSummary(days));
          setFromApi(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const s = summary;
  const periodLabel = useMemo(() => `Son ${days} gün`, [days]);

  return (
    <DashboardShell
      loading={loading}
      title="Bugünün kârı"
      description={
        fromApi
          ? summary.hasData
            ? `Tüm giderler düşülmüş net kâr özeti · ${periodLabel.toLowerCase()}.`
            : `Hesap bağlı · henüz sipariş verisi yok · ${periodLabel.toLowerCase()}.`
          : `Mağaza bağlandıktan sonra veriler burada görünür.`
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href="/live">
              <CalendarRange className="h-4 w-4" />
              Gün içi
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
            <Link href="/reports">
              <Download className="h-4 w-4" />
              Dışa aktar
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/settings">Mağaza bağla</Link>
          </Button>
        </>
      }
    >
      {loading ? (
        <DashboardPageSkeleton />
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

          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <StatCard
              label="Net kâr"
              value={formatTry(s.netProfit)}
              delta={s.delta.netProfit}
              hint={PERIOD_HINT[days]}
              tone="profit"
              icon={Wallet}
            />
            <StatCard
              label="Net marj"
              value={formatPct(s.marginPct)}
              delta={s.delta.marginPct}
              hint="tüm siparişler"
              tone="profit"
              icon={Percent}
            />
            <StatCard
              label="Sipariş"
              value={String(s.orderCount)}
              delta={s.delta.orderCount}
              hint={periodLabel.toLowerCase()}
              icon={ShoppingCart}
            />
            <StatCard
              label="Ciro"
              value={formatTry(s.grossAmount)}
              delta={s.delta.grossAmount}
              hint="brüt satış"
              icon={TrendingUp}
            />
          </div>

          <Card className="mt-4">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <TariffHealthRing score={tariffHealthScore} size={96} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Tarife sağlığı</span>
                    {tariffMismatchCount > 0 ? (
                      <Badge tone="warn">{tariffMismatchCount} sapma</Badge>
                    ) : (
                      <Badge tone="profit">Uyumlu</Badge>
                    )}
                    {tariffMaxDelta > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        en fazla ±{formatPct(tariffMaxDelta)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tariffHealthScore >= 80
                      ? "Komisyon oranları kategori tarifesine yakın — net kâr güvenilir."
                      : tariffHealthScore >= 55
                        ? "Bazı ürünlerde tarife sapması var — kâr hesabı kayabilir."
                        : "Tarife sapması yüksek — ürün komisyonlarını düzeltin."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/tariffs">Tarifeler</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/products">Ürünlerde düzelt</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Kâr trendi</CardTitle>
                  <CardDescription>
                    Net kâr ve ciro — {periodLabel.toLowerCase()}
                  </CardDescription>
                </div>
                <Badge tone={fromApi ? "profit" : "warn"}>
                  {fromApi ? "Canlı" : "Bağlı değil"}
                </Badge>
              </CardHeader>
              <CardContent>
                <ProfitChart data={s.chart} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Uyarılar</CardTitle>
                <CardDescription>Aksiyon gerektiren maddeler</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.alerts.map((a) => (
                  <div
                    key={a.title}
                    className="rounded-xl border border-border bg-muted/40 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <AlertTriangle
                          className={
                            a.tone === "loss"
                              ? "h-4 w-4 text-loss"
                              : a.tone === "profit"
                                ? "h-4 w-4 text-profit"
                                : "h-4 w-4 text-amber-600"
                          }
                        />
                        {a.title}
                      </div>
                      <Badge
                        tone={
                          a.tone === "warn"
                            ? "warn"
                            : a.tone === "loss"
                              ? "loss"
                              : "profit"
                        }
                      >
                        {a.tone === "profit"
                          ? "İyi"
                          : a.tone === "loss"
                            ? "Kritik"
                            : "Dikkat"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Son siparişler</CardTitle>
                  <CardDescription>Sipariş bazlı net kâr</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/orders">Tümünü gör</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {s.recentOrders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{o.id}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {o.product}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={
                            o.profit >= 0
                              ? "font-semibold text-profit"
                              : "font-semibold text-loss"
                          }
                        >
                          {o.profit >= 0 ? "+" : ""}
                          {formatTry(o.profit)}
                        </div>
                        <Badge
                          tone={o.profit >= 0 ? "profit" : "loss"}
                          className="mt-1"
                        >
                          {o.profit >= 0 ? "Kâr" : "Zarar"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Sipariş</th>
                        <th className="px-4 py-3 font-medium">Ürün</th>
                        <th className="px-4 py-3 font-medium">Net kâr</th>
                        <th className="px-4 py-3 font-medium">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.recentOrders.map((o) => (
                        <tr key={o.id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{o.id}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {o.product}
                          </td>
                          <td
                            className={
                              o.profit >= 0
                                ? "px-4 py-3 font-semibold text-profit"
                                : "px-4 py-3 font-semibold text-loss"
                            }
                          >
                            {o.profit >= 0 ? "+" : ""}
                            {formatTry(o.profit)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={o.profit >= 0 ? "profit" : "loss"}>
                              {o.profit >= 0 ? "Kâr" : "Zarar"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hızlı aksiyonlar</CardTitle>
                <CardDescription>Sık kullanılan işlemler</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button asChild variant="outline" className="justify-start rounded-xl">
                  <Link href="/products">
                    <Package className="h-4 w-4" />
                    Ürün maliyetlerini gir
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-xl">
                  <Link href="/products">
                    <Percent className="h-4 w-4" />
                    Tarife sapmalarını düzelt
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-xl">
                  <Link href="/orders">
                    <ShoppingCart className="h-4 w-4" />
                    Sipariş kârlılığını incele
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-xl">
                  <Link href="/settlements">
                    <TrendingUp className="h-4 w-4" />
                    Hakediş farklarını gör
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

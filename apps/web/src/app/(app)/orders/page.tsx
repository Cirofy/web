"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderDetailDrawer } from "@/components/order-detail-drawer";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { MarketplaceChannelFilter, MarketplaceLogo } from "@/components/marketplace-logo";
import { PaginationBar, paginateSlice } from "@/components/pagination-bar";
import { formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { computeOrderNet, hasEnteredCost, summarizeReturnLoss } from "@/lib/profit-utils";
import { orderStatusLabel } from "@/lib/order-utils";
import { apiFetch, getToken } from "@/lib/api";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";

const filters = ["Tümü", "Kâr", "Zarar", "İade"] as const;
type PeriodDays = 7 | 30 | 90 | "all";

type CatalogOrder = {
  id: string;
  externalId: string;
  product: string;
  productId?: string | null;
  sku?: string | null;
  marketplace: "Trendyol" | "Hepsiburada" | string;
  status: string;
  orderedAt: string;
  grossAmount: number;
  commission: number;
  shippingFee: number;
  serviceFee: number;
  vatNet: number;
  withholding: number;
  costTotal: number;
  returnFee?: number;
  netProfit: number;
};

type ApiOrder = {
  id: string;
  externalId: string;
  product: string;
  productId?: string | null;
  sku?: string | null;
  marketplace: "Trendyol" | "Hepsiburada" | string;
  status: CatalogOrder["status"];
  orderedAt: string;
  grossAmount: number;
  commission: number;
  shippingFee: number;
  serviceFee: number;
  vatNet: number;
  withholding: number;
  costTotal: number;
  returnFee?: number;
  netProfit: number;
};

const titleToSku = new Map<string, string>();

function mapApiOrder(o: ApiOrder): CatalogOrder {
  return {
    id: o.id,
    externalId: o.externalId,
    product: o.product,
    productId: o.productId ?? null,
    sku: o.sku ?? null,
    marketplace: o.marketplace === "Hepsiburada" ? "Hepsiburada" : "Trendyol",
    status: o.status,
    orderedAt: o.orderedAt,
    grossAmount: Number(o.grossAmount) || 0,
    commission: Number(o.commission) || 0,
    shippingFee: Number(o.shippingFee) || 0,
    serviceFee: Number(o.serviceFee) || 0,
    vatNet: Number(o.vatNet) || 0,
    withholding: Number(o.withholding) || 0,
    costTotal: Number(o.costTotal) || 0,
    returnFee: Number(o.returnFee) || 0,
    netProfit: Number(o.netProfit) || 0,
  };
}


function resolveOrderMismatch(
  o: CatalogOrder,
  byProductId: Map<string, TariffMismatchRow>,
  bySku: Map<string, TariffMismatchRow>,
): TariffMismatchRow | null {
  if (o.productId) {
    const byId = byProductId.get(o.productId);
    if (byId) return byId;
  }
  const sku = o.sku ?? titleToSku.get(o.product.toLowerCase()) ?? null;
  if (sku) {
    const bySkuHit = bySku.get(sku);
    if (bySkuHit) return bySkuHit;
  }
  return null;
}

export default function OrdersPage() {
  const ready = usePageReady();
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("Tümü");
  const [channel, setChannel] = useState<"all" | "Trendyol" | "Hepsiburada">("all");
  const [days, setDays] = useState<PeriodDays>(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mismatchByProductId, setMismatchByProductId] = useState<
    Map<string, TariffMismatchRow>
  >(() => new Map());
  const [mismatchBySku, setMismatchBySku] = useState<Map<string, TariffMismatchRow>>(
    () => new Map(),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const qs =
          days === "all"
            ? "/orders?limit=2000"
            : `/orders?limit=2000&days=${days}`;
        const [rows, mismatches] = await Promise.all([
          apiFetch<ApiOrder[]>(qs),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        setMismatchByProductId(mismatches.byProductId);
        setMismatchBySku(mismatches.bySku);
        setOrders(rows?.length ? rows.map(mapApiOrder) : []);
        setFromApi(true);
      } catch {
        if (!cancelled) {
          setOrders([]);
          setFromApi(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const rows = useMemo(() => {
    return orders.filter((o) => {
      const matchQ =
        !q ||
        o.externalId.toLowerCase().includes(q.toLowerCase()) ||
        o.product.toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (channel !== "all" && o.marketplace !== channel) return false;
      const hasCost = hasEnteredCost(o.costTotal);
      const net = computeOrderNet(o).net;
      if (filter === "Kâr") return hasCost && net > 0;
      if (filter === "Zarar") return hasCost && net < 0;
      if (filter === "İade") return o.status === "RETURNED";
      return true;
    });
  }, [orders, q, filter, channel]);

  useEffect(() => {
    setPage(1);
  }, [q, filter, channel, days, pageSize]);

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateSlice(rows, page, pageSize),
    [rows, page, pageSize],
  );

  const tariffMismatchCount = useMemo(() => {
    let n = 0;
    for (const o of rows) {
      if (resolveOrderMismatch(o, mismatchByProductId, mismatchBySku)) n += 1;
    }
    return n;
  }, [rows, mismatchByProductId, mismatchBySku]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const selectedMismatch = selected
    ? resolveOrderMismatch(selected, mismatchByProductId, mismatchBySku)
    : null;
  const totalProfit = rows.reduce((sum, o) => {
    if (!hasEnteredCost(o.costTotal)) return sum;
    return sum + computeOrderNet(o).net;
  }, 0);
  const returnSummary = summarizeReturnLoss(orders);
  const lossCount = orders.filter(
    (o) => hasEnteredCost(o.costTotal) && computeOrderNet(o).net < 0,
  ).length;

  return (
    <DashboardShell
      loading={!ready}
      title="Siparişler"
      description="Her siparişin cebine kalan net tutarı — komisyon, kargo, hizmet, KDV net ve maliyet düşülmüş."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">Mağaza bağla</Link>
        </Button>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
      <div className="mb-4 flex flex-wrap gap-2">
        {([7, 30, 90, "all"] as PeriodDays[]).map((d) => (
          <Button
            key={String(d)}
            size="sm"
            variant={days === d ? "default" : "outline"}
            onClick={() => setDays(d)}
          >
            {d === "all" ? "Tümü" : `Son ${d} gün`}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Listelenen</div>
            <div className="mt-1 font-display text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Toplam net kâr</div>
            <div
              className={
                totalProfit >= 0
                  ? "mt-1 font-display text-2xl font-bold text-profit"
                  : "mt-1 font-display text-2xl font-bold text-loss"
              }
            >
              {formatTry(totalProfit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Zararlı sipariş</div>
            <div className="mt-1 font-display text-2xl font-bold text-loss">
              {lossCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">İade zararı</div>
            <div className="mt-1 font-display text-2xl font-bold text-loss">
              {formatTry(returnSummary.loss)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {returnSummary.count} iade · ek zarar {formatTry(returnSummary.returnFees)}
            </div>
          </CardContent>
        </Card>
      </div>

      {tariffMismatchCount > 0 ? (
        <Card className="mb-4 border-amber-200/80 bg-amber-50/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">
                {tariffMismatchCount} siparişte tarife sapması
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ürün komisyonu kategori tarifesinden farklı — satırlar işaretli.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/products">Ürünlerde düzelt</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Sipariş listesi</CardTitle>
            <CardDescription>
              {fromApi
                ? orders.length
                  ? `Canlı siparişler — ${days === "all" ? "tüm dönem" : `son ${days} gün`}`
                  : `Henüz sipariş yok — ${days === "all" ? "tüm dönem" : `son ${days} gün`}`
                : `Mağaza bağlandıktan sonra siparişler burada görünür.`}
              {tariffMismatchCount > 0
                ? " · tarife sapması olan satırlar işaretli"
                : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MarketplaceChannelFilter value={channel} onChange={setChannel} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Sipariş veya ürün…"
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
              />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
              <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={
                    filter === f
                      ? "rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background"
                      : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobil: kart listesi */}
          <div className="space-y-3 md:hidden">
            {pageRows.map((o) => {
              const { net, deductions } = computeOrderNet(o);
              const hasCost = hasEnteredCost(o.costTotal);
              const mm = resolveOrderMismatch(o, mismatchByProductId, mismatchBySku);
              return (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedId(o.id);
                  }}
                  className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">{o.externalId}</div>
                        {!hasCost ? <Badge tone="warn">Maliyet yok</Badge> : null}
                        {mm ? <Badge tone="warn">Tarife sapması</Badge> : null}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {o.product} ·{" "}
                        <MarketplaceLogo
                          marketplace={o.marketplace}
                          height={12}
                          className="align-middle"
                        />
                      </div>
                      {mm ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Komisyon %{mm.currentRatePct} → tarife %{mm.suggestedRatePct}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        o.status === "RETURNED" || o.status === "CANCELLED"
                          ? "warn"
                          : !hasCost
                            ? "warn"
                            : net < 0
                              ? "loss"
                              : "default"
                      }
                    >
                      {orderStatusLabel[o.status] ?? o.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Brüt</div>
                      <div className="font-medium">{formatTry(o.grossAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Kesinti</div>
                      <div className="font-medium text-muted-foreground">
                        {formatTry(deductions)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Net</div>
                      {hasCost ? (
                        <div
                          className={
                            net >= 0
                              ? "font-semibold text-profit"
                              : "font-semibold text-loss"
                          }
                        >
                          {net >= 0 ? "+" : ""}
                          {formatTry(net)}
                        </div>
                      ) : (
                        <div className="font-semibold text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: tablo */}
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Sipariş</th>
                  <th className="px-4 py-3 font-medium">Ürün</th>
                  <th className="px-4 py-3 font-medium">Brüt</th>
                  <th className="px-4 py-3 font-medium">Kesinti</th>
                  <th className="px-4 py-3 font-medium">Net kâr</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const { net, deductions } = computeOrderNet(o);
                  const hasCost = hasEnteredCost(o.costTotal);
                  const mm = resolveOrderMismatch(
                    o,
                    mismatchByProductId,
                    mismatchBySku,
                  );
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => setSelectedId(o.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.externalId}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(o.orderedAt).toLocaleString("tr-TR")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{o.product}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {!hasCost ? <Badge tone="warn">Maliyet yok</Badge> : null}
                          {mm ? <Badge tone="warn">Tarife sapması</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatTry(o.grossAmount)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatTry(deductions)}
                      </td>
                      <td
                        className={
                          !hasCost
                            ? "px-4 py-3 text-muted-foreground"
                            : net >= 0
                              ? "px-4 py-3 font-semibold text-profit"
                              : "px-4 py-3 font-semibold text-loss"
                        }
                      >
                        {hasCost ? (
                          <>
                            {net >= 0 ? "+" : ""}
                            {formatTry(net)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            o.status === "RETURNED" || o.status === "CANCELLED"
                              ? "warn"
                              : !hasCost
                                ? "warn"
                                : net < 0
                                  ? "loss"
                                  : "default"
                          }
                        >
                          {orderStatusLabel[o.status] ?? o.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            total={rows.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      <OrderDetailDrawer
        order={selected}
        tariffMismatch={selectedMismatch}
        onClose={() => setSelectedId(null)}
      />
        </>
      )}
    </DashboardShell>
  );
}

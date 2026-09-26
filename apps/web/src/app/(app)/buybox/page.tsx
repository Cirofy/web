"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { estimateMargin } from "@/lib/profit-utils";
import {
  isExtensionBridgeMessage,
  pricingHrefForCapture,
  type ExtensionBridgeMessage,
} from "@/lib/extension-bridge";
import {
  loadBuyboxCapturesFromApi,
  pushBuyboxCapture,
  readBuyboxCaptures,
  type BuyboxCapture,
} from "@/lib/buybox-captures";
import {
  MarketplaceChannelFilter,
  MarketplaceLogo,
} from "@/components/marketplace-logo";
import { cn } from "@/lib/utils";
import { apiFetch, getToken } from "@/lib/api";
import { loadTariffMismatches, type TariffMismatchRow } from "@/lib/tariff-mismatches";

type BuyboxRow = {
  id: string;
  sku: string;
  title: string;
  marketplace: string;
  ourPrice: number;
  buyboxPrice: number;
  winner: string;
  competitorCount: number;
  ourRank: number;
  estimatedNetAtBuybox: number;
  live?: boolean;
  estimatedNetAtTariff?: number | null;
  estimatedNetAtPlus?: number | null;
  tariffNetDelta?: number | null;
  costPrice?: number;
  commissionRate?: number;
  shippingCost?: number;
  tariffMismatch?: {
    productId: string;
    currentRatePct: number;
    suggestedRatePct: number;
    suggestedPlusRatePct: number;
    deltaPct: number;
    tariffCategory: string;
  } | null;
};

function BuyboxInner() {
  const ready = usePageReady();
  const searchParams = useSearchParams();
  const [channel, setChannel] = useState<"all" | "Trendyol" | "Hepsiburada">("all");
  const [onlyLost, setOnlyLost] = useState(
    () => searchParams.get("onlyLost") === "1",
  );
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [focusSku, setFocusSku] = useState(() => searchParams.get("sku") ?? "");
  const [live, setLive] = useState<BuyboxCapture[]>([]);
  const [catalog, setCatalog] = useState<BuyboxRow[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [mismatchBySku, setMismatchBySku] = useState<
    Map<string, TariffMismatchRow>
  >(() => new Map());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("onlyLost") === "1") setOnlyLost(true);
    const sku = searchParams.get("sku");
    if (sku) setFocusSku(sku);
  }, [searchParams]);

  useEffect(() => {
    setLive(readBuyboxCaptures());
    void loadBuyboxCapturesFromApi().then(setLive);
    function onMessage(event: MessageEvent) {
      if (!isExtensionBridgeMessage(event.data)) return;
      const msg = event.data as ExtensionBridgeMessage;
      if (msg.type !== "cirofy.extension.buybox") return;
      setLive(
        pushBuyboxCapture({
          sku: msg.sku,
          marketplace: msg.marketplace,
          buyboxPrice: msg.buyboxPrice,
          ourPrice: msg.ourPrice,
          merchantName: msg.merchantName,
          winner: msg.winner,
          capturedAt: msg.capturedAt,
        }),
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [res, mismatches] = await Promise.all([
          apiFetch<{
            items: BuyboxRow[];
            captures?: BuyboxCapture[];
          }>("/buybox"),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        if (res.captures?.length) setLive(res.captures);
        if (res.items?.length) {
          setCatalog(res.items);
          setFromApi(true);
        }
        setMismatchBySku(mismatches.bySku);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const bySku = new Map(live.map((c) => [c.sku, c]));
    const base = catalog.map((r) => {
      const cap = bySku.get(r.sku);
      const mismatch =
        r.tariffMismatch ??
        (mismatchBySku.get(r.sku)
          ? {
              productId: mismatchBySku.get(r.sku)!.productId,
              currentRatePct: mismatchBySku.get(r.sku)!.currentRatePct,
              suggestedRatePct: mismatchBySku.get(r.sku)!.suggestedRatePct,
              suggestedPlusRatePct: mismatchBySku.get(r.sku)!.suggestedPlusRatePct,
              deltaPct: mismatchBySku.get(r.sku)!.deltaPct,
              tariffCategory: mismatchBySku.get(r.sku)!.tariffCategory,
            }
          : null);
      const buyboxPrice = cap?.buyboxPrice ?? r.buyboxPrice;
      const ourPrice = cap?.ourPrice ?? r.ourPrice;
      const winner = !cap
        ? r.winner
        : cap.winner === "us"
          ? ("Biz" as const)
          : cap.winner === "competitor"
            ? ("Rakip" as const)
            : ourPrice <= buyboxPrice + 0.01
              ? ("Biz" as const)
              : ("Rakip" as const);

      let estimatedNetAtBuybox = r.estimatedNetAtBuybox;
      let estimatedNetAtTariff = r.estimatedNetAtTariff ?? null;
      let tariffNetDelta = r.tariffNetDelta ?? null;

      if (
        mismatch &&
        r.costPrice != null &&
        r.commissionRate != null &&
        r.shippingCost != null
      ) {
        const atCurrent = estimateMargin({
          salePrice: buyboxPrice,
          costPrice: r.costPrice,
          commissionRate: r.commissionRate,
          shippingCost: r.shippingCost,
        });
        const atTariff = estimateMargin({
          salePrice: buyboxPrice,
          costPrice: r.costPrice,
          commissionRate: mismatch.suggestedRatePct / 100,
          shippingCost: r.shippingCost,
        });
        estimatedNetAtBuybox = atCurrent.net;
        estimatedNetAtTariff = atTariff.net;
        tariffNetDelta = Math.round((atTariff.net - atCurrent.net) * 100) / 100;
      } else if (mismatch && estimatedNetAtTariff == null) {
        // API net farkı yoksa yaklaşık: komisyon delta × fiyat
        const approx =
          Math.round(
            ((mismatch.currentRatePct - mismatch.suggestedRatePct) / 100) *
              buyboxPrice *
              100,
          ) / 100;
        estimatedNetAtTariff =
          Math.round((estimatedNetAtBuybox + approx) * 100) / 100;
        tariffNetDelta = approx;
      }

      return {
        ...r,
        buyboxPrice,
        ourPrice,
        winner,
        merchantName: cap?.merchantName,
        live: Boolean(cap) || Boolean(r.live),
        mismatch,
        estimatedNetAtBuybox,
        estimatedNetAtTariff,
        tariffNetDelta,
      };
    });

    return base.filter((r) => {
      if (channel !== "all" && r.marketplace !== channel) return false;
      if (onlyLost && r.winner !== "Rakip") return false;
      if (onlyMismatch && !r.mismatch) return false;
      if (focusSku && r.sku !== focusSku) return false;
      return true;
    });
  }, [catalog, channel, onlyLost, onlyMismatch, live, focusSku, mismatchBySku]);

  const lost = rows.filter((r) => r.winner === "Rakip").length;
  const won = rows.length - lost;
  const mismatchCount = rows.filter((r) => r.mismatch).length;
  const lostTariffDeltaSum = rows
    .filter((r) => r.winner === "Rakip" && r.tariffNetDelta != null)
    .reduce((s, r) => s + (r.tariffNetDelta ?? 0), 0);

  async function applyTariff(
    productId: string,
    sku: string,
    usePlus = false,
  ) {
    setApplyingId(productId + (usePlus ? ":plus" : ""));
    try {
      const res = await apiFetch<{ message: string }>("/tariffs/apply-product", {
        method: "POST",
        body: JSON.stringify({ productId, usePlus }),
      });
      setNote(
        res.message ??
          (usePlus ? "Plus tarife uygulandı." : "Tarife uygulandı."),
      );
      const next = await loadTariffMismatches();
      setMismatchBySku(next.bySku);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Tarife uygulanamadı.");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Buybox"
      description={
        fromApi
          ? "Kim kazanıyor, buybox neti ve tarife sapması — eklenti yakalaması fiyat motoruna gider."
          : "Kim kazanıyor, buybox fiyatında tahmini net — tarife sapması varsa düzeltin."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">Fiyat motoru</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Tarifeler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/extension">Eklenti</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          {note ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {note}
            </div>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">İzlenen</div>
                <div className="mt-1 font-display text-2xl font-bold">{rows.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Bizde</div>
                <div className="mt-1 font-display text-2xl font-bold text-profit">{won}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Rakipte</div>
                <div className="mt-1 font-display text-2xl font-bold text-loss">{lost}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife sapması</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {mismatchCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Kayıp · tarife Δ net</div>
                <div
                  className={
                    lostTariffDeltaSum >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {lostTariffDeltaSum >= 0 ? "+" : ""}
                  {formatTry(lostTariffDeltaSum)}
                </div>
              </CardContent>
            </Card>
          </div>

          {live.length > 0 ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground">
                  Eklentiden {live.length} yakalama — kaybedilenlerde fiyat önerisine geçin.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/extension">Köprü durumu</Link>
                </Button>
              </div>
              <ul className="mt-2 space-y-2">
                {live.slice(0, 5).map((c) => (
                  <li
                    key={`${c.sku}-${c.capturedAt}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{c.sku}</span>
                      <MarketplaceLogo marketplace={c.marketplace} height={12} />
                      {c.winner ? (
                        <Badge tone={c.winner === "us" ? "profit" : "loss"}>
                          {c.winner === "us" ? "Biz" : "Rakip"}
                        </Badge>
                      ) : null}
                      {c.merchantName ? (
                        <span className="text-xs text-muted-foreground">
                          Satıcı: {c.merchantName}
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatTry(c.buyboxPrice)}
                      </span>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={pricingHrefForCapture({
                          ...c,
                          tariff: Boolean(mismatchBySku.get(c.sku)),
                        })}
                      >
                        Fiyata öner
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <MarketplaceChannelFilter
            className="mb-4"
            variant="buttons"
            value={channel}
            onChange={setChannel}
            extra={
              <>
                <button
                  type="button"
                  aria-pressed={onlyLost}
                  onClick={() => setOnlyLost((v) => !v)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors",
                    onlyLost
                      ? "border-transparent bg-profit text-white"
                      : "border-border bg-card text-foreground hover:bg-muted/40",
                  )}
                >
                  Sadece kaybedilenler
                </button>
                <button
                  type="button"
                  aria-pressed={onlyMismatch}
                  onClick={() => setOnlyMismatch((v) => !v)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors",
                    onlyMismatch
                      ? "border-transparent bg-profit text-white"
                      : "border-border bg-card text-foreground hover:bg-muted/40",
                  )}
                >
                  Tarife sapması
                </button>
              </>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle>Buybox listesi</CardTitle>
              <CardDescription>
                Buybox fiyatına inersen tahmini net — fiyat motoruna geçip öneriyi uygula.
                {fromApi ? " · canlı katalog" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{r.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.sku} ·{" "}
                          <MarketplaceLogo
                            marketplace={r.marketplace}
                            height={12}
                            className="align-middle"
                          />
                          {r.live ? " · canlı" : null}
                          {"merchantName" in r && r.merchantName
                            ? ` · ${r.merchantName}`
                            : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge tone={r.winner === "Biz" ? "profit" : "loss"}>
                          {r.winner === "Biz" ? "Bizde" : "Rakipte"}
                        </Badge>
                        {r.mismatch ? (
                          <Badge tone="warn">Tarife sapması</Badge>
                        ) : null}
                      </div>
                    </div>
                    {r.mismatch ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Komisyon %{r.mismatch.currentRatePct} → tarife %
                        {r.mismatch.suggestedRatePct} ({r.mismatch.tariffCategory})
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Bizim fiyat</div>
                        <div className="font-medium">{formatTry(r.ourPrice)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Buybox</div>
                        <div className="font-medium">{formatTry(r.buyboxPrice)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Sıra</div>
                        <div className="font-medium">
                          #{r.ourRank} / {r.competitorCount}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Buybox net</div>
                        <div className="font-semibold text-profit">
                          {formatTry(r.estimatedNetAtBuybox)}
                        </div>
                      </div>
                      {r.winner === "Rakip" && r.tariffNetDelta != null ? (
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground">
                            Tarife net farkı (@ buybox)
                          </div>
                          <div
                            className={
                              r.tariffNetDelta >= 0
                                ? "font-semibold text-profit"
                                : "font-semibold text-loss"
                            }
                          >
                            {r.tariffNetDelta >= 0 ? "+" : ""}
                            {formatTry(r.tariffNetDelta)}
                            {r.estimatedNetAtTariff != null
                              ? ` → ${formatTry(r.estimatedNetAtTariff)}`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {r.mismatch ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={!!applyingId}
                            onClick={() =>
                              void applyTariff(r.mismatch!.productId, r.sku, false)
                            }
                          >
                            {applyingId === r.mismatch.productId
                              ? "Uygulanıyor…"
                              : "Tarifeyi uygula"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={!!applyingId}
                            onClick={() =>
                              void applyTariff(r.mismatch!.productId, r.sku, true)
                            }
                          >
                            {applyingId === `${r.mismatch.productId}:plus`
                              ? "Uygulanıyor…"
                              : `Plus · %${r.mismatch.suggestedPlusRatePct}`}
                          </Button>
                        </>
                      ) : null}
                      <Button asChild size="sm" variant="outline" className="w-full">
                        <Link
                          href={pricingHrefForCapture({
                            sku: r.sku,
                            buyboxPrice: r.buyboxPrice,
                            tariff: Boolean(r.mismatch),
                          })}
                        >
                          Fiyata öner
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Kanal</th>
                      <th className="px-4 py-3 font-medium">Bizim</th>
                      <th className="px-4 py-3 font-medium">Buybox</th>
                      <th className="px-4 py-3 font-medium">Durum</th>
                      <th className="px-4 py-3 font-medium">Tarife</th>
                      <th className="px-4 py-3 font-medium">Sıra</th>
                      <th className="px-4 py-3 font-medium">Buybox’ta net</th>
                      <th className="px-4 py-3 font-medium">Tarife Δ net</th>
                      <th className="px-4 py-3 font-medium">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.sku}
                            {r.live ? " · canlı" : null}
                            {"merchantName" in r && r.merchantName
                              ? ` · ${r.merchantName}`
                              : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <MarketplaceLogo marketplace={r.marketplace} height={16} />
                        </td>
                        <td className="px-4 py-3">{formatTry(r.ourPrice)}</td>
                        <td className="px-4 py-3 font-medium">{formatTry(r.buyboxPrice)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={r.winner === "Biz" ? "profit" : "loss"}>
                            {r.winner === "Biz" ? "Bizde" : "Rakipte"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {r.mismatch ? (
                            <div className="space-y-1">
                              <Badge tone="warn">Sapma</Badge>
                              <div className="text-xs text-muted-foreground">
                                %{r.mismatch.currentRatePct} → %
                                {r.mismatch.suggestedRatePct}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Uyumlu</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          #{r.ourRank} / {r.competitorCount}
                        </td>
                        <td className="px-4 py-3 font-semibold text-profit">
                          {formatTry(r.estimatedNetAtBuybox)}
                        </td>
                        <td className="px-4 py-3">
                          {r.winner === "Rakip" && r.tariffNetDelta != null ? (
                            <div>
                              <div
                                className={
                                  r.tariffNetDelta >= 0
                                    ? "font-semibold text-profit"
                                    : "font-semibold text-loss"
                                }
                              >
                                {r.tariffNetDelta >= 0 ? "+" : ""}
                                {formatTry(r.tariffNetDelta)}
                              </div>
                              {r.estimatedNetAtTariff != null ? (
                                <div className="text-xs text-muted-foreground">
                                  @ tarife {formatTry(r.estimatedNetAtTariff)}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {r.mismatch ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!!applyingId}
                                  onClick={() =>
                                    void applyTariff(
                                      r.mismatch!.productId,
                                      r.sku,
                                      false,
                                    )
                                  }
                                >
                                  {applyingId === r.mismatch.productId
                                    ? "…"
                                    : "Tarife"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!!applyingId}
                                  onClick={() =>
                                    void applyTariff(
                                      r.mismatch!.productId,
                                      r.sku,
                                      true,
                                    )
                                  }
                                >
                                  {applyingId === `${r.mismatch.productId}:plus`
                                    ? "…"
                                    : "Plus"}
                                </Button>
                              </>
                            ) : null}
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={pricingHrefForCapture({
                                  sku: r.sku,
                                  buyboxPrice: r.buyboxPrice,
                                  tariff: Boolean(r.mismatch),
                                })}
                              >
                                Fiyata öner
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
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

export default function BuyboxPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <BuyboxInner />
    </Suspense>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cable } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { MarketplaceLogo } from "@/components/marketplace-logo";
import { formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { toast } from "@/components/ui/toast";
import {
  EXTENSION_BRIDGE_VERSION,
  isBridgeStale,
  isExtensionBridgeMessage,
  pricingHrefForCapture,
  type ExtensionBridgeMessage,
} from "@/lib/extension-bridge";
import {
  applyTariffForProduct,
  loadBuyboxCapturesFromApi,
  pushBuyboxCaptureWithTariff,
  resolveTariffForCapture,
  syncTariffToExtension,
  type BuyboxCapture,
  type TariffMatch,
} from "@/lib/buybox-captures";

export default function ExtensionPage() {
  const ready = usePageReady();
  const [status, setStatus] = useState<"waiting" | "linked" | "stale">("waiting");
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [extVersion, setExtVersion] = useState<number | null>(null);
  const [captures, setCaptures] = useState<BuyboxCapture[]>([]);
  const [tariffBySku, setTariffBySku] = useState<Record<string, TariffMatch>>(
    {},
  );
  const [applyingSku, setApplyingSku] = useState<string | null>(null);
  
  useEffect(() => {
    void loadBuyboxCapturesFromApi().then(async (caps) => {
      setCaptures(caps);
      const entries = await Promise.all(
        caps.slice(0, 8).map(async (c) => {
          const match = await resolveTariffForCapture(c.sku, c.marketplace);
          return match ? ([c.sku, match] as const) : null;
        }),
      );
      const next: Record<string, TariffMatch> = {};
      for (const e of entries) {
        if (e) {
          next[e[0]] = e[1];
          syncTariffToExtension(e[0], e[1]);
        }
      }
      if (Object.keys(next).length) setTariffBySku((prev) => ({ ...prev, ...next }));
    });
    window.postMessage({ type: "cirofy.extension.request-last" }, "*");
    window.postMessage({ type: "cirofy.extension.request-status" }, "*");

    function onMessage(event: MessageEvent) {
      if (!isExtensionBridgeMessage(event.data)) return;
      const msg = event.data as ExtensionBridgeMessage;
      if (msg.type === "cirofy.extension.hello") {
        setStatus("linked");
        setExtVersion(msg.version);
        toast(msg.version >= EXTENSION_BRIDGE_VERSION
            ? "Eklenti bağlandı."
            : `Eklenti bağlandı — güncelleme önerilir (panel v${EXTENSION_BRIDGE_VERSION}).`,);
        window.postMessage(
          { type: "cirofy.panel.ack", ok: true, message: "panel hazır" },
          "*",
        );
      }
      if (msg.type === "cirofy.extension.status") {
        setStatus("linked");
        setExtVersion(msg.version);
        if (typeof msg.captureCount === "number" && msg.captureCount > 0) {
          toast(`Eklentide ${msg.captureCount} yakalama kaydı var.`);
        }
      }
      if (msg.type === "cirofy.extension.ping") {
        setLastPing(msg.at);
        setStatus("linked");
      }
      if (msg.type === "cirofy.extension.buybox") {
        const cap = {
          sku: msg.sku,
          marketplace: msg.marketplace,
          buyboxPrice: msg.buyboxPrice,
          ourPrice: msg.ourPrice,
          merchantName: msg.merchantName,
          winner: msg.winner,
          capturedAt: msg.capturedAt,
        };
        void pushBuyboxCaptureWithTariff(cap).then(({ captures: next, tariffMatch }) => {
          setCaptures(next.slice(0, 20));
          const match = tariffMatch;
          if (match) {
            setTariffBySku((prev) => ({ ...prev, [cap.sku]: match }));
          }
          if (msg.preferPlus) {
            const plus =
              match?.tariff?.plusRatePct ??
              msg.tariff?.plusRatePct ??
              null;
            toast(plus != null
                ? `Plus önerisi: ${msg.sku} · %${plus} — buybox’tan Plus uygula`
                : `Plus önerisi alındı: ${msg.sku}`,);
          } else if (match) {
            toast(match.mismatch
                ? `Buybox yakalandı: ${msg.sku} — ${match.message}`
                : `Buybox yakalandı: ${msg.sku}`,);
          } else {
            toast(`Buybox yakalandı: ${msg.sku}`);
          }
        });
        setStatus("linked");
        window.postMessage({ type: "cirofy.panel.ack", ok: true }, "*");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (status === "waiting") return;
      setStatus(isBridgeStale(lastPing) && lastPing ? "stale" : "linked");
    }, 15_000);
    return () => window.clearInterval(id);
  }, [lastPing, status]);

  function requestLast() {
    window.postMessage({ type: "cirofy.extension.request-last" }, "*");
    window.postMessage({ type: "cirofy.extension.request-status" }, "*");
    toast("Son yakalama istendi.");
  }

  async function applyTariff(sku: string) {
    const match = tariffBySku[sku];
    if (!match?.product?.id || !match.tariff) return;
    setApplyingSku(sku);
    try {
      const res = await applyTariffForProduct(match.product.id, false);
      if (res) {
        toast(res.message);
        const refreshed = await resolveTariffForCapture(
          sku,
          match.product.marketplace,
        );
        if (refreshed) {
          setTariffBySku((prev) => ({ ...prev, [sku]: refreshed }));
        }
      } else {
        toast("Tarife uygulanamadı — giriş gerekli olabilir.");
      }
    } finally {
      setApplyingSku(null);
    }
  }

  const statusLabel =
    status === "linked" ? "Bağlı" : status === "stale" ? "Zayıf sinyal" : "Bekliyor";
  const statusTone =
    status === "linked" ? "profit" : status === "stale" ? "warn" : "warn";

  return (
    <DashboardShell
      loading={!ready}
      title="Eklenti köprüsü"
      description="Trendyol / Hepsiburada ürün sayfasından yakalanan buybox paneline düşer; tarife sapması anında görülür."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/buybox">Buybox</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Tarifeler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">Fiyat</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Durum</div>
                <div className="mt-2 flex items-center gap-2">
                  <Cable className="h-4 w-4" />
                  <Badge tone={statusTone}>{statusLabel}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Protokol</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  v{extVersion ?? EXTENSION_BRIDGE_VERSION}
                </div>
                {extVersion != null && extVersion < EXTENSION_BRIDGE_VERSION ? (
                  <div className="mt-1 text-xs text-amber-700">Panel v{EXTENSION_BRIDGE_VERSION}</div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Yakalanan</div>
                <div className="mt-1 font-display text-2xl font-bold">{captures.length}</div>
                {lastPing ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Son ping {new Date(lastPing).toLocaleTimeString("tr-TR")}
                    {isBridgeStale(lastPing) ? " · gecikmeli" : ""}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={requestLast}>
              Son yakalamayı iste
            </Button>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Eklentiyi yükle</CardTitle>
              <CardDescription>
                Tarayıcıda geliştirici modunu açıp paketlenmemiş eklenti klasörünü yükleyin.
                Ürün sayfasında fiyatı yakalayın; bu panel sekmesinde otomatik düşer.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Popup’tan “Yeniden yakala” veya “Panele gönder” ile sinyal tazelenir. Buybox
              kaybedildiyse tarife sapmasını düzeltip fiyat motoruna geçin.
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Köprü sinyalleri</CardTitle>
                <CardDescription>
                  Bağlantı, canlılık pingsi ve buybox yakalama — panel bu sinyalleri dinler.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Bağlantı bildirimi</div>
                <div>Canlılık pingsi</div>
                <div>Buybox yakalama</div>
                <div>Tarife eşlemesi</div>
                <div>Panel onayı</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Yakalanan buybox</CardTitle>
                <CardDescription>
                  Son sinyaller — tarife sapması ve fiyat önerisi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {captures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Henüz yakalama yok.</p>
                ) : (
                  captures.map((c, i) => {
                    const match = tariffBySku[c.sku];
                    return (
                      <div
                        key={`${c.sku}-${c.capturedAt}-${i}`}
                        className="rounded-xl border border-border p-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{c.sku}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {c.winner ? (
                              <Badge tone={c.winner === "us" ? "profit" : "loss"}>
                                {c.winner === "us" ? "Biz" : "Rakip"}
                              </Badge>
                            ) : null}
                            {match?.mismatch ? (
                              <Badge tone="warn">Tarife sapması</Badge>
                            ) : match?.tariff ? (
                              <Badge tone="profit">Tarife uyumlu</Badge>
                            ) : null}
                            <MarketplaceLogo marketplace={c.marketplace} height={14} />
                          </div>
                        </div>
                        {c.merchantName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Satıcı: {c.merchantName}
                          </p>
                        ) : null}
                        {match?.message ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {match.message}
                            {match.product
                              ? ` · mevcut %${match.product.currentRatePct}`
                              : null}
                          </p>
                        ) : null}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Buybox</div>
                            <div className="font-medium">{formatTry(c.buyboxPrice)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Satıcı fiyatı</div>
                            <div className="font-medium">
                              {c.ourPrice != null ? formatTry(c.ourPrice) : "—"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.capturedAt).toLocaleString("tr-TR")}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {match?.mismatch && match.product?.id ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={applyingSku === c.sku}
                                onClick={() => void applyTariff(c.sku)}
                              >
                                {applyingSku === c.sku
                                  ? "Uygulanıyor…"
                                  : "Tarifeyi uygula"}
                              </Button>
                            ) : null}
                            <Button asChild size="sm" variant="outline">
                              <Link href={pricingHrefForCapture(c)}>Fiyata öner</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

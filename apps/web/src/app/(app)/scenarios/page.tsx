"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { simulateScenario } from "@/lib/profit-utils";
import { apiFetch, getToken } from "@/lib/api";

type CatalogProduct = {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  brand: string;
  returnRatePct: number;
  category: string;
  costPrice: number;
  costVatRate: number;
  desi: number;
  salePrice: number;
  commissionRate: number;
  shippingCost: number;
  stock: number;
  isActive: boolean;
  marketplace: string;
};

function formatSignedPts(v: number | undefined | null) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n}p`;
}

function formatSignedTry(v: number | undefined | null) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${formatTry(n)}`;
}

type ApiProduct = {
  id: string;
  title: string;
  sku: string | null;
  costPrice: number;
  salePrice: number;
  commissionRate: number;
  shippingCost: number;
  store?: { marketplace: string };
};

function mapProduct(p: ApiProduct): CatalogProduct {
  return {
    id: p.id,
    title: p.title,
    sku: p.sku ?? "",
    barcode: "",
    brand: "—",
    returnRatePct: 0,
    category: "Diğer",
    costPrice: Number(p.costPrice) || 0,
    costVatRate: 20,
    desi: 1,
    salePrice: Number(p.salePrice) || 0,
    commissionRate: Number(p.commissionRate) || 0,
    shippingCost: Number(p.shippingCost) || 0,
    stock: 0,
    isActive: true,
    marketplace:
      p.store?.marketplace === "HEPSIBURADA" ? "Hepsiburada" : "Trendyol",
  };
}

export default function ScenariosPage() {
  const ready = usePageReady();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [productId, setProductId] = useState("");
  const [commissionDeltaPts, setCommissionDeltaPts] = useState(2);
  const [shippingDelta, setShippingDelta] = useState(10);
  const [flashDiscountPct, setFlashDiscountPct] = useState(10);
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState<
    Array<{
      id: string;
      name: string;
      productId: string | null;
      productTitle: string | null;
      commissionDeltaPts: number;
      shippingDelta: number;
      flashDiscountPct: number;
      snapshot?: { deltaNet?: number; totalDelta?: number } | null;
    }>
  >([]);
  const [compareLeft, setCompareLeft] = useState<string>("");
  const [compareRight, setCompareRight] = useState<string>("");
  const [compareResult, setCompareResult] = useState<{
    left: {
      saved: {
        name: string;
        commissionDeltaPts?: number;
        shippingDelta?: number;
        flashDiscountPct?: number;
        scope?: string;
      };
      deltaNet: number;
      scope: string;
      plus?: {
        plusRatePct: number | null;
        currentRatePct: number | null;
        plusDeltaPts: number | null;
        plusDeltaNet: number | null;
        synced: boolean;
      };
    };
    right: {
      saved: {
        name: string;
        commissionDeltaPts?: number;
        shippingDelta?: number;
        flashDiscountPct?: number;
        scope?: string;
      };
      deltaNet: number;
      scope: string;
      plus?: {
        plusRatePct: number | null;
        currentRatePct: number | null;
        plusDeltaPts: number | null;
        plusDeltaNet: number | null;
        synced: boolean;
      };
    };
    deltaNetDiff: number;
    winner: "left" | "right" | "tie";
  } | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<
    Array<{
      id: string;
      leftId: string;
      rightId: string;
      leftName: string;
      rightName: string;
      deltaNetDiff: number;
      winner: "left" | "right" | "tie";
      message: string;
      createdAt: string;
    }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadSaved() {
    if (!getToken()) return;
    try {
      const res = await apiFetch<{ items: typeof saved }>("/scenarios/saved");
      setSaved(res.items ?? []);
    } catch {
      // sessiz
    }
  }

  async function loadComparisons() {
    if (!getToken()) return;
    try {
      const res = await apiFetch<{ items: typeof comparisonHistory }>(
        "/scenarios/comparisons",
      );
      setComparisonHistory(res.items ?? []);
    } catch {
      // sessiz
    }
  }

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiFetch<ApiProduct[]>("/products?limit=5000");
        if (cancelled || !rows?.length) return;
        const mapped = rows.map(mapProduct);
        setProducts(mapped);
        setProductId(mapped[0]!.id);
        setFromApi(true);
      } catch {
      }
      if (!cancelled) {
        await loadSaved();
        await loadComparisons();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const product = products.find((p) => p.id === productId) ?? products[0]!;

  const result = useMemo(
    () =>
      simulateScenario(product, {
        commissionDeltaPts,
        shippingDelta,
        flashDiscountPct,
      }),
    [product, commissionDeltaPts, shippingDelta, flashDiscountPct],
  );

  const catalogImpact = useMemo(() => {
    return products.map((p) => {
      const s = simulateScenario(p, {
        commissionDeltaPts,
        shippingDelta,
        flashDiscountPct,
      });
      return { id: p.id, title: p.title, marketplace: p.marketplace, ...s };
    });
  }, [products, commissionDeltaPts, shippingDelta, flashDiscountPct]);

  const totalDelta = catalogImpact.reduce((s, r) => s + r.deltaNet, 0);

  async function saveScenario(scope: "product" | "catalog") {
    const name =
      saveName.trim() ||
      (scope === "product"
        ? `${product.title.slice(0, 28)} · flaş %${flashDiscountPct}`
        : `Katalog · flaş %${flashDiscountPct}`);
    if (!getToken()) {
      const local = {
        id: `local-${Date.now()}`,
        name,
        productId: scope === "product" ? productId : null,
        productTitle: scope === "product" ? product.title : null,
        commissionDeltaPts,
        shippingDelta,
        flashDiscountPct,
        snapshot: {
          deltaNet: scope === "product" ? result.deltaNet : totalDelta,
        },
      };
      setSaved((prev) => [local, ...prev].slice(0, 20));
      setMsg("Senaryo yerel kaydedildi.");
      setSaveName("");
      return;
    }
    setBusy(true);
    try {
      const row = await apiFetch<(typeof saved)[number]>("/scenarios/saved", {
        method: "POST",
        body: JSON.stringify({
          name,
          productId: scope === "product" ? productId : undefined,
          commissionDeltaPts,
          shippingDelta,
          flashDiscountPct,
        }),
      });
      setSaved((prev) => [row, ...prev.filter((s) => s.id !== row.id)]);
      setMsg(`“${row.name}” kaydedildi.`);
      setSaveName("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Kayıt başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSaved(id: string) {
    if (!getToken()) {
      setSaved((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    try {
      await apiFetch(`/scenarios/saved/${id}`, { method: "DELETE" });
      setSaved((prev) => prev.filter((s) => s.id !== id));
      if (compareLeft === id) setCompareLeft("");
      if (compareRight === id) setCompareRight("");
      setCompareResult(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Silinemedi.");
    }
  }

  function applySaved(id: string) {
    const row = saved.find((s) => s.id === id);
    if (!row) return;
    setCommissionDeltaPts(row.commissionDeltaPts);
    setShippingDelta(row.shippingDelta);
    setFlashDiscountPct(row.flashDiscountPct);
    if (row.productId && products.some((p) => p.id === row.productId)) {
      setProductId(row.productId);
    }
    setMsg(`“${row.name}” varsayımları yüklendi.`);
  }

  async function runCompare() {
    if (!compareLeft || !compareRight || compareLeft === compareRight) {
      setMsg("Karşılaştırma için iki farklı senaryo seçin.");
      return;
    }
    if (!getToken()) {
      const left = saved.find((s) => s.id === compareLeft);
      const right = saved.find((s) => s.id === compareRight);
      if (!left || !right) return;
      const leftNet = left.snapshot?.deltaNet ?? left.snapshot?.totalDelta ?? 0;
      const rightNet = right.snapshot?.deltaNet ?? right.snapshot?.totalDelta ?? 0;
      const deltaNetDiff = Math.round((leftNet - rightNet) * 100) / 100;
      setCompareResult({
        left: {
          saved: {
            name: left.name,
            commissionDeltaPts: left.commissionDeltaPts,
            shippingDelta: left.shippingDelta,
            flashDiscountPct: left.flashDiscountPct,
          },
          deltaNet: leftNet,
          scope: left.productId ? "product" : "catalog",
        },
        right: {
          saved: {
            name: right.name,
            commissionDeltaPts: right.commissionDeltaPts,
            shippingDelta: right.shippingDelta,
            flashDiscountPct: right.flashDiscountPct,
          },
          deltaNet: rightNet,
          scope: right.productId ? "product" : "catalog",
        },
        deltaNetDiff,
        winner:
          Math.abs(deltaNetDiff) < 0.005
            ? "tie"
            : deltaNetDiff > 0
              ? "left"
              : "right",
      });
      setMsg(
        Math.abs(deltaNetDiff) < 0.005
          ? "Senaryolar net değişimde eşdeğer."
          : deltaNetDiff > 0
            ? `“${left.name}” daha iyi net değişim.`
            : `“${right.name}” daha iyi net değişim.`,
      );
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{
        left: {
          saved: {
            name: string;
            commissionDeltaPts?: number;
            shippingDelta?: number;
            flashDiscountPct?: number;
          };
          deltaNet: number;
          scope: string;
        };
        right: {
          saved: {
            name: string;
            commissionDeltaPts?: number;
            shippingDelta?: number;
            flashDiscountPct?: number;
          };
          deltaNet: number;
          scope: string;
        };
        deltaNetDiff: number;
        winner?: "left" | "right" | "tie";
        message?: string;
      }>("/scenarios/compare", {
        method: "POST",
        body: JSON.stringify({ leftId: compareLeft, rightId: compareRight }),
      });
      const winner: "left" | "right" | "tie" =
        res.winner ??
        (Math.abs(res.deltaNetDiff) < 0.005
          ? "tie"
          : res.deltaNetDiff > 0
            ? "left"
            : "right");
      setCompareResult({ ...res, winner });
      setMsg(
        res.message ??
          (winner === "tie"
            ? "Senaryolar net değişimde eşdeğer."
            : winner === "left"
              ? `“${res.left.saved.name}” daha iyi net değişim.`
              : `“${res.right.saved.name}” daha iyi net değişim.`),
      );
      await loadComparisons();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Karşılaştırma başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Senaryo"
      description={
        fromApi
          ? "Komisyon + puan, kargo +₺ veya flaş indirim — canlı katalog üzerinde etki."
          : "Komisyon + puan, kargo +₺ veya flaş indirim olursa net kâr ne olur?"
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">Fiyat motoru</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/promotions">Teklifler</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          {msg ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {msg}
            </div>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Baz net</div>
                <div
                  className={
                    result.base.net >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {formatTry(result.base.net)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Senaryo net</div>
                <div
                  className={
                    result.next.net >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {formatTry(result.next.net)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Fark (ürün)</div>
                <div
                  className={
                    result.deltaNet >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {result.deltaNet >= 0 ? "+" : ""}
                  {formatTry(result.deltaNet)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Marj {result.deltaMarginPts >= 0 ? "+" : ""}
                  {result.deltaMarginPts} puan
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Varsayımlar</CardTitle>
              <CardDescription>
                {fromApi
                  ? "Canlı katalog. Kaydırıcılar tek ürüne ve katalog özetine aynı anda uygulanır."
                  : "Mağaza bağlandıktan sonra ürünler burada görünür. Kaydırıcılar tek ürüne ve katalog özetine aynı anda uygulanır."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label className="text-sm font-medium" htmlFor="scenario-product">
                  Ürün
                </label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger id="scenario-product" aria-label="Ürün">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="comm-delta">
                  Komisyon +puan
                </label>
                <input
                  id="comm-delta"
                  type="number"
                  step={0.5}
                  value={commissionDeltaPts}
                  onChange={(e) => setCommissionDeltaPts(Number(e.target.value) || 0)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!fromApi || busy}
                  onClick={() => {
                    void (async () => {
                      if (!getToken() || !productId) return;
                      setBusy(true);
                      setMsg(null);
                      try {
                        const res = await apiFetch<{
                          product?: { currentRatePct?: number };
                          tariff?: { plusRatePct?: number; ratePct?: number } | null;
                          message?: string;
                        }>(
                          `/tariffs/resolve?productId=${encodeURIComponent(productId)}`,
                        );
                        if (
                          res.tariff?.plusRatePct == null ||
                          res.product?.currentRatePct == null
                        ) {
                          setMsg(res.message ?? "Plus tarife bulunamadı.");
                          return;
                        }
                        const pts =
                          Math.round(
                            (res.tariff.plusRatePct - res.product.currentRatePct) *
                              100,
                          ) / 100;
                        setCommissionDeltaPts(pts);
                        setMsg(
                          `Plus senkron · %${res.product.currentRatePct} → %${res.tariff.plusRatePct} (${pts >= 0 ? "+" : ""}${pts}p)`,
                        );
                      } catch (err) {
                        setMsg(
                          err instanceof Error
                            ? err.message
                            : "Plus senkron başarısız.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Plus tarifeyi senkronla
                </Button>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ship-delta">
                  Kargo +₺
                </label>
                <input
                  id="ship-delta"
                  type="number"
                  value={shippingDelta}
                  onChange={(e) => setShippingDelta(Number(e.target.value) || 0)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="flash-pct">
                  Flaş indirim %
                </label>
                <input
                  id="flash-pct"
                  type="number"
                  min={0}
                  max={80}
                  value={flashDiscountPct}
                  onChange={(e) => setFlashDiscountPct(Number(e.target.value) || 0)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Kaydet & karşılaştır</CardTitle>
              <CardDescription>
                Varsayımları isimle saklayın; iki senaryoyu yan yana net fark ile kıyaslayın.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="scenario-name">
                    Senaryo adı
                  </label>
                  <input
                    id="scenario-name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Örn. Flaş %15 + kargo +10"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void saveScenario("product")}
                  >
                    Ürünü kaydet
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void saveScenario("catalog")}
                  >
                    Kataloğu kaydet
                  </Button>
                </div>
              </div>

              {saved.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Kayıtlı senaryolar</div>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {saved.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.productTitle ?? "Katalog"} · komisyon +
                            {s.commissionDeltaPts}p · kargo +{s.shippingDelta}₺ · flaş %
                            {s.flashDiscountPct}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySaved(s.id)}
                          >
                            Yükle
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void deleteSaved(s.id)}
                          >
                            Sil
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Henüz kayıt yok — mevcut varsayımları kaydederek başlayın.
                </p>
              )}

              {saved.length >= 2 ? (
                <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3 sm:items-end">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Senaryo A</label>
                    <Select value={compareLeft || undefined} onValueChange={setCompareLeft}>
                      <SelectTrigger aria-label="Senaryo A">
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {saved.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Senaryo B</label>
                    <Select
                      value={compareRight || undefined}
                      onValueChange={setCompareRight}
                    >
                      <SelectTrigger aria-label="Senaryo B">
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {saved.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => void runCompare()}
                  >
                    Karşılaştır
                  </Button>
                </div>
              ) : null}

              {compareResult ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Sonuç</span>
                    <Badge
                      tone={
                        compareResult.winner === "tie"
                          ? "default"
                          : "profit"
                      }
                    >
                      {compareResult.winner === "tie"
                        ? "Eşdeğer"
                        : compareResult.winner === "left"
                          ? `Kazanan: ${compareResult.left.saved.name}`
                          : `Kazanan: ${compareResult.right.saved.name}`}
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div
                      className={
                        compareResult.winner === "left"
                          ? "rounded-xl border border-profit/40 bg-profit/5 p-4"
                          : "rounded-xl border border-border p-4"
                      }
                    >
                      <div className="text-xs text-muted-foreground">
                        A · {compareResult.left.saved.name}
                      </div>
                      <div
                        className={
                          compareResult.left.deltaNet >= 0
                            ? "mt-1 font-display text-xl font-bold text-profit"
                            : "mt-1 font-display text-xl font-bold text-loss"
                        }
                      >
                        {compareResult.left.deltaNet >= 0 ? "+" : ""}
                        {formatTry(compareResult.left.deltaNet)}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Komisyon +{compareResult.left.saved.commissionDeltaPts ?? "—"}p
                        · kargo +{compareResult.left.saved.shippingDelta ?? "—"}₺
                        · flaş %{compareResult.left.saved.flashDiscountPct ?? "—"}
                      </p>
                    </div>
                    <div
                      className={
                        compareResult.winner === "right"
                          ? "rounded-xl border border-profit/40 bg-profit/5 p-4"
                          : "rounded-xl border border-border p-4"
                      }
                    >
                      <div className="text-xs text-muted-foreground">
                        B · {compareResult.right.saved.name}
                      </div>
                      <div
                        className={
                          compareResult.right.deltaNet >= 0
                            ? "mt-1 font-display text-xl font-bold text-profit"
                            : "mt-1 font-display text-xl font-bold text-loss"
                        }
                      >
                        {compareResult.right.deltaNet >= 0 ? "+" : ""}
                        {formatTry(compareResult.right.deltaNet)}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Komisyon +{compareResult.right.saved.commissionDeltaPts ?? "—"}p
                        · kargo +{compareResult.right.saved.shippingDelta ?? "—"}₺
                        · flaş %{compareResult.right.saved.flashDiscountPct ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <div className="text-xs text-muted-foreground">A − B fark</div>
                      <div
                        className={
                          compareResult.deltaNetDiff >= 0
                            ? "mt-1 font-display text-xl font-bold text-profit"
                            : "mt-1 font-display text-xl font-bold text-loss"
                        }
                      >
                        {compareResult.deltaNetDiff >= 0 ? "+" : ""}
                        {formatTry(compareResult.deltaNetDiff)}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Pozitif = A daha iyi net değişim
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Kalem</th>
                          <th className="px-3 py-2 font-medium">A</th>
                          <th className="px-3 py-2 font-medium">B</th>
                          <th className="px-3 py-2 font-medium">Fark</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2 font-medium">Net Δ</td>
                          <td className="px-3 py-2">
                            {compareResult.left.deltaNet >= 0 ? "+" : ""}
                            {formatTry(compareResult.left.deltaNet)}
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.right.deltaNet >= 0 ? "+" : ""}
                            {formatTry(compareResult.right.deltaNet)}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {compareResult.deltaNetDiff >= 0 ? "+" : ""}
                            {formatTry(compareResult.deltaNetDiff)}
                          </td>
                        </tr>
                        <tr className="border-t border-border bg-amber-50/40">
                          <td className="px-3 py-2 font-medium">
                            Tarife
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (komisyon puanı)
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {formatSignedPts(
                              compareResult.left.saved.commissionDeltaPts,
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {formatSignedPts(
                              compareResult.right.saved.commissionDeltaPts,
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatSignedPts(
                              (compareResult.left.saved.commissionDeltaPts ?? 0) -
                                (compareResult.right.saved.commissionDeltaPts ?? 0),
                            )}
                          </td>
                        </tr>
                        <tr className="border-t border-border bg-muted/30">
                          <td className="px-3 py-2 font-medium">
                            Plus
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (tarife Δ)
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.left.plus?.plusDeltaPts != null ? (
                              <>
                                {formatSignedPts(compareResult.left.plus.plusDeltaPts)}
                                {compareResult.left.plus.synced ? (
                                  <span className="ml-1 text-xs text-profit">
                                    senkron
                                  </span>
                                ) : (
                                  <span className="ml-1 text-xs text-amber-700">
                                    sapma
                                  </span>
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.right.plus?.plusDeltaPts != null ? (
                              <>
                                {formatSignedPts(
                                  compareResult.right.plus.plusDeltaPts,
                                )}
                                {compareResult.right.plus.synced ? (
                                  <span className="ml-1 text-xs text-profit">
                                    senkron
                                  </span>
                                ) : (
                                  <span className="ml-1 text-xs text-amber-700">
                                    sapma
                                  </span>
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {compareResult.left.plus?.plusDeltaPts != null &&
                            compareResult.right.plus?.plusDeltaPts != null
                              ? formatSignedPts(
                                  compareResult.left.plus.plusDeltaPts -
                                    compareResult.right.plus.plusDeltaPts,
                                )
                              : "—"}
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2 font-medium">
                            Plus net Δ
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (yalnız Plus)
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.left.plus?.plusDeltaNet != null
                              ? `${compareResult.left.plus.plusDeltaNet >= 0 ? "+" : ""}${formatTry(compareResult.left.plus.plusDeltaNet)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.right.plus?.plusDeltaNet != null
                              ? `${compareResult.right.plus.plusDeltaNet >= 0 ? "+" : ""}${formatTry(compareResult.right.plus.plusDeltaNet)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {compareResult.left.plus?.plusDeltaNet != null &&
                            compareResult.right.plus?.plusDeltaNet != null
                              ? `${
                                  compareResult.left.plus.plusDeltaNet -
                                    compareResult.right.plus.plusDeltaNet >=
                                  0
                                    ? "+"
                                    : ""
                                }${formatTry(
                                  compareResult.left.plus.plusDeltaNet -
                                    compareResult.right.plus.plusDeltaNet,
                                )}`
                              : "—"}
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2 font-medium">Kargo Δ</td>
                          <td className="px-3 py-2">
                            {formatSignedTry(
                              compareResult.left.saved.shippingDelta,
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {formatSignedTry(
                              compareResult.right.saved.shippingDelta,
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatSignedTry(
                              (compareResult.left.saved.shippingDelta ?? 0) -
                                (compareResult.right.saved.shippingDelta ?? 0),
                            )}
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2 font-medium">Flaş %</td>
                          <td className="px-3 py-2">
                            {compareResult.left.saved.flashDiscountPct ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {compareResult.right.saved.flashDiscountPct ?? "—"}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatSignedPts(
                              (compareResult.left.saved.flashDiscountPct ?? 0) -
                                (compareResult.right.saved.flashDiscountPct ?? 0),
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {comparisonHistory.length > 0 ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="text-sm font-medium">Son karşılaştırmalar</div>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {comparisonHistory.map((h) => (
                      <div
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">
                            {h.leftName} vs {h.rightName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString("tr-TR")} ·{" "}
                            {h.message}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              h.winner === "tie"
                                ? "default"
                                : h.deltaNetDiff >= 0
                                  ? "profit"
                                  : "loss"
                            }
                          >
                            {h.winner === "tie"
                              ? "Eşdeğer"
                              : `${h.deltaNetDiff >= 0 ? "+" : ""}${formatTry(h.deltaNetDiff)}`}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCompareLeft(h.leftId);
                              setCompareRight(h.rightId);
                              setMsg(`A/B yüklendi: ${h.leftName} · ${h.rightName}`);
                            }}
                          >
                            A/B aç
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void (async () => {
                                try {
                                  await apiFetch(`/scenarios/comparisons/${h.id}`, {
                                    method: "DELETE",
                                  });
                                  await loadComparisons();
                                } catch {
                                  setMsg("Kayıt silinemedi.");
                                }
                              })();
                            }}
                          >
                            Sil
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Seçili ürün</CardTitle>
                <CardDescription>
                  {product.title} · {product.marketplace}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Satış (baz)" value={formatTry(product.salePrice)} />
                <Row label="Satış (senaryo)" value={formatTry(result.salePrice)} />
                <Row
                  label="Komisyon oranı"
                  value={`%${(product.commissionRate * 100).toFixed(1)} → %${(result.commissionRate * 100).toFixed(1)}`}
                />
                <Row
                  label="Kargo"
                  value={`${formatTry(product.shippingCost)} → ${formatTry(result.shippingCost)}`}
                />
                <Row
                  label="Marj"
                  value={`${formatPct(result.base.marginPct)} → ${formatPct(result.next.marginPct)}`}
                />
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs text-muted-foreground">Net değişim</div>
                  <div
                    className={
                      result.deltaNet >= 0
                        ? "mt-1 font-display text-xl font-bold text-profit"
                        : "mt-1 font-display text-xl font-bold text-loss"
                    }
                  >
                    {result.deltaNet >= 0 ? "+" : ""}
                    {formatTry(result.deltaNet)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Katalog etkisi</CardTitle>
                <CardDescription>
                  Aynı varsayımlar tüm ürünlere uygulanır · toplam fark{" "}
                  <span
                    className={
                      totalDelta >= 0 ? "font-semibold text-profit" : "font-semibold text-loss"
                    }
                  >
                    {totalDelta >= 0 ? "+" : ""}
                    {formatTry(totalDelta)}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {catalogImpact.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.marketplace}</div>
                      </div>
                      <div className="text-right">
                        <Badge tone={r.deltaNet >= 0 ? "profit" : "loss"}>
                          {r.deltaNet >= 0 ? "+" : ""}
                          {formatTry(r.deltaNet)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

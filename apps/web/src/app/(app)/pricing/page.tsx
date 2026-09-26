"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { captureForSku } from "@/lib/buybox-captures";
import {
  estimateMargin,
  priceOptions,
  suggestBuyboxAwarePrice,
  suggestSalePrice,
  type PriceTargetMode,
} from "@/lib/profit-utils";
import { apiFetch, getToken } from "@/lib/api";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";

const modes: Array<{ id: PriceTargetMode; label: string; hint: string }> = [
  { id: "margin_pct", label: "Hedef marj %", hint: "Net / satış" },
  { id: "net_amount", label: "Hedef net ₺", hint: "Sipariş başına cebine kalan" },
  { id: "markup_pct", label: "Maliyet üstü %", hint: "Net / maliyet" },
];

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

type ApiProduct = {
  id: string;
  title: string;
  sku: string | null;
  costPrice: number;
  salePrice: number;
  commissionRate: number;
  shippingCost: number;
  brand?: string | null;
  store?: { marketplace: string };
};

function mapApiProduct(p: ApiProduct): CatalogProduct {
  return {
    id: p.id,
    title: p.title,
    sku: p.sku ?? "",
    barcode: "",
    brand: p.brand ?? "—",
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
      p.store?.marketplace === "HEPSIBURADA" ||
      p.store?.marketplace === "Hepsiburada"
        ? "Hepsiburada"
        : "Trendyol",
  };
}

type PricingTariffSim = {
  tariffRatePct: number;
  plusRatePct: number;
  isOverride: boolean;
  suggestedAtTariff: number;
  suggestedAtPlus: number;
  tariffDeltaPct: number;
  tariffDeltaNet: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function PricingInner() {
  const ready = usePageReady();
  const params = useSearchParams();
  const focusSku = params.get("sku");
  const buyboxParam = params.get("buybox");
  const tariffFocus = params.get("tariff") === "1";
  const usePlusParam = params.get("usePlus") === "1";

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [mode, setMode] = useState<PriceTargetMode>("margin_pct");
  const [target, setTarget] = useState(15);
  /** TSF = müşteri fiyatı × (1 + tsfMarkupPct/100) — liste/tavsiye satış */
  const [tsfMarkupPct, setTsfMarkupPct] = useState(8);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [draftPrices, setDraftPrices] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"suggested" | "draft">("suggested");
  const [ackIrreversible, setAckIrreversible] = useState(false);
  const [applyTariffFirst, setApplyTariffFirst] = useState(true);
  const [usePlusTariff, setUsePlusTariff] = useState(false);

  useEffect(() => {
    if (usePlusParam) setUsePlusTariff(true);
  }, [usePlusParam]);

  useEffect(() => {
    if (tariffFocus) setApplyTariffFirst(true);
  }, [tariffFocus]);
  const [tariffBusy, setTariffBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [buyboxHint, setBuyboxHint] = useState<string | null>(null);
  const [mismatchByProductId, setMismatchByProductId] = useState<
    Map<string, TariffMismatchRow>
  >(() => new Map());
  const [engineTariffById, setEngineTariffById] = useState<
    Map<string, PricingTariffSim>
  >(() => new Map());

  useEffect(() => {
    const stored = localStorage.getItem("cirofy_tsf_markup");
    if (stored != null && Number.isFinite(Number(stored))) {
      setTsfMarkupPct(Math.max(0, Math.min(40, Number(stored))));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("cirofy_tsf_markup", String(tsfMarkupPct));
  }, [tsfMarkupPct]);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [rows, mismatches] = await Promise.all([
          apiFetch<ApiProduct[]>("/products?limit=5000"),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        if (rows?.length) {
          const mapped = rows.map(mapApiProduct);
          setProducts(mapped);
          setDraftPrices(Object.fromEntries(mapped.map((p) => [p.id, p.salePrice])));
          setFromApi(true);
        }
        setMismatchByProductId(mismatches.byProductId);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!getToken() || !fromApi) return;
    let cancelled = false;
    void (async () => {
      try {
        const q = new URLSearchParams({
          mode,
          target: String(target),
          tsfMarkup: String(tsfMarkupPct),
          usePlus: usePlusTariff ? "1" : "0",
        });
        const res = await apiFetch<{
          items: Array<{
            id: string;
            tariff: PricingTariffSim | null;
          }>;
        }>(`/pricing?${q.toString()}`);
        if (cancelled) return;
        const map = new Map<string, PricingTariffSim>();
        for (const item of res.items ?? []) {
          if (item.tariff) map.set(item.id, item.tariff);
        }
        setEngineTariffById(map);
      } catch {
        // istemci simülasyonu kalır
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromApi, mode, target, tsfMarkupPct, usePlusTariff]);

  useEffect(() => {
    if (!focusSku) return;
    const product = products.find((p) => p.sku === focusSku);
    if (!product) return;

    const fromParam = buyboxParam ? Number(buyboxParam) : NaN;
    const fromStore = captureForSku(focusSku)?.buyboxPrice;
    const buyboxPrice =
      Number.isFinite(fromParam) && fromParam > 0 ? fromParam : fromStore;

    const mm = mismatchByProductId.get(product.id);
    const engine = engineTariffById.get(product.id);
    const ratePct = mm
      ? usePlusTariff
        ? mm.suggestedPlusRatePct
        : mm.suggestedRatePct
      : engine
        ? usePlusTariff
          ? engine.plusRatePct
          : engine.tariffRatePct
        : null;
    const rateForSuggest =
      ratePct != null ? ratePct / 100 : product.commissionRate;
    const tariffNote =
      tariffFocus || mm || engine
        ? mm
          ? ` · tarife sapması %${mm.currentRatePct} → %${
              usePlusTariff ? mm.suggestedPlusRatePct : mm.suggestedRatePct
            }${usePlusTariff ? " (Plus)" : ""}`
          : engine
            ? ` · motor tarife %${
                usePlusTariff ? engine.plusRatePct : engine.tariffRatePct
              }${usePlusTariff ? " (Plus)" : ""}`
            : " · tarife kontrolü önerilir"
        : "";

    if (!buyboxPrice) {
      setSelected({ [product.id]: true });
      setBuyboxHint(`${focusSku} vurgulandı — buybox fiyatı yok.${tariffNote}`);
      if (tariffFocus || mm) setApplyTariffFirst(true);
      return;
    }

    const suggestion = suggestBuyboxAwarePrice(
      { ...product, commissionRate: rateForSuggest },
      buyboxPrice,
      10,
    );
    setDraftPrices((d) => ({ ...d, [product.id]: suggestion.salePrice }));
    setSelected({ [product.id]: true });
    setBuyboxHint(
      `${focusSku}: buybox ${buyboxPrice.toLocaleString("tr-TR")} ₺ → öneri ${suggestion.salePrice.toLocaleString("tr-TR")} ₺ (${suggestion.note})${tariffNote}`,
    );
    if (tariffFocus || mm) setApplyTariffFirst(true);
  }, [
    focusSku,
    buyboxParam,
    products,
    tariffFocus,
    mismatchByProductId,
    engineTariffById,
    usePlusTariff,
  ]);

  const rows = useMemo(() => {
    const factor = 1 + Math.max(0, tsfMarkupPct) / 100;
    return products.map((p) => {
      const salePrice = draftPrices[p.id] ?? p.salePrice;
      const customerPrice = salePrice;
      const tsf = round2(customerPrice * factor);
      const current = estimateMargin({ ...p, salePrice: customerPrice });
      const atTsf = estimateMargin({ ...p, salePrice: tsf });
      const mismatch = mismatchByProductId.get(p.id) ?? null;
      const engineTariff = engineTariffById.get(p.id) ?? null;
      const tariffRatePct = mismatch
        ? usePlusTariff
          ? mismatch.suggestedPlusRatePct
          : mismatch.suggestedRatePct
        : engineTariff
          ? usePlusTariff
            ? engineTariff.plusRatePct
            : engineTariff.tariffRatePct
          : null;
      const tariffRate =
        tariffRatePct != null ? tariffRatePct / 100 : null;
      const atTariff =
        tariffRate != null
          ? estimateMargin({
              ...p,
              salePrice: customerPrice,
              commissionRate: tariffRate,
            })
          : null;
      const options = priceOptions(
        { ...p, salePrice: p.salePrice },
        mode === "margin_pct" ? target : 15,
      );
      const cap = captureForSku(p.sku);
      const fromQuery =
        focusSku === p.sku && buyboxParam ? Number(buyboxParam) : NaN;
      const liveBuybox =
        Number.isFinite(fromQuery) && fromQuery > 0
          ? fromQuery
          : cap?.buyboxPrice;
      const buyboxAware =
        liveBuybox != null && liveBuybox > 0
          ? suggestBuyboxAwarePrice(
              {
                ...p,
                commissionRate:
                  tariffRate != null ? tariffRate : p.commissionRate,
              },
              liveBuybox,
              mode === "margin_pct" ? target : 10,
            )
          : null;
      const baseSuggested = suggestSalePrice(p, mode, target);
      const engineSuggestedPrice = engineTariff
        ? usePlusTariff
          ? engineTariff.suggestedAtPlus
          : engineTariff.suggestedAtTariff
        : null;
      const suggested =
        buyboxAware ??
        (engineSuggestedPrice != null
          ? {
              ...baseSuggested,
              salePrice: engineSuggestedPrice,
              ...estimateMargin({ ...p, salePrice: engineSuggestedPrice }),
            }
          : baseSuggested);
      return {
        ...p,
        salePrice,
        customerPrice,
        tsf,
        current,
        atTsf,
        atTariff,
        mismatch,
        engineTariff,
        tariffDeltaPct:
          tariffRatePct != null
            ? round2(tariffRatePct - p.commissionRate * 100)
            : engineTariff
              ? engineTariff.tariffDeltaPct
              : null,
        tariffDeltaNet:
          atTariff != null
            ? round2(atTariff.net - current.net)
            : engineTariff
              ? engineTariff.tariffDeltaNet
              : null,
        suggested,
        options,
        buyboxAware,
        focused: focusSku === p.sku,
        tsfDeltaPct: tsfMarkupPct,
      };
    });
  }, [
    products,
    draftPrices,
    mode,
    target,
    focusSku,
    buyboxParam,
    tsfMarkupPct,
    mismatchByProductId,
    engineTariffById,
    usePlusTariff,
  ]);

  const tariffGapCount = rows.filter((r) => r.mismatch).length;
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const mismatchSelectedIds = selectedIds.filter((id) =>
    mismatchByProductId.has(id),
  );
  const belowTarget = rows.filter((r) => {
    if (mode === "margin_pct") return r.current.marginPct < target;
    if (mode === "net_amount") return r.current.net < target;
    const markup = r.costPrice > 0 ? (r.current.net / r.costPrice) * 100 : 0;
    return markup < target;
  }).length;

  function toggleAll(on: boolean) {
    setSelected(
      on ? Object.fromEntries(products.map((p) => [p.id, true])) : {},
    );
  }

  function fillSuggestedOnSelected() {
    setDraftPrices((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        const row = rows.find((r) => r.id === id);
        if (row) next[id] = row.suggested.salePrice;
      }
      return next;
    });
    setAppliedMsg(
      `${selectedIds.length} üründe müşteri fiyatı öneriye çekildi (henüz kaydedilmedi).`,
    );
  }

  async function applySelectedPrices(kind: "suggested" | "draft") {
    if (!ackIrreversible) {
      setAppliedMsg("Devam etmek için geri alınamaz uyarısını onaylayın.");
      return;
    }
    const payload = selectedIds.map((id) => {
      const row = rows.find((r) => r.id === id);
      const salePrice =
        kind === "suggested"
          ? (row?.suggested.salePrice ?? draftPrices[id] ?? 0)
          : (draftPrices[id] ?? row?.salePrice ?? 0);
      return { productId: id, salePrice };
    });
    const tariffIds = [...mismatchSelectedIds];

    setDraftPrices((prev) => {
      const next = { ...prev };
      for (const item of payload) next[item.productId] = item.salePrice;
      return next;
    });

    setApplying(true);
    try {
      if (getToken() && fromApi) {
        try {
          let tariffUpdated = 0;
          const rateById = new Map(
            tariffIds.map((id) => {
              const mm = mismatchByProductId.get(id);
              if (!mm) return [id, null] as const;
              const pct = usePlusTariff
                ? mm.suggestedPlusRatePct
                : mm.suggestedRatePct;
              return [id, pct / 100] as const;
            }),
          );
          if (applyTariffFirst && tariffIds.length > 0) {
            const tariffRes = await apiFetch<{
              updated: number;
              message: string;
            }>("/tariffs/apply-mismatches", {
              method: "POST",
              body: JSON.stringify({
                productIds: tariffIds,
                usePlus: usePlusTariff,
              }),
            });
            tariffUpdated = tariffRes.updated ?? 0;
            const refreshed = await loadTariffMismatches();
            setMismatchByProductId(refreshed.byProductId);
          }

          const res = await apiFetch<{ updated: number; message: string }>(
            "/pricing/apply",
            {
              method: "POST",
              body: JSON.stringify({ items: payload, acknowledged: true }),
            },
          );
          setProducts((prev) =>
            prev.map((p) => {
              const hit = payload.find((i) => i.productId === p.id);
              if (!hit) return p;
              const nextRate = rateById.get(p.id);
              return {
                ...p,
                salePrice: hit.salePrice,
                commissionRate:
                  applyTariffFirst && nextRate != null
                    ? nextRate
                    : p.commissionRate,
              };
            }),
          );
          setConfirmOpen(false);
          setAckIrreversible(false);
          setAppliedMsg(
            tariffUpdated > 0
              ? `${tariffUpdated} komisyon ${usePlusTariff ? "Plus " : ""}tarifeye çekildi · ${res.message}`
              : res.message,
          );
          setSelected({});
          return;
        } catch {
          // yerel taslak kalsın
        }
      }

      setConfirmOpen(false);
      setAckIrreversible(false);
      setAppliedMsg(
        `${selectedIds.length} ürün için ${kind === "suggested" ? "önerilen" : "taslak"} fiyat uygulandı${
          applyTariffFirst && tariffIds.length
            ? ` · ${tariffIds.length} tarife sapması düzeltildi`
            : ""
        } (kaydedilmez).`,
      );
      setSelected({});
    } finally {
      setApplying(false);
    }
  }

  /** Seçili sapmalara yalnız Plus / standart tarife — tek tık. */
  async function applyTariffOnly(usePlus: boolean) {
    const ids = [...mismatchSelectedIds];
    if (ids.length === 0) {
      setAppliedMsg("Seçililerde tarife sapması yok.");
      return;
    }
    const rateById = new Map(
      ids.map((id) => {
        const mm = mismatchByProductId.get(id);
        if (!mm) return [id, null] as const;
        const pct = usePlus ? mm.suggestedPlusRatePct : mm.suggestedRatePct;
        return [id, pct / 100] as const;
      }),
    );
    setTariffBusy(true);
    try {
      if (getToken() && fromApi) {
        const tariffRes = await apiFetch<{
          updated: number;
          message: string;
        }>("/tariffs/apply-mismatches", {
          method: "POST",
          body: JSON.stringify({ productIds: ids, usePlus }),
        });
        const refreshed = await loadTariffMismatches();
        setMismatchByProductId(refreshed.byProductId);
        setProducts((prev) =>
          prev.map((p) => {
            const rate = rateById.get(p.id);
            return rate != null ? { ...p, commissionRate: rate } : p;
          }),
        );
        setAppliedMsg(
          tariffRes.message ||
            `${tariffRes.updated} ürüne ${usePlus ? "Plus " : ""}tarife uygulandı.`,
        );
        return;
      }
      setProducts((prev) =>
        prev.map((p) => {
          const rate = rateById.get(p.id);
          return rate != null ? { ...p, commissionRate: rate } : p;
        }),
      );
      setMismatchByProductId((prev) => {
        const next = new Map(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setAppliedMsg(
        `${ids.length} ürüne ${usePlus ? "Plus " : ""}tarife uygulandı.`,
      );
    } catch (err) {
      setAppliedMsg(
        err instanceof Error ? err.message : "Tarife uygulanamadı.",
      );
    } finally {
      setTariffBusy(false);
    }
  }

  const confirmRows = useMemo(() => {
    return selectedIds
      .map((id) => {
        const row = rows.find((r) => r.id === id);
        const original = products.find((p) => p.id === id);
        if (!row || !original) return null;
        const next =
          confirmMode === "suggested"
            ? row.suggested.salePrice
            : (draftPrices[id] ?? row.salePrice);
        const prev = original.salePrice;
        return {
          id: row.id,
          title: row.title,
          sku: row.sku,
          previous: prev,
          next,
          delta: round2(next - prev),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [selectedIds, rows, products, confirmMode, draftPrices]);

  return (
    <DashboardShell
      loading={!ready}
      title="Fiyat motoru"
      description={
        fromApi
          ? "Hedef marj / net — kayıtlı komisyon ile tarife netini yan yana görün."
          : "Hedef marj, net tutar veya maliyet üstü — tarife sapmasında net farkı görün."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/buybox">Buybox</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Tarifeler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">Maliyetler</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          {appliedMsg ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {appliedMsg}
            </div>
          ) : null}

          {buyboxHint ? (
            <div className="mb-4 rounded-xl border border-profit/30 bg-card px-4 py-3 text-sm text-foreground">
              {buyboxHint}
            </div>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Ürün</div>
                <div className="mt-1 font-display text-2xl font-bold">{rows.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Hedef altı</div>
                <div className="mt-1 font-display text-2xl font-bold text-loss">
                  {belowTarget}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife sapması</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {tariffGapCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Seçili</div>
                <div className="mt-1 font-display text-2xl font-bold">{selectedIds.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle>Hedef</CardTitle>
              <CardDescription>
                Modu seç, değeri gir — listedeki öneri buna göre hesaplanır.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                role="tablist"
                aria-label="Hedef modu"
                className="flex w-full flex-col gap-1 rounded-xl border border-border bg-muted/50 p-1 sm:w-auto sm:flex-row"
              >
                {modes.map((m) => {
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setMode(m.id);
                        setTarget(m.id === "net_amount" ? 40 : 15);
                      }}
                      className={
                        active
                          ? "h-9 rounded-lg bg-profit px-3.5 text-sm font-semibold text-white shadow-soft"
                          : "h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground hover:bg-card hover:text-foreground"
                      }
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 sm:ml-auto">
                <div className="relative">
                  <label className="sr-only" htmlFor="price-target">
                    {modes.find((m) => m.id === mode)?.label}
                  </label>
                  <input
                    id="price-target"
                    type="number"
                    min={0}
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value) || 0)}
                    className="h-10 w-[7.5rem] rounded-xl border border-border bg-background pl-3 pr-9 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    {mode === "net_amount" ? "₺" : "%"}
                  </span>
                </div>
                <p className="max-w-[9rem] text-xs leading-snug text-muted-foreground">
                  {modes.find((m) => m.id === mode)?.hint}
                </p>
              </div>
              {fromApi ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm sm:ml-2">
                  <input
                    type="checkbox"
                    checked={usePlusTariff}
                    onChange={(e) => setUsePlusTariff(e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--profit))]"
                  />
                  <span>Plus tarife ile öner</span>
                </label>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle>TSF × müşteri fiyatı</CardTitle>
              <CardDescription>
                Müşteri fiyatı = vitrinde görünen satış (marj hesabı buna göre). TSF =
                tavsiye / liste fiyatı — müşteri fiyatının üzerine eklenen fark.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="tsf-markup"
                  className="shrink-0 text-sm font-medium text-foreground"
                >
                  TSF farkı
                </label>
                <div className="relative">
                  <input
                    id="tsf-markup"
                    type="number"
                    min={0}
                    max={40}
                    step={1}
                    value={tsfMarkupPct}
                    onChange={(e) => setTsfMarkupPct(Number(e.target.value) || 0)}
                    className="h-10 w-[5.5rem] rounded-xl border border-border bg-background pl-3 pr-8 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:max-w-sm sm:text-right">
                Örn. müşteri 200 ₺ → TSF {formatTry(round2(200 * (1 + tsfMarkupPct / 100)))}.
                Toplu güncelleme müşteri fiyatını yazar.
              </p>
            </CardContent>
          </Card>

          <Card className="mb-4 border-amber-200/80 bg-amber-50/50">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Toplu fiyat güncellemesi geri alınamaz
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fromApi
                      ? "Seçili ürünlerin satış fiyatı katalogda güncellenir. Pazaryerine otomatik yazılmaz."
                      : "Mağaza bağlandıktan sonra seçili ürünlerin satış fiyatı pazaryerine yazılır."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
                  Tümünü seç
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length === 0}
                  onClick={fillSuggestedOnSelected}
                >
                  Öneriyi taslağa ({selectedIds.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mismatchSelectedIds.length === 0 || tariffBusy}
                  onClick={() => void applyTariffOnly(false)}
                >
                  {tariffBusy ? "…" : `Tarife (${mismatchSelectedIds.length})`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mismatchSelectedIds.length === 0 || tariffBusy}
                  onClick={() => void applyTariffOnly(true)}
                >
                  {tariffBusy ? "…" : `Plus tarife (${mismatchSelectedIds.length})`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setConfirmMode("draft");
                    setAckIrreversible(false);
                    setConfirmOpen(true);
                  }}
                >
                  Taslağı kaydet ({selectedIds.length})
                </Button>
                <Button
                  size="sm"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setConfirmMode("suggested");
                    setAckIrreversible(false);
                    setConfirmOpen(true);
                  }}
                >
                  Önerileni uygula ({selectedIds.length})
                </Button>
              </div>
            </CardContent>
          </Card>

          {confirmOpen ? (
            <div className="mb-4 rounded-xl border border-loss/30 bg-card p-5">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-loss" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Onay — geri alınamaz</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedIds.length} ürünün müşteri (vitrin) fiyatı
                    {fromApi ? " katalogda kalıcı olarak" : " taslağa"}{" "}
                    {confirmMode === "suggested"
                      ? "önerilen değere"
                      : "düzenlediğiniz taslağa"}{" "}
                    çekilecek. Eski fiyata otomatik dönüş yok.
                  </p>
                  {mismatchSelectedIds.length > 0 ? (
                    <p className="mt-2 text-sm text-amber-800">
                      Seçililerde {mismatchSelectedIds.length} tarife sapması var
                      {applyTariffFirst
                        ? usePlusTariff
                          ? " — önce Plus komisyon tarifeye çekilecek, sonra fiyat."
                          : " — önce komisyon tarifeye çekilecek, sonra fiyat."
                        : " — yalnız fiyat güncellenecek."}
                    </p>
                  ) : null}
                  <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Ürün</th>
                          <th className="px-3 py-2 font-medium">Eski</th>
                          <th className="px-3 py-2 font-medium">Yeni</th>
                          <th className="px-3 py-2 font-medium">Fark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmRows.slice(0, 20).map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <div className="font-medium">{r.title}</div>
                              <div className="text-xs text-muted-foreground">{r.sku}</div>
                            </td>
                            <td className="px-3 py-2">{formatTry(r.previous)}</td>
                            <td className="px-3 py-2 font-medium">{formatTry(r.next)}</td>
                            <td
                              className={
                                r.delta >= 0
                                  ? "px-3 py-2 text-profit"
                                  : "px-3 py-2 text-loss"
                              }
                            >
                              {r.delta >= 0 ? "+" : ""}
                              {formatTry(r.delta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mismatchSelectedIds.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={applyTariffFirst}
                          onChange={(e) => setApplyTariffFirst(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-[hsl(var(--profit))]"
                        />
                        <span>
                          Sapmalı ürünlerde önce komisyon tarifesini uygula, sonra fiyatı kaydet
                        </span>
                      </label>
                      {applyTariffFirst ? (
                        <label className="flex cursor-pointer items-start gap-2 pl-6 text-sm">
                          <input
                            type="checkbox"
                            checked={usePlusTariff}
                            onChange={(e) => setUsePlusTariff(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[hsl(var(--profit))]"
                          />
                          <span>Plus komisyon oranını kullan</span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ackIrreversible}
                      onChange={(e) => setAckIrreversible(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[hsl(var(--profit))]"
                    />
                    <span>
                      Bu değişikliğin geri alınamayacağını anladım
                      {fromApi ? " ve katalog fiyatlarını güncellemek istiyorum" : ""}.
                    </span>
                  </label>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      disabled={!ackIrreversible || applying}
                      onClick={() => void applySelectedPrices(confirmMode)}
                    >
                      {applying
                        ? "Uygulanıyor…"
                        : applyTariffFirst && mismatchSelectedIds.length > 0
                          ? usePlusTariff
                            ? "Plus tarife + fiyat uygula"
                            : "Tarife + fiyat uygula"
                          : "Onayla ve uygula"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setConfirmOpen(false);
                        setAckIrreversible(false);
                      }}
                    >
                      Vazgeç
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Kâr marjı listesi</CardTitle>
              <CardDescription>
                Müşteri fiyatı düzenlenir. Sapmada kayıtlı komisyon neti ile tarife neti yan yana.
                TSF liste referansı · +%{tsfMarkupPct}.
                {fromApi ? " · canlı katalog" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={
                      r.focused
                        ? "rounded-xl border border-profit p-4"
                        : "rounded-xl border border-border p-4"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                        }
                        className="mt-1 h-4 w-4 accent-[hsl(var(--profit))]"
                        aria-label={`${r.title} seç`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold leading-snug">{r.title}</div>
                          {r.mismatch ? <Badge tone="warn">Tarife sapması</Badge> : null}
                          {r.engineTariff && !r.mismatch ? (
                            <Badge tone="profit">
                              Motor {usePlusTariff ? "Plus" : "tarife"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.sku}</div>
                        {r.mismatch ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Komisyon %{r.mismatch.currentRatePct} → tarife %
                            {r.mismatch.suggestedRatePct}
                          </div>
                        ) : null}
                        {r.buyboxAware ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Buybox {formatTry(r.buyboxAware.buyboxPrice)} ·{" "}
                            {r.buyboxAware.meetsBuybox ? "yakalanabilir" : "marj koru"}
                          </div>
                        ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Müşteri (vitrin)
                            </div>
                            <div className="font-medium">{formatTry(r.customerPrice)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              TSF (liste +%{r.tsfDeltaPct})
                            </div>
                            <div className="font-medium text-muted-foreground">
                              {formatTry(r.tsf)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Net @ kayıtlı komisyon
                            </div>
                            <div
                              className={
                                r.current.net >= 0
                                  ? "font-semibold text-profit"
                                  : "font-semibold text-loss"
                              }
                            >
                              {formatTry(r.current.net)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Net @ tarife</div>
                            {r.atTariff ? (
                              <div
                                className={
                                  r.atTariff.net >= 0
                                    ? "font-semibold text-profit"
                                    : "font-semibold text-loss"
                                }
                              >
                                {formatTry(r.atTariff.net)}
                              </div>
                            ) : (
                              <div className="font-medium text-muted-foreground">—</div>
                            )}
                          </div>
                          {r.mismatch ? (
                            <div className="col-span-2">
                              <div className="text-xs text-muted-foreground">Tarife Δ</div>
                              <div className="font-semibold text-amber-700">
                                {(r.tariffDeltaPct ?? 0) > 0 ? "+" : ""}
                                {r.tariffDeltaPct ?? 0} puan
                                {r.tariffDeltaNet != null
                                  ? ` · net ${r.tariffDeltaNet >= 0 ? "+" : ""}${formatTry(r.tariffDeltaNet)}`
                                  : ""}
                              </div>
                            </div>
                          ) : null}
                          <div>
                            <div className="text-xs text-muted-foreground">Net @ TSF</div>
                            <div className="font-medium text-muted-foreground">
                              {formatTry(r.atTsf.net)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Marj @ müşteri</div>
                            <div className="font-medium">{formatPct(r.current.marginPct)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Marj @ TSF</div>
                            <div className="font-medium text-muted-foreground">
                              {formatPct(r.atTsf.marginPct)}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-xs text-muted-foreground">Öneri (müşteri)</div>
                            <button
                              type="button"
                              className="font-semibold text-profit underline-offset-2 hover:underline"
                              onClick={() =>
                                setDraftPrices((d) => ({
                                  ...d,
                                  [r.id]: r.suggested.salePrice,
                                }))
                              }
                            >
                              {formatTry(r.suggested.salePrice)}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {r.options.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() =>
                                setDraftPrices((d) => ({ ...d, [r.id]: o.salePrice }))
                              }
                              className="rounded-lg border border-border px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                            >
                              <div className="font-medium">{o.label}</div>
                              <div className="text-muted-foreground">
                                {formatTry(o.salePrice)} · {formatTry(o.net)}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[1420px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">
                        <span className="sr-only">Seç</span>
                      </th>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Müşteri (vitrin)</th>
                      <th className="px-4 py-3 font-medium">TSF (liste)</th>
                      <th className="px-4 py-3 font-medium">Net @ kayıtlı</th>
                      <th className="px-4 py-3 font-medium">Net @ tarife</th>
                      <th className="px-4 py-3 font-medium">Tarife Δ</th>
                      <th className="px-4 py-3 font-medium">Net @ TSF</th>
                      <th className="px-4 py-3 font-medium">Marj @ müşteri</th>
                      <th className="px-4 py-3 font-medium">Marj @ TSF</th>
                      <th className="px-4 py-3 font-medium">Seçenekler (fiyat · net)</th>
                      <th className="px-4 py-3 font-medium">Öneri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className={
                          r.focused
                            ? "border-t border-border bg-profit/5"
                            : "border-t border-border"
                        }
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={!!selected[r.id]}
                            onChange={(e) =>
                              setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                            }
                            className="h-4 w-4 accent-[hsl(var(--profit))]"
                            aria-label={`${r.title} seç`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">{r.title}</div>
                            {r.mismatch ? <Badge tone="warn">Sapma</Badge> : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{r.sku}</div>
                          {r.mismatch ? (
                            <div className="text-xs text-muted-foreground">
                              %{r.mismatch.currentRatePct} → %{r.mismatch.suggestedRatePct}
                            </div>
                          ) : null}
                          {r.buyboxAware ? (
                            <div className="text-xs text-muted-foreground">
                              Buybox {formatTry(r.buyboxAware.buyboxPrice)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={r.customerPrice}
                            onChange={(e) =>
                              setDraftPrices((d) => ({
                                ...d,
                                [r.id]: Number(e.target.value) || 0,
                              }))
                            }
                            className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${r.title} müşteri fiyatı`}
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div>{formatTry(r.tsf)}</div>
                          <div className="text-xs">+%{r.tsfDeltaPct}</div>
                        </td>
                        <td
                          className={
                            r.current.net >= 0
                              ? "px-4 py-3 font-semibold text-profit"
                              : "px-4 py-3 font-semibold text-loss"
                          }
                        >
                          {formatTry(r.current.net)}
                        </td>
                        <td className="px-4 py-3">
                          {r.atTariff ? (
                            <div
                              className={
                                r.atTariff.net >= 0
                                  ? "font-semibold text-profit"
                                  : "font-semibold text-loss"
                              }
                            >
                              {formatTry(r.atTariff.net)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.mismatch ? (
                            <div>
                              <div
                                className={
                                  (r.tariffDeltaPct ?? 0) > 0
                                    ? "font-semibold text-amber-700"
                                    : "font-semibold text-profit"
                                }
                              >
                                {(r.tariffDeltaPct ?? 0) > 0 ? "+" : ""}
                                {r.tariffDeltaPct ?? 0} puan
                              </div>
                              {r.tariffDeltaNet != null ? (
                                <div className="text-xs text-muted-foreground">
                                  net {r.tariffDeltaNet >= 0 ? "+" : ""}
                                  {formatTry(r.tariffDeltaNet)}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatTry(r.atTsf.net)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              r.current.marginPct >= 15
                                ? "profit"
                                : r.current.marginPct >= 8
                                  ? "warn"
                                  : "loss"
                            }
                          >
                            {formatPct(r.current.marginPct)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {formatPct(r.atTsf.marginPct)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {r.options.map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() =>
                                  setDraftPrices((d) => ({
                                    ...d,
                                    [r.id]: o.salePrice,
                                  }))
                                }
                                className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/50"
                              >
                                <span className="font-medium">{o.label}</span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  {formatTry(o.salePrice)} · {formatTry(o.net)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDraftPrices((d) => ({
                                ...d,
                                [r.id]: r.suggested.salePrice,
                              }))
                            }
                          >
                            {formatTry(r.suggested.salePrice)}
                          </Button>
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

export default function PricingPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <PricingInner />
    </Suspense>
  );
}

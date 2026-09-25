"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, Upload } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { PaginationBar, paginateSlice } from "@/components/pagination-bar";
import { cn, formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { estimateMargin, summarizeCampaignResults, type CampaignResultRow } from "@/lib/profit-utils";
import { promoKindLabels, type PromoKind } from "@/lib/promo-utils";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";

const tabs: Array<{ id: PromoKind | "all"; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "flash", label: "Flaş" },
  { id: "advantage_label", label: "Avantaj etiket" },
  { id: "commission_tariff", label: "Komisyon" },
  { id: "plus_commission", label: "Plus komisyon" },
  { id: "discount", label: "İndirim" },
];

const tariffFilters = [
  { id: "all", label: "Tümü" },
  { id: "mismatch", label: "Tarife sapması" },
  { id: "aligned", label: "Tarife uyumlu" },
] as const;
type TariffFilter = (typeof tariffFilters)[number]["id"];

type OfferRow = {
  id: string;
  kind: PromoKind;
  sku: string;
  title: string;
  listPrice: number;
  offerPrice: number;
  targetMarginPct: number;
  estimatedMarginPct: number;
  estimatedNet: number;
  source?: string;
  tariffLabel?: string | null;
  tariffRatePct?: number | null;
};
type RealizedRow = CampaignResultRow & { kind: PromoKind };

type OfferPreviewRow = {
  sku: string;
  kind: PromoKind;
  offerPrice: number;
  listPrice: number;
  title: string;
  estimatedMarginPct: number;
  estimatedNet: number;
  matched: boolean;
};

function parseNum(raw: string) {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function parseKind(raw: string): PromoKind {
  const k = raw.toLowerCase().trim();
  if (k.includes("flash") || k.includes("flaş") || k.includes("flas")) return "flash";
  if (k.includes("plus")) return "plus_commission";
  if (k.includes("avantaj") || k.includes("advantage")) return "advantage_label";
  if (k.includes("indirim") || k.includes("discount")) return "discount";
  return "commission_tariff";
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === ";" || ch === "," || ch === "\t")) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export default function PromotionsPage() {
  const ready = usePageReady();
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"before" | "realized">("before");
  const [tab, setTab] = useState<PromoKind | "all">("all");
  const [targetMargin, setTargetMargin] = useState(15);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [campaignResults, setCampaignResults] = useState<RealizedRow[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [preview, setPreview] = useState<OfferPreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [catalog, setCatalog] = useState<Array<{ id: string; title: string; sku: string; salePrice: number; costPrice: number; commissionRate: number; shippingCost: number }>>([]);
  const [tariffFilter, setTariffFilter] = useState<TariffFilter>("all");
  const [plusScenario, setPlusScenario] = useState(false);
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
        const [promoRes, products, mismatches] = await Promise.all([
          apiFetch<{
            offers: OfferRow[];
            realized: RealizedRow[];
            note?: string;
          }>(`/promotions?targetMargin=${targetMargin}`),
          apiFetch<
            Array<{
              id: string;
              title: string;
              sku: string | null;
              salePrice: number;
              costPrice: number;
              commissionRate: number;
              shippingCost: number;
            }>
          >("/products").catch(() => null),
          loadTariffMismatches(),
        ]);
        if (cancelled) return;
        setMismatchBySku(mismatches.bySku);
        setOffers(promoRes.offers ?? []);
        setFromApi(true);
        if (promoRes.realized?.length) setCampaignResults(promoRes.realized);
        else setCampaignResults([]);
        if (products?.length) {
          setCatalog(
            products.map((p) => ({
              id: p.id,
              title: p.title,
              sku: p.sku ?? "",
              salePrice: Number(p.salePrice) || 0,
              costPrice: Number(p.costPrice) || 0,
              commissionRate: Number(p.commissionRate) || 0,
              shippingCost: Number(p.shippingCost) || 0,
            })),
          );
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetMargin]);

  async function syncPromotions() {
    if (!getToken()) {
      toast("Kampanya senkronu için giriş yapın.");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>(
        `/promotions/sync?targetMargin=${targetMargin}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      toast(res.message ?? "Senkron tamamlandı.");
      const promoRes = await apiFetch<{
        offers: OfferRow[];
        realized: RealizedRow[];
      }>(`/promotions?targetMargin=${targetMargin}`);
      setOffers(promoRes.offers ?? []);
      setCampaignResults(promoRes.realized ?? []);
      setFromApi(true);
    } catch {
      toast("Kampanya senkronu tamamlanamadı. Tekrar deneyin.");
    } finally {
      setSyncBusy(false);
    }
  }

  const rows = useMemo(() => {
    const base = tab === "all" ? offers : offers.filter((o) => o.kind === tab);
    return base
      .map((o) => {
        const tariffMismatch = o.sku ? (mismatchBySku.get(o.sku) ?? null) : null;
        const product = catalog.find((p) => p.sku === o.sku);
        const plusRatePct =
          tariffMismatch?.suggestedPlusRatePct ??
          (o.tariffRatePct != null ? Math.round((o.tariffRatePct + 2) * 10) / 10 : null);
        const plusEst =
          plusScenario && product && plusRatePct != null
            ? estimateMargin({
                salePrice: o.offerPrice,
                costPrice: product.costPrice,
                commissionRate: plusRatePct / 100,
                shippingCost: product.shippingCost,
              })
            : null;
        const effectiveMargin = plusEst?.marginPct ?? o.estimatedMarginPct;
        const effectiveNet = plusEst?.net ?? o.estimatedNet;
        return {
          ...o,
          belowTarget: effectiveMargin < targetMargin,
          tariffMismatch,
          plusRatePct,
          plusEst,
          plusDeltaNet:
            plusEst != null ? Math.round((plusEst.net - o.estimatedNet) * 100) / 100 : null,
          displayNet: effectiveNet,
          displayMarginPct: effectiveMargin,
        };
      })
      .filter((o) => {
        if (tariffFilter === "mismatch") return !!o.tariffMismatch;
        if (tariffFilter === "aligned") return !o.tariffMismatch;
        return true;
      });
  }, [tab, targetMargin, offers, tariffFilter, mismatchBySku, catalog, plusScenario]);

  useEffect(() => {
    setPage(1);
  }, [tab, tariffFilter, targetMargin, plusScenario, view, pageSize]);

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateSlice(rows, page, pageSize),
    [rows, page, pageSize],
  );

  const plusImpact = useMemo(() => {
    if (!plusScenario) return null;
    const withPlus = rows.filter((r) => r.plusEst != null);
    if (withPlus.length === 0) return null;
    const deltaSum = withPlus.reduce((s, r) => s + (r.plusDeltaNet ?? 0), 0);
    const worse = withPlus.filter((r) => (r.plusDeltaNet ?? 0) < 0).length;
    return {
      count: withPlus.length,
      deltaSum: Math.round(deltaSum * 100) / 100,
      worse,
    };
  }, [plusScenario, rows]);

  const realizedRows = useMemo(() => {
    const base =
      tab === "all"
        ? campaignResults
        : campaignResults.filter((r) => r.kind === tab);
    return base;
  }, [tab, campaignResults]);

  const below = rows.filter((r) => r.belowTarget).length;
  const ok = rows.length - below;
  const realizedSummary = useMemo(
    () => summarizeCampaignResults(realizedRows),
    [realizedRows],
  );

  function buildPreview(text: string): OfferPreviewRow[] | null {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast("Dosyada satır bulunamadı.");
      return null;
    }
    const headerLine = lines[0];
    if (!headerLine) {
      toast("Dosyada satır bulunamadı.");
      return null;
    }
    const header = headerLine.toLowerCase().split(/[;,]/);
    const skuIdx = header.findIndex((h) => h.includes("sku"));
    const priceIdx = header.findIndex(
      (h) =>
        h.includes("offer") ||
        h.includes("teklif") ||
        h.includes("price") ||
        h.includes("fiyat"),
    );
    const kindIdx = header.findIndex(
      (h) => h.includes("kind") || h.includes("tür") || h.includes("tur") || h.includes("type"),
    );
    if (skuIdx < 0 || priceIdx < 0) {
      toast("Sütunlar okunamadı. sku;offer_price;kind bekleniyor.");
      return null;
    }

    const out: OfferPreviewRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = splitCsvLine(line);
      const sku = cols[skuIdx]?.trim() ?? "";
      const offerPrice = parseNum(cols[priceIdx] ?? "");
      if (!sku || offerPrice == null) continue;
      const product = catalog.find((p) => p.sku === sku);
      const kind = kindIdx >= 0 ? parseKind(cols[kindIdx] ?? "") : ("flash" as PromoKind);
      const listPrice = product?.salePrice ?? offerPrice;
      const costPrice = product?.costPrice ?? offerPrice * 0.4;
      const commissionRate = product?.commissionRate ?? 0.12;
      const shippingCost = product?.shippingCost ?? 35;
      const est = estimateMargin({
        salePrice: offerPrice,
        costPrice,
        commissionRate,
        shippingCost,
      });
      out.push({
        sku,
        kind,
        offerPrice,
        listPrice,
        title: product?.title ?? sku,
        estimatedMarginPct: Math.round(est.marginPct * 10) / 10,
        estimatedNet: est.net,
        matched: !!product,
      });
    }
    return out;
  }

  function importOffers(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = buildPreview(String(reader.result ?? ""));
      if (!rows || rows.length === 0) {
        if (rows?.length === 0) toast("Eşleşen teklif satırı yok.");
        return;
      }
      setPreview(rows);
      const matched = rows.filter((r) => r.matched).length;
      toast(`${rows.length} satır okundu · ${matched} katalogda · ${rows.length - matched} yeni SKU. Uygula ile kaydedin.`,);
    };
    reader.readAsText(file);
  }

  async function applyPreview() {
    if (!preview?.length) return;
    setImporting(true);
    try {
      if (getToken()) {
        try {
          const res = await apiFetch<{
            upserted: number;
            missed?: string[];
            offers: OfferRow[];
            message: string;
          }>("/promotions/import", {
            method: "POST",
            body: JSON.stringify({
              targetMargin,
              rows: preview.map((r) => ({
                sku: r.sku,
                offerPrice: r.offerPrice,
                kind: r.kind,
                title: r.title,
                listPrice: r.listPrice,
              })),
            }),
          });
          if (res.offers?.length) {
            setOffers((prev) => {
              const keys = new Set(res.offers.map((o) => o.sku + o.kind));
              const kept = prev.filter((o) => !keys.has(o.sku + o.kind));
              return [...res.offers, ...kept];
            });
            setFromApi(true);
          }
          toast(res.message);
          setPreview(null);
          return;
        } catch {
          // yerel düş
        }
      }

      const imported: OfferRow[] = preview.map((r, i) => ({
        id: `imp-${r.sku}-${i}`,
        kind: r.kind,
        sku: r.sku,
        title: r.title,
        listPrice: r.listPrice,
        offerPrice: r.offerPrice,
        targetMarginPct: targetMargin,
        estimatedMarginPct: r.estimatedMarginPct,
        estimatedNet: r.estimatedNet,
        source: "import",
      }));
      setOffers((prev) => {
        const skus = new Set(imported.map((o) => o.sku + o.kind));
        const kept = prev.filter((o) => !skus.has(o.sku + o.kind));
        return [...imported, ...kept];
      });
      toast(`${imported.length} teklif yüklendi${fromApi ? "" : " (kaydedilmez)"}.`,);
      setPreview(null);
    } finally {
      setImporting(false);
    }
  }

  function downloadSampleCsv() {
    const sample = [
      "sku;offer_price;kind",
      "SKU-1001;199;flash",
      "SKU-1002;149;discount",
      "SKU-1003;89;plus_commission",
    ].join("\n");
    const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cirofy-teklif-sablon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Şablon CSV indirildi.");
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Teklif filtresi"
      description={
        fromApi
          ? "Kampanya teklifleri — pazaryeri senkronu veya içe aktarım."
          : "Kampanya senkronu veya CSV ile teklif yükleyin."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncBusy}
            onClick={() => void syncPromotions()}
          >
            <RefreshCw
              className={syncBusy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />
            Kampanya senkronu
          </Button>
          <Button variant="outline" size="sm" onClick={downloadSampleCsv}>
            <Download className="h-3.5 w-3.5" />
            Şablon CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Excel yükle
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importOffers(f);
              e.target.value = "";
            }}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">Fiyat motoru</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">Maliyetleri güncelle</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          <div
            className={
              dragOver
                ? "mb-4 rounded-xl border-2 border-dashed border-profit bg-profit/5 px-4 py-5 text-center text-sm"
                : "mb-4 rounded-xl border border-dashed border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground"
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) importOffers(f);
            }}
          >
            <p className="font-medium text-foreground">Teklif CSV dosyasını buraya bırakın</p>
            <p className="mt-1">sku · offer_price · kind</p>
          </div>

          {preview ? (
            <Card className="mb-4">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Teklif önizleme</CardTitle>
                  <CardDescription>
                    {preview.filter((r) => r.matched).length} katalogda ·{" "}
                    {preview.filter((r) => !r.matched).length} yeni
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={importing}
                    onClick={() => void applyPreview()}
                  >
                    {importing ? "Kaydediliyor…" : "Uygula"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPreview(null);
                      
                    }}
                  >
                    İptal
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-56 overflow-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Tür</th>
                        <th className="px-3 py-2 font-medium">Teklif</th>
                        <th className="px-3 py-2 font-medium">Marj</th>
                        <th className="px-3 py-2 font-medium">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 40).map((r, i) => (
                        <tr key={`${r.sku}-${r.kind}-${i}`} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{r.sku}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {promoKindLabels[r.kind]}
                          </td>
                          <td className="px-3 py-2">{formatTry(r.offerPrice)}</td>
                          <td className="px-3 py-2">
                            <Badge
                              tone={r.estimatedMarginPct < targetMargin ? "loss" : "profit"}
                            >
                              {formatPct(r.estimatedMarginPct)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={r.matched ? "profit" : "warn"}>
                              {r.matched ? "Katalog" : "Yeni"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={view === "before" ? "default" : "outline"}
              onClick={() => setView("before")}
            >
              Teklif öncesi
            </Button>
            <Button
              size="sm"
              variant={view === "realized" ? "default" : "outline"}
              onClick={() => setView("realized")}
            >
              Gerçekleşen
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/reports">Raporlar</Link>
            </Button>
          </div>

          {view === "before" ? (
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Teklif</div>
                  <div className="mt-1 font-display text-2xl font-bold">{rows.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Hedef üstü</div>
                  <div className="mt-1 font-display text-2xl font-bold text-profit">{ok}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Hedef altı (ele)</div>
                  <div className="mt-1 font-display text-2xl font-bold text-loss">{below}</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Kampanya</div>
                  <div className="mt-1 font-display text-2xl font-bold">
                    {realizedSummary.campaigns}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Sipariş</div>
                  <div className="mt-1 font-display text-2xl font-bold">
                    {realizedSummary.orders}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-muted-foreground">Gerçekleşen net</div>
                  <div className="mt-1 font-display text-2xl font-bold text-profit">
                    {formatTry(realizedSummary.net)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {view === "before" ? (
          <Card className="mb-4 overflow-hidden">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle>Filtre eşiği</CardTitle>
                  <CardDescription className="max-w-xl">
                    Hedef marjın altı kırmızı; tarife sapması ve Plus senaryosu
                    listeyi daraltır.
                  </CardDescription>
                </div>
                <Badge tone={below > 0 ? "loss" : "profit"}>
                  {below > 0 ? `${below} eleme adayı` : "Hepsi eşik üstü"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,14rem)_1fr_minmax(0,16rem)] lg:items-end lg:gap-8">
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  htmlFor="target-margin"
                >
                  Hedef marj
                </label>
                <div className="flex items-baseline gap-2">
                  <div className="relative">
                    <input
                      id="target-margin"
                      type="number"
                      min={0}
                      max={80}
                      step={1}
                      value={targetMargin}
                      onChange={(e) => setTargetMargin(Number(e.target.value) || 0)}
                      className="h-11 w-[4.75rem] rounded-xl border border-border bg-background px-3 pr-8 font-display text-xl font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      %
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {ok}/{rows.length || 0} uygun
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tarife uyumu
                </div>
                <div
                  className="inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-border bg-muted/40 p-0.5"
                  role="group"
                  aria-label="Tarife uyumu"
                >
                  {tariffFilters.map((f) => {
                    const active = tariffFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTariffFilter(f.id)}
                        className={cn(
                          "h-9 px-3 text-xs font-semibold transition-colors",
                          active
                            ? "rounded-lg bg-card text-foreground shadow-sm"
                            : "rounded-lg text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Senaryo
                </div>
                <button
                  type="button"
                  onClick={() => setPlusScenario((v) => !v)}
                  aria-pressed={plusScenario}
                  className={cn(
                    "flex h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left transition-colors",
                    plusScenario
                      ? "border-profit/40 bg-profit/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span className="text-sm font-semibold">Plus tarife</span>
                  <span
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      plusScenario ? "bg-profit" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform",
                        plusScenario ? "left-4" : "left-0.5",
                      )}
                    />
                  </span>
                </button>
                {plusImpact ? (
                  <p className="text-xs leading-snug text-muted-foreground">
                    {plusImpact.count} satır · net fark{" "}
                    <span
                      className={
                        plusImpact.deltaSum >= 0
                          ? "font-semibold text-profit"
                          : "font-semibold text-loss"
                      }
                    >
                      {plusImpact.deltaSum >= 0 ? "+" : ""}
                      {formatTry(plusImpact.deltaSum)}
                    </span>
                    {plusImpact.worse > 0
                      ? ` · ${plusImpact.worse} satır zayıflar`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs leading-snug text-muted-foreground">
                    Açınca teklif neti Plus komisyonla yeniden hesaplanır.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? "default" : "outline"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {view === "before" ? (
          <Card>
            <CardHeader>
              <CardTitle>Teklif listesi</CardTitle>
              <CardDescription>
                Kırmızı = hedef marjın altında.
                {plusScenario
                  ? " Plus senaryosu açık — net Plus komisyonla."
                  : " Komisyon / Plus satırlarında kategori tarifesi etiketi gösterilir."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {pageRows.map((o) => (
                  <div key={o.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{o.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.sku} · {promoKindLabels[o.kind]}
                          {o.source === "import" ? " · yüklenen" : null}
                        </div>
                        {o.tariffLabel ? (
                          <div className="mt-1">
                            <Badge tone="default">{o.tariffLabel}</Badge>
                          </div>
                        ) : null}
                        {o.tariffMismatch ? (
                          <div className="mt-1">
                            <Badge tone="warn">
                              Sapma %{o.tariffMismatch.currentRatePct} → %
                              {o.tariffMismatch.suggestedRatePct}
                            </Badge>
                          </div>
                        ) : null}
                        {plusScenario && o.plusRatePct != null ? (
                          <div className="mt-1">
                            <Badge tone="default">Plus %{o.plusRatePct}</Badge>
                          </div>
                        ) : null}
                      </div>
                      <Badge tone={o.belowTarget ? "loss" : "profit"}>
                        {o.belowTarget ? "Ele" : "Uygun"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Liste</div>
                        <div className="font-medium">{formatTry(o.listPrice)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Teklif</div>
                        <div className="font-medium">{formatTry(o.offerPrice)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {plusScenario ? "Marj @ Plus" : "Marj"}
                        </div>
                        <div
                          className={
                            o.belowTarget
                              ? "font-semibold text-loss"
                              : "font-semibold text-profit"
                          }
                        >
                          {formatPct(o.displayMarginPct)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {plusScenario ? "Plus net" : "Tahmini net"}{" "}
                      {formatTry(o.displayNet)}
                      {o.plusDeltaNet != null ? (
                        <span
                          className={
                            o.plusDeltaNet >= 0
                              ? "ml-1 font-semibold text-profit"
                              : "ml-1 font-semibold text-loss"
                          }
                        >
                          ({o.plusDeltaNet >= 0 ? "+" : ""}
                          {formatTry(o.plusDeltaNet)})
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table
                  className={
                    plusScenario
                      ? "w-full min-w-[980px] text-left text-sm"
                      : "w-full min-w-[800px] text-left text-sm"
                  }
                >
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Tür</th>
                      <th className="px-4 py-3 font-medium">Liste</th>
                      <th className="px-4 py-3 font-medium">Teklif</th>
                      <th className="px-4 py-3 font-medium">Tahmini net</th>
                      {plusScenario ? (
                        <>
                          <th className="px-4 py-3 font-medium">Plus net</th>
                          <th className="px-4 py-3 font-medium">Δ Plus</th>
                        </>
                      ) : null}
                      <th className="px-4 py-3 font-medium">Marj</th>
                      <th className="px-4 py-3 font-medium">Karar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">{o.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.sku}
                            {o.source === "import" ? " · yüklenen" : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div>{promoKindLabels[o.kind]}</div>
                          {o.tariffLabel ? (
                            <div className="mt-1">
                              <Badge tone="default">{o.tariffLabel}</Badge>
                            </div>
                          ) : null}
                          {o.tariffMismatch ? (
                            <div className="mt-1">
                              <Badge tone="warn">
                                Sapma %{o.tariffMismatch.currentRatePct} → %
                                {o.tariffMismatch.suggestedRatePct}
                              </Badge>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{formatTry(o.listPrice)}</td>
                        <td className="px-4 py-3 font-medium">{formatTry(o.offerPrice)}</td>
                        <td
                          className={
                            o.estimatedNet >= 0
                              ? "px-4 py-3 font-semibold text-profit"
                              : "px-4 py-3 font-semibold text-loss"
                          }
                        >
                          {formatTry(o.estimatedNet)}
                        </td>
                        {plusScenario ? (
                          <>
                            <td
                              className={
                                (o.plusEst?.net ?? 0) >= 0
                                  ? "px-4 py-3 font-semibold text-profit"
                                  : "px-4 py-3 font-semibold text-loss"
                              }
                            >
                              {o.plusEst ? formatTry(o.plusEst.net) : "—"}
                              {o.plusRatePct != null ? (
                                <div className="text-xs font-normal text-muted-foreground">
                                  %{o.plusRatePct}
                                </div>
                              ) : null}
                            </td>
                            <td
                              className={
                                (o.plusDeltaNet ?? 0) >= 0
                                  ? "px-4 py-3 font-semibold text-profit"
                                  : "px-4 py-3 font-semibold text-loss"
                              }
                            >
                              {o.plusDeltaNet != null
                                ? `${o.plusDeltaNet >= 0 ? "+" : ""}${formatTry(o.plusDeltaNet)}`
                                : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className="px-4 py-3">
                          <Badge tone={o.belowTarget ? "loss" : "profit"}>
                            {formatPct(o.displayMarginPct)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={o.belowTarget ? "loss" : "profit"}>
                            {o.belowTarget ? "Ele" : "Uygun"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
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
          ) : (
          <Card>
            <CardHeader>
              <CardTitle>Gerçekleşen kampanya kârı</CardTitle>
              <CardDescription>
                Tahmini marja karşı gerçekleşen — sapma varsa kırmızı.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">Tür</th>
                      <th className="px-4 py-3 font-medium">Sipariş</th>
                      <th className="px-4 py-3 font-medium">Tahmini</th>
                      <th className="px-4 py-3 font-medium">Gerçek</th>
                      <th className="px-4 py-3 font-medium">Net toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realizedRows.map((r) => {
                      const worse = r.realizedMarginPct < r.estimatedMarginPct - 0.5;
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.title}</div>
                            <div className="text-xs text-muted-foreground">{r.sku}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {promoKindLabels[r.kind]}
                          </td>
                          <td className="px-4 py-3">{r.orders}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatPct(r.estimatedMarginPct)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={worse ? "loss" : "profit"}>
                              {formatPct(r.realizedMarginPct)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-profit">
                            {formatTry(r.realizedNetTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          )}
        </>
      )}
    </DashboardShell>
  );
}

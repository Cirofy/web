"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { MarketplaceLogo } from "@/components/marketplace-logo";
import { formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getToken } from "@/lib/api";

const tabs = [
  { id: "stores", label: "Mağaza" },
  { id: "products", label: "Ürün" },
  { id: "ads", label: "Reklam" },
  { id: "influencers", label: "Influencer" },
] as const;

type TabId = (typeof tabs)[number]["id"];
type TrackedStore = {
  id: string;
  name: string;
  marketplace: string;
  productCount: number;
  lastChange: string;
  alert: boolean;
  changeKind?: "price_down" | "stock_down" | "stable";
  changeLabel?: string;
  affectedCount?: number;
};
type TrackedProduct = {
  id: string;
  title: string;
  marketplace: string;
  price: number;
  prevPrice: number;
  stock: string;
  alert: string;
  tariffMismatch: boolean;
  tariffRiskScore: number;
  tariffDeltaPct?: number | null;
  currentRatePct?: number | null;
  suggestedRatePct?: number | null;
  priceDropPct?: number;
};
type AdRadar = {
  id: string;
  keyword: string;
  marketplace: string;
  competitors: number;
  ourBidHint: string;
  note: string;
};
type Influencer = {
  id: string;
  handle: string;
  platform: string;
  productHint: string;
  reach: string;
  note: string;
};

type RadarAlert = {
  id: string;
  severity: "critical" | "warn" | "info";
  kind: string;
  title: string;
  detail: string;
  marketplace: string;
  sku?: string | null;
  ctaHref: string;
  ctaLabel: string;
};

type RadarPrefs = {
  priceDropPctThreshold: number;
  stockAlertEnabled: boolean;
};

const DEFAULT_PREFS: RadarPrefs = {
  priceDropPctThreshold: 3,
  stockAlertEnabled: true,
};

function storeChange(s: TrackedStore) {
  const kind = s.changeKind ?? (s.alert ? "price_down" : "stable");
  const changeLabel =
    s.changeLabel ??
    (s.lastChange.includes("·")
      ? s.lastChange.split("·")[0]?.trim()
      : s.lastChange);
  const affected =
    s.affectedCount ??
    (s.alert ? Number(s.lastChange.match(/(\d+)\s*ürün/)?.[1] ?? 0) : 0);
  return { kind, changeLabel, affected };
}

function changeClass(kind: string) {
  if (kind === "price_down") return "font-semibold text-loss";
  if (kind === "stock_down") return "font-semibold text-amber-800";
  return "font-medium text-foreground";
}

export default function RadarPage() {
  const ready = usePageReady();
  const [tab, setTab] = useState<TabId>("stores");
  const [trackedStores, setTrackedStores] = useState<TrackedStore[]>([]);
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [ads, setAds] = useState<AdRadar[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [prefs, setPrefs] = useState<RadarPrefs>(DEFAULT_PREFS);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [tariffRiskScore, setTariffRiskScore] = useState(0);
  const [tariffMismatchCount, setTariffMismatchCount] = useState(0);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{
          trackedStores: TrackedStore[];
          trackedProducts: TrackedProduct[];
          ads: AdRadar[];
          influencers: Influencer[];
          alerts?: RadarAlert[];
          prefs?: RadarPrefs;
          tariffRiskScore?: number;
          tariffMismatchCount?: number;
          source?: string;
          note?: string;
        }>("/radar");
        if (cancelled) return;
        if (res.trackedStores?.length) setTrackedStores(res.trackedStores);
        if (res.trackedProducts?.length) setTrackedProducts(res.trackedProducts);
        if (res.ads?.length) setAds(res.ads);
        if (res.influencers?.length) setInfluencers(res.influencers);
        if (res.alerts?.length) setAlerts(res.alerts);
        if (typeof res.tariffRiskScore === "number") {
          setTariffRiskScore(res.tariffRiskScore);
        }
        if (typeof res.tariffMismatchCount === "number") {
          setTariffMismatchCount(res.tariffMismatchCount);
        }
        if (res.prefs) {
          setPrefs({
            priceDropPctThreshold: Number(res.prefs.priceDropPctThreshold) || 3,
            stockAlertEnabled: !!res.prefs.stockAlertEnabled,
          });
        }
        if (
          res.trackedStores?.length ||
          res.trackedProducts?.length ||
          res.ads?.length
        ) {
          setFromApi(true);
        }
        if (res.note) setPrefsMsg(res.note);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStores = trackedStores.filter((s) => {
    if (onlyAlerts && !s.alert) return false;
    if (!s.alert) return true;
    const { kind } = storeChange(s);
    if (kind === "price_down") {
      const drop =
        (s as TrackedStore & { priceDropPct?: number }).priceDropPct ??
        Number(s.changeLabel?.match(/(\d+)/)?.[1] ?? 0);
      return drop >= prefs.priceDropPctThreshold;
    }
    if (kind === "stock_down" && !prefs.stockAlertEnabled) return false;
    return true;
  });

  const filteredProducts = trackedProducts.filter((p) => {
    if (onlyAlerts && !p.alert && !p.tariffMismatch) return false;
    if (!p.alert && !p.tariffMismatch) return true;
    if (p.tariffMismatch || (typeof p.alert === "string" && p.alert.includes("Tarife"))) {
      return true;
    }
    if (typeof p.alert === "string" && p.alert.includes("Fiyat")) {
      const fromField = p.priceDropPct;
      const fromLabel = Number(String(p.alert).match(/(\d+)/)?.[1] ?? NaN);
      const fromPrices =
        p.prevPrice > 0 && p.price < p.prevPrice
          ? Math.round(((p.prevPrice - p.price) / p.prevPrice) * 100)
          : 0;
      const drop = fromField ?? (Number.isFinite(fromLabel) ? fromLabel : fromPrices);
      return drop >= prefs.priceDropPctThreshold;
    }
    if (!prefs.stockAlertEnabled && String(p.alert).includes("Stok")) {
      return false;
    }
    return true;
  });

  const visibleAlerts = alerts.filter((a) => {
    if (a.kind === "tariff_mismatch") return true;
    if (a.kind === "price_down") {
      const drop = Number(a.detail.match(/−%(\d+)/)?.[1] ?? a.detail.match(/%(\d+)/)?.[1] ?? 99);
      return drop >= prefs.priceDropPctThreshold;
    }
    if ((a.kind === "stock_down" || a.kind === "stock_out") && !prefs.stockAlertEnabled) {
      return false;
    }
    return true;
  });

  const alertCount =
    visibleAlerts.length > 0
      ? visibleAlerts.length
      : filteredStores.filter((s) => s.alert).length +
        filteredProducts.filter((p) => p.alert).length;

  async function savePrefs() {
    if (!getToken()) {
      setPrefsMsg(
        `Eşik yerel uygulandı: fiyat −%${prefs.priceDropPctThreshold}${prefs.stockAlertEnabled ? " · stok açık" : " · stok kapalı"}.`,
      );
      return;
    }
    setSavingPrefs(true);
    try {
      const res = await apiFetch<RadarPrefs>("/radar/prefs", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setPrefs({
        priceDropPctThreshold: Number(res.priceDropPctThreshold) || 3,
        stockAlertEnabled: !!res.stockAlertEnabled,
      });
      // Yenile
      const overview = await apiFetch<{
        trackedStores: TrackedStore[];
        trackedProducts: TrackedProduct[];
        alerts?: RadarAlert[];
        note?: string;
      }>("/radar");
      if (overview.trackedStores?.length) setTrackedStores(overview.trackedStores);
      if (overview.trackedProducts?.length) {
        setTrackedProducts(overview.trackedProducts);
      }
      if (overview.alerts) setAlerts(overview.alerts);
      setPrefsMsg(
        overview.note ??
          `Alarm eşiği kaydedildi: fiyat −%${res.priceDropPctThreshold}.`,
      );
      setFromApi(true);
    } catch (err) {
      setPrefsMsg(err instanceof Error ? err.message : "Tercih kaydedilemedi.");
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Radar"
      description={
        fromApi
          ? "Rakip mağaza/ürün takibi, reklam kelimesi ve influencer sinyalleri."
          : "Rakip mağaza/ürün takibi, reklam kelimesi ve influencer sinyalleri — yerel önizleme."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Tarifeler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/buybox">Buybox</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Bağlantılar</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          {prefsMsg ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {prefsMsg}
            </div>
          ) : null}

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle>Alarm eşiği</CardTitle>
              <CardDescription>
                Rakip fiyat düşüşü bu oranın altındaysa uyarı sayılmaz. Stok
                uyarılarını ayrıca açıp kapatabilirsiniz.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label
                    htmlFor="radar-drop"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Fiyat düşüş eşiği
                  </label>
                  <div className="relative">
                    <input
                      id="radar-drop"
                      type="number"
                      min={0}
                      max={50}
                      step={1}
                      value={prefs.priceDropPctThreshold}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          priceDropPctThreshold: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-10 w-[6rem] rounded-xl border border-border bg-background pl-3 pr-8 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={prefs.stockAlertEnabled}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        stockAlertEnabled: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[hsl(var(--profit))]"
                  />
                  Stok uyarıları
                </label>
              </div>
              <Button
                size="sm"
                disabled={savingPrefs}
                onClick={() => void savePrefs()}
              >
                {savingPrefs ? "Kaydediliyor…" : "Eşiği kaydet"}
              </Button>
            </CardContent>
          </Card>

          {visibleAlerts.length > 0 ? (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Rakip uyarıları</CardTitle>
                    <CardDescription>
                      Öncelik sırasıyla — aksiyon alınacak sinyaller ({visibleAlerts.length}).
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant={onlyAlerts ? "default" : "outline"}
                    onClick={() => setOnlyAlerts((v) => !v)}
                  >
                    {onlyAlerts ? "Tüm liste" : "Sadece uyarılılar"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {visibleAlerts.slice(0, 8).map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            a.severity === "critical"
                              ? "loss"
                              : a.severity === "warn"
                                ? "warn"
                                : "default"
                          }
                        >
                          {a.severity === "critical"
                            ? "Kritik"
                            : a.severity === "warn"
                              ? "Uyarı"
                              : "Bilgi"}
                        </Badge>
                        <MarketplaceLogo marketplace={a.marketplace} height={12} />
                        <span className="font-medium">{a.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={a.ctaHref}>{a.ctaLabel}</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Takip edilen mağaza</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {trackedStores.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Takip edilen ürün</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {trackedProducts.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife risk</div>
                <div
                  className={
                    tariffRiskScore >= 70
                      ? "mt-1 font-display text-2xl font-bold text-loss"
                      : tariffRiskScore >= 40
                        ? "mt-1 font-display text-2xl font-bold text-amber-700"
                        : "mt-1 font-display text-2xl font-bold text-profit"
                  }
                >
                  {tariffRiskScore}
                  <span className="text-base font-semibold text-muted-foreground">
                    /100
                  </span>
                </div>
                {tariffMismatchCount > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {tariffMismatchCount} ürün sapması
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Uyumlu</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Aktif uyarı</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {alertCount}
                </div>
              </CardContent>
            </Card>
          </div>

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

          {tab === "stores" ? (
            <Card>
              <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>Mağaza takibi</CardTitle>
                  <CardDescription>
                    Rakip mağazalarda fiyat ve stok hareketi.
                    {fromApi ? " · canlı sinyal" : ""}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("products")}
                >
                  Ürün hareketlerine bak
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {filteredStores.map((s) => {
                    const { kind, changeLabel, affected } = storeChange(s);
                    return (
                      <div
                        key={s.id}
                        className={
                          s.alert
                            ? "rounded-xl border border-amber-200/80 bg-amber-50/50 p-4"
                            : "rounded-xl border border-border p-4"
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{s.name}</div>
                            <div className="mt-1">
                              <MarketplaceLogo marketplace={s.marketplace} height={12} />
                            </div>
                          </div>
                          <Badge tone={s.alert ? "warn" : "profit"}>
                            {s.alert ? "Uyarı" : "Stabil"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">Hareket</div>
                            <div className={changeClass(kind)}>{changeLabel}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Etkilenen</div>
                            <div className="font-medium">
                              {affected > 0 ? `${affected} ürün` : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Mağaza</th>
                        <th className="px-4 py-3 font-medium">Kanal</th>
                        <th className="px-4 py-3 font-medium">İzlenen</th>
                        <th className="px-4 py-3 font-medium">Hareket</th>
                        <th className="px-4 py-3 font-medium">Etkilenen</th>
                        <th className="px-4 py-3 font-medium">Durum</th>
                        <th className="px-4 py-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStores.map((s) => {
                        const { kind, changeLabel, affected } = storeChange(s);
                        return (
                          <tr key={s.id} className="border-t border-border hover:bg-muted/40">
                            <td className="px-4 py-3 font-medium">{s.name}</td>
                            <td className="px-4 py-3">
                              <MarketplaceLogo marketplace={s.marketplace} height={14} />
                            </td>
                            <td className="px-4 py-3 tabular-nums">{s.productCount}</td>
                            <td className={`px-4 py-3 ${changeClass(kind)}`}>{changeLabel}</td>
                            <td className="px-4 py-3 tabular-nums">
                              {affected > 0 ? affected : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={s.alert ? "warn" : "profit"}>
                                {s.alert ? "Uyarı" : "Stabil"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {s.alert ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTab("products")}
                                >
                                  İncele
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "products" ? (
            <Card>
              <CardHeader>
                <CardTitle>Ürün takibi</CardTitle>
                <CardDescription>
                  Fiyat, stok ve tarife risk skoru.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {filteredProducts.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{p.title}</div>
                          <div className="mt-1">
                            <MarketplaceLogo marketplace={p.marketplace} height={12} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {p.tariffMismatch ? (
                            <Badge tone="warn">
                              Risk {p.tariffRiskScore ?? 0}
                            </Badge>
                          ) : null}
                          {p.alert ? (
                            <Badge tone="warn">{p.alert}</Badge>
                          ) : (
                            <Badge tone="profit">Stabil</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Fiyat</div>
                          <div className="font-medium">{formatTry(p.price)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Önceki</div>
                          <div className="font-medium text-muted-foreground">
                            {formatTry(p.prevPrice)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Stok</div>
                          <div className="font-medium">{p.stock}</div>
                        </div>
                      </div>
                      {p.tariffMismatch ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Komisyon %{p.currentRatePct} → tarife %{p.suggestedRatePct}
                          {p.tariffDeltaPct != null
                            ? ` (Δ${p.tariffDeltaPct > 0 ? "+" : ""}${p.tariffDeltaPct})`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Ürün</th>
                        <th className="px-4 py-3 font-medium">Kanal</th>
                        <th className="px-4 py-3 font-medium">Fiyat</th>
                        <th className="px-4 py-3 font-medium">Önceki</th>
                        <th className="px-4 py-3 font-medium">Stok</th>
                        <th className="px-4 py-3 font-medium">Tarife risk</th>
                        <th className="px-4 py-3 font-medium">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => {
                        const dropped = p.price < p.prevPrice;
                        return (
                          <tr key={p.id} className="border-t border-border hover:bg-muted/40">
                            <td className="px-4 py-3 font-medium">{p.title}</td>
                            <td className="px-4 py-3">
                              <MarketplaceLogo marketplace={p.marketplace} height={14} />
                            </td>
                            <td
                              className={
                                dropped
                                  ? "px-4 py-3 font-semibold text-loss tabular-nums"
                                  : "px-4 py-3 font-medium tabular-nums"
                              }
                            >
                              {formatTry(p.price)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                              {formatTry(p.prevPrice)}
                            </td>
                            <td className="px-4 py-3">{p.stock}</td>
                            <td className="px-4 py-3">
                              {p.tariffMismatch ? (
                                <div>
                                  <div
                                    className={
                                      (p.tariffRiskScore ?? 0) >= 70
                                        ? "font-semibold text-loss tabular-nums"
                                        : "font-semibold text-amber-700 tabular-nums"
                                    }
                                  >
                                    {p.tariffRiskScore ?? 0}
                                  </div>
                                  {p.tariffDeltaPct != null ? (
                                    <div className="text-xs text-muted-foreground">
                                      Δ{p.tariffDeltaPct > 0 ? "+" : ""}
                                      {p.tariffDeltaPct} puan
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {p.alert ? (
                                <Badge tone="warn">{p.alert}</Badge>
                              ) : (
                                <Badge tone="profit">Stabil</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "ads" ? (
            <Card>
              <CardHeader>
                <CardTitle>Reklam radarı</CardTitle>
                <CardDescription>
                  Kelime bazlı rakip yoğunluğu
                  {fromApi ? " — katalogdan." : " — yerel veri."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {ads.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">{a.keyword}</div>
                        <MarketplaceLogo marketplace={a.marketplace} height={14} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{a.note}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Rakip</div>
                          <div className="font-medium">{a.competitors}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Teklif</div>
                          <div className="font-medium">{a.ourBidHint}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Kelime</th>
                        <th className="px-4 py-3 font-medium">Kanal</th>
                        <th className="px-4 py-3 font-medium">Rakip reklam</th>
                        <th className="px-4 py-3 font-medium">Teklif ipucu</th>
                        <th className="px-4 py-3 font-medium">Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ads.map((a) => (
                        <tr key={a.id} className="border-t border-border hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{a.keyword}</td>
                          <td className="px-4 py-3">
                            <MarketplaceLogo marketplace={a.marketplace} height={14} />
                          </td>
                          <td className="px-4 py-3 tabular-nums">{a.competitors}</td>
                          <td className="px-4 py-3">{a.ourBidHint}</td>
                          <td className="px-4 py-3 text-muted-foreground">{a.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "influencers" ? (
            <Card>
              <CardHeader>
                <CardTitle>Influencer radarı</CardTitle>
                <CardDescription>
                  Kategoriyle ilgili içerik sinyalleri — pazarlama iddiası değil, izleme iskeleti.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {influencers.map((i) => (
                    <div key={i.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{i.handle}</div>
                        <Badge>{i.reach}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {i.productHint} · {i.note}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Hesap</th>
                        <th className="px-4 py-3 font-medium">Kanal</th>
                        <th className="px-4 py-3 font-medium">Ürün ipucu</th>
                        <th className="px-4 py-3 font-medium">Erişim</th>
                        <th className="px-4 py-3 font-medium">Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencers.map((i) => (
                        <tr key={i.id} className="border-t border-border hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{i.handle}</td>
                          <td className="px-4 py-3">{i.platform}</td>
                          <td className="px-4 py-3">{i.productHint}</td>
                          <td className="px-4 py-3">
                            <Badge>{i.reach}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{i.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}

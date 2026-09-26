"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Mail, Printer, Send } from "lucide-react";
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
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";
import { promoKindLabels } from "@/lib/promo-utils";
import {
  summarizeAdProfit,
  summarizeCampaignResults,
  summarizeCategoryProfit,
  summarizeReturnLoss,
  type AdProfitRow,
  type CampaignResultRow,
} from "@/lib/profit-utils";
import { MarketplaceLogo } from "@/components/marketplace-logo";
import {
  AdSpendChart,
  CategoryBarChart,
  ProfitChart,
} from "@/components/charts";

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type MailPrefs = {
  email: string;
  daily: boolean;
  monthly: boolean;
  tariffChange: boolean;
  sendHourUtc: number;
};

type PlusAbRow = {
  productId: string;
  sku: string | null;
  title: string;
  storeName: string;
  marketplace: string;
  category: string;
  standardRatePct: number;
  plusRatePct: number;
  standardNet: number;
  plusNet: number;
  deltaNet: number;
  isOverride: boolean;
};

/** Türkiye saati sabit UTC+3 (yaz/kış uygulaması yok). */
const TR_UTC_OFFSET = 3;

function utcToTrHour(utcHour: number) {
  return ((Math.trunc(utcHour) % 24) + TR_UTC_OFFSET + 24) % 24;
}

function trHourToUtc(trHour: number) {
  return ((Math.trunc(trHour) % 24) - TR_UTC_OFFSET + 24) % 24;
}

function formatTrHour(utcHour: number) {
  return `${String(utcToTrHour(utcHour)).padStart(2, "0")}:00`;
}

type DigestJob = {
  id: string;
  cadence: string;
  status: string;
  note?: string;
  createdAt: string;
  sentAt?: string;
};

const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Kuyrukta",
  sent: "Gönderildi",
  sent_mock: "Gönderildi",
  failed: "Başarısız",
  skipped: "Atlandı",
};

type ReportTab = "summary" | "ads" | "campaigns";

type AdRow = AdProfitRow;

function AdsReportSection({
  adSummary,
  onExport,
  onMessage,
}: {
  adSummary: ReturnType<typeof summarizeAdProfit>;
  onExport: () => void;
  onMessage: (msg: string) => void;
}) {
  const [rows, setRows] = useState<AdRow[]>([]);
  const [pulling, setPulling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const liveSummary = useMemo(() => summarizeAdProfit(rows), [rows]);

  async function pullAds() {
    if (!getToken()) {
      onMessage("Reklam çekimi için giriş yapın.");
      return;
    }
    setPulling(true);
    try {
      const res = await apiFetch<{
        rows: Array<{
          sku: string;
          title: string;
          marketplace: string;
          adSpend: number;
          attributedSales: number;
          orders: number;
          influencerFee: number;
          netAfterAds: number;
        }>;
        note?: string;
        source?: string;
      }>("/ads/pull", { method: "POST" });
      const mapped: AdRow[] = (res.rows ?? []).map((r, i) => ({
        id: `live-${i}`,
        sku: r.sku,
        title: r.title,
        marketplace:
          r.marketplace === "HEPSIBURADA" || r.marketplace === "Hepsiburada"
            ? "Hepsiburada"
            : "Trendyol",
        adSpend: r.adSpend,
        attributedSales: r.attributedSales,
        orders: r.orders,
        influencerFee: r.influencerFee,
        netAfterAds: r.netAfterAds,
      }));
      setRows(mapped);
      setNote(
        res.note ??
          (mapped.length === 0
            ? "Reklam verisi yok — uçları bağlayın veya harcamayı çekin."
            : "Reklam harcaması güncellendi."),
      );
      onMessage(res.note ?? "Reklam harcaması çekildi.");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Çekim başarısız.");
    } finally {
      setPulling(false);
    }
  }

  const summary = rows.length === 0 ? adSummary : liveSummary;

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Reklam harcaması</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {formatTry(summary.spend)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Atfedilen satış</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {formatTry(summary.sales)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">ROAS</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {summary.roas.toFixed(2)}x
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Reklam sonrası net</div>
            <div
              className={
                summary.net >= 0
                  ? "mt-1 font-display text-2xl font-bold text-profit"
                  : "mt-1 font-display text-2xl font-bold text-loss"
              }
            >
              {formatTry(summary.net)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Influencer {formatTry(summary.influencer)} · {summary.losing} zararlı SKU
            </div>
          </CardContent>
        </Card>
      </div>

      {note ? (
        <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {note}
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Harcama × net</CardTitle>
          <CardDescription>
            SKU bazında reklam harcaması ve reklam sonrası net.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdSpendChart
            data={rows.map((r) => ({
              label: r.title,
              adSpend: r.adSpend,
              netAfterAds: r.netAfterAds,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Reklam kârlılık</CardTitle>
            <CardDescription>
              Harcama + influencer kesintisi sonrası net.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pulling} onClick={() => void pullAds()}>
              {pulling ? "Çekiliyor…" : "Harcamayı çek"}
            </Button>
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Ürün</th>
                  <th className="px-4 py-3 font-medium">Kanal</th>
                  <th className="px-4 py-3 font-medium">Harcama</th>
                  <th className="px-4 py-3 font-medium">Satış</th>
                  <th className="px-4 py-3 font-medium">Influencer</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Reklam satırı yok. Harcamayı çek ile güncelleyin.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.sku} · {r.orders} sipariş
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MarketplaceLogo marketplace={r.marketplace} height={14} />
                    </td>
                    <td className="px-4 py-3">{formatTry(r.adSpend)}</td>
                    <td className="px-4 py-3">{formatTry(r.attributedSales)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatTry(r.influencerFee)}
                    </td>
                    <td
                      className={
                        r.netAfterAds >= 0
                          ? "px-4 py-3 font-semibold text-profit"
                          : "px-4 py-3 font-semibold text-loss"
                      }
                    >
                      {formatTry(r.netAfterAds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function ReportsPage() {
  const ready = usePageReady();
  const [range, setRange] = useState<"7" | "30">("7");
  const [tab, setTab] = useState<ReportTab>("summary");
  const [mailPrefs, setMailPrefs] = useState<MailPrefs>({
    daily: false,
    monthly: false,
    tariffChange: false,
    email: "",
    sendHourUtc: 6,
  });
  const [jobs, setJobs] = useState<DigestJob[]>([]);
    const [saving, setSaving] = useState(false);
  const [tariffMismatches, setTariffMismatches] = useState<TariffMismatchRow[]>(
    [],
  );
  const [plusAb, setPlusAb] = useState<{
    items: PlusAbRow[];
    summary: {
      productCount: number;
      totalStandardNet: number;
      totalPlusNet: number;
      deltaTotal: number;
      winner: "standard" | "plus" | "tie";
    } | null;
    message: string;
  } | null>(null);
  const [categoryApi, setCategoryApi] = useState<Array<{
    category: string;
    orderCount: number;
    gross: number;
    net: number;
    marginPct: number;
  }> | null>(null);
  type SummaryShape = {
    netProfit: number;
    marginPct: number;
    orderCount: number;
    grossAmount: number;
    stores: number;
    connectedStores: number;
    hasData: boolean;
    chart: Array<{ day: string; profit: number; sales: number }>;
    delta: { netProfit: number; marginPct: number; orderCount: number; grossAmount: number };
  };
  const [summaryLive, setSummaryLive] = useState<SummaryShape | null>(null);
  const [chartLive, setChartLive] = useState<Array<{ day: string; profit: number; sales: number }> | null>(null);

  const returnSummary = summarizeReturnLoss([]);
  const emptyCategories = useMemo(() => summarizeCategoryProfit([]), []);
  const categories = categoryApi ?? emptyCategories;
  const adSummary = useMemo(() => summarizeAdProfit([]), []);
  type CampaignRow = CampaignResultRow & { fromOrders?: boolean };
  const [campaignRows, setCampaignRows] = useState<CampaignRow[] | null>(null);
  const [campaignNote, setCampaignNote] = useState<string | null>(null);
  const campaignSummary = useMemo(
    () => summarizeCampaignResults(campaignRows ?? []),
    [campaignRows],
  );
  const s = summaryLive ?? {
    netProfit: 0,
    marginPct: 0,
    orderCount: 0,
    grossAmount: 0,
    stores: 0,
    connectedStores: 0,
    hasData: false,
    chart: [],
    delta: { netProfit: 0, marginPct: 0, orderCount: 0, grossAmount: 0 },
  };
  const chartData = chartLive ?? [];

  useEffect(() => {
    if (!ready || !getToken()) return;
    void apiFetch<MailPrefs>("/reports/mail-prefs")
      .then((p) => {
        if (p.email) {
          setMailPrefs({
            email: p.email,
            daily: p.daily,
            monthly: p.monthly,
            tariffChange: Boolean(p.tariffChange),
            sendHourUtc:
              typeof p.sendHourUtc === "number" ? p.sendHourUtc : 6,
          });
        }
      })
      .catch(() => undefined);
    void apiFetch<{ jobs: DigestJob[] }>("/reports/jobs")
      .then((r) => setJobs(r.jobs ?? []))
      .catch(() => undefined);
    void loadTariffMismatches(200).then((r) => setTariffMismatches(r.items));
    void apiFetch<{
      items: PlusAbRow[];
      summary: {
        productCount: number;
        totalStandardNet: number;
        totalPlusNet: number;
        deltaTotal: number;
        winner: "standard" | "plus" | "tie";
      };
      message: string;
    }>("/reports/plus-vs-standard")
      .then((r) =>
        setPlusAb({
          items: r.items ?? [],
          summary: r.summary ?? null,
          message: r.message ?? "",
        }),
      )
      .catch(() => undefined);
  }, [ready]);

  useEffect(() => {
    if (!ready || !getToken()) {
      setSummaryLive(null);
      setChartLive(null);
      return;
    }
    void apiFetch<{
      netProfit: number;
      marginPct: number;
      orderCount: number;
      grossAmount: number;
      stores: number;
      connectedStores: number;
      hasData?: boolean;
      chart?: Array<{ day: string; profit: number; sales: number }>;
      delta?: {
        netProfit: number;
        marginPct: number;
        orderCount: number;
        grossAmount: number;
      };
    }>(`/dashboard/summary?days=${range}`)
      .then((res) => {
        if (!res?.hasData) {
          setSummaryLive(null);
          setChartLive(null);
          return;
        }
        setSummaryLive({
          netProfit: Number(res.netProfit) || 0,
          marginPct: Number(res.marginPct) || 0,
          orderCount: Number(res.orderCount) || 0,
          grossAmount: Number(res.grossAmount) || 0,
          stores: Number(res.stores) || 0,
          connectedStores: Number(res.connectedStores) || 0,
          hasData: true,
          chart: Array.isArray(res.chart) && res.chart.length ? res.chart : [],
          delta: res.delta ?? { netProfit: 0, marginPct: 0, orderCount: 0, grossAmount: 0 },
        });
        if (Array.isArray(res.chart) && res.chart.length) {
          setChartLive(res.chart);
        }
      })
      .catch(() => {
        setSummaryLive(null);
        setChartLive(null);
      });
  }, [ready, range]);

  useEffect(() => {
    if (!ready || !getToken()) return;
    void apiFetch<{
      items: Array<{
        category: string;
        orderCount: number;
        gross: number;
        net: number;
        marginPct: number;
      }>;
    }>(`/reports/category-profit?days=${range}`)
      .then((r) => {
        if (r.items?.length) setCategoryApi(r.items);
      })
      .catch(() => undefined);
  }, [ready, range]);

  useEffect(() => {
    if (!ready || !getToken()) return;
    void apiFetch<{
      rows: CampaignRow[];
      summary: {
        campaigns: number;
        orders: number;
        net: number;
        worseThanEstimate: number;
        fromOrders?: number;
      };
      note?: string;
      message?: string;
    }>("/promotions/realized")
      .then((r) => {
        if (r.rows?.length) {
          setCampaignRows(r.rows);
          setCampaignNote(r.note || r.message || null);
        }
      })
      .catch(() => undefined);
  }, [ready]);

  function exportSummaryCsv() {
    const header = ["metric", "value"];
    const rows = [
      ["period_days", range],
      ["net_profit", s.netProfit],
      ["margin_pct", s.marginPct],
      ["order_count", s.orderCount],
      ["gross_amount", s.grossAmount],
      ["return_loss", returnSummary.loss],
      ["return_count", returnSummary.count],
      ["tariff_mismatch_count", tariffMismatches.length],
    ];
    const csv =
      "\uFEFF" +
      [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    downloadText("cirofy-ozet-rapor.csv", csv, "text/csv;charset=utf-8");
    toast("Özet CSV indirildi.");
  }

  function exportDailyCsv() {
    const csv =
      "\uFEFF" +
      ["day;profit;sales", ...chartData.map((d) => `${d.day};${d.profit};${d.sales}`)].join(
        "\n",
      );
    downloadText("cirofy-gunluk-kar.csv", csv, "text/csv;charset=utf-8");
    toast("Günlük kâr CSV indirildi.");
  }

  function exportOrdersCsv() {
    const header = "external_id;product;status;gross;net;marketplace";
    // Canlı veriler için sipariş CSV'yi API üzerinden indirin
    downloadText(
      "cirofy-siparis-kar.csv",
      "\uFEFF" + [header].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("Sipariş CSV: Canlı veri için mağazanızı bağlayın.");
  }

  function exportCategoryCsv() {
    const header = "category;orders;gross;net;margin_pct";
    const lines = categories.map((c) =>
      [c.category, c.orderCount, c.gross, c.net, c.marginPct].join(";"),
    );
    downloadText(
      "cirofy-kategori-kar.csv",
      "\uFEFF" + [header, ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("Kategori kârlılık CSV indirildi.");
  }

  function exportTariffCsv() {
    const header =
      "sku;title;category;marketplace;current_rate_pct;suggested_rate_pct;suggested_plus_rate_pct;delta_pct;tariff_category";
    const lines = tariffMismatches.map((r) =>
      [
        r.sku ?? "",
        `"${r.title.replace(/"/g, '""')}"`,
        r.category ?? "",
        r.marketplace,
        r.currentRatePct,
        r.suggestedRatePct,
        r.suggestedPlusRatePct,
        r.deltaPct,
        r.tariffCategory,
      ].join(";"),
    );
    downloadText(
      "cirofy-tarife-sapmasi.csv",
      "\uFEFF" + [header, ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast(tariffMismatches.length
        ? `Tarife sapması CSV indirildi (${tariffMismatches.length} satır).`
        : "Tarife sapması yok — boş CSV indirildi.",);
  }

  function exportAdsCsv() {
    const header =
      "sku;title;marketplace;ad_spend;sales;orders;influencer_fee;net_after_ads";
    downloadText(
      "cirofy-reklam-kar.csv",
      "\uFEFF" + [header].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("Reklam CSV: Reklam verilerini yukarıdan çekin.");
  }

  function exportCampaignsCsv() {
    const header =
      "sku;kind;offer_price;orders;est_margin;real_margin;realized_net";
    const lines = (campaignRows ?? []).map((r) =>
      [
        r.sku,
        r.kind,
        r.offerPrice,
        r.orders,
        r.estimatedMarginPct,
        r.realizedMarginPct,
        r.realizedNetTotal,
      ].join(";"),
    );
    downloadText(
      "cirofy-kampanya-gerceklesen.csv",
      "\uFEFF" + [header, ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("Kampanya gerçekleşen CSV indirildi.");
  }

  function exportPrintableSummary() {
    const text = [
      "Cirofy — dönem özeti",
      "====================",
      `Aralık özeti`,
      `Aralık: son ${range} gün`,
      "",
      `Net kâr: ${s.netProfit}`,
      `Net marj: %${s.marginPct}`,
      `Sipariş: ${s.orderCount}`,
      `Brüt: ${s.grossAmount}`,
      `İade zararı: ${returnSummary.loss} (${returnSummary.count} iade)`,
      `Reklam sonrası net: ${adSummary.net} (ROAS ${adSummary.roas.toFixed(2)}x)`,
      `Kampanya net: ${campaignSummary.net} (${campaignSummary.campaigns} kampanya)`,
      `Tarife sapması: ${tariffMismatches.length} ürün`,
      "",
      "Kategori net:",
      ...categories.map((c) => `  ${c.category}: ${c.net} (%${c.marginPct})`),
      "",
      ...(tariffMismatches.length
        ? [
            "Tarife sapması:",
            ...tariffMismatches
              .slice(0, 15)
              .map(
                (r) =>
                  `  ${r.sku || r.title}: %${r.currentRatePct} → %${r.suggestedRatePct} (Δ ${r.deltaPct})`,
              ),
            "",
          ]
        : []),
      "Günlük net:",
      ...chartData.map((d) => `  ${d.day}: ${d.profit}`),
    ].join("\n");
    downloadText("cirofy-ozet.txt", text);
    toast("Yazdırılabilir özet metin indirildi.");
  }

  function printSummary() {
    window.print();
    toast("Yazdır / PDF kaydet diyaloğu açıldı.");
  }

  async function saveMailPrefs() {
    setSaving(true);
    try {
      if (getToken()) {
        await apiFetch("/reports/mail-prefs", {
          method: "PUT",
          body: JSON.stringify(mailPrefs),
        });
        toast(`Rapor maili kaydedildi: günlük ${mailPrefs.daily ? "açık" : "kapalı"}, aylık ${mailPrefs.monthly ? "açık" : "kapalı"}, saat ${formatTrHour(mailPrefs.sendHourUtc)} (TR) → ${mailPrefs.email}`,);
      } else {
        toast(`Rapor maili yerel kaydedildi: günlük ${mailPrefs.daily ? "açık" : "kapalı"}, aylık ${mailPrefs.monthly ? "açık" : "kapalı"}, saat ${formatTrHour(mailPrefs.sendHourUtc)} (TR) → ${mailPrefs.email}`,);
      }
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Kayıt başarısız.", tone: "loss" });
    } finally {
      setSaving(false);
    }
  }

  async function enqueueDigest(cadence: "daily" | "monthly") {
    if (!getToken()) {
      toast("Özet kuyruğu için giriş yapın.");
      return;
    }
    try {
      const [job, payload] = await Promise.all([
        apiFetch<{
          id: string;
          note?: string;
          status: string;
        }>("/reports/enqueue-digest", {
          method: "POST",
          body: JSON.stringify({ cadence }),
        }),
        apiFetch<{
          metrics?: {
            orderCount: number;
            netProfit: number;
            marginPct: number;
          };
          title?: string;
        }>("/reports/digest-payload", {
          method: "POST",
          body: JSON.stringify({ cadence }),
        }),
      ]);
      setJobs((prev) => [job as DigestJob, ...prev].slice(0, 20));
      const m = payload.metrics;
      const metricNote = m
        ? ` · ${m.orderCount} sipariş · net ${formatTry(m.netProfit)} · marj %${m.marginPct}`
        : "";
      toast((job.note ?? `Özet kuyruğa alındı (${cadence}).`) + metricNote);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Kuyruk başarısız.", tone: "loss" });
    }
  }

  async function retryFailedJobs() {
    if (!getToken()) {
      toast("Yeniden denemek için giriş yapın.");
      return;
    }
    try {
      const res = await apiFetch<{
        retried: number;
        message: string;
        jobs: DigestJob[];
      }>("/reports/retry-failed", { method: "POST" });
      if (res.jobs?.length) {
        setJobs((prev) => [...res.jobs, ...prev].slice(0, 20));
      } else {
        const refreshed = await apiFetch<{ jobs: DigestJob[] }>("/reports/jobs");
        setJobs(refreshed.jobs ?? []);
      }
      toast(res.message);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Yeniden deneme başarısız.", tone: "loss" });
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Raporlar"
      description="Özet, kategori kârlılığı ve sipariş dışa aktarımı; günlük/aylık mail tercihi."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Özete dön</Link>
        </Button>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          

          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["summary", "Özet"],
                ["ads", "Reklam"],
                ["campaigns", "Kampanya"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? "default" : "outline"}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {tab === "summary" ? (
            <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={range === "7" ? "default" : "outline"}
              onClick={() => setRange("7")}
            >
              Son 7 gün
            </Button>
            <Button
              size="sm"
              variant={range === "30" ? "default" : "outline"}
              onClick={() => setRange("30")}
            >
              Son 30 gün
            </Button>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Net kâr</div>
                <div className="mt-1 font-display text-2xl font-bold text-profit">
                  {formatTry(s.netProfit)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Marj</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {formatPct(s.marginPct)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Sipariş</div>
                <div className="mt-1 font-display text-2xl font-bold">{s.orderCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">İade zararı</div>
                <div className="mt-1 font-display text-2xl font-bold text-loss">
                  {formatTry(returnSummary.loss)}
                </div>
                <Link
                  href="/returns"
                  className="mt-2 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Derin analiz →
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Haftalık kâr</CardTitle>
                <CardDescription>Net kâr ve ciro — son 7 gün</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfitChart data={chartData} height={260} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Kategori dağılımı</CardTitle>
                <CardDescription>Kategori bazında net kâr</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryBarChart
                  data={categories.map((c) => ({
                    category: c.category,
                    net: c.net,
                    marginPct: c.marginPct,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Kategori kârlılık</CardTitle>
              <CardDescription>
                Siparişlerin ürün kategorisine göre net kâr ve marj
                {categoryApi ? " · canlı" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Button size="sm" variant="outline" onClick={exportCategoryCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Kategori CSV
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Kategori</th>
                      <th className="px-4 py-3 font-medium">Sipariş</th>
                      <th className="px-4 py-3 font-medium">Brüt</th>
                      <th className="px-4 py-3 font-medium">Net</th>
                      <th className="px-4 py-3 font-medium">Marj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.category} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{c.category}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.orderCount}</td>
                        <td className="px-4 py-3">{formatTry(c.gross)}</td>
                        <td
                          className={
                            c.net >= 0
                              ? "px-4 py-3 font-semibold text-profit"
                              : "px-4 py-3 font-semibold text-loss"
                          }
                        >
                          {formatTry(c.net)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              c.marginPct >= 15
                                ? "profit"
                                : c.marginPct >= 8
                                  ? "warn"
                                  : "loss"
                            }
                          >
                            {formatPct(c.marginPct)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Plus vs standart</CardTitle>
                  <CardDescription>
                    Aynı katalogda standart ve Plus tarife net kâr farkı.
                  </CardDescription>
                </div>
                {plusAb?.summary ? (
                  <Badge
                    tone={
                      plusAb.summary.winner === "standard"
                        ? "profit"
                        : plusAb.summary.winner === "plus"
                          ? "warn"
                          : "default"
                    }
                  >
                    {plusAb.summary.winner === "standard"
                      ? "Standart daha iyi"
                      : plusAb.summary.winner === "plus"
                        ? "Plus daha iyi"
                        : "Eşdeğer"}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {plusAb?.summary ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-xs text-muted-foreground">Standart net</div>
                    <div className="mt-1 font-display text-lg font-bold">
                      {formatTry(plusAb.summary.totalStandardNet)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-xs text-muted-foreground">Plus net</div>
                    <div className="mt-1 font-display text-lg font-bold">
                      {formatTry(plusAb.summary.totalPlusNet)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-xs text-muted-foreground">Plus − Standart</div>
                    <div
                      className={
                        plusAb.summary.deltaTotal >= 0
                          ? "mt-1 font-display text-lg font-bold text-profit"
                          : "mt-1 font-display text-lg font-bold text-loss"
                      }
                    >
                      {plusAb.summary.deltaTotal >= 0 ? "+" : ""}
                      {formatTry(plusAb.summary.deltaTotal)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Giriş yapınca katalog tarife karşılaştırması yüklenir.
                </p>
              )}
              {plusAb?.items?.length ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Ürün</th>
                        <th className="px-3 py-2 font-medium">Std %</th>
                        <th className="px-3 py-2 font-medium">Plus %</th>
                        <th className="px-3 py-2 font-medium">Δ net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plusAb.items.slice(0, 30).map((r) => (
                        <tr key={r.productId} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.storeName}
                              {r.isOverride ? " · override" : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            %{r.standardRatePct}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            %{r.plusRatePct}
                          </td>
                          <td
                            className={
                              r.deltaNet >= 0
                                ? "px-3 py-2 tabular-nums text-profit"
                                : "px-3 py-2 tabular-nums text-loss"
                            }
                          >
                            {r.deltaNet >= 0 ? "+" : ""}
                            {formatTry(r.deltaNet)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Tarife sapması</CardTitle>
                  <CardDescription>
                    Ürün komisyonu ile kategori tarifesi farkı — kâr hesabını
                    bozan satırlar.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tariffMismatches.length > 0 ? (
                    <Badge tone="warn">{tariffMismatches.length} ürün</Badge>
                  ) : (
                    <Badge tone="profit">Uyumlu</Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={exportTariffCsv}>
                    <Download className="h-3.5 w-3.5" />
                    Tarife CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tariffMismatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tarifeyle uyumlu ürünler — sapma yok. Giriş yapınca canlı liste
                  yüklenir.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Ürün</th>
                        <th className="px-4 py-3 font-medium">Kategori</th>
                        <th className="px-4 py-3 font-medium">Mevcut %</th>
                        <th className="px-4 py-3 font-medium">Tarife %</th>
                        <th className="px-4 py-3 font-medium">Fark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffMismatches.slice(0, 40).map((r) => (
                        <tr key={r.productId} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.sku || "—"} · {r.marketplace}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.category || r.tariffCategory}
                          </td>
                          <td className="px-4 py-3">{formatPct(r.currentRatePct)}</td>
                          <td className="px-4 py-3">{formatPct(r.suggestedRatePct)}</td>
                          <td className="px-4 py-3">
                            <Badge tone="warn">
                              {r.deltaPct > 0 ? "+" : ""}
                              {formatPct(r.deltaPct)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2" data-print-hide>
            <Card>
              <CardHeader>
                <CardTitle>Dışa aktar</CardTitle>
                <CardDescription>
                  CSV ve yazdırılabilir özet — PDF için tarayıcı kaydı.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <Button variant="outline" onClick={exportSummaryCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Özet CSV
                </Button>
                <Button variant="outline" onClick={exportDailyCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Günlük kâr CSV
                </Button>
                <Button variant="outline" onClick={exportOrdersCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Sipariş kârlılık CSV
                </Button>
                <Button variant="outline" onClick={exportCategoryCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Kategori CSV
                </Button>
                <Button variant="outline" onClick={exportTariffCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Tarife sapması CSV
                </Button>
                <Button variant="outline" onClick={exportPrintableSummary}>
                  <Download className="h-3.5 w-3.5" />
                  Özet metin
                </Button>
                <Button variant="outline" onClick={printSummary}>
                  <Printer className="h-3.5 w-3.5" />
                  Yazdır / PDF kaydet
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rapor maili</CardTitle>
                <CardDescription>
                  Günlük / aylık özet. Türkiye saatine göre seçilen zamanda otomatik
                  kuyruklanır; elle de gönderebilirsiniz.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="report-email">
                    E-posta
                  </label>
                  <input
                    id="report-email"
                    type="email"
                    value={mailPrefs.email}
                    onChange={(e) =>
                      setMailPrefs((p) => ({ ...p, email: e.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="report-hour">
                    Gönderim saati (Türkiye)
                  </label>
                  <Select
                    value={String(utcToTrHour(mailPrefs.sendHourUtc ?? 6))}
                    onValueChange={(v) =>
                      setMailPrefs((p) => ({
                        ...p,
                        sendHourUtc: trHourToUtc(Number(v)),
                      }))
                    }
                  >
                    <SelectTrigger id="report-hour" className="w-full sm:w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Seçilen saat Türkiye saatine göre. Kuyruk her gün bu saatte çalışır
                    (şu an: {String(utcToTrHour(mailPrefs.sendHourUtc ?? 6)).padStart(2, "0")}
                    :00 TR).
                  </p>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={mailPrefs.daily}
                    onChange={(e) =>
                      setMailPrefs((p) => ({ ...p, daily: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[hsl(var(--profit))]"
                  />
                  Günlük özet
                  {mailPrefs.daily ? <Badge tone="profit">Açık</Badge> : <Badge>Kapalı</Badge>}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={mailPrefs.monthly}
                    onChange={(e) =>
                      setMailPrefs((p) => ({ ...p, monthly: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[hsl(var(--profit))]"
                  />
                  Aylık özet
                  {mailPrefs.monthly ? (
                    <Badge tone="profit">Açık</Badge>
                  ) : (
                    <Badge>Kapalı</Badge>
                  )}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(mailPrefs.tariffChange)}
                    onChange={(e) =>
                      setMailPrefs((p) => ({
                        ...p,
                        tariffChange: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[hsl(var(--profit))]"
                  />
                  Tarife değişiklik bildirimi
                  {mailPrefs.tariffChange ? (
                    <Badge tone="warn">Açık</Badge>
                  ) : (
                    <Badge>Kapalı</Badge>
                  )}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={saving} onClick={() => void saveMailPrefs()}>
                    <Mail className="h-3.5 w-3.5" />
                    {saving ? "Kaydediliyor…" : "Tercihi kaydet"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void enqueueDigest("daily")}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Günlük özet gönder
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void enqueueDigest("monthly")}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Aylık özet gönder
                  </Button>
                  {jobs.some((j) => j.status === "failed" || j.status === "queued") ? (
                    <Button
                      variant="outline"
                      onClick={() => void retryFailedJobs()}
                    >
                      Başarısızları yeniden dene
                    </Button>
                  ) : null}
                </div>
                {jobs.length > 0 ? (
                  <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">Son kuyruk</div>
                    {jobs.slice(0, 5).map((j) => (
                      <div key={j.id}>
                        {j.cadence === "daily" ? "Günlük" : "Aylık"} ·{" "}
                        {JOB_STATUS_LABEL[j.status] ?? j.status}
                        {j.note ? ` — ${j.note}` : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card
            className="mt-4 print:mt-0 print:border-0 print:bg-transparent print:shadow-none"
            id="report-print"
          >
            <CardHeader className="print:px-0">
              <CardTitle>Özet önizleme</CardTitle>
              <CardDescription className="print:hidden">
                Yazdır / PDF kaydet bu bloğu kullanır — kenar çubuğu ve dışa aktar gizlenir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm print:px-0">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
                <div>
                  <div className="font-display text-xl font-bold tracking-tight">
                    Cirofy dönem özeti
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Son {range} gün ·{" "}
                    {new Date().toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground print:text-black">
                  Gizli özet — mağaza içi kullanım
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">Net kâr</div>
                  <div className="mt-0.5 font-display text-lg font-bold">
                    {formatTry(s.netProfit)}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">Marj</div>
                  <div className="mt-0.5 font-display text-lg font-bold">
                    {formatPct(s.marginPct)}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">Sipariş</div>
                  <div className="mt-0.5 font-display text-lg font-bold">{s.orderCount}</div>
                </div>
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">Brüt</div>
                  <div className="mt-0.5 font-display text-lg font-bold">
                    {formatTry(s.grossAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">İade zararı</div>
                  <div className="mt-0.5 font-display text-lg font-bold">
                    {formatTry(returnSummary.loss)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {returnSummary.count} iade
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 print:rounded-none print:border-black/20">
                  <div className="text-xs text-muted-foreground">Reklam sonrası net</div>
                  <div className="mt-0.5 font-display text-lg font-bold">
                    {formatTry(adSummary.net)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ROAS {adSummary.roas.toFixed(2)}x
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="mb-2 font-medium">Kampanya özeti</div>
                <div className="grid gap-1 sm:grid-cols-3">
                  <div>
                    Kampanya: <strong>{campaignSummary.campaigns}</strong>
                  </div>
                  <div>
                    Sipariş: <strong>{campaignSummary.orders}</strong>
                  </div>
                  <div>
                    Net: <strong>{formatTry(campaignSummary.net)}</strong>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="mb-2 font-medium">Kategori net</div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {categories.map((c) => (
                    <div key={c.category}>
                      {c.category}: {formatTry(c.net)} ({formatPct(c.marginPct)})
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="mb-2 font-medium">Günlük net</div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {chartData.map((d) => (
                    <div key={d.day}>
                      {d.day}: {formatTry(d.profit)}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
            </>
          ) : null}

          {tab === "ads" ? (
            <AdsReportSection
              adSummary={adSummary}
              onExport={exportAdsCsv}
              onMessage={(msg) => toast(msg)}
            />
          ) : null}

          {tab === "campaigns" ? (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="text-sm text-muted-foreground">Kampanya</div>
                    <div className="mt-1 font-display text-2xl font-bold">
                      {campaignSummary.campaigns}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="text-sm text-muted-foreground">Sipariş</div>
                    <div className="mt-1 font-display text-2xl font-bold">
                      {campaignSummary.orders}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="text-sm text-muted-foreground">Gerçekleşen net</div>
                    <div className="mt-1 font-display text-2xl font-bold text-profit">
                      {formatTry(campaignSummary.net)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="text-sm text-muted-foreground">Tahminin altı</div>
                    <div className="mt-1 font-display text-2xl font-bold text-loss">
                      {campaignSummary.worseThanEstimate}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>Kampanya gerçekleşen kâr</CardTitle>
                    <CardDescription>
                      Teklif öncesi tahmine karşı gerçekleşen marj ve net
                      {campaignRows ? " · canlı" : ""}.
                      {campaignNote ? ` ${campaignNote}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/promotions">Teklifler</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportCampaignsCsv}>
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Ürün</th>
                          <th className="px-4 py-3 font-medium">Tür</th>
                          <th className="px-4 py-3 font-medium">Teklif</th>
                          <th className="px-4 py-3 font-medium">Sipariş</th>
                          <th className="px-4 py-3 font-medium">Tahmini marj</th>
                          <th className="px-4 py-3 font-medium">Gerçek marj</th>
                          <th className="px-4 py-3 font-medium">Gerçek net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(campaignRows ?? []).map((r) => {
                          const worse = r.realizedMarginPct < r.estimatedMarginPct - 0.5;
                          return (
                            <tr key={r.id} className="border-t border-border">
                              <td className="px-4 py-3">
                                <div className="font-medium">{r.title}</div>
                                <div className="text-xs text-muted-foreground">{r.sku}</div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {promoKindLabels[r.kind as keyof typeof promoKindLabels] ?? r.kind}
                              </td>
                              <td className="px-4 py-3">{formatTry(r.offerPrice)}</td>
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
            </>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}

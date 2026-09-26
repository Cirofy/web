"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
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
import { formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import {
  buildDisputePackage,
  settlementIssueLabels,
  type SettlementIssueType,
} from "@/lib/settlement-utils";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";

const issueFilters: Array<{ value: "all" | SettlementIssueType; label: string }> = [
  { value: "all", label: "Tüm sapmalar" },
  { value: "extra_shipping", label: settlementIssueLabels.extra_shipping },
  {
    value: "missing_return_commission",
    label: settlementIssueLabels.missing_return_commission,
  },
  { value: "missing_sale", label: settlementIssueLabels.missing_sale },
  { value: "desi_mismatch", label: settlementIssueLabels.desi_mismatch },
];

type SettlementPeriod = {
  id: string;
  storeId: string;
  storeName: string;
  period: string;
  expected: number;
  paid: number;
  diff: number;
  status: string;
  paidAt: string | null;
};
type SettlementIssue = {
  id: string;
  storeId: string;
  storeName: string;
  type: SettlementIssueType;
  orderId: string;
  period: string;
  expected: number;
  billed: number;
  diff: number;
  note: string;
  status?: string;
  productId?: string | null;
  sku?: string | null;
  tariffMismatch?: boolean;
  tariffDeltaPct?: number | null;
};
type StoreOption = { id: string; name: string; marketplace?: string };
type DesiGap = {
  productId: string;
  sku: string | null;
  title: string;
  desi: number;
  storeName: string;
  marketplace: string;
};

type TariffGap = {
  productId: string;
  sku: string | null;
  title: string;
  currentRatePct: number;
  suggestedRatePct: number;
  deltaPct: number;
  marketplace: string;
  category: string | null;
};

export default function SettlementsPage() {
  const ready = usePageReady();
  const [periods, setPeriods] = useState<SettlementPeriod[]>([]);
  const [allIssues, setAllIssues] = useState<SettlementIssue[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [storeName, setStoreName] = useState("");
  const [fromApi, setFromApi] = useState(false);
  const [issueType, setIssueType] = useState<"all" | SettlementIssueType>("all");
  const [showResolved, setShowResolved] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
  const [desiGaps, setDesiGaps] = useState<DesiGap[]>([]);
  const [desiGapMsg, setDesiGapMsg] = useState<string | null>(null);
  const [tariffGaps, setTariffGaps] = useState<TariffGap[]>([]);
  const [tariffGapMsg, setTariffGapMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  async function loadOverview() {
    const q =
      storeFilter !== "all"
        ? `?storeId=${encodeURIComponent(storeFilter)}`
        : "";
    const res = await apiFetch<{
      periods: SettlementPeriod[];
      issues: SettlementIssue[];
      desiGaps?: { count: number; items: DesiGap[]; message?: string };
      tariffGaps?: { count: number; items: TariffGap[]; message?: string };
      stores?: StoreOption[];
      storeName?: string;
      source?: string;
      note?: string;
    }>(`/settlements${q}`);
    if (res) {
      setPeriods(res.periods ?? []);
      setAllIssues(res.issues ?? []);
      setFromApi(true);
    }
    if (res.desiGaps) {
      setDesiGaps(res.desiGaps.items ?? []);
      setDesiGapMsg(res.desiGaps.message ?? null);
    }
    if (res.tariffGaps) {
      setTariffGaps(res.tariffGaps.items ?? []);
      setTariffGapMsg(res.tariffGaps.message ?? null);
    }
    if (res.stores?.length) setStores(res.stores);
    if (res.storeName) setStoreName(res.storeName);
  }

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadOverview();
      } catch {
        if (!cancelled) setFromApi(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeFilter]);

  async function syncSettlements() {
    if (!getToken()) {
      toast("Hakediş senkronu için giriş yapın.");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>(
        "/settlements/sync",
        { method: "POST", body: JSON.stringify({}) },
      );
      toast(res.message ?? "Senkron tamamlandı.");
      await loadOverview();
    } catch {
      toast("Hakediş senkronu tamamlanamadı. Tekrar deneyin.");
    } finally {
      setSyncBusy(false);
    }
  }

  const filteredPeriods = useMemo(() => {
    if (fromApi || storeFilter === "all") return periods;
    return periods.filter((p) => p.storeId === storeFilter);
  }, [fromApi, periods, storeFilter]);

  const filteredIssuesBase = useMemo(() => {
    if (fromApi || storeFilter === "all") return allIssues;
    return allIssues.filter((i) => i.storeId === storeFilter);
  }, [allIssues, fromApi, storeFilter]);

  const totalDiff = filteredPeriods.reduce((s, r) => s + r.diff, 0);
  const openCount = filteredIssuesBase.filter(
    (i) => (i.status ?? "open") === "open",
  ).length;

  const issues = useMemo(() => {
    let list = filteredIssuesBase;
    if (!showResolved) list = list.filter((i) => (i.status ?? "open") === "open");
    if (issueType !== "all") list = list.filter((i) => i.type === issueType);
    return list;
  }, [issueType, filteredIssuesBase, showResolved]);

  const issueSum = issues.reduce((s, i) => s + i.diff, 0);

  async function setIssueStatus(id: string, status: "open" | "resolved") {
    setBusyId(id);
    try {
      if (getToken()) {
        const res = await apiFetch<{
          ok: boolean;
          item?: SettlementIssue;
          message?: string;
        }>(`/settlements/issues/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        if (res.item) {
          setAllIssues((prev) =>
            prev.map((i) => (i.id === id ? { ...i, ...res.item, status } : i)),
          );
          toast(res.message ?? (status === "resolved" ? "Sapma kapatıldı." : "Sapma açıldı."));
          return;
        }
      }
      setAllIssues((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status } : i)),
      );
      toast(status === "resolved" ? "Sapma kapatıldı." : "Sapma yeniden açıldı.");
    } catch {
      toast("Durum güncellenemedi. Tekrar deneyin.");
    } finally {
      setBusyId(null);
    }
  }

  function exportDispute() {
    const pack = buildDisputePackage(
      issues.filter((i) => (i.status ?? "open") === "open"),
      {
        storeName,
        period: issueType === "all" ? "Tüm açık sapmalar" : settlementIssueLabels[issueType],
        tariffGaps,
      },
    );
    const blob = new Blob([pack.summary + "\n\n" + pack.csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cirofy-itiraz-paketi.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(
      `${pack.count} sapma + ${pack.tariffCount ?? 0} tarife satırı · toplam fark ${formatTry(pack.sum)}.`,
    );
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Hakediş"
      description={
        fromApi
          ? "Dönem özeti ve sapmalar — pazaryeri senkronu veya sipariş kayıtlarından."
          : "Dönem özeti ve sapma tipleri."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncBusy}
            onClick={() => void syncSettlements()}
          >
            <RefreshCw className={syncBusy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Hakediş senkronu
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={issues.length === 0}
            onClick={exportDispute}
          >
            <Download className="h-3.5 w-3.5" />
            İtiraz paketi
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton rows={4} />
      ) : (
        <>
          

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="settlement-store">
                Mağaza
              </label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger id="settlement-store" className="w-[240px]">
                  <SelectValue placeholder="Mağaza" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm mağazalar</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pb-2 text-sm text-muted-foreground">{storeName}</div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Dönem sayısı</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {filteredPeriods.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Toplam dönem farkı</div>
                <div
                  className={
                    totalDiff === 0
                      ? "mt-1 font-display text-2xl font-bold"
                      : totalDiff < 0
                        ? "mt-1 font-display text-2xl font-bold text-loss"
                        : "mt-1 font-display text-2xl font-bold text-profit"
                  }
                >
                  {formatTry(totalDiff)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Açık sapma satırı</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {openCount}
                </div>
              </CardContent>
            </Card>
          </div>

          {fromApi && (desiGaps.length > 0 || desiGapMsg) ? (
            <Card className="mb-4">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Desi boşlukları</CardTitle>
                    <CardDescription>
                      {desiGapMsg ||
                        "Desi tanımsız ürünlerde kargo sapması güvenilir değil."}
                    </CardDescription>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/products">Ürün desilerini düzelt</Link>
                  </Button>
                </div>
              </CardHeader>
              {desiGaps.length > 0 ? (
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {desiGaps.slice(0, 8).map((p) => (
                      <li
                        key={p.productId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.sku || "—"} · {p.storeName}
                          </div>
                        </div>
                        <Badge tone="warn">desi {p.desi}</Badge>
                      </li>
                    ))}
                  </ul>
                  {desiGaps.length > 8 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      +{desiGaps.length - 8} ürün daha
                    </p>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          {fromApi && (tariffGaps.length > 0 || tariffGapMsg) ? (
            <Card className="mb-4 border-amber-200/80 bg-amber-50/40">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Tarife sapması</CardTitle>
                    <CardDescription>
                      {tariffGapMsg ||
                        "Komisyon tarifeden sapan ürünlerde hakediş satırı sapabilir."}
                    </CardDescription>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/products">Ürünlerde düzelt</Link>
                  </Button>
                </div>
              </CardHeader>
              {tariffGaps.length > 0 ? (
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {tariffGaps.slice(0, 8).map((p) => (
                      <li
                        key={p.productId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.sku || "—"} · {p.marketplace}
                            {p.category ? ` · ${p.category}` : ""}
                          </div>
                        </div>
                        <Badge tone="warn">
                          %{p.currentRatePct} → %{p.suggestedRatePct}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  {tariffGaps.length > 8 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      +{tariffGaps.length - 8} ürün daha
                    </p>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hakediş dönemleri</CardTitle>
                <CardDescription>
                  Beklenen = sipariş neti tahmini · Ödenen = pazaryeri bildirimi
                  {fromApi ? " · kayıtlı özet" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredPeriods.map((s) => (
                    <div key={s.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{s.period}</div>
                          {s.storeName ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {s.storeName}
                            </div>
                          ) : null}
                        </div>
                        <Badge
                          tone={
                            s.status === "İnceleniyor"
                              ? "warn"
                              : s.diff < 0
                                ? "loss"
                                : "profit"
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Beklenen</div>
                          <div className="font-medium">{formatTry(s.expected)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Ödenen</div>
                          <div className="font-medium">{formatTry(s.paid)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Fark</div>
                          <div
                            className={
                              s.diff === 0
                                ? "font-semibold"
                                : s.diff < 0
                                  ? "font-semibold text-loss"
                                  : "font-semibold text-profit"
                            }
                          >
                            {s.diff === 0 ? "—" : formatTry(s.diff)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>Sapma kontrolü</CardTitle>
                  <CardDescription>
                    Filtreleyip incele — seçili satırlardan itiraz paketi indir.
                  </CardDescription>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-56">
                  <Select
                    value={issueType}
                    onValueChange={(v) =>
                      setIssueType(v as "all" | SettlementIssueType)
                    }
                  >
                    <SelectTrigger aria-label="Sapma tipi">
                      <SelectValue placeholder="Sapma tipi" />
                    </SelectTrigger>
                    <SelectContent>
                      {issueFilters.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResolved((v) => !v)}
                  >
                    {showResolved ? "Kapalıları gizle" : "Kapalıları göster"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    {issues.length} satır · seçili tip toplamı
                  </span>
                  <span
                    className={
                      issueSum < 0 ? "font-semibold text-loss" : "font-semibold"
                    }
                  >
                    {formatTry(issueSum)}
                  </span>
                </div>

                {issues.map((i) => {
                  const closed = (i.status ?? "open") === "resolved";
                  return (
                    <div
                      key={i.id}
                      className={
                        closed
                          ? "rounded-xl border border-border bg-muted/30 p-4 opacity-80"
                          : "rounded-xl border border-border p-4"
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{i.orderId}</div>
                        <div className="flex flex-wrap gap-2">
                          {closed ? <Badge tone="default">Kapalı</Badge> : null}
                          {i.tariffMismatch ? (
                            <Badge tone="warn">Tarife sapması</Badge>
                          ) : null}
                          <Badge tone="loss">{settlementIssueLabels[i.type]}</Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{i.note}</p>
                      {i.tariffMismatch ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ürün komisyonu tarifeden sapıyor
                          {typeof i.tariffDeltaPct === "number"
                            ? ` (Δ ${i.tariffDeltaPct > 0 ? "+" : ""}${i.tariffDeltaPct} puan)`
                            : ""}
                          .
                        </p>
                      ) : null}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Beklenen</div>
                          <div className="font-medium">{formatTry(i.expected)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Kesilen</div>
                          <div className="font-medium">{formatTry(i.billed)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Fark</div>
                          <div className="font-semibold text-loss">{formatTry(i.diff)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">{i.period}</div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === i.id}
                          onClick={() =>
                            void setIssueStatus(i.id, closed ? "open" : "resolved")
                          }
                        >
                          {closed ? "Yeniden aç" : "Kapat"}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  className="w-full"
                  disabled={issues.filter((i) => (i.status ?? "open") === "open").length === 0}
                  onClick={exportDispute}
                >
                  <Download className="h-3.5 w-3.5" />
                  İtiraz özeti indir
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

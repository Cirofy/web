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
import { MarketplaceLogo } from "@/components/marketplace-logo";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";

type TariffRow = {
  id: string;
  marketplace: string;
  marketplaceCode?: "TRENDYOL" | "HEPSIBURADA";
  category: string;
  ratePct: number;
  plusRatePct: number;
  note?: string | null;
};

type MismatchRow = {
  productId: string;
  sku: string | null;
  title: string;
  category: string | null;
  marketplace: string;
  currentRatePct: number;
  suggestedRatePct: number;
  suggestedPlusRatePct: number;
  tariffCategory: string;
  deltaPct: number;
  isOverride?: boolean;
};

type HistoryRow = {
  id: string;
  action: string;
  label: string;
  actor: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
};

export default function TariffsPage() {
  const ready = usePageReady();
  const [items, setItems] = useState<TariffRow[]>([]);
  const [mismatches, setMismatches] = useState<MismatchRow[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<"all" | "Trendyol" | "Hepsiburada">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mismatchBusy, setMismatchBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function load() {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ items: TariffRow[] }>("/tariffs");
      setItems(res.items ?? []);
      setFromApi(true);
    } catch {
      /* keep previous */
    }
    try {
      const mis = await apiFetch<{ items: MismatchRow[] }>("/tariffs/mismatches");
      setMismatches(mis.items ?? []);
    } catch {
      setMismatches([]);
    }
    try {
      const hist = await apiFetch<{ items: HistoryRow[] }>("/tariffs/history");
      setHistory(hist.items ?? []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  async function syncTariffs(opts?: { silent?: boolean }) {
    if (!getToken()) {
      if (!opts?.silent) toast("Tarife çekmek için giriş yapın.");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await apiFetch<{
        upserted: number;
        message: string;
        items?: TariffRow[];
      }>("/tariffs/sync", { method: "POST", body: JSON.stringify({}) });
      if (res.items?.length) {
        setItems(res.items);
        setFromApi(true);
      }
      setLastSyncedAt(new Date().toISOString());
      if (!opts?.silent) toast({ message: res.message, tone: "profit" });
      await load();
    } catch (err) {
      if (!opts?.silent) {
        toast({ message: err instanceof Error ? err.message : "Tarifeler çekilemedi.", tone: "loss" });
      }
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    return items.filter((r) => channel === "all" || r.marketplace === channel);
  }, [items, channel]);

  const mismatchRows = useMemo(() => {
    return mismatches.filter(
      (r) => channel === "all" || r.marketplace === channel,
    );
  }, [mismatches, channel]);

  async function applyTariff(id: string, usePlus: boolean) {
    setBusyId(`${id}:${usePlus ? "plus" : "base"}`);
    try {
      if (!getToken()) {
        toast("Uygulamak için giriş yapın.");
        return;
      }
      const res = await apiFetch<{ message: string; updated: number }>("/tariffs/apply", {
        method: "POST",
        body: JSON.stringify({ id, usePlus }),
      });
      toast(res.message);
      await load();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Uygulama başarısız.", tone: "loss" });
    } finally {
      setBusyId(null);
    }
  }

  async function applyAllMismatches(usePlus: boolean) {
    if (!getToken()) {
      toast("Uygulamak için giriş yapın.");
      return;
    }
    if (mismatchRows.length === 0) {
      toast("Güncellenecek sapma yok.");
      return;
    }
    setMismatchBusy(true);
    try {
      const res = await apiFetch<{ message: string; updated: number }>(
        "/tariffs/apply-mismatches",
        {
          method: "POST",
          body: JSON.stringify({
            productIds: mismatchRows.map((r) => r.productId),
            usePlus,
          }),
        },
      );
      toast(res.message);
      await load();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Toplu uygulama başarısız.", tone: "loss" });
    } finally {
      setMismatchBusy(false);
    }
  }

  async function applyOneMismatch(productId: string, usePlus: boolean) {
    if (!getToken()) {
      toast("Uygulamak için giriş yapın.");
      return;
    }
    setBusyId(productId);
    try {
      const res = await apiFetch<{ message: string }>("/tariffs/apply-product", {
        method: "POST",
        body: JSON.stringify({ productId, usePlus }),
      });
      toast(res.message);
      await load();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Uygulama başarısız.", tone: "loss" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      loading={!ready || loading}
      title="Komisyon tarifeleri"
      description={
        fromApi
          ? "Oranlar bağlı mağazanın hakediş / listing komisyon uçlarından gelir; ürüne uygulayınca net kâr güncellenir."
          : "Mağaza bağlayıp Senkron ile pazaryerinden komisyon oranlarını çekin."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={syncBusy || !getToken()}
            onClick={() => void syncTariffs()}
          >
            {syncBusy ? "Çekiliyor…" : "Tarifeleri güncelle"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">Ürünlere git</Link>
          </Button>
        </div>
      }
    >
      {!ready || loading ? (
        <ListPageSkeleton rows={8} />
      ) : (
        <>
          

          <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Tarife listesi</CardTitle>
                    <CardDescription>
                      Katalog tarifeleri. Uygula = eşleşen ürünlerin komisyonunu yazar.
                    </CardDescription>
                  </div>
                  <Select
                    value={channel}
                    onValueChange={(v) =>
                      setChannel(v as "all" | "Trendyol" | "Hepsiburada")
                    }
                  >
                    <SelectTrigger className="w-[160px]" aria-label="Kanal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm kanallar</SelectItem>
                      <SelectItem value="Trendyol">Trendyol</SelectItem>
                      <SelectItem value="Hepsiburada">Hepsiburada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{r.category}</div>
                          <div className="mt-1">
                            <MarketplaceLogo marketplace={r.marketplace} height={14} />
                          </div>
                        </div>
                        <Badge tone="default">%{r.ratePct}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Plus %{r.plusRatePct}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId != null}
                          onClick={() => void applyTariff(r.id, false)}
                        >
                          Uygula
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId != null}
                          onClick={() => void applyTariff(r.id, true)}
                        >
                          Plus uygula
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Kategori</th>
                        <th className="px-4 py-3 font-medium">Kanal</th>
                        <th className="px-4 py-3 font-medium">Standart</th>
                        <th className="px-4 py-3 font-medium">Plus</th>
                        <th className="px-4 py-3 font-medium">Not</th>
                        <th className="px-4 py-3 font-medium">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{r.category}</td>
                          <td className="px-4 py-3">
                            <MarketplaceLogo marketplace={r.marketplace} height={16} />
                          </td>
                          <td className="px-4 py-3 tabular-nums">%{r.ratePct}</td>
                          <td className="px-4 py-3 tabular-nums">%{r.plusRatePct}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.note || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId != null}
                                onClick={() => void applyTariff(r.id, false)}
                              >
                                Uygula
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId != null}
                                onClick={() => void applyTariff(r.id, true)}
                              >
                                Plus
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

            <Card>
              <CardHeader>
                <CardTitle>Pazaryeri komisyonu</CardTitle>
                <CardDescription>
                  Trendyol hakediş (Sale) ve Hepsiburada listing komisyon
                  uçlarından çekilir. Manuel oran girişi yok.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Önce ürün senkronu yapın. Oranlar hakedişten barkod → marka →
                  kategori sırasıyla uygulanır (HP gibi marka farkları korunur).
                  Plus için ayrı uç yoksa taban oran kullanılır.
                </p>
                {lastSyncedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Son çekim:{" "}
                    {new Date(lastSyncedAt).toLocaleString("tr-TR")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mağaza anahtarları kayıtlıysa Senkron ile canlı oranları
                    çekin.
                  </p>
                )}
                <Button
                  type="button"
                  className="w-full"
                  disabled={syncBusy || !getToken()}
                  onClick={() => void syncTariffs()}
                >
                  {syncBusy ? "Çekiliyor…" : "Tarifeleri şimdi çek"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {fromApi ? (
            <Card className="mt-4">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Tarife sapmaları</CardTitle>
                    <CardDescription>
                      Ürün komisyonu kategori tarifesinden farklı olanlar.
                      {mismatchRows.length > 0
                        ? ` ${mismatchRows.length} ürün.`
                        : " Sapma yok."}
                    </CardDescription>
                  </div>
                  {mismatchRows.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={mismatchBusy}
                        onClick={() => void applyAllMismatches(false)}
                      >
                        {mismatchBusy ? "…" : "Tümünü uygula"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mismatchBusy}
                        onClick={() => void applyAllMismatches(true)}
                      >
                        Tümü Plus
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {mismatchRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aktif ürünler tarifeyle uyumlu.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {mismatchRows.map((r) => (
                        <div
                          key={r.productId}
                          className="rounded-xl border border-border p-4"
                        >
                          <div className="font-semibold">{r.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {r.sku || "—"} · {r.category} · {r.marketplace}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-sm">
                            <Badge tone="warn">Mevcut %{r.currentRatePct}</Badge>
                            <Badge tone="profit">
                              Öneri %{r.suggestedRatePct}
                            </Badge>
                            <span className="text-muted-foreground">
                              Δ {r.deltaPct > 0 ? "+" : ""}
                              {r.deltaPct} pp
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId != null || mismatchBusy}
                              onClick={() =>
                                void applyOneMismatch(r.productId, false)
                              }
                            >
                              Uygula
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId != null || mismatchBusy}
                              onClick={() =>
                                void applyOneMismatch(r.productId, true)
                              }
                            >
                              Plus
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">Ürün</th>
                            <th className="px-4 py-3 font-medium">Kanal</th>
                            <th className="px-4 py-3 font-medium">Mevcut</th>
                            <th className="px-4 py-3 font-medium">Tarife</th>
                            <th className="px-4 py-3 font-medium">Fark</th>
                            <th className="px-4 py-3 font-medium"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {mismatchRows.map((r) => (
                            <tr
                              key={r.productId}
                              className="border-t border-border"
                            >
                              <td className="px-4 py-3">
                                <div className="font-medium">{r.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {r.sku || "—"} · {r.tariffCategory}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <MarketplaceLogo
                                  marketplace={r.marketplace}
                                  height={14}
                                />
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                %{r.currentRatePct}
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                %{r.suggestedRatePct}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                {r.deltaPct > 0 ? "+" : ""}
                                {r.deltaPct} pp
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId != null || mismatchBusy}
                                    onClick={() =>
                                      void applyOneMismatch(r.productId, false)
                                    }
                                  >
                                    Uygula
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId != null || mismatchBusy}
                                    onClick={() =>
                                      void applyOneMismatch(r.productId, true)
                                    }
                                  >
                                    Plus
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Tarife geçmişi</CardTitle>
              <CardDescription>
                Çekim, uygulama ve sapma düzeltme izleri.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz kayıt yok — tarife çekilince veya ürünlere uygulanınca burada görünür.
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                  {history.map((h) => {
                    const cat =
                      typeof h.meta.category === "string"
                        ? h.meta.category
                        : null;
                    const updated =
                      typeof h.meta.updated === "number"
                        ? h.meta.updated
                        : typeof h.meta.upserted === "number"
                          ? h.meta.upserted
                          : null;
                    return (
                      <li
                        key={h.id}
                        className="rounded-xl border border-border px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{h.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString("tr-TR")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {h.actor ? `${h.actor} · ` : ""}
                          {cat ? `${cat} · ` : ""}
                          {updated != null ? `${updated} işlem` : h.action}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}

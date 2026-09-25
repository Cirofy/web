"use client";

import { FormEvent, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPageSkeleton } from "@/components/page-skeletons";
import { MarketplaceLogo } from "@/components/marketplace-logo";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getStoredUser, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";

type StoreRow = {
  id: string;
  name: string;
  marketplace: string;
  externalStoreId?: string | null;
  isConnected: boolean;
  lastSyncAt?: string | null;
  syncStatus?: "idle" | "syncing" | "ok" | "error";
};

type SyncJob = {
  id: string;
  storeId: string;
  label: string;
  status: "ok" | "error";
  finishedAt: string;
};

type ApiStore = {
  id: string;
  name: string;
  marketplace: string;
  externalStoreId?: string | null;
  isConnected: boolean;
  lastSyncAt?: string | null;
};

function displayMarketplace(raw: string) {
  const u = raw.toUpperCase();
  if (u === "TRENDYOL" || raw === "Trendyol") return "Trendyol";
  if (u === "HEPSIBURADA" || raw === "Hepsiburada") return "Hepsiburada";
  return raw;
}

function toApiMarketplace(raw: string) {
  return raw === "Hepsiburada" ? "HEPSIBURADA" : "TRENDYOL";
}

export default function SettingsPage() {
  const ready = usePageReady();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [marketplace, setMarketplace] = useState("Trendyol");
  const [probing, setProbing] = useState(false);
  const account = getStoredUser();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function probe() {
      const token = getToken();
      if (!token) return;
      setProbing(true);
      try {
        const [list, jobList] = await Promise.all([
          apiFetch<ApiStore[]>("/stores"),
          apiFetch<
            Array<{
              id: string;
              storeId: string;
              status: string;
              message?: string;
              finishedAt?: string;
              kind?: string;
            }>
          >("/stores/sync-jobs?limit=10").catch(() => []),
        ]);
        if (cancelled) return;
        if (Array.isArray(list)) {
          setStores(
            list.map((s) => ({
              id: s.id,
              name: s.name,
              marketplace: displayMarketplace(s.marketplace),
              externalStoreId: s.externalStoreId,
              isConnected: s.isConnected,
              lastSyncAt: s.lastSyncAt,
              syncStatus: "ok",
            })),
          );
          toast(list.length ? "Canlı mağaza listesi yüklendi." : "Henüz mağaza yok — aşağıdan bağlayın.");
        }
        if (Array.isArray(jobList) && jobList.length) {
          setJobs(
            jobList.map((j) => ({
              id: j.id,
              storeId: j.storeId,
              label: j.message || j.kind || "Senkron",
              status: j.status === "error" || j.status === "failed" ? "error" : "ok",
              finishedAt: j.finishedAt || new Date().toISOString(),
            })),
          );
        } else if (Array.isArray(list)) {
          setJobs([]);
        }
      } catch {
        if (!cancelled) {
          toast("Mağaza listesi alınamadı. Oturumu kontrol edip yenileyin.");
        }
      } finally {
        if (!cancelled) setProbing(false);
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "Yeni Mağaza");
    const selectedMarketplace = marketplace || "Trendyol";
    const externalStoreId = String(form.get("externalStoreId") || "");
    const apiKey = String(form.get("apiKey") || "");
    const apiSecret = String(form.get("apiSecret") || "");
    const token = getToken();

    async function run() {
      if (token) {
        try {
          const created = await apiFetch<ApiStore>("/stores/connect", {
            method: "POST",
            body: JSON.stringify({
              marketplace: toApiMarketplace(selectedMarketplace),
              name,
              externalStoreId: externalStoreId || undefined,
              apiKey,
              apiSecret,
            }),
          });
          setStores((prev) => [
            {
              id: created.id,
              name: created.name,
              marketplace: displayMarketplace(created.marketplace),
              externalStoreId: created.externalStoreId,
              isConnected: created.isConnected,
              lastSyncAt: created.lastSyncAt,
              syncStatus: "ok",
            },
            ...prev,
          ]);
          toast({ message: "Mağaza bağlantısı kaydedildi.", tone: "profit" });
          e.currentTarget.reset();
          setMarketplace("Trendyol");
          setSaving(false);
          return;
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : "Mağaza kaydı başarısız. Bilgileri kontrol edin.", tone: "loss" });
          setSaving(false);
          return;
        }
      }

      toast({ message: "Mağaza bağlamak için giriş yapın.", tone: "warn" });
      setSaving(false);
    }

    void run();
  }

  function syncNow(storeId: string) {
    setSyncingId(storeId);

    setStores((prev) =>
      prev.map((s) => (s.id === storeId ? { ...s, syncStatus: "syncing" } : s)),
    );

    const token = getToken();
    async function run() {
      if (token) {
        try {
          type Job = {
            id: string;
            status: string;
            message?: string;
            finishedAt?: string;
            result?: { products?: number; orders?: number };
          };
          let job = await apiFetch<Job>(`/stores/${storeId}/sync`, {
            method: "POST",
            body: JSON.stringify({ kind: "marketplace_pull" }),
          });

          for (let i = 0; i < 20; i++) {
            if (job.status === "ok" || job.status === "error") break;
            await new Promise((r) => setTimeout(r, 250));
            job = await apiFetch<Job>(`/stores/sync-jobs/${job.id}`);
          }

          const finishedAt = job.finishedAt ?? new Date().toISOString();
          const ok = job.status === "ok";
          setStores((prev) =>
            prev.map((s) =>
              s.id === storeId
                ? { ...s, syncStatus: ok ? "ok" : "error", lastSyncAt: finishedAt, isConnected: ok }
                : s,
            ),
          );
          setJobs((prev) => [
            { id: job.id, storeId, label: "Senkron işi", status: ok ? "ok" : "error", finishedAt },
            ...prev,
          ]);
          toast(
            ok
              ? `Senkron tamamlandı${job.result?.orders != null ? ` — ${job.result.products ?? 0} ürün, ${job.result.orders} sipariş` : ""}.`
              : job.message ?? "Senkron tamamlanamadı. Tekrar deneyin.",
          );
          setSyncingId(null);
          return;
        } catch {
          toast({ message: "Senkron başlatılamadı. Tekrar deneyin.", tone: "loss" });
          setStores((prev) =>
            prev.map((s) => (s.id === storeId ? { ...s, syncStatus: "error" } : s)),
          );
          setSyncingId(null);
          return;
        }
      }

      toast({ message: "Senkron için giriş yapın.", tone: "warn" });
      setStores((prev) =>
        prev.map((s) => (s.id === storeId ? { ...s, syncStatus: "idle" } : s)),
      );
      setSyncingId(null);
    }

    void run();
  }

  function validateNow(storeId: string) {
    setValidatingId(storeId);

    const token = getToken();

    void (async () => {
      if (token) {
        try {
          const res = await apiFetch<{
            ok: boolean;
            message: string;
            source?: string;
            products?: number;
            orders?: number;
          }>(`/stores/${storeId}/validate`, { method: "POST" });
          setStores((prev) =>
            prev.map((s) =>
              s.id === storeId
                ? { ...s, isConnected: res.ok, syncStatus: res.ok ? "ok" : "error" }
                : s,
            ),
          );
          toast(res.message);
          setValidatingId(null);
          return;
        } catch {
          toast("Bağlantı doğrulanamadı. Tekrar deneyin.");
          setValidatingId(null);
          return;
        }
      }

      toast({ message: "Doğrulama için giriş yapın.", tone: "warn" });
      setValidatingId(null);
    })();
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Ayarlar"
      description="Mağaza bağlantısı, senkron durumu ve hesap."
    >
      {!ready ? (
        <SettingsPageSkeleton />
      ) : (
        <>
          {probing ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              Sunucu kontrol ediliyor…
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pazaryeri bağlantısı</CardTitle>
                <CardDescription>
                  Satıcı kimlik bilgileri kaydedilir; canlı çekim aynı form üzerinden
                  ilerler.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onConnect}>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="marketplace">
                      Pazaryeri
                    </label>
                    <Select value={marketplace} onValueChange={setMarketplace}>
                      <SelectTrigger id="marketplace" aria-label="Pazaryeri">
                        <SelectValue placeholder="Pazaryeri seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Trendyol">Trendyol</SelectItem>
                        <SelectItem value="Hepsiburada">Hepsiburada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="name">
                      Mağaza adı
                    </label>
                    <input
                      id="name"
                      name="name"
                      required
                      minLength={2}
                      placeholder="Örn. Nova Elektronik TY"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="externalStoreId">
                      Satıcı ID
                    </label>
                    <input
                      id="externalStoreId"
                      name="externalStoreId"
                      required
                      minLength={2}
                      placeholder="Pazaryeri satıcı numarası"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="apiKey">
                      Entegrasyon anahtarı
                    </label>
                    <input
                      id="apiKey"
                      name="apiKey"
                      required
                      minLength={8}
                      autoComplete="off"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="apiSecret">
                      Entegrasyon gizli anahtarı
                    </label>
                    <input
                      id="apiSecret"
                      name="apiSecret"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="off"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Bağlı mağazalar</CardTitle>
                  <CardDescription>
                    "Şimdi senkronla" asenkron iş kuyruğuna alınır.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Henüz mağaza bağlı değil.
                    </p>
                  ) : null}
                  {stores.map((store) => (
                    <div
                      key={store.id}
                      className="flex flex-col gap-3 rounded-xl border border-border p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{store.name}</span>
                            <MarketplaceLogo marketplace={store.marketplace} height={14} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            ID {store.externalStoreId ?? "—"}
                            {store.lastSyncAt
                              ? ` · Son senkron ${new Date(store.lastSyncAt).toLocaleString("tr-TR")}`
                              : null}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              store.syncStatus === "syncing"
                                ? "warn"
                                : store.isConnected
                                  ? "profit"
                                  : "warn"
                            }
                          >
                            {store.syncStatus === "syncing"
                              ? "Senkron…"
                              : store.isConnected
                                ? "Bağlı"
                                : "Kopuk"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              syncingId === store.id || validatingId === store.id
                            }
                            onClick={() => validateNow(store.id)}
                          >
                            <ShieldCheck
                              className={
                                validatingId === store.id
                                  ? "h-3.5 w-3.5 animate-pulse"
                                  : "h-3.5 w-3.5"
                              }
                            />
                            Doğrula
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              syncingId === store.id || validatingId === store.id
                            }
                            onClick={() => syncNow(store.id)}
                          >
                            <RefreshCw
                              className={
                                syncingId === store.id
                                  ? "h-3.5 w-3.5 animate-spin"
                                  : "h-3.5 w-3.5"
                              }
                            />
                            Şimdi senkronla
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Son senkronlar</CardTitle>
                  <CardDescription>İş kuyruğu</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Henüz senkron yok.</p>
                  ) : null}
                  {jobs.slice(0, 5).map((j) => {
                    const store = stores.find((s) => s.id === j.storeId);
                    return (
                      <div
                        key={j.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {store?.name ?? "Mağaza"} · {j.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(j.finishedAt).toLocaleString("tr-TR")}
                          </div>
                        </div>
                        <Badge tone={j.status === "ok" ? "profit" : "warn"}>
                          {j.status === "ok" ? "Tamam" : j.status}
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hesap</CardTitle>
                  <CardDescription>Profil bilgileri</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-border pb-3">
                    <span className="text-muted-foreground">Ad soyad</span>
                    <span className="font-medium">{account?.fullName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-3">
                    <span className="text-muted-foreground">E-posta</span>
                    <span className="font-medium">{account?.email ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Organizasyon</span>
                    <span className="font-medium">
                      {account?.organization?.name ?? "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

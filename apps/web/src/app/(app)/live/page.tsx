"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { MarketplaceChannelFilter, MarketplaceLogo } from "@/components/marketplace-logo";
import { IntradayChart } from "@/components/charts";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { API_URL, apiFetch, getToken } from "@/lib/api";
import { loadTariffMismatches } from "@/lib/tariff-mismatches";

type LiveChannel = "all" | "Trendyol" | "Hepsiburada";

type ChannelShare = {
  marketplace: string;
  netProfit: number;
  orderCount: number;
  marginPct: number;
  sharePct?: number;
};

type LiveSnapshot = {
  asOf?: string;
  netProfitToday: number;
  orderCountToday: number;
  marginPctToday: number;
  grossAmountToday: number;
  vsYesterdayPct?: number;
  hours: Array<{ hour: string; profit: number; orders: number }>;
  source?: string;
  channel?: LiveChannel;
  byChannel?: ChannelShare[];
  tariffMismatchCount?: number;
};

function emptySnapshot(channel: LiveChannel = "all"): LiveSnapshot {
  return {
    netProfitToday: 0,
    orderCountToday: 0,
    marginPctToday: 0,
    grossAmountToday: 0,
    vsYesterdayPct: 0,
    hours: [],
    channel,
    byChannel: [],
    source: "empty",
  };
}

export default function LivePage() {
  const ready = usePageReady();
  const [channel, setChannel] = useState<LiveChannel>("all");
  const [live, setLive] = useState<LiveSnapshot>(() => emptySnapshot("all"));
  const [shareRows, setShareRows] = useState<ChannelShare[] | null>(null);
  const [streamState, setStreamState] = useState<"connecting" | "live" | "backup">(
    "connecting",
  );
  const [tariffMismatchCount, setTariffMismatchCount] = useState(0);

  useEffect(() => {
    if (!ready) return;

    const token = getToken();
    const qs = new URLSearchParams();
    if (token) qs.set("token", token);
    if (channel !== "all") qs.set("channel", channel);
    const url = `${API_URL}/live/stream?${qs.toString()}`;

    let es: EventSource | null = null;
    let fallbackTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let closed = false;
    setStreamState("connecting");

    function applyTariffCount(n: number | undefined) {
      if (typeof n === "number" && n >= 0) setTariffMismatchCount(n);
    }

    async function pollBackup() {
      if (!getToken()) {
        setLive(emptySnapshot(channel));
        setShareRows([]);
        setTariffMismatchCount(0);
        setStreamState("backup");
        return;
      }
      try {
        const [snap, share] = await Promise.all([
          apiFetch<LiveSnapshot>(
            `/live/intraday${channel !== "all" ? `?channel=${encodeURIComponent(channel)}` : ""}`,
          ),
          apiFetch<{ channels: ChannelShare[] }>("/live/share"),
        ]);
        setLive({
          ...snap,
          channel: snap.channel ?? channel,
          source: snap.source ?? "snapshot",
        });
        setShareRows(share.channels ?? null);
        applyTariffCount(snap.tariffMismatchCount);
        setStreamState("backup");
      } catch {
        setLive(emptySnapshot(channel));
        setShareRows([]);
        setStreamState("backup");
      }
    }

    function startBackupPoll() {
      void pollBackup();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      fallbackTimer = window.setInterval(() => {
        void pollBackup();
      }, 4000);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        if (closed) return;
        if (fallbackTimer) window.clearInterval(fallbackTimer);
        fallbackTimer = undefined;
        connect();
      }, 20_000);
    }

    function connect() {
      if (closed) return;
      try {
        es?.close();
        es = new EventSource(url);
      } catch {
        startBackupPoll();
        return;
      }

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as LiveSnapshot;
          setLive({ ...data, channel: data.channel ?? channel });
          if (data.byChannel?.length) setShareRows(data.byChannel);
          applyTariffCount(data.tariffMismatchCount);
          setStreamState("live");
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        startBackupPoll();
      };
    }

    // İlk yüklemede bir kez; SSE güncelleyene kadar boş kalmasın
    if (token) {
      void loadTariffMismatches().then((r) =>
        setTariffMismatchCount(r.items.length),
      );
    } else {
      setTariffMismatchCount(0);
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [ready, channel]);

  const byChannel = useMemo(() => {
    const rows = shareRows ?? live.byChannel ?? [];
    if (channel === "all") return rows;
    return rows.filter((c) => c.marketplace === channel);
  }, [shareRows, live.byChannel, channel]);

  return (
    <DashboardShell
      loading={!ready}
      title="Gün içi"
      description="Bugünün saatlik net kârı — kanal filtresi ile canlı akış veya yedek poll."
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge tone={streamState === "live" ? "profit" : "warn"}>
            {streamState === "live"
              ? live.source === "orders"
                ? "Canlı · sipariş"
                : "Canlı akış"
              : streamState === "connecting"
                ? "Bağlanıyor…"
                : "Yedek akış"}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Özet</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          <div className="mb-4">
            <MarketplaceChannelFilter
              variant="buttons"
              value={channel}
              onChange={setChannel}
            />
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">
                  Bugün net
                  {channel !== "all" ? ` · ${channel}` : ""}
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-profit">
                  {formatTry(live.netProfitToday)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Bugün sipariş</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {live.orderCountToday}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Bugün marj</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {formatPct(live.marginPctToday)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Düne göre
                </div>
                <div
                  className={
                    (live.vsYesterdayPct ?? 0) >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {(live.vsYesterdayPct ?? 0) >= 0 ? "+" : ""}
                  {formatPct(live.vsYesterdayPct ?? 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {tariffMismatchCount > 0 ? (
            <div
              className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Canlı tarife uyarısı</span>
                  <Badge tone="warn">{tariffMismatchCount} ürün</Badge>
                  {streamState === "live" ? (
                    <span className="text-xs text-muted-foreground">SSE · güncel</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gün içi net, eski komisyonla hesaplanıyor olabilir — tarife
                  sapmasını düzeltin.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/pricing?tariff=1">Fiyat motoru</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/products">Ürünlerde düzelt</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {byChannel.length > 0 ? (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle>Kanal özeti</CardTitle>
                <CardDescription>
                  Bugünkü netin kanallara dağılımı
                  {channel !== "all" ? ` · filtre: ${channel}` : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {byChannel.map((c) => {
                  const share =
                    typeof c.sharePct === "number"
                      ? c.sharePct
                      : (() => {
                          const totalAbs = byChannel.reduce(
                            (s, x) => s + Math.abs(x.netProfit),
                            0,
                          );
                          return totalAbs > 0
                            ? Math.round(
                                (Math.abs(c.netProfit) / totalAbs) * 1000,
                              ) / 10
                            : 0;
                        })();
                  const barW = Math.max(4, Math.min(100, Math.abs(share)));
                  return (
                    <div key={c.marketplace} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <MarketplaceLogo marketplace={c.marketplace} height={16} />
                          <span className="text-xs text-muted-foreground">
                            {c.orderCount} sipariş · marj {formatPct(c.marginPct)}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-lg font-bold text-profit">
                            {formatTry(c.netProfit)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            pay %{Math.abs(share).toFixed(1)}
                          </div>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-profit"
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setChannel(c.marketplace as LiveChannel)
                          }
                        >
                          Bu kanala filtrele
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Saatlik net</CardTitle>
              <CardDescription>
                Çubuk: net kâr · çizgi: sipariş —{" "}
                {live.asOf ? new Date(live.asOf).toLocaleString("tr-TR") : "—"}
                {channel !== "all" ? ` · ${channel}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IntradayChart data={live.hours} />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-profit" /> Net kâr
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-[#2B6CFF]" /> Sipariş
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}

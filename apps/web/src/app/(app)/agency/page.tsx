"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import {
  MarketplaceChannelFilter,
  MarketplaceLogo,
} from "@/components/marketplace-logo";
import { cn, formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { agencyHealthLabels } from "@/lib/agency-utils";
import { apiFetch, getToken } from "@/lib/api";

type PortfolioRow = {
  id: string;
  storeName: string;
  marketplace: string;
  netProfit: number;
  marginPct: number;
  orderCount: number;
  grossAmount: number;
  openIssues: number;
  health: "good" | "watch" | "risk";
  healthScore: number;
  tariffMismatchCount: number;
  healthFactors: Array<{ key: string; label: string; points: number; max: number; detail: string }>;
  ctaHref: string;
  ctaLabel: string;
  actions?: Array<{ href: string; label: string }>;
};

type TariffSlaRow = {
  id: string;
  storeName: string;
  marketplace: string;
  productCount: number;
  tariffMismatchCount: number;
  mismatchRatePct: number;
  tariffScore: number;
  healthScore: number;
  lastTariffAt: string | null;
  daysSinceUpdate: number | null;
  slaStatus: "ok" | "watch" | "breach";
  ctaHref: string;
  ctaLabel: string;
};

function scoreTone(score: number) {
  if (score < 45) return "text-loss";
  if (score < 70) return "text-amber-700";
  return "text-profit";
}

function ScoreBar({ score }: { score: number }) {
  const width = Math.max(0, Math.min(100, score));
  const bar =
    score < 45 ? "bg-loss" : score < 70 ? "bg-amber-500" : "bg-profit";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${width}%` }} />
      </div>
      <span className={cn("tabular-nums text-sm font-semibold", scoreTone(score))}>
        {score}
      </span>
    </div>
  );
}

export default function AgencyPage() {
  const ready = usePageReady();
  const [channel, setChannel] = useState<"all" | "Trendyol" | "Hepsiburada">("all");
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [avgHealthScore, setAvgHealthScore] = useState<number | null>(null);
  const [avgTariffScore, setAvgTariffScore] = useState<number | null>(null);
  const [tariffMismatchTotal, setTariffMismatchTotal] = useState<number | null>(
    null,
  );
  const [fromApi, setFromApi] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [slaRows, setSlaRows] = useState<TariffSlaRow[]>([]);
  const [slaMeta, setSlaMeta] = useState<{
    breachedCount: number;
    watchCount: number;
    okCount: number;
    note: string;
    slaScoreMin: number;
  } | null>(null);
  const [slaBusy, setSlaBusy] = useState(false);
  const [slaMsg, setSlaMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{
          items: PortfolioRow[];
          avgHealthScore?: number;
          avgTariffScore?: number;
          tariffMismatchTotal?: number;
        }>("/agency/portfolio");
        if (cancelled || !res.items?.length) return;
        setPortfolio(res.items);
        setAvgHealthScore(
          typeof res.avgHealthScore === "number" ? res.avgHealthScore : null,
        );
        setAvgTariffScore(
          typeof res.avgTariffScore === "number" ? res.avgTariffScore : null,
        );
        setTariffMismatchTotal(
          typeof res.tariffMismatchTotal === "number"
            ? res.tariffMismatchTotal
            : null,
        );
        setFromApi(true);
      } catch {
      }
      try {
        const sla = await apiFetch<{
          items: TariffSlaRow[];
          breachedCount?: number;
          watchCount?: number;
          okCount?: number;
          note?: string;
          slaScoreMin?: number;
        }>("/agency/tariff-sla");
        if (cancelled) return;
        setSlaRows(sla.items ?? []);
        setSlaMeta({
          breachedCount: sla.breachedCount ?? 0,
          watchCount: sla.watchCount ?? 0,
          okCount: sla.okCount ?? 0,
          note: sla.note ?? "",
          slaScoreMin: sla.slaScoreMin ?? 70,
        });
      } catch {
        setSlaRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    return portfolio.filter(
      (r) => channel === "all" || r.marketplace === channel,
    );
  }, [channel, portfolio]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.net += r.netProfit;
        acc.gross += r.grossAmount;
        acc.orders += r.orderCount;
        acc.issues += r.openIssues;
        acc.scoreSum += r.healthScore ?? 0;
        acc.tariffMismatches += r.tariffMismatchCount ?? 0;
        acc.tariffScoreSum += (() => {
          const f = r.healthFactors?.find((x) => x.key === "tariff");
          return f ? (f.points / f.max) * 100 : 100;
        })();
        return acc;
      },
      {
        net: 0,
        gross: 0,
        orders: 0,
        issues: 0,
        scoreSum: 0,
        tariffMismatches: 0,
        tariffScoreSum: 0,
      },
    );
  }, [rows]);

  const marginPct = totals.gross > 0 ? (totals.net / totals.gross) * 100 : 0;
  const portfolioScore =
    avgHealthScore ??
    (rows.length > 0 ? Math.round(totals.scoreSum / rows.length) : 0);
  const tariffScore =
    avgTariffScore ??
    (rows.length > 0 ? Math.round(totals.tariffScoreSum / rows.length) : 100);
  const tariffGaps =
    tariffMismatchTotal ?? totals.tariffMismatches;

  return (
    <DashboardShell
      loading={!ready}
      title="Ajans portföyü"
      description={
        fromApi
          ? "Çoklu mağaza sağlık skoru ve net kâr — son 30 gün."
          : "Çoklu mağaza sağlık skoru ve net kâr — ajans görünümü."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Tarifeler</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/team">Ekip</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/settlements">Hakediş</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">Raporlar</Link>
          </Button>
        </div>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Mağaza</div>
                <div className="mt-1 font-display text-2xl font-bold">{rows.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Portföy skoru</div>
                <div
                  className={cn(
                    "mt-1 font-display text-2xl font-bold",
                    scoreTone(portfolioScore),
                  )}
                >
                  {portfolioScore}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife skoru</div>
                <div
                  className={cn(
                    "mt-1 font-display text-2xl font-bold",
                    scoreTone(tariffScore),
                  )}
                >
                  {tariffScore}
                </div>
                {tariffGaps > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {tariffGaps} ürün sapması
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Uyumlu</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Portföy net</div>
                <div
                  className={
                    totals.net >= 0
                      ? "mt-1 font-display text-2xl font-bold text-profit"
                      : "mt-1 font-display text-2xl font-bold text-loss"
                  }
                >
                  {formatTry(totals.net)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Ortalama marj</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {formatPct(marginPct)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Açık sapma</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {totals.issues}
                </div>
              </CardContent>
            </Card>
          </div>

          {slaRows.length > 0 || slaMeta ? (
            <Card className="mb-4">
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Tarife SLA</CardTitle>
                  <CardDescription>
                    {slaMeta?.note ||
                      "Mağaza bazlı tarife skoru ve sapma eşiği."}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="loss">
                    İhlal {slaMeta?.breachedCount ?? 0}
                  </Badge>
                  <Badge tone="warn">
                    İzle {slaMeta?.watchCount ?? 0}
                  </Badge>
                  <Badge tone="profit">
                    Uyumlu {slaMeta?.okCount ?? 0}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={slaBusy || !getToken()}
                    onClick={() => {
                      void (async () => {
                        setSlaBusy(true);
                        setSlaMsg(null);
                        try {
                          const res = await apiFetch<{
                            message: string;
                            ok?: boolean;
                          }>("/agency/tariff-sla/enqueue", {
                            method: "POST",
                            body: JSON.stringify({}),
                          });
                          setSlaMsg(res.message);
                        } catch (err) {
                          setSlaMsg(
                            err instanceof Error
                              ? err.message
                              : "SLA e-posta gönderilemedi.",
                          );
                        } finally {
                          setSlaBusy(false);
                        }
                      })();
                    }}
                  >
                    {slaBusy ? "Gönderiliyor…" : "SLA özeti e-posta"}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/tariffs">Tarifelere git</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {slaMsg ? (
                  <p className="mb-3 text-sm text-muted-foreground">{slaMsg}</p>
                ) : null}
                {slaRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Mağaza bağlandıktan sonra SLA dolacak.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Mağaza</th>
                          <th className="px-3 py-2 font-medium">Tarife skoru</th>
                          <th className="px-3 py-2 font-medium">Sapma</th>
                          <th className="px-3 py-2 font-medium">Son güncelleme</th>
                          <th className="px-3 py-2 font-medium">SLA</th>
                          <th className="px-3 py-2 font-medium"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {slaRows
                          .filter(
                            (r) =>
                              channel === "all" || r.marketplace === channel,
                          )
                          .map((r) => (
                            <tr key={r.id} className="border-t border-border">
                              <td className="px-3 py-2">
                                <div className="font-medium">{r.storeName}</div>
                                <div className="mt-1">
                                  <MarketplaceLogo
                                    marketplace={r.marketplace}
                                    height={14}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <ScoreBar score={r.tariffScore} />
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {r.tariffMismatchCount} · %{r.mismatchRatePct}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {r.daysSinceUpdate != null
                                  ? `${r.daysSinceUpdate} gün önce`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <Badge
                                  tone={
                                    r.slaStatus === "ok"
                                      ? "profit"
                                      : r.slaStatus === "watch"
                                        ? "warn"
                                        : "loss"
                                  }
                                >
                                  {r.slaStatus === "ok"
                                    ? "Uyumlu"
                                    : r.slaStatus === "watch"
                                      ? "İzle"
                                      : "İhlal"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Button asChild size="sm" variant="ghost">
                                  <Link href={r.ctaHref}>{r.ctaLabel}</Link>
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <MarketplaceChannelFilter
            className="mb-4"
            variant="buttons"
            value={channel}
            onChange={setChannel}
          />

          <Card>
            <CardHeader>
              <CardTitle>Mağaza karşılaştırması</CardTitle>
              <CardDescription>
                Skor 0–100: bağlantı, marj, iade, katalog, tarife, hakediş. Satıra tıklayınca faktörler açılır.
                {fromApi ? " · canlı portföy" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {rows.map((r) => {
                  const open = expandedId === r.id;
                  return (
                    <div key={r.id} className="rounded-xl border border-border p-4">
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-2 text-left"
                        onClick={() => setExpandedId(open ? null : r.id)}
                      >
                        <div>
                          <div className="font-semibold">{r.storeName}</div>
                          <div className="mt-1">
                            <MarketplaceLogo marketplace={r.marketplace} height={14} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            tone={
                              r.health === "good"
                                ? "profit"
                                : r.health === "watch"
                                  ? "warn"
                                  : "loss"
                            }
                          >
                            {agencyHealthLabels[r.health]}
                          </Badge>
                          <ScoreBar score={r.healthScore ?? 0} />
                        </div>
                      </button>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Net</div>
                          <div
                            className={
                              r.netProfit >= 0
                                ? "font-semibold text-profit"
                                : "font-semibold text-loss"
                            }
                          >
                            {formatTry(r.netProfit)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Marj</div>
                          <div className="font-medium">{formatPct(r.marginPct)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sipariş</div>
                          <div className="font-medium">{r.orderCount}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sapma</div>
                          <div className="font-medium">{r.openIssues}</div>
                        </div>
                      </div>
                      {(r.tariffMismatchCount ?? 0) > 0 ? (
                        <div className="mt-2">
                          <Badge tone="warn">
                            {r.tariffMismatchCount} tarife sapması
                          </Badge>
                        </div>
                      ) : null}
                      {open && r.healthFactors?.length ? (
                        <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                          {r.healthFactors.map((f) => (
                            <li key={f.key} className="flex justify-between gap-2">
                              <span>
                                {f.label}: {f.detail}
                              </span>
                              <span className="shrink-0 tabular-nums font-medium text-foreground">
                                {f.points}/{f.max}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {r.ctaHref && r.ctaLabel ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild size="sm">
                            <Link href={r.ctaHref}>{r.ctaLabel}</Link>
                          </Button>
                          {(r.actions ?? [])
                            .filter((a) => a.href !== r.ctaHref)
                            .slice(0, 2)
                            .map((a) => (
                              <Button key={a.href} asChild size="sm" variant="outline">
                                <Link href={a.href}>{a.label}</Link>
                              </Button>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Mağaza</th>
                      <th className="px-4 py-3 font-medium">Kanal</th>
                      <th className="px-4 py-3 font-medium">Brüt</th>
                      <th className="px-4 py-3 font-medium">Net kâr</th>
                      <th className="px-4 py-3 font-medium">Marj</th>
                      <th className="px-4 py-3 font-medium">Sipariş</th>
                      <th className="px-4 py-3 font-medium">Sapma</th>
                      <th className="px-4 py-3 font-medium">Skor</th>
                      <th className="px-4 py-3 font-medium">Sağlık</th>
                      <th className="px-4 py-3 font-medium">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const open = expandedId === r.id;
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className="cursor-pointer border-t border-border hover:bg-muted/40"
                            onClick={() => setExpandedId(open ? null : r.id)}
                          >
                            <td className="px-4 py-3 font-medium">{r.storeName}</td>
                            <td className="px-4 py-3">
                              <MarketplaceLogo marketplace={r.marketplace} height={16} />
                            </td>
                            <td className="px-4 py-3">{formatTry(r.grossAmount)}</td>
                            <td
                              className={
                                r.netProfit >= 0
                                  ? "px-4 py-3 font-semibold text-profit"
                                  : "px-4 py-3 font-semibold text-loss"
                              }
                            >
                              {formatTry(r.netProfit)}
                            </td>
                            <td className="px-4 py-3">{formatPct(r.marginPct)}</td>
                            <td className="px-4 py-3">{r.orderCount}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{r.openIssues}</div>
                              {(r.tariffMismatchCount ?? 0) > 0 ? (
                                <Badge tone="warn" className="mt-1">
                                  {r.tariffMismatchCount} tarife
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <ScoreBar score={r.healthScore ?? 0} />
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                tone={
                                  r.health === "good"
                                    ? "profit"
                                    : r.health === "watch"
                                      ? "warn"
                                      : "loss"
                                }
                              >
                                {agencyHealthLabels[r.health]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {r.ctaHref && r.ctaLabel ? (
                                <div className="flex flex-col gap-1.5">
                                  <Button asChild size="sm">
                                    <Link href={r.ctaHref}>{r.ctaLabel}</Link>
                                  </Button>
                                  {(r.actions ?? [])
                                    .filter((a) => a.href !== r.ctaHref)
                                    .slice(0, 1)
                                    .map((a) => (
                                      <Link
                                        key={a.href}
                                        href={a.href}
                                        className="text-xs font-semibold text-profit hover:underline"
                                      >
                                        {a.label}
                                      </Link>
                                    ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                          {open && r.healthFactors?.length ? (
                            <tr className="border-t border-border bg-muted/30">
                              <td colSpan={10} className="px-4 py-3">
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                                  {r.healthFactors.map((f) => (
                                    <span key={f.key}>
                                      <span className="font-medium text-foreground">
                                        {f.label} {f.points}/{f.max}
                                      </span>
                                      {" · "}
                                      {f.detail}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
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

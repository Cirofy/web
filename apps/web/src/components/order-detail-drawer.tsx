"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderDetailSkeleton } from "@/components/page-skeletons";
import { formatTry } from "@/lib/utils";
import { computeOrderNet, hasEnteredCost } from "@/lib/profit-utils";
import { orderStatusLabel } from "@/lib/order-utils";

export type OrderDetail = {
  id: string;
  externalId: string;
  product: string;
  status: string;
  orderedAt: string;
  grossAmount: number;
  commission: number;
  shippingFee: number;
  serviceFee: number;
  vatNet: number;
  withholding: number;
  costTotal: number;
  returnFee?: number;
  netProfit: number;
};

export type OrderTariffMismatch = {
  currentRatePct: number;
  suggestedRatePct: number;
  suggestedPlusRatePct?: number;
  tariffCategory?: string;
  deltaPct?: number;
};

export function OrderDetailDrawer({
  order,
  tariffMismatch = null,
  onClose,
}: {
  order: OrderDetail | null;
  tariffMismatch?: OrderTariffMismatch | null;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!order) {
      setReady(false);
      return;
    }
    setReady(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => setReady(true), 400);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [order]);

  if (!order || !mounted) return null;

  const computed = computeOrderNet(order);
  const net = computed.net;
  const hasCost = hasEnteredCost(order.costTotal);
  const realizedRatePct =
    order.grossAmount > 0
      ? Math.round((order.commission / order.grossAmount) * 10000) / 100
      : null;
  const tariffCommissionTry =
    tariffMismatch && order.grossAmount > 0
      ? Math.round(
          ((order.grossAmount * tariffMismatch.suggestedRatePct) / 100) * 100,
        ) / 100
      : null;
  const commissionDeltaTry =
    tariffCommissionTry != null
      ? Math.round((order.commission - tariffCommissionTry) * 100) / 100
      : null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Detayı kapat"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-4">
          <div className="min-w-0">
            <div className="font-display text-lg font-bold tracking-tight">
              {order.externalId}
            </div>
            <div className="mt-0.5 truncate text-sm text-muted-foreground">
              {order.product}
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Kapat" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!ready ? (
          <OrderDetailSkeleton />
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  order.status === "RETURNED" || order.status === "CANCELLED"
                    ? "warn"
                    : !hasCost
                      ? "warn"
                      : net < 0
                        ? "loss"
                        : "profit"
                }
              >
                {orderStatusLabel[order.status] ?? order.status}
              </Badge>
              {!hasCost ? <Badge tone="warn">Maliyet yok</Badge> : null}
              {tariffMismatch ? (
                <Badge tone="warn">Tarife sapması</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {new Date(order.orderedAt).toLocaleString("tr-TR")}
              </span>
            </div>

            {tariffMismatch ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 text-sm">
                <div className="font-medium">Tarife vs gerçekleşen komisyon</div>
                <div className="mt-2 space-y-1.5 text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>Gerçekleşen</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatTry(order.commission)}
                      {realizedRatePct != null ? ` · %${realizedRatePct}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>
                      Tarife
                      {tariffMismatch.tariffCategory
                        ? ` (${tariffMismatch.tariffCategory})`
                        : ""}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {tariffCommissionTry != null
                        ? formatTry(tariffCommissionTry)
                        : "—"}
                      {" · %"}
                      {tariffMismatch.suggestedRatePct}
                    </span>
                  </div>
                  {commissionDeltaTry != null ? (
                    <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5">
                      <span>Fark</span>
                      <span
                        className={
                          commissionDeltaTry > 0
                            ? "font-semibold text-amber-700 tabular-nums"
                            : "font-semibold text-profit tabular-nums"
                        }
                      >
                        {commissionDeltaTry > 0 ? "+" : ""}
                        {formatTry(commissionDeltaTry)}
                        {typeof tariffMismatch.deltaPct === "number"
                          ? ` · Δ${tariffMismatch.deltaPct > 0 ? "+" : ""}${tariffMismatch.deltaPct} puan`
                          : ""}
                      </span>
                    </div>
                  ) : null}
                  <p className="pt-1 text-xs">
                    Ürün kayıtlı oran %{tariffMismatch.currentRatePct}
                    {typeof tariffMismatch.suggestedPlusRatePct === "number"
                      ? ` · Plus %${tariffMismatch.suggestedPlusRatePct}`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-sm text-muted-foreground">Net kâr</div>
              {hasCost ? (
                <>
                  <div
                    className={
                      net >= 0
                        ? "mt-1 font-display text-3xl font-bold text-profit"
                        : "mt-1 font-display text-3xl font-bold text-loss"
                    }
                  >
                    {net >= 0 ? "+" : ""}
                    {formatTry(net)}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Satış − komisyon − kargo − hizmet − KDV net − stopaj − maliyet
                    {computed.returnFee > 0 ? " − iade ek zararı" : ""}.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-1 font-display text-3xl font-bold text-muted-foreground">
                    —
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Ürün maliyeti girilmediği için net kâr hesaplanmaz.
                  </p>
                </>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {computed.lines.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="text-muted-foreground">{r.label}</span>
                  <span
                    className={
                      r.value < 0 ? "font-medium text-loss" : "font-medium"
                    }
                  >
                    {formatTry(r.value)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm">
                <span className="font-medium">Toplam kesinti</span>
                <span className="font-semibold text-loss">
                  {formatTry(-computed.deductions)}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

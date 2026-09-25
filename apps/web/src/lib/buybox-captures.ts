/** Eklenti / panel buybox yakalamaları — localStorage + API köprüsü */

import { apiFetch, getToken } from "@/lib/api";

export const BUYBOX_CAPTURE_KEY = "cirofy_buybox_captures";

export type BuyboxCapture = {
  sku: string;
  marketplace: string;
  buyboxPrice: number;
  ourPrice?: number;
  merchantName?: string;
  winner?: "us" | "competitor";
  capturedAt: string;
};

export type TariffMatch = {
  product: {
    id: string;
    sku: string | null;
    title: string;
    category: string | null;
    marketplace: string;
    currentRate: number;
    currentRatePct: number;
  } | null;
  tariff: {
    id: string;
    category: string;
    marketplace: string;
    rate: number;
    ratePct: number;
    plusRate: number;
    plusRatePct: number;
  } | null;
  mismatch: boolean;
  message: string;
};

export function readBuyboxCaptures(): BuyboxCapture[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BUYBOX_CAPTURE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCapture).slice(0, 40);
  } catch {
    return [];
  }
}

export function writeBuyboxCaptures(caps: BuyboxCapture[]): BuyboxCapture[] {
  const next = caps.filter(isCapture).slice(0, 40);
  if (typeof window !== "undefined") {
    localStorage.setItem(BUYBOX_CAPTURE_KEY, JSON.stringify(next));
  }
  return next;
}

export function pushBuyboxCapture(cap: BuyboxCapture): BuyboxCapture[] {
  const next = writeBuyboxCaptures([
    cap,
    ...readBuyboxCaptures().filter((c) => c.sku !== cap.sku),
  ]);
  void syncCaptureToApi(cap);
  return next;
}

/** Yakalama sonrası tarife eşlemesi — API yanıtı veya ayrı resolve. */
export async function pushBuyboxCaptureWithTariff(
  cap: BuyboxCapture,
): Promise<{ captures: BuyboxCapture[]; tariffMatch: TariffMatch | null }> {
  const captures = writeBuyboxCaptures([
    cap,
    ...readBuyboxCaptures().filter((c) => c.sku !== cap.sku),
  ]);
  const fromSync = await syncCaptureToApi(cap);
  if (fromSync) {
    syncTariffToExtension(cap.sku, fromSync);
    return { captures, tariffMatch: fromSync };
  }
  const resolved = await resolveTariffForCapture(cap.sku, cap.marketplace);
  if (resolved) syncTariffToExtension(cap.sku, resolved);
  return { captures, tariffMatch: resolved };
}

/** Panel → eklenti popup rozeti için tarife bilgisini storage’a yazar. */
export function syncTariffToExtension(sku: string, match: TariffMatch) {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      type: "cirofy.extension.tariff-sync",
      sku,
      tariff: {
        mismatch: match.mismatch,
        message: match.message,
        currentRatePct: match.product?.currentRatePct ?? null,
        suggestedRatePct: match.tariff?.ratePct ?? null,
        plusRatePct: match.tariff?.plusRatePct ?? null,
      },
    },
    "*",
  );
}

export function captureForSku(sku: string): BuyboxCapture | null {
  return readBuyboxCaptures().find((c) => c.sku === sku) ?? null;
}

export async function loadBuyboxCapturesFromApi(): Promise<BuyboxCapture[]> {
  if (!getToken()) return readBuyboxCaptures();
  try {
    const res = await apiFetch<{ items: BuyboxCapture[] }>("/buybox/captures");
    if (!res.items?.length) return readBuyboxCaptures();
    return writeBuyboxCaptures(res.items);
  } catch {
    return readBuyboxCaptures();
  }
}

export async function resolveTariffForCapture(
  sku: string,
  marketplace?: string,
): Promise<TariffMatch | null> {
  if (!getToken()) return null;
  try {
    const qs = new URLSearchParams({ sku });
    if (marketplace) qs.set("marketplace", marketplace);
    return await apiFetch<TariffMatch>(`/tariffs/resolve?${qs.toString()}`);
  } catch {
    return null;
  }
}

export async function applyTariffForProduct(
  productId: string,
  usePlus = false,
): Promise<{ updated: number; message: string; ratePct?: number } | null> {
  if (!getToken()) return null;
  try {
    return await apiFetch<{ updated: number; message: string; ratePct?: number }>(
      "/tariffs/apply-product",
      {
        method: "POST",
        body: JSON.stringify({ productId, usePlus }),
      },
    );
  } catch {
    return null;
  }
}

async function syncCaptureToApi(cap: BuyboxCapture): Promise<TariffMatch | null> {
  if (!getToken()) return null;
  try {
    const res = await apiFetch<{
      item: BuyboxCapture;
      tariffMatch?: TariffMatch | null;
      message?: string;
    }>("/buybox/captures", {
      method: "POST",
      body: JSON.stringify({
        sku: cap.sku,
        marketplace: cap.marketplace,
        buyboxPrice: cap.buyboxPrice,
        ourPrice: cap.ourPrice,
        merchantName: cap.merchantName,
        winner: cap.winner,
        capturedAt: cap.capturedAt,
      }),
    });
    return res.tariffMatch ?? null;
  } catch {
    return null;
  }
}

function isCapture(v: unknown): v is BuyboxCapture {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sku === "string" &&
    typeof o.marketplace === "string" &&
    typeof o.buyboxPrice === "number" &&
    typeof o.capturedAt === "string"
  );
}

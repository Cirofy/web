/** Tarayıcı eklentisi ↔ panel mesaj sözleşmesi. */

export const EXTENSION_BRIDGE_VERSION = 2;

export type ExtensionBridgeMessage =
  | {
      type: "cirofy.extension.hello";
      version: number;
      extensionId?: string;
    }
  | {
      type: "cirofy.extension.buybox";
      sku: string;
      marketplace: "Trendyol" | "Hepsiburada";
      buyboxPrice: number;
      ourPrice?: number;
      merchantName?: string;
      winner?: "us" | "competitor";
      capturedAt: string;
      title?: string;
      pageUrl?: string;
      source?: string;
      preferPlus?: boolean;
      tariff?: {
        mismatch?: boolean;
        message?: string;
        currentRatePct?: number | null;
        suggestedRatePct?: number | null;
        plusRatePct?: number | null;
      } | null;
    }
  | {
      type: "cirofy.extension.ping";
      at: string;
    }
  | {
      type: "cirofy.extension.status";
      version: number;
      linked: boolean;
      lastCaptureAt?: string | null;
      captureCount?: number;
    }
  | {
      type: "cirofy.panel.ack";
      ok: boolean;
      message?: string;
    }
  | {
      type: "cirofy.extension.request-last";
    }
  | {
      type: "cirofy.extension.request-status";
    };

export function isExtensionBridgeMessage(data: unknown): data is ExtensionBridgeMessage {
  if (!data || typeof data !== "object") return false;
  const t = (data as { type?: unknown }).type;
  return typeof t === "string" && t.startsWith("cirofy.");
}

/** Ping 90 sn’den eskiyse köprü zayıf sayılır. */
export function isBridgeStale(lastPingIso: string | null | undefined, now = Date.now()) {
  if (!lastPingIso) return true;
  const t = Date.parse(lastPingIso);
  if (!Number.isFinite(t)) return true;
  return now - t > 90_000;
}

export function pricingHrefForCapture(cap: {
  sku: string;
  buyboxPrice: number;
  tariff?: boolean;
  usePlus?: boolean;
}) {
  const q = new URLSearchParams({
    sku: cap.sku,
    buybox: String(cap.buyboxPrice),
  });
  if (cap.tariff) q.set("tariff", "1");
  if (cap.usePlus) q.set("usePlus", "1");
  return `/pricing?${q.toString()}`;
}

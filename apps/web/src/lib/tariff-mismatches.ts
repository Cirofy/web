/** Tarife sapması listesi — buybox / fiyat motoru ortak */

import { apiFetch, getToken } from "@/lib/api";

export type TariffMismatchRow = {
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

export async function loadTariffMismatches(limit = 200): Promise<{
  items: TariffMismatchRow[];
  bySku: Map<string, TariffMismatchRow>;
  byProductId: Map<string, TariffMismatchRow>;
}> {
  const empty = {
    items: [] as TariffMismatchRow[],
    bySku: new Map<string, TariffMismatchRow>(),
    byProductId: new Map<string, TariffMismatchRow>(),
  };
  if (!getToken()) return empty;
  try {
    const res = await apiFetch<{ items: TariffMismatchRow[] }>(
      "/tariffs/mismatches",
    );
    const items = (res.items ?? []).slice(0, limit);
    const bySku = new Map<string, TariffMismatchRow>();
    const byProductId = new Map<string, TariffMismatchRow>();
    for (const row of items) {
      byProductId.set(row.productId, row);
      if (row.sku) bySku.set(row.sku, row);
    }
    return { items, bySku, byProductId };
  } catch {
    return empty;
  }
}

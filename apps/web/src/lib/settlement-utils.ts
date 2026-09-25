export type SettlementIssueType =
  | "extra_shipping"
  | "missing_return_commission"
  | "missing_sale"
  | "desi_mismatch";

export const settlementIssueLabels: Record<SettlementIssueType, string> = {
  extra_shipping: "Fazla kargo faturası",
  missing_return_commission: "Eksik iade komisyon faturası",
  missing_sale: "Eksik satış bedeli",
  desi_mismatch: "Desi sapması",
};

export type SettlementIssueRow = {
  id?: string;
  type: SettlementIssueType;
  orderId: string;
  period: string;
  expected: number;
  billed: number;
  diff: number;
  note: string;
  sku?: string | null;
  tariffMismatch?: boolean;
  tariffDeltaPct?: number | null;
};

/** Hakediş itiraz paketi (CSV satırları) */
export function buildDisputePackage(
  issues: SettlementIssueRow[],
  meta?: {
    storeName?: string;
    period?: string;
    tariffGaps?: Array<{
      sku?: string | null;
      title?: string;
      category?: string | null;
      marketplace?: string;
      currentRatePct?: number;
      suggestedRatePct?: number;
      deltaPct?: number;
    }>;
  },
) {
  const header = [
    "period",
    "order_id",
    "issue_type",
    "issue_label",
    "expected",
    "billed",
    "diff",
    "sku",
    "tariff_mismatch",
    "tariff_delta_pct",
    "note",
  ];
  const lines = issues.map((i) =>
    [
      i.period,
      i.orderId,
      i.type,
      settlementIssueLabels[i.type],
      i.expected,
      i.billed,
      i.diff,
      i.sku ?? "",
      i.tariffMismatch ? "1" : "0",
      i.tariffDeltaPct ?? "",
      `"${i.note.replace(/"/g, '""')}"`,
    ].join(";"),
  );
  const sum = issues.reduce((s, i) => s + i.diff, 0);
  const tariffGaps = meta?.tariffGaps ?? [];
  const tariffHeader = [
    "section",
    "sku",
    "title",
    "category",
    "marketplace",
    "current_rate_pct",
    "suggested_rate_pct",
    "delta_pct",
  ];
  const tariffLines = tariffGaps.map((g) =>
    [
      "tariff_gap",
      g.sku ?? "",
      `"${(g.title ?? "").replace(/"/g, '""')}"`,
      g.category ?? "",
      g.marketplace ?? "",
      g.currentRatePct ?? "",
      g.suggestedRatePct ?? "",
      g.deltaPct ?? "",
    ].join(";"),
  );
  const summary = [
    `# Cirofy itiraz özeti`,
    `# Mağaza: ${meta?.storeName ?? ""}`,
    `# Dönem: ${meta?.period ?? "Seçili sapmalar"}`,
    `# Satır: ${issues.length}`,
    `# Toplam fark: ${sum}`,
    `# Tarife sapması: ${tariffGaps.length} ürün`,
  ].join("\n");
  const csvParts = [
    header.join(";"),
    ...lines,
    ...(tariffLines.length ? ["", tariffHeader.join(";"), ...tariffLines] : []),
  ];
  return {
    csv: "\uFEFF" + csvParts.join("\n"),
    summary,
    count: issues.length,
    tariffCount: tariffGaps.length,
    sum: Math.round(sum * 100) / 100,
  };
}

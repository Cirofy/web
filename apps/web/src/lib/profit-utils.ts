export type OrderProfitInput = {
  grossAmount: number;
  commission: number;
  shippingFee: number;
  serviceFee: number;
  vatNet: number;
  withholding: number;
  costTotal: number;
  returnFee?: number;
};

export type OrderInput = OrderProfitInput & {
  id: string;
  externalId: string;
  product: string;
  marketplace: string;
  orderedAt: string;
  status: string;
  netProfit: number;
};

export type ProductInput = {
  title: string;
  sku: string;
  category: string;
  brand: string;
  returnRatePct: number;
};

export type AdProfitRow = {
  id: string;
  sku: string;
  title: string;
  marketplace: string;
  adSpend: number;
  attributedSales: number;
  orders: number;
  influencerFee: number;
  netAfterAds: number;
};

export type CampaignResultRow = {
  id: string;
  offerId: string;
  kind: string;
  sku: string;
  title: string;
  offerPrice: number;
  orders: number;
  estimatedMarginPct: number;
  realizedMarginPct: number;
  estimatedNet: number;
  realizedNetTotal: number;
};

export type PriceTargetMode = "margin_pct" | "net_amount" | "markup_pct";

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Maliyet girilmiş mi — 0 / boş ise kâr hesaplanmaz. */
export function hasEnteredCost(cost: number | null | undefined) {
  return cost != null && Number.isFinite(cost) && cost > 0;
}

/**
 * Net kâr (parity):
 * satış − komisyon − kargo − hizmet − KDV net − stopaj − maliyet − iade ek zararı
 */
export function computeOrderNet(o: OrderProfitInput) {
  const returnFee = o.returnFee ?? 0;
  const deductions =
    o.commission +
    o.shippingFee +
    o.serviceFee +
    o.vatNet +
    o.withholding +
    o.costTotal +
    returnFee;
  const net = round2(o.grossAmount - deductions);
  return {
    net,
    deductions: round2(deductions),
    returnFee,
    lines: [
      { label: "Brüt satış", value: o.grossAmount },
      { label: "Komisyon", value: -o.commission },
      { label: "Kargo", value: -o.shippingFee },
      { label: "Hizmet bedeli", value: -o.serviceFee },
      { label: "KDV net", value: -o.vatNet },
      { label: "Stopaj", value: -o.withholding },
      { label: "Ürün maliyeti", value: -o.costTotal },
      ...(returnFee > 0 ? [{ label: "İade ek zararı", value: -returnFee }] : []),
    ],
  };
}

/** Ürün tahmini: sipariş formülü ile aynı kalemler (KDV net / stopaj yaklaşık) */
export function estimateMargin(p: {
  salePrice: number;
  costPrice: number;
  commissionRate: number;
  shippingCost: number;
}) {
  const hasCost = hasEnteredCost(p.costPrice);
  const commission = round2(p.salePrice * p.commissionRate);
  const serviceFee = round2(Math.max(4, p.salePrice * 0.018));
  const vatNet = round2(p.salePrice * 0.02);
  const withholding = round2(p.salePrice * 0.01);
  if (!hasCost) {
    return {
      net: 0,
      marginPct: 0,
      commission,
      serviceFee,
      vatNet,
      withholding,
      deductions: 0,
      hasCost: false as const,
    };
  }
  const { net, deductions } = computeOrderNet({
    grossAmount: p.salePrice,
    commission,
    shippingFee: p.shippingCost,
    serviceFee,
    vatNet,
    withholding,
    costTotal: p.costPrice,
  });
  const marginPct = p.salePrice > 0 ? (net / p.salePrice) * 100 : 0;
  return {
    net,
    marginPct,
    commission,
    serviceFee,
    vatNet,
    withholding,
    deductions,
    hasCost: true as const,
  };
}

/** İade zarar özeti */
export function summarizeReturnLoss(orders: Array<OrderProfitInput & { status: string }>) {
  const returned = orders.filter((o) => o.status === "RETURNED");
  const loss = returned.reduce((s, o) => s + Math.min(0, computeOrderNet(o).net), 0);
  return {
    count: returned.length,
    loss: round2(loss),
    returnFees: round2(returned.reduce((s, o) => s + (o.returnFee ?? 0), 0)),
  };
}

/** İade zarar derin analizi — SKU / kategori / kanal */
export function analyzeReturnLoss(
  orders: OrderInput[],
  products: ProductInput[] = [],
  days: 7 | 30 | 90 = 30,
) {
  const cutoff = Date.now() - days * 86400_000;
  const inPeriod = orders.filter((o) => new Date(o.orderedAt).getTime() >= cutoff);
  const returned = inPeriod.filter((o) => o.status === "RETURNED");
  const byTitle = new Map(products.map((p) => [p.title, p]));

  const bySku = new Map<
    string,
    {
      sku: string;
      title: string;
      category: string;
      brand: string;
      count: number;
      gross: number;
      netLoss: number;
      returnFeeEst: number;
      returnRatePct: number;
    }
  >();
  const byCategory = new Map<
    string,
    { category: string; count: number; netLoss: number; gross: number }
  >();
  const byMarketplace = new Map<
    string,
    { marketplace: string; count: number; netLoss: number; gross: number }
  >();

  let totalNetLoss = 0;
  let totalGross = 0;
  let totalReturnFees = 0;

  const recent = returned.map((o) => {
    const product = byTitle.get(o.product);
    const net = computeOrderNet(o).net;
    const netLoss = Math.min(0, net);
    const returnFeeEst = o.returnFee ?? 0;
    totalNetLoss += netLoss;
    totalGross += o.grossAmount;
    totalReturnFees += returnFeeEst;

    const sku = product?.sku ?? o.externalId;
    const category = product?.category ?? "Diğer";
    const brand = product?.brand ?? "—";

    const skuCur = bySku.get(sku) ?? {
      sku,
      title: o.product,
      category,
      brand,
      count: 0,
      gross: 0,
      netLoss: 0,
      returnFeeEst: 0,
      returnRatePct: product?.returnRatePct ?? 0,
    };
    skuCur.count += 1;
    skuCur.gross += o.grossAmount;
    skuCur.netLoss += netLoss;
    skuCur.returnFeeEst += returnFeeEst;
    bySku.set(sku, skuCur);

    const catCur = byCategory.get(category) ?? { category, count: 0, netLoss: 0, gross: 0 };
    catCur.count += 1;
    catCur.netLoss += netLoss;
    catCur.gross += o.grossAmount;
    byCategory.set(category, catCur);

    const mkt = o.marketplace;
    const mktCur = byMarketplace.get(mkt) ?? { marketplace: mkt, count: 0, netLoss: 0, gross: 0 };
    mktCur.count += 1;
    mktCur.netLoss += netLoss;
    mktCur.gross += o.grossAmount;
    byMarketplace.set(mkt, mktCur);

    return {
      id: o.id,
      externalId: o.externalId,
      orderedAt: o.orderedAt,
      marketplace: o.marketplace,
      storeName: "",
      sku,
      title: o.product,
      category,
      brand,
      grossAmount: o.grossAmount,
      netProfit: net,
      netLoss: round2(netLoss),
      returnFeeEst: round2(returnFeeEst),
      costTotal: o.costTotal,
      commission: o.commission,
    };
  });

  return {
    periodDays: days,
    hasData: true,
    summary: {
      returnCount: returned.length,
      orderCount: inPeriod.length,
      returnRatePct:
        inPeriod.length > 0 ? round2((returned.length / inPeriod.length) * 100) : 0,
      netLoss: round2(totalNetLoss),
      grossReturned: round2(totalGross),
      returnFees: round2(totalReturnFees),
      avgLossPerReturn:
        returned.length > 0 ? round2(totalNetLoss / returned.length) : 0,
    },
    bySku: [...bySku.values()]
      .map((r) => ({
        ...r,
        gross: round2(r.gross),
        netLoss: round2(r.netLoss),
        returnFeeEst: round2(r.returnFeeEst),
      }))
      .sort((a, b) => a.netLoss - b.netLoss),
    byCategory: [...byCategory.values()]
      .map((r) => ({ ...r, gross: round2(r.gross), netLoss: round2(r.netLoss) }))
      .sort((a, b) => a.netLoss - b.netLoss),
    byMarketplace: [...byMarketplace.values()]
      .map((r) => ({ ...r, gross: round2(r.gross), netLoss: round2(r.netLoss) }))
      .sort((a, b) => a.netLoss - b.netLoss),
    recent,
  };
}

/** Siparişleri ürün kategorisine göre net kâr */
export function summarizeCategoryProfit(
  orders: Array<OrderProfitInput & { product: string }>,
  products: Array<{ title: string; category: string }> = [],
) {
  const byTitle = new Map(products.map((p) => [p.title, p.category]));
  const buckets = new Map<
    string,
    { category: string; gross: number; net: number; orderCount: number }
  >();

  for (const o of orders) {
    const category = byTitle.get(o.product) ?? "Diğer";
    const net = computeOrderNet(o).net;
    const cur = buckets.get(category) ?? { category, gross: 0, net: 0, orderCount: 0 };
    cur.gross += o.grossAmount;
    cur.net += net;
    cur.orderCount += 1;
    buckets.set(category, cur);
  }

  return [...buckets.values()]
    .map((b) => ({
      ...b,
      gross: round2(b.gross),
      net: round2(b.net),
      marginPct: b.gross > 0 ? round2((b.net / b.gross) * 100) : 0,
    }))
    .sort((a, b) => b.net - a.net);
}

export function summarizeAdProfit(rows: AdProfitRow[]) {
  const spend = rows.reduce((s, r) => s + r.adSpend, 0);
  const sales = rows.reduce((s, r) => s + r.attributedSales, 0);
  const influencer = rows.reduce((s, r) => s + r.influencerFee, 0);
  const net = rows.reduce((s, r) => s + r.netAfterAds, 0);
  const roas = spend > 0 ? sales / spend : 0;
  return {
    spend: round2(spend),
    sales: round2(sales),
    influencer: round2(influencer),
    net: round2(net),
    roas: round2(roas),
    losing: rows.filter((r) => r.netAfterAds < 0).length,
  };
}

export function summarizeCampaignResults(rows: CampaignResultRow[]) {
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const net = rows.reduce((s, r) => s + r.realizedNetTotal, 0);
  const worseThanEstimate = rows.filter(
    (r) => r.realizedMarginPct < r.estimatedMarginPct - 0.5,
  ).length;
  return {
    campaigns: rows.length,
    orders,
    net: round2(net),
    worseThanEstimate,
  };
}

/** Senaryo: komisyon puanı / kargo / flaş indirim etkisi */
export function simulateScenario(
  p: {
    salePrice: number;
    costPrice: number;
    commissionRate: number;
    shippingCost: number;
  },
  opts: {
    commissionDeltaPts?: number;
    shippingDelta?: number;
    flashDiscountPct?: number;
  },
) {
  const flash = Math.max(0, Math.min(80, opts.flashDiscountPct ?? 0));
  const salePrice = Math.round(p.salePrice * (1 - flash / 100) * 100) / 100;
  const commissionRate = Math.max(
    0,
    p.commissionRate + (opts.commissionDeltaPts ?? 0) / 100,
  );
  const shippingCost = Math.max(0, p.shippingCost + (opts.shippingDelta ?? 0));
  const base = estimateMargin(p);
  const next = estimateMargin({ salePrice, costPrice: p.costPrice, commissionRate, shippingCost });
  return {
    base,
    next,
    salePrice,
    commissionRate,
    shippingCost,
    deltaNet: Math.round((next.net - base.net) * 100) / 100,
    deltaMarginPts: Math.round((next.marginPct - base.marginPct) * 10) / 10,
  };
}

/** Hedef marj / net / maliyet üstü oran için satış fiyatı önerisi */
export function suggestSalePrice(
  p: {
    costPrice: number;
    commissionRate: number;
    shippingCost: number;
  },
  mode: PriceTargetMode,
  target: number,
) {
  const base = {
    costPrice: p.costPrice,
    commissionRate: p.commissionRate,
    shippingCost: p.shippingCost,
  };
  let lo = Math.max(1, p.costPrice + p.shippingCost * 0.5);
  let hi = Math.max(lo * 2, p.costPrice * 8 + 500);

  const hit = (salePrice: number) => {
    const est = estimateMargin({ ...base, salePrice });
    if (mode === "margin_pct") return est.marginPct - target;
    if (mode === "net_amount") return est.net - target;
    const markup = p.costPrice > 0 ? (est.net / p.costPrice) * 100 : 0;
    return markup - target;
  };

  if (hit(hi) < 0) hi *= 2;

  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (hit(mid) < 0) lo = mid;
    else hi = mid;
  }

  const salePrice = round2(hi);
  const est = estimateMargin({ ...base, salePrice });
  return { salePrice, ...est };
}

/**
 * Buybox fiyatına göre öneri:
 * - alt kırım veya eşleşme min marjı koruyorsa onu öner
 * - aksi halde marjı koruyan hedef fiyat (buybox kaçabilir)
 */
export function suggestBuyboxAwarePrice(
  p: {
    costPrice: number;
    commissionRate: number;
    shippingCost: number;
    salePrice: number;
  },
  buyboxPrice: number,
  minMarginPct = 10,
) {
  const undercut = round2(Math.max(1, buyboxPrice - 1));
  const atUndercut = estimateMargin({ ...p, salePrice: undercut });
  if (atUndercut.marginPct >= minMarginPct) {
    return {
      salePrice: undercut,
      ...atUndercut,
      strategy: "undercut" as const,
      meetsBuybox: true,
      buyboxPrice,
      note: "Buybox'ın 1 ₺ altında; hedef marj korunuyor.",
    };
  }

  const atMatch = estimateMargin({ ...p, salePrice: round2(buyboxPrice) });
  if (atMatch.marginPct >= minMarginPct) {
    return {
      salePrice: round2(buyboxPrice),
      ...atMatch,
      strategy: "match" as const,
      meetsBuybox: true,
      buyboxPrice,
      note: "Buybox ile eşleş; hedef marj korunuyor.",
    };
  }

  const protectedPrice = suggestSalePrice(p, "margin_pct", minMarginPct);
  return {
    ...protectedPrice,
    strategy: "protect_margin" as const,
    meetsBuybox: false,
    buyboxPrice,
    note: "Buybox fiyatında marj düşük; hedef marj için daha yüksek fiyat önerildi.",
  };
}

/** Yan yana fiyat seçenekleri (mevcut / +5% / hedef) */
export function priceOptions(
  p: {
    salePrice: number;
    costPrice: number;
    commissionRate: number;
    shippingCost: number;
  },
  targetMarginPct: number,
) {
  const current = estimateMargin(p);
  const plus5 = estimateMargin({ ...p, salePrice: round2(p.salePrice * 1.05) });
  const target = suggestSalePrice(p, "margin_pct", targetMarginPct);
  return [
    {
      id: "current" as const,
      label: "Mevcut",
      salePrice: p.salePrice,
      net: current.net,
      marginPct: current.marginPct,
    },
    {
      id: "plus5" as const,
      label: "+%5",
      salePrice: round2(p.salePrice * 1.05),
      net: plus5.net,
      marginPct: plus5.marginPct,
    },
    {
      id: "target" as const,
      label: `Hedef %${targetMarginPct}`,
      salePrice: target.salePrice,
      net: target.net,
      marginPct: target.marginPct,
    },
  ];
}

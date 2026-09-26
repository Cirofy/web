export type PromoKind =
  | "flash"
  | "advantage_label"
  | "commission_tariff"
  | "plus_commission"
  | "discount";

export const promoKindLabels: Record<PromoKind, string> = {
  flash: "Flaş teklif",
  advantage_label: "Avantajlı etiket",
  commission_tariff: "Komisyon tarifesi",
  plus_commission: "Plus komisyon tarifesi",
  discount: "İndirim",
};

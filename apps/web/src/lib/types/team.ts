export type TeamRole = "owner" | "ops" | "finance" | "agency";

export const teamRoleLabels: Record<TeamRole, string> = {
  owner: "Sahip",
  ops: "Operasyon",
  finance: "Finans",
  agency: "Ajans",
};

export const teamRoleHints: Record<TeamRole, string> = {
  owner: "Tüm mağazalar, faturalama, ekip · tarife uygula",
  ops: "Sipariş, ürün, teklif, buybox · tarife uygula",
  finance: "Hakediş, itiraz, rapor, abonelik · tarife görüntüle",
  agency: "Çoklu mağaza özeti · tarife görüntüle (salt okunur)",
};

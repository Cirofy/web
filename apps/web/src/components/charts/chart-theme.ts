/** Cirofy grafik token’ları — tasarım dili §7 */

export const chartColors = {
  profit: "#0DBF9B",
  profitSoft: "rgba(13, 191, 155, 0.28)",
  accent: "#2B6CFF",
  accentSoft: "rgba(43, 108, 255, 0.18)",
  loss: "#F05252",
  warn: "#E8A317",
  inkMuted: "#3D4F66",
  border: "#D5DDE8",
  grid: "#E4EAF2",
  surface: "#FFFFFF",
} as const;

export const chartTooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${chartColors.border}`,
  background: chartColors.surface,
  boxShadow: "0 10px 30px rgba(11,20,36,0.08)",
  fontSize: 12,
  color: "#0B1424",
} as const;

export const chartAxisTick = {
  fill: chartColors.inkMuted,
  fontSize: 12,
} as const;

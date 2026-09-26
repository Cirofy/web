"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  chartColors,
  chartTooltipStyle,
} from "@/components/charts/chart-theme";

export type ProfitMixPoint = {
  key: "profit" | "loss" | "returns";
  label: string;
  value: number;
};

const FILL: Record<ProfitMixPoint["key"], string> = {
  profit: chartColors.profit,
  loss: chartColors.loss,
  returns: chartColors.warn,
};

export function ProfitMixChart({
  data,
  height = 220,
}: {
  data: ProfitMixPoint[];
  height?: number;
}) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);

  if (total <= 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sipariş dağılımı yok.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke={chartColors.surface}
            strokeWidth={2}
            animationDuration={650}
          >
            {rows.map((r) => (
              <Cell key={r.key} fill={FILL[r.key]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value, name) => {
              const n = Number(value ?? 0);
              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
              return [`${n} sipariş · %${pct}`, String(name)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        {rows.map((r) => (
          <span key={r.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: FILL[r.key] }}
            />
            {r.label} ({r.value})
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTry } from "@/lib/utils";
import {
  chartAxisTick,
  chartColors,
  chartTooltipStyle,
} from "@/components/charts/chart-theme";

export type CategoryBarPoint = {
  category: string;
  net: number;
  marginPct?: number;
};

export function CategoryBarChart({
  data,
  height = 260,
}: {
  data: CategoryBarPoint[];
  height?: number;
}) {
  const rows = data.slice(0, 8).map((d) => ({
    ...d,
    label: d.category.length > 14 ? `${d.category.slice(0, 12)}…` : d.category,
  }));

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Kategori verisi yok.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={88}
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "rgba(13, 191, 155, 0.06)" }}
            formatter={(value, _name, item) => {
              const pct = (item?.payload as CategoryBarPoint | undefined)?.marginPct;
              const base = formatTry(Number(value ?? 0));
              return [
                pct != null ? `${base} · %${pct.toFixed(1)}` : base,
                "Net kâr",
              ];
            }}
            labelFormatter={(_, payload) =>
              String((payload?.[0]?.payload as CategoryBarPoint | undefined)?.category ?? "")
            }
          />
          <Bar dataKey="net" radius={[0, 8, 8, 0]} barSize={18} animationDuration={650}>
            {rows.map((r) => (
              <Cell
                key={r.category}
                fill={
                  r.net < 0
                    ? chartColors.loss
                    : (r.marginPct ?? 15) >= 15
                      ? chartColors.profit
                      : (r.marginPct ?? 15) >= 8
                        ? chartColors.warn
                        : chartColors.accent
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

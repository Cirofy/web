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

export type TopProductPoint = {
  name: string;
  net: number;
  orderCount?: number;
};

export function TopProductsChart({
  data,
  height = 260,
}: {
  data: TopProductPoint[];
  height?: number;
}) {
  const rows = data.slice(0, 8).map((d) => ({
    ...d,
    label: d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name,
  }));

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Ürün kâr verisi yok.
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
            width={108}
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "rgba(13, 191, 155, 0.06)" }}
            formatter={(value, _name, item) => {
              const count = (item?.payload as TopProductPoint | undefined)?.orderCount;
              const base = formatTry(Number(value ?? 0));
              return [
                count != null ? `${base} · ${count} sipariş` : base,
                "Net kâr",
              ];
            }}
            labelFormatter={(_, payload) =>
              String((payload?.[0]?.payload as TopProductPoint | undefined)?.name ?? "")
            }
          />
          <Bar dataKey="net" radius={[0, 8, 8, 0]} barSize={16} animationDuration={650}>
            {rows.map((r) => (
              <Cell
                key={r.name}
                fill={r.net < 0 ? chartColors.loss : chartColors.profit}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

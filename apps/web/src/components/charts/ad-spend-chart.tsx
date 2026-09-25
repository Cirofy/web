"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export type AdSpendPoint = {
  label: string;
  adSpend: number;
  netAfterAds: number;
};

export function AdSpendChart({
  data,
  height = 280,
}: {
  data: AdSpendPoint[];
  height?: number;
}) {
  const rows = data.slice(0, 8).map((d) => ({
    ...d,
    short: d.label.length > 16 ? `${d.label.slice(0, 14)}…` : d.label,
  }));

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Reklam verisi yok.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="short"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            interval={0}
            angle={rows.length > 5 ? -18 : 0}
            textAnchor={rows.length > 5 ? "end" : "middle"}
            height={rows.length > 5 ? 56 : 28}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            width={36}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "rgba(13, 191, 155, 0.06)" }}
            formatter={(value, name) => [
              formatTry(Number(value ?? 0)),
              name === "adSpend" ? "Harcama" : "Reklam sonrası net",
            ]}
            labelFormatter={(_, payload) =>
              String((payload?.[0]?.payload as AdSpendPoint | undefined)?.label ?? "")
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: chartColors.inkMuted }}
            formatter={(value) =>
              value === "adSpend" ? "Harcama" : "Reklam sonrası net"
            }
          />
          <Bar
            dataKey="adSpend"
            name="adSpend"
            fill={chartColors.accent}
            radius={[8, 8, 0, 0]}
            maxBarSize={28}
            animationDuration={650}
          />
          <Bar
            dataKey="netAfterAds"
            name="netAfterAds"
            fill={chartColors.profit}
            radius={[8, 8, 0, 0]}
            maxBarSize={28}
            animationDuration={650}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

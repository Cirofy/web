"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

export type IntradayPoint = {
  hour: string;
  profit: number;
  orders: number;
};

export function IntradayChart({
  data,
  height = 260,
}: {
  data: IntradayPoint[];
  height?: number;
}) {
  const rows = data.map((d) => ({
    ...d,
    label: `${d.hour}:00`,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
          />
          <YAxis
            yAxisId="profit"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            tickFormatter={(v) => `${Math.round(Number(v))}`}
            width={40}
          />
          <YAxis
            yAxisId="orders"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            width={28}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "rgba(13, 191, 155, 0.06)" }}
            formatter={(value, name) => [
              name === "orders" ? String(value) : formatTry(Number(value ?? 0)),
              name === "orders" ? "Sipariş" : "Net kâr",
            ]}
            labelFormatter={(label) => `${label}:00`}
          />
          <Bar
            yAxisId="profit"
            dataKey="profit"
            name="profit"
            fill={chartColors.profit}
            radius={[8, 8, 0, 0]}
            maxBarSize={36}
            animationDuration={600}
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="orders"
            stroke={chartColors.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: chartColors.accent, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            animationDuration={700}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

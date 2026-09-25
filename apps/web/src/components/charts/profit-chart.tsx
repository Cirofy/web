"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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

export type ChartPoint = {
  day: string;
  profit: number;
  sales: number;
};

const emptyWeek: ChartPoint[] = [
  { day: "Pzt", profit: 0, sales: 0 },
  { day: "Sal", profit: 0, sales: 0 },
  { day: "Çar", profit: 0, sales: 0 },
  { day: "Per", profit: 0, sales: 0 },
  { day: "Cum", profit: 0, sales: 0 },
  { day: "Cmt", profit: 0, sales: 0 },
  { day: "Paz", profit: 0, sales: 0 },
];

export function ProfitChart({
  data,
  height = 280,
}: {
  data: ChartPoint[];
  height?: number;
}) {
  const chartData = data.length > 0 ? data : emptyWeek;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cirofyProfitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.profit} stopOpacity={0.32} />
              <stop offset="100%" stopColor={chartColors.profit} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cirofySalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.12} />
              <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
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
            cursor={{ stroke: chartColors.border, strokeDasharray: "4 4" }}
            formatter={(value, name) => [
              formatTry(Number(value ?? 0)),
              name === "profit" ? "Net kâr" : "Ciro",
            ]}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="sales"
            name="sales"
            stroke={chartColors.accent}
            strokeWidth={1.75}
            fill="url(#cirofySalesFill)"
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="profit"
            name="profit"
            stroke={chartColors.profit}
            strokeWidth={2.5}
            fill="url(#cirofyProfitFill)"
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartAxisTick,
  chartColors,
  chartTooltipStyle,
} from "@/components/charts/chart-theme";

export type OrderVolumePoint = {
  day: string;
  orders: number;
};

const emptyWeek: OrderVolumePoint[] = [
  { day: "Pzt", orders: 0 },
  { day: "Sal", orders: 0 },
  { day: "Çar", orders: 0 },
  { day: "Per", orders: 0 },
  { day: "Cum", orders: 0 },
  { day: "Cmt", orders: 0 },
  { day: "Paz", orders: 0 },
];

export function OrderVolumeChart({
  data,
  height = 220,
}: {
  data: OrderVolumePoint[];
  height?: number;
}) {
  const chartData = data.length > 0 ? data : emptyWeek;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={chartAxisTick}
            width={28}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "rgba(43, 108, 255, 0.06)" }}
            formatter={(value) => [Number(value ?? 0), "Sipariş"]}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          <Bar
            dataKey="orders"
            fill={chartColors.accent}
            radius={[8, 8, 0, 0]}
            barSize={22}
            animationDuration={650}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

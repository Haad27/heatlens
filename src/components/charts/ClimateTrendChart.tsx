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
import { CHART_COLORS, TOOLTIP_STYLE } from "@/components/charts/shared";
import { celsiusToFahrenheit } from "@/lib/format";
import type { ClimateTrend } from "@/lib/types";

/**
 * Warm-season trajectory since 2021.
 *
 * Bars are days at or above the heat-risk threshold, which is the number a
 * capital-planning committee reacts to; the line is mean daily maximum, which
 * shows whether those days come from a shifting distribution or from a single
 * unusual year. Regional resolution, so it is deliberately kept visually
 * separate from the block-level FortyGuard figures.
 */
export default function ClimateTrendChart({
  trend,
  height = 180,
}: {
  trend: ClimateTrend;
  height?: number;
}) {
  if (trend.points.length < 2) return null;

  const data = trend.points.map((point) => ({
    year: point.year,
    days: point.daysAboveThreshold,
    mean: point.meanSummerMaxC,
  }));

  const means = data.map((d) => d.mean);
  const pad = 1.2;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.axis }}
          />
          <YAxis
            yAxisId="days"
            tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <YAxis
            yAxisId="mean"
            orientation="right"
            domain={[Math.floor(Math.min(...means) - pad), Math.ceil(Math.max(...means) + pad)]}
            tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={false}
            width={38}
            tickFormatter={(v: number) => `${v}°`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(12,16,21,.04)" }}
            formatter={(value, name) => {
              if (name === "Days above threshold") return [`${value} days`, name];
              const celsius = Number(value);
              return [
                `${celsius.toFixed(1)} °C / ${celsiusToFahrenheit(celsius).toFixed(0)} °F`,
                name as string,
              ];
            }}
          />
          <Bar
            yAxisId="days"
            dataKey="days"
            name="Days above threshold"
            fill={CHART_COLORS.warm}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="mean"
            type="monotone"
            dataKey="mean"
            name="Mean daily maximum"
            stroke={CHART_COLORS.hot}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_COLORS.hot, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

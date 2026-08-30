"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/components/charts/shared";
import { celsiusToFahrenheit, formatClockHour } from "@/lib/format";
import type { ForecastInsight } from "@/lib/types";

/**
 * Compact 12-hour predicted-temperature sparkline for the Thermal Overview card.
 */
export default function ForecastSparkline({
  forecast,
  height = 88,
}: {
  forecast: ForecastInsight;
  height?: number;
}) {
  const data = forecast.hourlyMeanTemps.map((point) => ({
    label: formatClockHour(point.hourLocal),
    maxTemp: point.maxTemp,
    meanTemp: point.meanTemp,
  }));

  const values = data.flatMap((d) => [d.maxTemp, d.meanTemp]);
  const min = Math.min(...values, forecast.thresholdC) - 1.5;
  const max = Math.max(...values, forecast.thresholdC) + 1.5;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.axis }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            domain={[Math.floor(min), Math.ceil(max)]}
            tick={{ fontSize: 9, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => `${v}°`}
          />
          <ReferenceLine
            y={forecast.thresholdC}
            stroke={CHART_COLORS.hot}
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{
              value: "32.2°C",
              position: "insideTopRight",
              fontSize: 9,
              fill: "#b2182b",
            }}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["—", name as string];
              const celsius = Number(value);
              return [
                `${celsius.toFixed(1)} °C / ${celsiusToFahrenheit(celsius).toFixed(0)} °F`,
                name as string,
              ];
            }}
            labelFormatter={(label) => `${String(label ?? "")} local`}
          />
          <Line
            type="monotone"
            dataKey="maxTemp"
            name="Predicted max"
            stroke={CHART_COLORS.hot}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/components/charts/shared";
import { buildTemperatureScale } from "@/lib/colors";
import { celsiusToFahrenheit } from "@/lib/format";
import type { HeatGrid } from "@/lib/types";

/**
 * How temperature is distributed across the area.
 *
 * A long right tail means a few blocks are carrying the heat and targeted
 * intervention will work; a broad, flat distribution means the whole area runs
 * hot and needs an area-wide strategy. Bars are coloured with the same scale as
 * the map so the reader can tie a tail directly to what they see on screen.
 */
export default function DistributionChart({
  grid,
  thresholdC,
  height = 150,
}: {
  grid: HeatGrid;
  thresholdC: number;
  height?: number;
}) {
  if (grid.distribution.length < 3) return null;

  const scale = buildTemperatureScale(grid.stats.min, grid.stats.max);
  const isTemperature = grid.unit === "celsius";

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={grid.distribution} margin={{ top: 6, right: 6, bottom: 0, left: -26 }}>
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.axis }}
            interval="preserveStartEnd"
            minTickGap={22}
            tickFormatter={(v: number) => (isTemperature ? `${v.toFixed(0)}°` : `${v}h`)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(12,16,21,.04)" }}
            formatter={(value) => [`${value} tiles`, "Count"]}
            labelFormatter={(label) => {
              const bucket = Number(label);
              if (!Number.isFinite(bucket)) return String(label ?? "");
              return isTemperature
                ? `${bucket.toFixed(1)} °C / ${celsiusToFahrenheit(bucket).toFixed(0)} °F`
                : `${bucket} hours`;
            }}
          />
          {isTemperature && (
            <ReferenceLine
              x={grid.distribution.reduce((closest, d) =>
                Math.abs(d.bucket - thresholdC) < Math.abs(closest.bucket - thresholdC) ? d : closest,
              ).bucket}
              stroke="#b2182b"
              strokeDasharray="3 3"
            />
          )}
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {grid.distribution.map((entry) => (
              <Cell
                key={entry.bucket}
                fill={isTemperature ? scale.colorFor(entry.bucket) : CHART_COLORS.warm}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

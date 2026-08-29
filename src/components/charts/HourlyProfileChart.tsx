"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HEAT_THRESHOLD_LABELS } from "@/components/charts/shared";
import { celsiusToFahrenheit, formatClockHour } from "@/lib/format";
import type { HourlyProfile } from "@/lib/types";

/**
 * Hourly thermal comfort across the analysed day.
 *
 * Heat index is plotted above apparent temperature because heat index is the
 * measure the National Weather Service issues advisories against, so it is the
 * line a public-health reader is looking for. The caution and danger bands are
 * drawn as reference lines rather than described in a caption — the point of the
 * chart is to show how much of the day sits inside them.
 */
export default function HourlyProfileChart({
  profile,
  thresholdC,
  height = 200,
}: {
  profile: HourlyProfile;
  thresholdC: number;
  height?: number;
}) {
  const data = profile.samples
    .filter((s) => s.heatIndexC !== undefined || s.apparentTempC !== undefined)
    .map((sample) => ({
      hour: sample.hourLocal,
      label: formatClockHour(sample.hourLocal),
      heatIndex: sample.heatIndexC ?? null,
      apparent: sample.apparentTempC ?? null,
      humidity: sample.relativeHumidityPct ?? null,
      isForecast: sample.isForecast,
    }));

  if (data.length < 2) return null;

  const values = data.flatMap((d) => [d.heatIndex, d.apparent].filter((v): v is number => v !== null));
  const min = Math.min(...values, thresholdC) - 2;
  const max = Math.max(...values, thresholdC) + 2;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="heatIndexFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f46d43" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#f46d43" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#eceef2" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#7d8899" }}
            tickLine={false}
            axisLine={{ stroke: "#d5dae2" }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            domain={[Math.floor(min), Math.ceil(max)]}
            tick={{ fontSize: 10, fill: "#7d8899" }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}°`}
          />

          <ReferenceLine
            y={thresholdC}
            stroke="#e34a33"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{
              value: HEAT_THRESHOLD_LABELS.risk,
              position: "insideTopRight",
              fontSize: 9,
              fill: "#b2182b",
            }}
          />

          <Tooltip
            cursor={{ stroke: "#b0b9c7", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #d5dae2",
              fontSize: 12,
              boxShadow: "0 4px 16px rgba(12,16,21,.10)",
            }}
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["—", name as string];
              if (name === "Humidity") return [`${Math.round(Number(value))}%`, name];
              const celsius = Number(value);
              return [
                `${celsius.toFixed(1)} °C / ${celsiusToFahrenheit(celsius).toFixed(0)} °F`,
                name as string,
              ];
            }}
            labelFormatter={(label) => `${String(label ?? "")} local`}
          />

          <Area
            type="monotone"
            dataKey="heatIndex"
            name="Heat index"
            stroke="#d73027"
            strokeWidth={2}
            fill="url(#heatIndexFill)"
            connectNulls
            dot={false}
            activeDot={{ r: 3.5 }}
          />
          <Line
            type="monotone"
            dataKey="apparent"
            name="Apparent temperature"
            stroke="#0d857e"
            strokeWidth={1.75}
            strokeDasharray="5 3"
            connectNulls
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

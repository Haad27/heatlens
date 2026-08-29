"use client";

import { FileDown } from "lucide-react";
import { cn } from "@/lib/format";
import type { AggregatedRecommendation } from "@/lib/types";

export default function RecommendationsPanel({
  recommendations,
  selectedId,
  onSelect,
  onDownload,
}: {
  recommendations: AggregatedRecommendation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDownload: () => void;
}) {
  const selected =
    recommendations.find((item) => item.id === selectedId) ?? recommendations[0] ?? null;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">AI Recommendations</h2>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download Report
        </button>
      </div>

      <ul className="mt-4 flex-1 space-y-1.5">
        {recommendations.length === 0 && (
          <li className="rounded-xl bg-ink-50 px-3 py-3 text-sm text-ink-500">
            No intervention scored above the rule thresholds.
          </li>
        )}
        {recommendations.map((item) => {
          const active = selected?.id === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  active ? "bg-emerald-50 ring-1 ring-emerald-100" : "hover:bg-ink-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-900">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{item.horizon}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    item.coolingLabel === "people-focused"
                      ? "bg-violet-50 text-violet-700"
                      : "bg-violet-50 text-violet-700",
                  )}
                >
                  {item.coolingLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Implementation
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-400">Cost</dt>
              <dd className="font-semibold text-emerald-700">{selected.costBand}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Timeline</dt>
              <dd className="font-semibold text-violet-700">{selected.timeline}</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Impact: {selected.impactSummary}
          </p>
        </div>
      )}
    </section>
  );
}

import type { AnalysisResult } from "@/lib/types";

/**
 * Browser-side copy of recent analyses.
 *
 * The report route normally loads an analysis by id from the server cache. On a
 * deployment without a persistent KV store, the server cache is per-instance, so
 * the report request can land on a different serverless instance than the one
 * that produced the analysis and find nothing. Keeping the last few results in
 * localStorage means the report still renders the exact figures the user just
 * looked at, rather than silently re-running the pipeline and producing subtly
 * different numbers.
 */

const PREFIX = "heatlens:analysis:";
const INDEX_KEY = "heatlens:analysis:index";
const MAX_ENTRIES = 4;

function available(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readIndex(): string[] {
  if (!available()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function cacheAnalysisLocally(result: AnalysisResult): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(`${PREFIX}${result.id}`, JSON.stringify(result));

    const index = [result.id, ...readIndex().filter((id) => id !== result.id)];
    for (const stale of index.slice(MAX_ENTRIES)) {
      window.localStorage.removeItem(`${PREFIX}${stale}`);
    }
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, MAX_ENTRIES)));
  } catch {
  }
}

export function loadAnalysisLocally(id: string): AnalysisResult | null {
  if (!available()) return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as AnalysisResult) : null;
  } catch {
    return null;
  }
}

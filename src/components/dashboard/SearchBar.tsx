"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/format";
import type { GeocodeResult } from "@/lib/types";

const SAMPLE_PLACES: { label: string; query: string }[] = [
  { label: "Phoenix, AZ", query: "Phoenix, Arizona" },
  { label: "Houston, TX", query: "Houston, Texas" },
  { label: "Fresno, CA", query: "Fresno, California" },
  { label: "Newark, NJ", query: "Newark, New Jersey" },
];

export default function SearchBar({
  onSelect,
  placeholder = "Search a US address, city or neighbourhood",
  autoFocus = false,
  showSamples = false,
  className,
}: {
  onSelect: (result: GeocodeResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showSamples?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  /**
   * Results are stored together with the query they belong to, and only
   * rendered when that query still matches what is in the box. Storing them
   * separately would mean clearing them whenever the input shrinks below the
   * minimum length, and a late response for an abandoned query could still
   * flash stale suggestions.
   */
  const [response, setResponse] = useState<{
    query: string;
    results: GeocodeResult[];
    error: string | null;
  }>({ query: "", results: [], error: null });

  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const trimmedQuery = query.trim();
  const isSearchable = trimmedQuery.length >= 3;
  const current = response.query === trimmedQuery ? response : null;
  const results = current?.results ?? [];
  const error = current?.error ?? null;

  useEffect(() => {
    if (trimmedQuery.length < 3) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { results?: GeocodeResult[]; error?: string };
        if (controller.signal.aborted) return;

        const found = body.results ?? [];
        setResponse({
          query: trimmedQuery,
          results: found,
          error:
            body.error ??
            (found.length === 0
              ? "No US match for that search. Try adding a city and state, or click the map."
              : null),
        });
        setHighlighted(0);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setResponse({
            query: trimmedQuery,
            results: [],
            error: "Address lookup is unavailable right now. You can still click the map.",
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 320);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const choose = (result: GeocodeResult) => {
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((h) => (h - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-10 pr-10 text-sm text-ink-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" />
        )}
        {!loading && query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && isSearchable && (results.length > 0 || error) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-[1200] mt-1.5 max-h-72 w-full overflow-auto rounded-lg border border-ink-200 bg-white p-1 shadow-xl"
        >
          {results.map((result, index) => (
            <li key={`${result.label}-${index}`} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(result)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition",
                  index === highlighted ? "bg-accent-50" : "hover:bg-ink-50",
                )}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-900">{result.label}</span>
                  <span className="block text-[11px] capitalize text-ink-400">
                    {result.kind.replace(/_/g, " ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {error && results.length === 0 && (
            <li className="px-3 py-2.5 text-xs leading-relaxed text-ink-500">{error}</li>
          )}
        </ul>
      )}

      {showSamples && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-400">Try:</span>
          {SAMPLE_PLACES.map((sample) => (
            <button
              key={sample.query}
              type="button"
              onClick={() => {
                setQuery(sample.query);
                setOpen(true);
              }}
              className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 transition hover:border-accent-300 hover:text-accent-700"
            >
              {sample.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

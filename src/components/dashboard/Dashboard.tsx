"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import Logo from "@/components/ui/Logo";
import SearchBar from "@/components/dashboard/SearchBar";
import DashboardWelcome from "@/components/dashboard/DashboardWelcome";
import ResultsView, { AnalysisLoading } from "@/components/results/ResultsView";
import { cacheAnalysisLocally, loadAnalysisLocally } from "@/lib/clientStore";
import type { AnalysisResult, GeocodeResult, LatLng } from "@/lib/types";

interface DashboardProps {
  initialAnalysisId?: string | null;
  initialCenter: LatLng | null;
  initialLabel: string | null;
  demoMode: boolean;
}

export default function Dashboard({
  initialAnalysisId,
  initialCenter,
  initialLabel,
  demoMode,
}: DashboardProps) {
  const router = useRouter();

  const [center, setCenter] = useState<LatLng | null>(initialCenter);
  const [placeLabel, setPlaceLabel] = useState<string | null>(initialLabel);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
  }, []);

  const startStageNarration = useCallback(() => {
    clearStageTimers();
    const stages: [number, string][] = [
      [0, "Connecting to satellite thermal telemetry"],
      [12_000, "Polling FortyGuard satellite raster grid"],
      [26_000, "Detecting microclimate thermal hotspots"],
      [38_000, "Sampling canopy, pavement & building density"],
      [48_000, "Querying census tract vulnerability & exposure"],
      [58_000, "Synthesizing mitigation insights with Google Gemini"],
    ];
    for (const [delay, label] of stages) {
      stageTimersRef.current.push(setTimeout(() => setLoadingStage(label), delay));
    }
  }, [clearStageTimers]);

  const loadExistingAnalysis = useCallback(async (id: string): Promise<boolean> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analysis/${id}`);
      if (response.ok) {
        const body = (await response.json()) as AnalysisResult;
        if (requestId !== requestIdRef.current) return false;

        setAnalysis(body);
        if (body.request?.center) {
          setCenter(body.request.center);
        }
        if (body.placeLabel) {
          setPlaceLabel(body.placeLabel);
        }
        setSelectedRecommendationId(body.brief?.recommendations[0]?.id ?? null);
        return true;
      }

      const local = loadAnalysisLocally(id);
      if (local && requestId === requestIdRef.current) {
        setAnalysis(local);
        if (local.request?.center) {
          setCenter(local.request.center);
        }
        if (local.placeLabel) {
          setPlaceLabel(local.placeLabel);
        }
        setSelectedRecommendationId(local.brief?.recommendations[0]?.id ?? null);
        return true;
      }
      return false;
    } catch {
      const local = loadAnalysisLocally(id);
      if (local && requestId === requestIdRef.current) {
        setAnalysis(local);
        if (local.request?.center) {
          setCenter(local.request.center);
        }
        if (local.placeLabel) {
          setPlaceLabel(local.placeLabel);
        }
        setSelectedRecommendationId(local.brief?.recommendations[0]?.id ?? null);
        return true;
      }
      return false;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const runAnalysis = useCallback(
    async (override?: { center?: LatLng; label?: string }) => {
      const targetCenter = override?.center ?? center;
      if (!targetCenter) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setLoading(true);
      setError(null);
      setSelectedHotspotId(null);
      setSelectedRecommendationId(null);
      startStageNarration();

      try {
        const response = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            center: targetCenter,
            radiusMeters: 1200,
            mode: "current",
            granularity: 100,
            thresholdC: 32.2,
            placeLabel: override?.label ?? placeLabel ?? undefined,
          }),
        });

        const body = await response.json();
        if (requestId !== requestIdRef.current) return;

        if (!response.ok) {
          setError({ message: body.error ?? "That analysis failed.", hint: body.hint });
          setAnalysis(null);
          return;
        }

        const result = body as AnalysisResult;
        setAnalysis(result);
        cacheAnalysisLocally(result);
        setSelectedRecommendationId(result.brief?.recommendations[0]?.id ?? null);

        if (typeof window !== "undefined") {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set("id", result.id);
          if (targetCenter) {
            currentUrl.searchParams.set("lat", targetCenter.lat.toFixed(6));
            currentUrl.searchParams.set("lng", targetCenter.lng.toFixed(6));
          }
          if (override?.label ?? placeLabel) {
            currentUrl.searchParams.set("label", override?.label ?? placeLabel ?? "");
          }
          window.history.replaceState(null, "", currentUrl.toString());
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError({
          message: "Could not reach the analysis service.",
          hint: "Check your connection and try again.",
        });
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingStage(null);
          clearStageTimers();
        }
      }
    },
    [center, clearStageTimers, placeLabel, startStageNarration],
  );

  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    async function initialize() {
      if (initialAnalysisId) {
        const loaded = await loadExistingAnalysis(initialAnalysisId);
        if (loaded) return;
      }

      if (initialCenter) {
        void runAnalysis({ center: initialCenter, label: initialLabel ?? undefined });
      }
    }

    void initialize();
  }, [initialAnalysisId, initialCenter, initialLabel, loadExistingAnalysis, runAnalysis]);

  useEffect(() => () => clearStageTimers(), [clearStageTimers]);

  const handleSelectPlace = (result: GeocodeResult) => {
    setCenter(result.center);
    setPlaceLabel(result.label);
    void runAnalysis({ center: result.center, label: result.label });
  };

  const handleGenerateReport = () => {
    if (!analysis) return;
    cacheAnalysisLocally(analysis);
    router.push(`/report/${analysis.id}`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#f3f6f8]">
      <header className="z-[1100] flex shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo size="sm" />
          <span className="hidden text-sm font-semibold tracking-tight text-ink-900 sm:block">
            HeatLens
          </span>
        </Link>

        <SearchBar onSelect={handleSelectPlace} className="max-w-xl flex-1" />

        {demoMode && (
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 md:flex"
            title="No FortyGuard API key is configured, so temperature data is simulated."
          >
            <FlaskConical className="h-3 w-3" />
            Demo data
          </span>
        )}
      </header>

      {loading && !analysis && (
        <AnalysisLoading stage={loadingStage} label={placeLabel} coords={center} />
      )}

      {error && !analysis && !loading && (
        <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
          <p className="text-sm font-semibold text-ink-900">{error.message}</p>
          {error.hint && <p className="mt-2 text-sm text-ink-500">{error.hint}</p>}
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Pick another location
          </button>
        </div>
      )}

      {!center && !loading && !analysis && (
        <DashboardWelcome onSelectPlace={handleSelectPlace} />
      )}

      {analysis && center && (
        <ResultsView
          analysis={analysis}
          center={center}
          grid={analysis.grid}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspot={setSelectedHotspotId}
          overlayOpacity={0.68}
          onNewAnalysis={() => router.push("/")}
          onDownload={handleGenerateReport}
          selectedRecommendationId={selectedRecommendationId}
          onSelectRecommendation={setSelectedRecommendationId}
          demoMode={demoMode}
        />
      )}
    </div>
  );
}

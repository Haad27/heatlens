"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import SearchBar from "@/components/dashboard/SearchBar";
import { Skeleton } from "@/components/ui/Primitives";
import type { GeocodeResult, LatLng } from "@/lib/types";

const InteractivePickerMap = dynamic(
  () => import("@/components/landing/InteractivePickerMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full items-center justify-center rounded-xl bg-ink-100">
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    ),
  },
);

const DEFAULT_CENTER: LatLng = { lat: 29.7604, lng: -95.3698 };
const DEFAULT_LABEL = "Downtown Houston, TX";

export default function LandingMapSelector() {
  const router = useRouter();
  const [selectedPoint, setSelectedPoint] = useState<LatLng>(DEFAULT_CENTER);
  const [selectedLabel, setSelectedLabel] = useState<string>(DEFAULT_LABEL);

  const handleSelectGeocode = useCallback((result: GeocodeResult) => {
    setSelectedPoint(result.center);
    setSelectedLabel(result.label);
  }, []);

  const handleMapClick = useCallback((point: LatLng) => {
    setSelectedPoint(point);
    setSelectedLabel(`Selected location`);
  }, []);

  const handleProceed = () => {
    const params = new URLSearchParams({
      lat: selectedPoint.lat.toFixed(6),
      lng: selectedPoint.lng.toFixed(6),
      label: selectedLabel,
    });
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="w-full rounded-2xl border border-ink-200 bg-white p-5 shadow-xl sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Select Urban Area for Analysis
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Click the map to pick a location for climate analysis.
        </p>
      </div>

      <div className="mb-4">
        <SearchBar
          onSelect={handleSelectGeocode}
          placeholder="Search a US city, neighbourhood or address"
          showSamples
        />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-ink-200">
        <InteractivePickerMap center={selectedPoint} onPickLocation={handleMapClick} />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-emerald-800">
          Location Selected: {selectedLabel}{" "}
          <span className="font-normal tnum">
            Lat: {selectedPoint.lat.toFixed(6)}, Lng: {selectedPoint.lng.toFixed(6)}
          </span>
        </p>
        <button
          type="button"
          onClick={handleProceed}
          className="shrink-0 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900"
        >
          Proceed with Location
        </button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
        Tip: Use satellite view to better identify urban areas and buildings.
      </p>
    </div>
  );
}

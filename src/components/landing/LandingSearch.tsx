"use client";

import { useRouter } from "next/navigation";
import SearchBar from "@/components/dashboard/SearchBar";
import type { GeocodeResult } from "@/lib/types";

export default function LandingSearch() {
  const router = useRouter();

  const handleSelect = (result: GeocodeResult) => {
    const params = new URLSearchParams({
      lat: result.center.lat.toFixed(6),
      lng: result.center.lng.toFixed(6),
      label: result.label,
    });
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <SearchBar
      onSelect={handleSelect}
      autoFocus
      showSamples
      placeholder="Enter a US address, city or neighbourhood"
    />
  );
}

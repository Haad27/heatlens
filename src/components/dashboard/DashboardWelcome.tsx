"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileText,
  Flame,
  MapPin,
  Sparkles,
  Thermometer,
  TreePine,
  Users,
} from "lucide-react";
import type { GeocodeResult, LatLng } from "@/lib/types";

interface PresetCity {
  city: string;
  state: string;
  label: string;
  center: LatLng;
  tag: string;
  description: string;
}

const PRESET_CITIES: PresetCity[] = [
  {
    city: "Houston",
    state: "TX",
    label: "Downtown Houston, TX",
    center: { lat: 29.7604, lng: -95.3698 },
    tag: "High Humidity & Asphalt",
    description: "Dense commercial corridors with high impervious surface coverage and thermal retention.",
  },
  {
    city: "Phoenix",
    state: "AZ",
    label: "Phoenix Central Corridor, AZ",
    center: { lat: 33.4484, lng: -112.074 },
    tag: "Extreme Desert Heat",
    description: "Prolonged daytime heat exceedance and severe nocturnal urban heat island effect.",
  },
  {
    city: "Las Vegas",
    state: "NV",
    label: "East Las Vegas / Strip, NV",
    center: { lat: 36.1699, lng: -115.1398 },
    tag: "Low Canopy & Albedo Deficit",
    description: "Rapidly developing urban basin with significant thermal anomalies and limited green space.",
  },
  {
    city: "Miami",
    state: "FL",
    label: "Downtown & Brickell, Miami, FL",
    center: { lat: 25.7617, lng: -80.1918 },
    tag: "Coastal Heat Index",
    description: "Intense heat-humidity interaction combined with dense high-rise canyon effects.",
  },
  {
    city: "Fresno",
    state: "CA",
    label: "Downtown Fresno, CA",
    center: { lat: 36.7468, lng: -119.7726 },
    tag: "Central Valley Heat",
    description: "Agricultural-urban transition zone with low canopy coverage and elevated demographic risk.",
  },
  {
    city: "Newark",
    state: "NJ",
    label: "Ironbound District, Newark, NJ",
    center: { lat: 40.7357, lng: -74.1724 },
    tag: "Dense Industrial & Residential",
    description: "High building density and industrial land use driving localized microclimate hotspots.",
  },
];

const PLATFORM_FEATURES = [
  {
    icon: <Thermometer className="h-5 w-5 text-red-600" />,
    iconBg: "bg-red-50 ring-red-100",
    title: "Hyperlocal Heat Modeling",
    description:
      "High-resolution 60m–100m thermal grids pinpoint microclimate hotspots, intra-urban heat gaps, and cooler neighborhood refuges.",
  },
  {
    icon: <TreePine className="h-5 w-5 text-emerald-600" />,
    iconBg: "bg-emerald-50 ring-emerald-100",
    title: "Causal Attribution Analysis",
    description:
      "Decomposes extreme heat into root drivers: tree canopy deficits, low surface albedo, building density, and impervious surface fractions.",
  },
  {
    icon: <Users className="h-5 w-5 text-indigo-600" />,
    iconBg: "bg-indigo-50 ring-indigo-100",
    title: "Socio-Demographic Vulnerability",
    description:
      "Integrates live US Census ACS 5-year data to assess health risk for vulnerable populations: seniors 65+, poverty levels, and vehicle access.",
  },
  {
    icon: <Sparkles className="h-5 w-5 text-violet-600" />,
    iconBg: "bg-violet-50 ring-violet-100",
    title: "AI Executive Briefs",
    description:
      "Powered by Google Gemini to transform complex climate physics into decision-ready executive summaries for city sustainability planners.",
  },
  {
    icon: <Building2 className="h-5 w-5 text-sky-600" />,
    iconBg: "bg-sky-50 ring-sky-100",
    title: "Mitigation & Intervention Playbook",
    description:
      "Recommends targeted cooling solutions—cool roofs, urban forestry, reflective paving, and shade structures—with estimated cooling deltas (°C) and cost bands.",
  },
  {
    icon: <FileText className="h-5 w-5 text-amber-600" />,
    iconBg: "bg-amber-50 ring-amber-100",
    title: "Print & PDF Assessment Reports",
    description:
      "Export publication-quality, print-ready PDF briefs equipped with static heat maps, causal breakdowns, and committee-ready recommendations.",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Select an Urban Area",
    description: "Search any US city, neighborhood, or address, or pinpoint directly on our interactive map.",
  },
  {
    step: "02",
    title: "Run Thermal Grid Simulation",
    description: "HeatLens analyzes 60–100m measurement cells, detecting statistically significant heat islands.",
  },
  {
    step: "03",
    title: "Uncover Drivers & Demographics",
    description: "Inspect why the hotspot is hot (canopy vs albedo vs density) and evaluate affected vulnerable residents.",
  },
  {
    step: "04",
    title: "Implement Cooling Solutions",
    description: "Review prioritized cooling interventions and export executive reports for capital investment planning.",
  },
];

export default function DashboardWelcome({
  onSelectPlace,
}: {
  onSelectPlace: (result: GeocodeResult) => void;
}) {
  const handleLaunchPreset = (preset: PresetCity) => {
    onSelectPlace({
      label: preset.label,
      center: preset.center,
      kind: "city",
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-12">
      {/* -------------------- Hero Header -------------------- */}
      <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-emerald-950 to-ink-950 p-8 text-white shadow-xl sm:p-12">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            AI-Powered Urban Climate Intelligence
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Understand, Attribute & Mitigate Urban Heat Islands
          </h1>

          <p className="text-base leading-relaxed text-emerald-100/90 sm:text-lg">
            HeatLens delivers hyperlocal 60m–100m heat analysis for US cities. Identify thermal
            anomalies, uncover environmental root causes, score demographic vulnerability, and deploy
            costed cooling interventions.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-400 hover:shadow-emerald-500/25"
            >
              <MapPin className="h-4 w-4" />
              Pick Location on Interactive Map
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs text-emerald-300 sm:text-sm">
              Or select one of the featured city presets below to start instantly.
            </p>
          </div>
        </div>
      </div>

      {/* -------------------- Featured Preset Cities -------------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Quick Start
            </span>
            <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              Featured US City Hotspot Presets
            </h2>
          </div>
          <p className="text-xs text-ink-500 sm:text-sm">
            Click any city to run an instant, live thermal analysis.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRESET_CITIES.map((preset) => (
            <button
              key={preset.city}
              type="button"
              onClick={() => handleLaunchPreset(preset)}
              className="group flex flex-col justify-between rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md hover:ring-2 hover:ring-emerald-100"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 transition group-hover:bg-emerald-600 group-hover:text-white">
                      <Flame className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink-900 group-hover:text-emerald-800">
                        {preset.city}, {preset.state}
                      </h3>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                    Live Preset
                  </span>
                </div>

                <div className="mt-3">
                  <span className="inline-block rounded-md bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                    {preset.tag}
                  </span>
                  <p className="mt-2 text-xs leading-relaxed text-ink-600">
                    {preset.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs font-semibold text-emerald-800 group-hover:text-emerald-950">
                <span>Run Assessment</span>
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* -------------------- What HeatLens Does (Feature Pillars) -------------------- */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Core Capabilities
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Everything You Need for Urban Heat Resilience
          </h2>
          <p className="text-sm text-ink-500">
            From raw satellite thermal rasters to costed cooling intervention plans.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${feature.iconBg}`}
              >
                {feature.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{feature.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------- How It Works -------------------- */}
      <section className="rounded-3xl border border-ink-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Analysis Workflow
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">
            How HeatLens Works
          </h2>
          <p className="text-sm text-ink-500">
            End-to-end urban climate assessment in four straightforward steps.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div key={step.step} className="relative space-y-3">
              <span className="text-2xl font-black text-emerald-800/30 sm:text-3xl">
                {step.step}
              </span>
              <h3 className="text-sm font-semibold text-ink-900">{step.title}</h3>
              <p className="text-xs leading-relaxed text-ink-500">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------- Bottom CTA -------------------- */}
      <section className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-emerald-800 px-8 py-10 text-white shadow-lg sm:flex-row sm:px-12">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-xl font-bold tracking-tight">
            Ready to analyze heat in your community?
          </h3>
          <p className="text-xs text-emerald-100 sm:text-sm">
            Search any address in the bar above or pick an area using our interactive map selector.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-900 shadow transition hover:bg-emerald-50"
        >
          Select Location on Map
        </Link>
      </section>
    </div>
  );
}

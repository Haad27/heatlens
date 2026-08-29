"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HeatGridLayer from "@/components/map/HeatGridLayer";
import { SEVERITY_COLORS, buildDurationScale, buildTemperatureScale } from "@/lib/colors";
import { formatTemperatureDual } from "@/lib/format";
import type { BoundingBox, CoolZone, HeatGrid, HeatTile, Hotspot, LatLng } from "@/lib/types";

export type MapLayerKey = "temperature" | "exceedance" | "persistence";

interface MapViewProps {
  center: LatLng;
  bbox?: BoundingBox;
  grid?: HeatGrid;
  hotspots: Hotspot[];
  coolZones?: CoolZone[];
  selectedHotspotId: string | null;
  activeLayer: MapLayerKey;
  overlayOpacity: number;
  onSelectHotspot: (id: string | null) => void;
  onPickLocation: (point: LatLng) => void;
  /** When true, a click on the map re-centres the area of interest. */
  pickMode: boolean;
  /** Disable interaction while the map is used as a static report snapshot. */
  staticMode?: boolean;
  /** Three-item heat / cool legend without the continuous scale copy. */
  compactLegend?: boolean;
}

function MapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (point: LatLng) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/** Keeps the viewport following the analysed area without fighting the user. */
function ViewportController({
  bbox,
  center,
  selectedHotspot,
}: {
  bbox?: BoundingBox;
  center: LatLng;
  selectedHotspot: Hotspot | null;
}) {
  const map = useMap();
  const lastBboxKey = useRef<string | null>(null);
  const lastHotspotId = useRef<string | null>(null);

  useEffect(() => {
    if (!bbox) {
      map.setView([center.lat, center.lng], map.getZoom() ?? 14);
      return;
    }
    const key = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    if (key === lastBboxKey.current) return;
    lastBboxKey.current = key;
    map.fitBounds(
      [
        [bbox.south, bbox.west],
        [bbox.north, bbox.east],
      ],
      { padding: [36, 36], animate: true },
    );
  }, [map, bbox, center.lat, center.lng]);

  useEffect(() => {
    if (!selectedHotspot) {
      lastHotspotId.current = null;
      return;
    }
    if (selectedHotspot.id === lastHotspotId.current) return;
    lastHotspotId.current = selectedHotspot.id;
    map.flyTo([selectedHotspot.center.lat, selectedHotspot.center.lng], Math.max(map.getZoom(), 16), {
      duration: 0.8,
    });
  }, [map, selectedHotspot]);

  return null;
}

function hotspotIcon(hotspot: Hotspot, selected: boolean): L.DivIcon {
  const color = SEVERITY_COLORS[hotspot.severityTier];
  const size = selected ? 40 : 32;
  return L.divIcon({
    className: "hotspot-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${
          selected
            ? `<span class="pulse-ring" style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.45;"></span>`
            : ""
        }
        <span style="
          position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          border-radius:9999px;background:${color};color:#fff;
          font:600 ${selected ? 15 : 13}px/1 var(--font-sans, system-ui);
          border:${selected ? 3 : 2}px solid #fff;
          box-shadow:0 2px 8px rgba(12,16,21,.35);
        ">${hotspot.rank}</span>
      </div>`,
  });
}

const centerIcon = () =>
  L.divIcon({
    className: "hotspot-marker",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#0d857e;border:3px solid #fff;box-shadow:0 2px 6px rgba(12,16,21,.4);"></span>`,
  });

function coolZoneIcon(index: number): L.DivIcon {
  const size = 30;
  return L.divIcon({
    className: "coolzone-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <span style="
          position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          border-radius:9999px;background:#0284c7;color:#fff;
          font:600 12px/1 var(--font-sans, system-ui);
          border:2px solid #fff;
          box-shadow:0 2px 6px rgba(2,132,199,.4);
        ">❄${index + 1}</span>
      </div>`,
  });
}

export default function MapView({
  center,
  bbox,
  grid,
  hotspots,
  coolZones,
  selectedHotspotId,
  overlayOpacity,
  onSelectHotspot,
  onPickLocation,
  pickMode,
  staticMode = false,
  compactLegend = false,
}: MapViewProps) {
  const [hoverTile, setHoverTile] = useState<HeatTile | null>(null);
  const [baseMap, setBaseMap] = useState<"satellite" | "streets">("satellite");

  const scale = useMemo(() => {
    if (!grid) return buildTemperatureScale(20, 40);
    return grid.unit === "celsius"
      ? buildTemperatureScale(grid.stats.min, grid.stats.max)
      : buildDurationScale(grid.stats.min, grid.stats.max);
  }, [grid]);

  const selectedHotspot = hotspots.find((h) => h.id === selectedHotspotId) ?? null;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        minZoom={4}
        maxZoom={18}
        scrollWheelZoom={!staticMode}
        dragging={!staticMode}
        zoomControl={!staticMode}
        doubleClickZoom={!staticMode}
        attributionControl
        preferCanvas={true}
        className="h-full w-full"
        style={{ cursor: pickMode ? "crosshair" : undefined }}
      >
        {baseMap === "satellite" ? (
          <>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'
              maxZoom={19}
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution=""
              maxZoom={19}
              opacity={0.7}
            />
          </>
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}

        <ViewportController bbox={bbox} center={center} selectedHotspot={selectedHotspot} />
        <MapClickHandler enabled={pickMode && !staticMode} onPick={onPickLocation} />

        {grid && grid.tiles.length > 0 && (
          <HeatGridLayer
            tiles={grid.tiles}
            scale={scale}
            opacity={overlayOpacity}
            onHoverTile={staticMode ? undefined : setHoverTile}
          />
        )}

        {bbox && (
          <Rectangle
            bounds={[
              [bbox.south, bbox.west],
              [bbox.north, bbox.east],
            ]}
            pathOptions={{
              color: baseMap === "satellite" ? "#ffffff" : "#151a21",
              weight: 1.5,
              opacity: 0.7,
              fill: false,
              dashArray: "5 4",
            }}
          />
        )}

        {selectedHotspot?.polygon.map((ring, index) => (
          <Polygon
            key={`${selectedHotspot.id}-${index}`}
            positions={ring.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              opacity: 0.9,
              fillColor: SEVERITY_COLORS[selectedHotspot.severityTier],
              fillOpacity: 0.2,
            }}
          />
        ))}

        {!bbox && <Marker position={[center.lat, center.lng]} icon={centerIcon()} />}

        {hotspots.map((hotspot) => (
          <Marker
            key={hotspot.id}
            position={[hotspot.center.lat, hotspot.center.lng]}
            icon={hotspotIcon(hotspot, hotspot.id === selectedHotspotId)}
            eventHandlers={{
              click: () =>
                onSelectHotspot(hotspot.id === selectedHotspotId ? null : hotspot.id),
            }}
            zIndexOffset={hotspot.id === selectedHotspotId ? 1000 : 0}
          />
        ))}

        {coolZones?.map((zone, index) => (
          <Marker
            key={zone.id}
            position={[zone.center.lat, zone.center.lng]}
            icon={coolZoneIcon(index)}
          />
        ))}
      </MapContainer>

      {!staticMode && (
        <div className="absolute top-3.5 right-3.5 z-[500] flex items-center rounded-lg border border-ink-200 bg-white/95 p-0.5 shadow-md backdrop-blur">
          <button
            type="button"
            onClick={() => setBaseMap("satellite")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              baseMap === "satellite"
                ? "bg-ink-900 text-white shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setBaseMap("streets")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              baseMap === "streets"
                ? "bg-ink-900 text-white shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Map
          </button>
        </div>
      )}

      {hoverTile && grid && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full border border-ink-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm backdrop-blur">
          <span className="tnum">
            {grid.unit === "celsius"
              ? formatTemperatureDual(hoverTile.value)
              : `${hoverTile.value} h above threshold`}
          </span>
          <span className="ml-2 text-ink-400">
            {hoverTile.center.lat.toFixed(4)}, {hoverTile.center.lng.toFixed(4)}
          </span>
        </div>
      )}

      {pickMode && !staticMode && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-ink-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Click anywhere on the map to move the area of interest
        </div>
      )}

      {grid && grid.tiles.length > 0 && (
        <MapLegend compact={compactLegend} />
      )}
    </div>
  );
}

function MapLegend({ compact }: { compact: boolean }) {
  return (
    <div className="absolute bottom-4 left-3 z-[500] rounded-xl border border-ink-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <div className={`flex ${compact ? "flex-col gap-1.5" : "flex-wrap gap-x-3 gap-y-1.5"} text-[11px] font-medium text-ink-600`}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#e38a8a]" />
          <span>High Heat Areas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#fee08b] ring-1 ring-amber-300/80" />
          <span>Moderate / Sweet Spot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#6ec6b8]" />
          <span>Cooling Zones</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#4b7ec7]" />
          <span>Cool Zones</span>
        </div>
      </div>
    </div>
  );
}

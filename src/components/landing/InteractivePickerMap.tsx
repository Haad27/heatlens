"use client";

import { useEffect, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/types";

interface InteractivePickerMapProps {
  center: LatLng;
  onPickLocation: (point: LatLng) => void;
}

function MapClickHandler({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function ViewportFollower({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 14), {
      duration: 0.8,
    });
  }, [map, center.lat, center.lng]);
  return null;
}

const pinIcon = () =>
  L.divIcon({
    className: "picker-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    html: `
      <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;bottom:0;width:14px;height:14px;border-radius:9999px;background:rgba(0,0,0,0.3);filter:blur(2px);transform:scaleY(0.5);"></span>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#0d857e" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
          <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="#0d857e" />
        </svg>
      </div>`,
  });

export default function InteractivePickerMap({
  center,
  onPickLocation,
}: InteractivePickerMapProps) {
  const [baseMap, setBaseMap] = useState<"satellite" | "streets">("satellite");

  return (
    <div className="relative h-[360px] w-full sm:h-[400px]">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        minZoom={4}
        maxZoom={18}
        className="h-full w-full"
        style={{ cursor: "crosshair" }}
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
              opacity={0.75}
            />
          </>
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}

        <ViewportFollower center={center} />
        <MapClickHandler onPick={onPickLocation} />

        <Circle
          center={[center.lat, center.lng]}
          radius={1200}
          pathOptions={{
            color: "#0d857e",
            weight: 2,
            opacity: 0.9,
            fillColor: "#0d857e",
            fillOpacity: 0.15,
            dashArray: "6 4",
          }}
        />

        <Marker position={[center.lat, center.lng]} icon={pinIcon()} />
      </MapContainer>

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

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-ink-900/80 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur">
        1.2 km analysis area shown
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ColorScale } from "@/lib/colors";
import type { HeatTile } from "@/lib/types";

interface HeatGridLayerProps {
  tiles: HeatTile[];
  scale: ColorScale;
  opacity: number;
  /** Called with the tile under the cursor, or null when the cursor leaves. */
  onHoverTile?: (tile: HeatTile | null) => void;
}

export default function HeatGridLayer({
  tiles,
  scale,
  opacity,
  onHoverTile,
}: HeatGridLayerProps) {
  const map = useMap();
  const layerGroupRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }

    if (!tiles || tiles.length === 0) return;

    // Calculate approximate cell size if rings are missing or point-based
    let dLat = 0.0009;
    let dLng = 0.001;
    if (tiles.length >= 2) {
      const lats = [...new Set(tiles.map((t) => Number(t.center.lat.toFixed(5))))].sort((a, b) => a - b);
      const lngs = [...new Set(tiles.map((t) => Number(t.center.lng.toFixed(5))))].sort((a, b) => a - b);
      const latGaps = lats.slice(1).map((v, i) => v - lats[i]).filter((g) => g > 1e-6);
      const lngGaps = lngs.slice(1).map((v, i) => v - lngs[i]).filter((g) => g > 1e-6);
      if (latGaps.length) dLat = latGaps.sort((a, b) => a - b)[Math.floor(latGaps.length / 2)];
      if (lngGaps.length) dLng = lngGaps.sort((a, b) => a - b)[Math.floor(lngGaps.length / 2)];
    }

    const layerGroup = L.featureGroup();

    tiles.forEach((tile) => {
      const color = scale.colorFor(tile.value);
      let latLngs: [number, number][];

      if (tile.ring && tile.ring.length >= 3) {
        latLngs = tile.ring.map(([lng, lat]) => [lat, lng] as [number, number]);
      } else {
        latLngs = [
          [tile.center.lat - dLat / 2, tile.center.lng - dLng / 2],
          [tile.center.lat + dLat / 2, tile.center.lng - dLng / 2],
          [tile.center.lat + dLat / 2, tile.center.lng + dLng / 2],
          [tile.center.lat - dLat / 2, tile.center.lng + dLng / 2],
        ];
      }

      const layer = L.polygon(latLngs, {
        stroke: true,
        color: color,
        weight: 0.8,
        opacity: Math.min(1, opacity + 0.15),
        fillColor: color,
        fillOpacity: opacity,
        interactive: Boolean(onHoverTile),
      });

      if (onHoverTile) {
        layer.on("mouseover", () => onHoverTile(tile));
        layer.on("mouseout", () => onHoverTile(null));
      }

      layer.addTo(layerGroup);
    });

    layerGroup.addTo(map);
    layerGroupRef.current = layerGroup;

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [map, tiles, scale, opacity, onHoverTile]);

  return null;
}

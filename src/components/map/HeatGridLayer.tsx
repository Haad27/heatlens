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

    const layerGroup = L.featureGroup();

    tiles.forEach((tile) => {
      const color = scale.colorFor(tile.value);
      let layer: L.Polygon | L.CircleMarker;

      if (tile.ring && tile.ring.length >= 3) {
        const latLngs = tile.ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        layer = L.polygon(latLngs, {
          stroke: true,
          color: color,
          weight: 0.8,
          opacity: Math.min(1, opacity + 0.15),
          fillColor: color,
          fillOpacity: opacity,
          interactive: Boolean(onHoverTile),
        });
      } else {
        layer = L.circleMarker([tile.center.lat, tile.center.lng], {
          radius: 8,
          stroke: false,
          fillColor: color,
          fillOpacity: opacity,
          interactive: Boolean(onHoverTile),
        });
      }

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

import type { BoundingBox, HeatGrid, HeatTile, LatLng } from "@/lib/types";
import { ringBox } from "@/lib/geo";

/**
 * Hotspot detection.
 *
 * The point of this module is that a hotspot is a *statistical* claim, not a
 * colour. A tile is only flagged when it is significantly hotter than the
 * surrounding area's own baseline, and isolated flagged tiles are discarded —
 * a single anomalous cell is sensor noise or a rooftop, not a heat island that
 * a city can act on. What survives is a contiguous cluster, which is what a
 * tree-planting or cool-roof programme is actually scoped around.
 *
 * Detection is relative to the AOI rather than to a fixed temperature so the
 * result stays meaningful in Phoenix in July and in Seattle in April. Absolute
 * public-health thresholds are applied separately, in the severity score.
 */

/**
 * Candidate thresholds, in standard deviations above the AOI mean.
 *
 * Detection walks this ladder rather than fixing on one value. In a downtown
 * core almost every cell clears +1σ, and a single flood fill then merges the
 * whole business district into one 70-hectare "hotspot" — technically correct
 * and operationally useless, because nobody scopes a tree-planting programme
 * around a quarter of a city. Raising the threshold until the largest cluster
 * is a plausible intervention unit separates the distinct thermal cores inside
 * that district. The threshold that was actually used is reported back so the
 * UI can state it.
 */
const Z_LADDER = [1.0, 1.3, 1.6, 1.9, 2.2] as const;
/** Relaxed threshold used when even the lowest rung finds nothing. */
const FALLBACK_Z = 0.65;
/** Below this spread the AOI is thermally uniform and has no real hotspots. */
const MIN_MEANINGFUL_STDDEV_C = 0.25;

export interface DetectedCluster {
  tiles: HeatTile[];
  center: LatLng;
  bbox: BoundingBox;
  polygon: [number, number][][];
  meanValue: number;
  peakValue: number;
  anomaly: number;
  zScore: number;
  areaSqMeters: number;
}

interface CellGeometry {
  cellWidthDeg: number;
  cellHeightDeg: number;
}

function estimateCellGeometry(tiles: HeatTile[]): CellGeometry {
  const widths: number[] = [];
  const heights: number[] = [];

  for (const tile of tiles.slice(0, 200)) {
    if (tile.ring.length < 4) continue;
    const box = ringBox(tile.ring);
    const w = box.east - box.west;
    const h = box.north - box.south;
    if (w > 0) widths.push(w);
    if (h > 0) heights.push(h);
  }

  const median = (values: number[]): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  let cellWidthDeg = median(widths);
  let cellHeightDeg = median(heights);

  if (cellWidthDeg <= 0 || cellHeightDeg <= 0) {
    const lngs = [...new Set(tiles.map((t) => Number(t.center.lng.toFixed(6))))].sort((a, b) => a - b);
    const lats = [...new Set(tiles.map((t) => Number(t.center.lat.toFixed(6))))].sort((a, b) => a - b);
    const gaps = (values: number[]) =>
      values.slice(1).map((v, i) => v - values[i]).filter((g) => g > 1e-7);
    cellWidthDeg = cellWidthDeg > 0 ? cellWidthDeg : median(gaps(lngs)) || 0.001;
    cellHeightDeg = cellHeightDeg > 0 ? cellHeightDeg : median(gaps(lats)) || 0.001;
  }

  return { cellWidthDeg, cellHeightDeg };
}

function tileAreaSqMeters(tile: HeatTile): number {
  if (tile.ring.length < 4) return 0;
  const box = ringBox(tile.ring);
  const midLat = (box.north + box.south) / 2;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
  return (box.north - box.south) * metersPerDegLat * (box.east - box.west) * metersPerDegLng;
}

function summariseCluster(
  tiles: HeatTile[],
  aoiMean: number,
  aoiStdDev: number,
): DetectedCluster {
  const values = tiles.map((t) => t.value);
  const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
  const peakValue = Math.max(...values);

  const weights = values.map((v) => Math.max(0.001, Math.abs(v - aoiMean) + aoiStdDev));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const center: LatLng = {
    lat: tiles.reduce((acc, t, i) => acc + t.center.lat * weights[i], 0) / (weightSum || 1),
    lng: tiles.reduce((acc, t, i) => acc + t.center.lng * weights[i], 0) / (weightSum || 1),
  };

  const boxes = tiles.map((t) => (t.ring.length >= 4 ? ringBox(t.ring) : null));
  const validBoxes = boxes.filter((b): b is BoundingBox => b !== null);
  const bbox: BoundingBox = validBoxes.length
    ? validBoxes.reduce((acc, b) => ({
        west: Math.min(acc.west, b.west),
        south: Math.min(acc.south, b.south),
        east: Math.max(acc.east, b.east),
        north: Math.max(acc.north, b.north),
      }))
    : {
        west: center.lng - 0.001,
        south: center.lat - 0.001,
        east: center.lng + 0.001,
        north: center.lat + 0.001,
      };

  return {
    tiles,
    center,
    bbox,
    polygon: tiles.filter((t) => t.ring.length >= 4).map((t) => t.ring),
    meanValue: Math.round(meanValue * 100) / 100,
    peakValue: Math.round(peakValue * 100) / 100,
    anomaly: Math.round((meanValue - aoiMean) * 100) / 100,
    zScore: Math.round(((meanValue - aoiMean) / Math.max(0.1, aoiStdDev)) * 100) / 100,
    areaSqMeters: Math.round(tiles.reduce((acc, t) => acc + tileAreaSqMeters(t), 0)),
  };
}

export interface DetectionOutcome {
  clusters: DetectedCluster[];
  /** The z threshold that actually produced the result. */
  zThresholdUsed: number;
  /** Explains an empty result in language the UI can show directly. */
  note?: string;
}

function detectExtremaClusters(
  tiles: HeatTile[],
  geometry: CellGeometry,
  mean: number,
  stdDev: number,
  mode: "hotspot" | "coolzone",
  limit: number,
): { clusters: HeatTile[][]; zUsed: number } {
  if (!tiles.length) return { clusters: [], zUsed: FALLBACK_Z };

  const originLng = Math.min(...tiles.map((t) => t.center.lng));
  const originLat = Math.min(...tiles.map((t) => t.center.lat));
  const cellW = geometry.cellWidthDeg || 0.001;
  const cellH = geometry.cellHeightDeg || 0.001;

  const lattice = new Map<string, { tile: HeatTile; col: number; row: number }>();
  for (const t of tiles) {
    const col = Math.round((t.center.lng - originLng) / cellW);
    const row = Math.round((t.center.lat - originLat) / cellH);
    lattice.set(`${col},${row}`, { tile: t, col, row });
  }

  const effectiveStdDev = Math.max(0.2, stdDev);
  const zTiers = [1.2, 0.9, 0.6, 0.35, 0.15];
  let bestClusters: HeatTile[][] = [];
  let bestZ: number = Z_LADDER[0];

  for (const z of zTiers) {
    const cutoff = mode === "hotspot" ? mean + z * effectiveStdDev : mean - z * effectiveStdDev;
    const isQualified = (val: number) => (mode === "hotspot" ? val >= cutoff : val <= cutoff);

    const candidatePeaks: { tile: HeatTile; col: number; row: number }[] = [];
    for (const item of lattice.values()) {
      const { tile, col, row } = item;
      if (!isQualified(tile.value)) continue;

      let isExtremum = true;
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          const nKey = `${col + dc},${row + dr}`;
          const n = lattice.get(nKey);
          if (n) {
            if (mode === "hotspot" && n.tile.value > tile.value) isExtremum = false;
            if (mode === "coolzone" && n.tile.value < tile.value) isExtremum = false;
          }
        }
      }
      if (isExtremum) candidatePeaks.push(item);
    }

    candidatePeaks.sort((a, b) =>
      mode === "hotspot" ? b.tile.value - a.tile.value : a.tile.value - b.tile.value,
    );

    const selectedPeaks: { tile: HeatTile; col: number; row: number }[] = [];
    const MIN_PEAK_DIST_CELLS = 2.0;
    for (const peak of candidatePeaks) {
      const tooClose = selectedPeaks.some(
        (sp) => Math.hypot(sp.col - peak.col, sp.row - peak.row) < MIN_PEAK_DIST_CELLS,
      );
      if (!tooClose) {
        selectedPeaks.push(peak);
      }
      if (selectedPeaks.length >= limit) break;
    }

    if (selectedPeaks.length > 0) {
      const clusterMap = new Map<number, HeatTile[]>();
      selectedPeaks.forEach((p, idx) => clusterMap.set(idx, [p.tile]));

      const visited = new Map<string, number>();
      const queue: { col: number; row: number; peakIndex: number }[] = [];
      selectedPeaks.forEach((p, idx) => {
        const key = `${p.col},${p.row}`;
        visited.set(key, idx);
        queue.push({ col: p.col, row: p.row, peakIndex: idx });
      });

      let qHead = 0;
      while (qHead < queue.length) {
        const { col, row, peakIndex } = queue[qHead++];
        for (let dc = -1; dc <= 1; dc += 1) {
          for (let dr = -1; dr <= 1; dr += 1) {
            if (dc === 0 && dr === 0) continue;
            const nKey = `${col + dc},${row + dr}`;
            if (!visited.has(nKey) && lattice.has(nKey)) {
              const nItem = lattice.get(nKey)!;
              if (isQualified(nItem.tile.value)) {
                visited.set(nKey, peakIndex);
                clusterMap.get(peakIndex)!.push(nItem.tile);
                queue.push({ col: nItem.col, row: nItem.row, peakIndex });
              }
            }
          }
        }
      }

      const validClusters = Array.from(clusterMap.values()).filter(
        (tList) => tList.length >= 2,
      );

      if (validClusters.length > bestClusters.length) {
        bestClusters = validClusters;
        bestZ = z;
      }

      if (validClusters.length >= Math.min(limit, 3)) {
        return { clusters: validClusters.slice(0, limit), zUsed: z };
      }
    }
  }

  if (bestClusters.length > 0) {
    return { clusters: bestClusters.slice(0, limit), zUsed: bestZ };
  }

  return { clusters: [], zUsed: FALLBACK_Z };
}

export function detectHotspots(grid: HeatGrid, limit: number): DetectionOutcome {
  if (grid.tiles.length < 12) {
    return {
      clusters: [],
      zThresholdUsed: Z_LADDER[0],
      note: "Not enough temperature tiles were returned for this area to detect hotspots reliably. Try a larger area or a finer granularity.",
    };
  }

  const { mean, stdDev } = grid.stats;

  if (stdDev < MIN_MEANINGFUL_STDDEV_C) {
    return {
      clusters: [],
      zThresholdUsed: Z_LADDER[0],
      note: `Temperature across this area is nearly uniform (spread of ${stdDev.toFixed(2)} °C), so no area stands out as a distinct hotspot.`,
    };
  }

  const geometry = estimateCellGeometry(grid.tiles);
  const { clusters, zUsed } = detectExtremaClusters(
    grid.tiles,
    geometry,
    mean,
    stdDev,
    "hotspot",
    limit,
  );

  if (clusters.length === 0) {
    return {
      clusters: [],
      zThresholdUsed: zUsed,
      note: "Hot tiles in this area are scattered rather than clustered, so there is no contiguous hotspot large enough to act on.",
    };
  }

  const summarised = clusters
    .map((tiles) => summariseCluster(tiles, mean, stdDev))
    .filter((c) => c.anomaly >= 0.3)
    .sort((a, b) => b.peakValue * Math.sqrt(b.tiles.length) - a.peakValue * Math.sqrt(a.tiles.length))
    .slice(0, limit);

  return { clusters: summarised, zThresholdUsed: zUsed };
}

/**
 * Cool-zone detection: the inverse of a hotspot.
 *
 * Cells significantly *below* the area mean are clustered using local minima
 * basin detection so multiple distinct cool refuges (parks, water, tree canopy)
 * are identified.
 */
export function detectCoolZones(grid: HeatGrid, limit: number): DetectionOutcome {
  if (grid.tiles.length < 12) {
    return { clusters: [], zThresholdUsed: Z_LADDER[0] };
  }

  const { mean, stdDev } = grid.stats;
  if (stdDev < MIN_MEANINGFUL_STDDEV_C) {
    return { clusters: [], zThresholdUsed: Z_LADDER[0] };
  }

  const geometry = estimateCellGeometry(grid.tiles);
  const { clusters, zUsed } = detectExtremaClusters(
    grid.tiles,
    geometry,
    mean,
    stdDev,
    "coolzone",
    limit,
  );

  if (clusters.length === 0) {
    return { clusters: [], zThresholdUsed: zUsed };
  }

  const summarised = clusters
    .map((tiles) => summariseCluster(tiles, mean, stdDev))
    // A genuine cool zone must have a significant negative temperature anomaly below the AOI mean
    .filter((c) => c.anomaly <= -0.3)
    .sort(
      (a, b) =>
        Math.abs(a.anomaly) * Math.sqrt(a.tiles.length) -
        Math.abs(b.anomaly) * Math.sqrt(b.tiles.length),
    )
    .reverse()
    .slice(0, limit);

  return { clusters: summarised, zThresholdUsed: zUsed };
}

/** Look up the value of another analytic layer inside a cluster footprint. */
export function sampleLayerWithin(
  grid: HeatGrid | undefined,
  bbox: BoundingBox,
  reducer: "mean" | "max" = "mean",
): number | undefined {
  if (!grid || grid.tiles.length === 0) return undefined;

  const inside = grid.tiles.filter(
    (t) =>
      t.center.lng >= bbox.west &&
      t.center.lng <= bbox.east &&
      t.center.lat >= bbox.south &&
      t.center.lat <= bbox.north,
  );
  if (!inside.length) return undefined;

  const values = inside.map((t) => t.value);
  if (reducer === "max") return Math.round(Math.max(...values) * 10) / 10;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

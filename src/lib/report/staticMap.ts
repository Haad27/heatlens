import { SEVERITY_COLORS, buildTemperatureScale } from "@/lib/colors";
import type { BoundingBox, HeatTile, Hotspot } from "@/lib/types";

/**
 * Composites a static map image in the browser for the PDF export.
 *
 * Leaflet cannot be screenshotted without a DOM-rasterising library, and those
 * libraries choke on modern CSS colour functions. Drawing the tiles onto a
 * canvas directly avoids that entirely and produces a crisp image at whatever
 * pixel density the PDF needs. The tile servers send `Access-Control-Allow-Origin: *`,
 * so the canvas stays untainted and can be exported.
 */

const TILE_SIZE = 256;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export interface StaticMapOptions {
  bbox: BoundingBox;
  tiles?: HeatTile[];
  hotspots?: Hotspot[];
  width: number;
  height: number;
  /** Multiplier for output resolution. 2 keeps text and tile edges crisp in print. */
  pixelRatio?: number;
  overlayOpacity?: number;
}

export async function renderStaticMap(options: StaticMapOptions): Promise<string | null> {
  const { bbox, width, height, pixelRatio = 2, overlayOpacity = 0.75 } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(pixelRatio, pixelRatio);

  let zoom = 18;
  for (let candidate = 18; candidate >= 3; candidate -= 1) {
    const spanX = (lngToTileX(bbox.east, candidate) - lngToTileX(bbox.west, candidate)) * TILE_SIZE;
    const spanY = (latToTileY(bbox.south, candidate) - latToTileY(bbox.north, candidate)) * TILE_SIZE;
    if (spanX <= width && spanY <= height) {
      zoom = candidate;
      break;
    }
    zoom = 3;
  }

  const centerX = (lngToTileX(bbox.west, zoom) + lngToTileX(bbox.east, zoom)) / 2;
  const centerY = (latToTileY(bbox.north, zoom) + latToTileY(bbox.south, zoom)) / 2;

  const originPxX = centerX * TILE_SIZE - width / 2;
  const originPxY = centerY * TILE_SIZE - height / 2;

  const project = (lat: number, lng: number): [number, number] => [
    lngToTileX(lng, zoom) * TILE_SIZE - originPxX,
    latToTileY(lat, zoom) * TILE_SIZE - originPxY,
  ];

  ctx.fillStyle = "#eceef2";
  ctx.fillRect(0, 0, width, height);

  const minTileX = Math.floor(originPxX / TILE_SIZE);
  const maxTileX = Math.floor((originPxX + width) / TILE_SIZE);
  const minTileY = Math.floor(originPxY / TILE_SIZE);
  const maxTileY = Math.floor((originPxY + height) / TILE_SIZE);
  const tileCount = 2 ** zoom;

  const requests: Promise<{ image: HTMLImageElement | null; x: number; y: number }>[] = [];
  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) continue;
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      const url = TILE_URL.replace("{z}", String(zoom))
        .replace("{x}", String(wrappedX))
        .replace("{y}", String(y));
      requests.push(loadImage(url).then((image) => ({ image, x, y })));
    }
  }

  const loaded = await Promise.all(requests);
  for (const { image, x, y } of loaded) {
    if (!image) continue;
    ctx.drawImage(
      image,
      x * TILE_SIZE - originPxX,
      y * TILE_SIZE - originPxY,
      TILE_SIZE,
      TILE_SIZE,
    );
  }

  if (options.tiles?.length) {
    const values = options.tiles.map((t) => t.value);
    const scale = buildTemperatureScale(Math.min(...values), Math.max(...values));
    ctx.globalAlpha = overlayOpacity;
    for (const tile of options.tiles) {
      if (tile.ring.length < 4) continue;
      const lngs = tile.ring.map((p) => p[0]);
      const lats = tile.ring.map((p) => p[1]);
      const [x1, y1] = project(Math.max(...lats), Math.min(...lngs));
      const [x2, y2] = project(Math.min(...lats), Math.max(...lngs));
      ctx.fillStyle = scale.colorFor(tile.value);
      ctx.fillRect(x1 - 0.3, y1 - 0.3, x2 - x1 + 0.6, y2 - y1 + 0.6);
    }
    ctx.globalAlpha = 1;
  }

  const [aoiX1, aoiY1] = project(bbox.north, bbox.west);
  const [aoiX2, aoiY2] = project(bbox.south, bbox.east);
  ctx.strokeStyle = "rgba(21,26,33,.55)";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.25;
  ctx.strokeRect(aoiX1, aoiY1, aoiX2 - aoiX1, aoiY2 - aoiY1);
  ctx.setLineDash([]);

  for (const hotspot of options.hotspots ?? []) {
    const [x, y] = project(hotspot.center.lat, hotspot.center.lng);
    const radius = 11;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = SEVERITY_COLORS[hotspot.severityTier];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(hotspot.rank), x, y + 0.5);
  }

  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fillRect(0, height - 14, width, 14);
  ctx.fillStyle = "#5b6678";
  ctx.font = "9px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("© OpenStreetMap contributors", width - 5, height - 7);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

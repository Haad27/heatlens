# How every number and label on the UI is calculated

This document is the source-of-truth for the current HeatLens screens. It maps each visible field to its data source, the formula or rule that produced it, and why that decision was made.

Nothing on the results screen is written by a language model. Claude (when `ANTHROPIC_API_KEY` is set) only phrases the longer executive summary that goes into the **PDF report**. The cards, badges, counts, causes, and recommendations are all deterministic.

Implementation files:

| Layer | File |
| --- | --- |
| Temperature grid | `src/lib/fortyguard/client.ts`, mock in `src/lib/fortyguard/mock.ts` |
| Hotspots / cool zones | `src/lib/analysis/hotspots.ts` |
| Land cover | `src/lib/datasources/landcover.ts` |
| Factor shares | `src/lib/analysis/factors.ts` |
| Severity score | `src/lib/analysis/severity.ts` |
| Recommendation rules | `src/lib/analysis/recommendations.ts` |
| UI brief (almost everything you see) | `src/lib/analysis/brief.ts`, `src/lib/analysis/placeNames.ts` |
| Pipeline glue | `src/lib/analysis/pipeline.ts` |

---

## 1. What the UI actually requests

When you click **Proceed with Location**, the dashboard posts one analysis:

- **Center:** the searched or clicked coordinate
- **Radius:** 1.2 km (a square AOI around the point, capped at 9.5 mi²)
- **Mode:** historical
- **Date / time:** `2024-07-15` at **15:00 local** (a peak-summer hour with nationwide FortyGuard coverage)
- **Tile size:** 100 m
- **Heat-risk threshold:** **32.2 °C** (NWS Extreme Caution)

Non-US coordinates are rejected before any API call. Location search is Census Geocoder first, Nominatim fallback, both restricted to the United States.

**Demo data** badge: shown when `FORTYGUARD_API_KEY` is missing or `FORTYGUARD_MOCK_MODE=true`. Temperature is then a deterministic simulator (`mock.ts`) seeded by AOI + timestamp — same query, same map. Land cover and place search stay live.

---

## 2. Data sources behind the screen

| Source | What it supplies on the UI | If it is missing |
| --- | --- | --- |
| **FortyGuard Temperature API** (`tcm` heatmap) | Heatmap colors, hotspot / cool-zone geometry, counts, heat-island severity inputs | Simulator + **Demo data** badge |
| **FortyGuard exceedance / persistence** | Hours above 32.2 °C, used inside hotspot severity (feeds badges) | That term is dropped from severity; remaining weights are renormalised |
| **USGS NLCD 2021 via MRLC WMS** | Vegetation %, building density %, causes, heat-source tags, cool-zone “Source”, gaps, materials | Those cards fall back to hotspot averages, or “open space” / empty lists |
| **US Census ACS 5-year** | Vulnerability term in hotspot severity (not shown as its own card) | Severity ignores vulnerability instead of scoring it as zero |
| **Census / Nominatim geocoder** | Place name under “Analysis Results” | Lat/lng string |
| **Esri World Imagery** | Satellite basemap only — not a temperature source | Streets fallback is available on the picker |

NLCD is sampled at **five points** per footprint (centre + four quadrants) and averaged. That is enough at 30 m raster resolution and keeps WMS cost bounded.

---

## 3. Location select screen

| UI | Source | How it is decided |
| --- | --- | --- |
| Search box | `/api/geocode` | US address / place lookup |
| Map pin + green circle | Your click or search result | Circle is the 1.2 km analysis radius |
| “Location Selected” + lat/lng | Same point, 6 decimal places | Confirmation before spend |
| **Proceed with Location** | Navigates to `/dashboard?lat=&lng=&label=` | Analysis starts on that page |

---

## 4. Analysis Results header

### Place name

`analysis.placeLabel`. Search label if you typed one; otherwise reverse-geocoded from the pin.

### Vegetation Coverage %

Rounded integer, 0–100.

1. Prefer AOI-level **NLCD tree canopy %** (USFS TCC 2021).
2. Else AOI **vegetated land-cover share** (forest, shrub, grass, crops, wetlands).
3. Else average tree-canopy % across detected hotspots.
4. Else `0`.

**Why canopy first:** “green space” on this card means shade you can measure, not every grass patch. The bar is that same percentage, capped at 100.

### Building Density %

Rounded integer, 0–100.

1. Prefer AOI share of NLCD classes **23 + 24** (Developed, Medium / High Intensity — 50–100% impervious).
2. Else AOI **impervious surface %**.
3. Else average hotspot built-density.
4. Else `0`.

**Why those NLCD classes:** they are the nationally consistent proxy for dense building mass. There is no building-footprint API in this product.

---

## 5. Heat Map Analysis

### Overlay colors

Each 100 m cell is FortyGuard **2 m air temperature** (`analytic_type: tcm`) at the analysed hour.

Color is **ColorBrewer RdYlBu reversed** (blue → yellow → red), **stretched to this AOI’s own min–max**, not to a fixed 0–40 °C scale. Overlay opacity is 0.68.

**Why relative scale:** a planner cares about *this* neighbourhood’s contrast. A fixed scale would wash out Seattle in April and saturate Phoenix in July.

### Numbered pins

Hotspot rank after enrichment (see §6). Clicking a pin or a Hot Zone card selects that cluster and outlines it.

### Legend (High Heat / Cooling Zones / Cool Zones)

Categorical labels for the same ramp. They are **not** extra layers. High heat = red end, cooling = teal/green mid, cool = blue end.

### White dashed box

The analysed AOI (1.2 km square).

---

## 6. How a hotspot is found (feeds Hot Spots, Hot Zones, pins)

A cell is flagged when it is **≥ 1.0 standard deviation above the AOI mean** (z-ladder can rise to 1.3 / 1.6 / 1.9 / 2.2 if one blob would swallow more than 8% of the AOI). Flagged cells are flood-filled into 8-connected clusters. Clusters smaller than **3 cells** are discarded.

If nothing is found at 1.0σ, the detector retries at **0.65σ**. If the AOI spread is under **0.25 °C**, it reports no hotspots (thermally uniform).

Each cluster is then enriched:

1. **NLCD** at five points → canopy %, impervious %, built density %.
2. **Factor model** (`factors.ts`): each factor is a *deficit* vs a reference, then weighted **canopy 0.40 / impervious 0.35 / built 0.25**. Canopy reference is the 40% American Forests urban target.
3. **Census tract** demographics → vulnerability 0–100 (age 65+, poverty, no vehicle, density).
4. **Severity 0–100** (`severity.ts`): intensity 0.30 + duration 0.25 + absolute NWS heat 0.15 + vulnerability 0.30. Missing terms are dropped and the rest renormalised. Tiers: ≥70 critical, ≥50 high, ≥32 moderate, else watch.
5. **Recommendation rules** fire on those measured values (see §8).

Hotspots are re-ranked by this composite score. The UI keeps at most **5**.

**Why relative detection:** “hotter than the blocks next door” is the unit a tree-planting programme can act on. A fixed 35 °C cutoff would miss a Seattle hotspot and flood a Phoenix map.

---

## 7. How a cool zone is found (feeds Cool Spots, Cool Zones, parks)

Inverse of hotspots: cells **≤ mean − 1.0σ** (fallback 0.65σ), same clustering, max **4** zones.

Each cool cluster is NLCD-sampled. **Source** is the first match:

| Condition | Source shown |
| --- | --- |
| Water / ice class share ≥ 20% | `large water body` |
| Canopy ≥ 25% **or** vegetated share ≥ 50% | `park space` |
| Canopy ≥ 10% **or** vegetated share ≥ 20% | `light vegetation` |
| Else, or NLCD failed | `open space` |

**Intensity** badge from |z|: ≥ 1.8 `high`, ≥ 1.0 `medium`, else `low`.

**Description** is a one-liner from source + intensity (e.g. “Significant cooling from a water body.”).

**Why this exists:** the screenshots needed named cool pockets (water, park, light vegetation). Temperature alone cannot say *why* a cell is cool; NLCD supplies the label.

---

## 8. Zone names (`central area`, `eastern corridor`, …)

Not street addresses. Each hotspot / cool-zone centroid is named relative to the **pin you chose**:

- Distance < ~0.0022° (~240 m) → `central area` (fallback `inner core`)
- Else 8-point compass from bearing: northern section, northeast quadrant, eastern corridor, southeast quadrant, southern boundary, southwest corner, western district, northwest quadrant

If a name is already taken, the next synonym is used (`eastern edge`, etc.).

**Why:** short, scannable, unique. A full reverse-geocode sentence would put paragraphs back on the cards.

---

## 9. Hotspot Analysis tab

### Thermal Overview

| Field | Calculation |
| --- | --- |
| **Hot Spots** | Count of detected / enriched hotspots (0–5) |
| **Cool Spots** | Count of detected cool zones (0–4) |
| **Heat Island Severity** | `High` if any hotspot is **critical** or AOI heat gap (hottest − coolest tile) ≥ 6 °C. `Medium` if any hotspot is **high** or gap ≥ 3 °C. Else `Low`. |
| One-line summary | Template from those counts + severity. Not an LLM. |

Heat gap comes from the FortyGuard grid stats.

### Hot Zone card

| Field | Calculation | Why |
| --- | --- | --- |
| **Name** | Compass name above | Scan, don’t read an address |
| **Description** | `extreme` → “Intense heat from {cause}.” `high` → “Significant heat from {cause} and limited vegetation.” else “Moderate heat from {cause}.” | One sentence, no filler |
| **Cause** | See table below | Surface cover, not a guessed land-use layer |
| **Badge** | `extreme` if severity tier is critical **or** peak ≥ 43 °C. `high` if tier is high **or** anomaly ≥ 2.2 °C. Else `medium`. | Card badges stay in three words; internal tiers are four |

**Cause** (first match), using that hotspot’s NLCD-derived factors:

| Condition | Cause |
| --- | --- |
| Built ≥ 70% **and** canopy < 10% | industrial area or large commercial complex |
| Built ≥ 45% **and** canopy < 12% | commercial district |
| Built ≥ 25% (and not the rows above) | dense residential area |
| Built ≥ 70% **or** impervious ≥ 85% | dense urban development |
| Impervious ≥ 70% | mixed development |
| Else | `developmentLabel` (`mixed development` if canopy ≥ 20%, else `residential area`) |

`developmentLabel` (also used on Vegetation Gaps) is the same factor thresholds: dense urban / commercial / dense residential / mixed development / residential area.

**Decision basis:** NLCD does not name “industrial vs residential” directly. Built intensity + missing canopy is the closest inspectable proxy. High built + almost no trees is treated as industrial / large commercial because that is the typical NLCD high-intensity signature.

---

## 10. Vegetation Insights tab

### Summary sentence

`Approximately {coverage}% of the area has vegetation` plus `, with gaps in the {first two gap names}` when any gaps exist. Coverage is the same integer as the header Vegetation Coverage card.

### Tree Coverage list

Cool zones whose source is `park space` or `light vegetation` (max 3):

- **density:** park space → `dense`; light vegetation → `sparse`
- **area:** intensity high → `large`; medium → `medium`; else `small`

If none, one **area-wide** row from AOI canopy: ≥30% dense, ≥15% moderate, else sparse; area medium if coverage ≥ 25%.

**Why cool zones:** they are the places that are actually cooler *and* vegetated. Using every NLCD forest pixel would list shade that does not show up as a cool pocket.

### Parks & Green Spaces

Cool zones with source `park space` or `large water body` (max 3):

- **size:** intensity high → `medium`, else `small`
- **quality:** park space → `good`, water body → `fair`

Water is listed here because it is a green/blue amenity on the screenshot pattern, even though it is not trees.

### Vegetation Gaps

Hot zones whose canopy is **missing or < 18%** (max 3). **Development** is `developmentLabel` for that hotspot.

18% is below the ~27% US urban canopy average and well below the 40% target — a gap worth naming.

### Green Opportunities

Walk hot zones in rank order. For each, take the first recommendation that maps to a short action badge, skipping duplicates. Max **3** cards.

| Rule id | Badge |
| --- | --- |
| street-tree-canopy | street trees |
| shade-structures | shade structure |
| misting-systems | misting |
| cool-roofs | green roof |
| cool-pavement | cool pavement |
| depave-green-infrastructure | pocket park |
| cool-corridor | cool corridor |
| transit-shade | transit shade |

- **Feasibility:** `high` if the rule’s cost tier is `quick_win`, else `medium`
- **Impact:** the rule’s impact tier (`low` is raised to `medium` so the card stays two words)

**Why recommendations, not a new model:** the opportunity should be the same intervention the engine already defended with measured factors.

---

## 11. Urban Correlations tab

### Urban Heat Sources (tags)

From AOI NLCD (or average hotspot factors if AOI sampling failed):

| Tag added when | Threshold |
| --- | --- |
| concrete buildings | built ≥ 35% **or** impervious ≥ 55% |
| asphalt roads | impervious ≥ 50% |
| parking lots | impervious ≥ 65% |
| industrial facilities | built ≥ 70% **and** canopy < 12% |
| metal roofs | built ≥ 45% |
| paved surfaces + building mass | none of the above fired |

These are **inferred surface types**, not a parcel land-use database. NLCD cannot see “metal roof” vs “asphalt”; the tags are the usual companions of high-intensity / high-impervious urban fabric.

### Building Analysis

- **Density:** building-density % → `high` ≥ 55, `medium` ≥ 30, else `low`
- **Materials:** ≥ 60% built → concrete, glass, metal; ≥ 30% → concrete, asphalt; else asphalt, mixed

Again a typology from intensity, not a materials survey.

### Heat Correlations (one sentence each)

Up to 5 hot zones:

- If severity is `extreme` **or** the name is `central area`: `Primary hotspot correlates with {cause} in the {name}.`
- Else: `{Name} hotspot is associated with {cause}.`

Cause is the same string as the Hot Zone card.

### Infrastructure Impact

One sentence: first two hot-zone names + first three heat-source tags, plus the top cool zone’s name and source if one exists.

---

## 12. AI Recommendations panel

Not generated by the LLM. A **rule engine** (`recommendations.ts`) runs on each hotspot. Rules that fire are **deduped by id** (keep the highest priority copy), `monitor` is dropped, sorted by priority, **top 6** shown.

Each rule records `triggeredBy` (the measured values that opened it). Expected cooling is a **near-surface air** °C range from urban-heat-island field studies, not surface-temperature drop.

### When each listed action appears

| UI title | Fires when | Cooling range used |
| --- | --- | --- |
| Plant street trees | Canopy < 15% | 0.8–2.5 °C |
| Install temporary shade structures | Canopy < 12% | 0.3–1.0 °C |
| Deploy misting systems | Peak ≥ 36 °C and canopy < 20% (or unknown) | 1–2 °C |
| Implement reflective roofing and pavements | Impervious ≥ 65% | 0.4–1.7 °C |
| Develop green roofs | Built density ≥ 45% | 0.3–1.5 °C |
| Create pocket parks | Impervious ≥ 70%, vegetated share ≤ 25%, area ≥ 0.8 ha | 1–3 °C |
| Shade transit stops | ≥ 8 hours above 32.2 °C | 0.2–0.8 °C |
| Designate a cool corridor | Severity ≥ 65 and area ≥ 1.5 ha | 1.5–3.5 °C |
| Open a cooling centre | Vulnerability score ≥ 55 | people-focused (0 °C outdoor) |
| Check in on older residents | Tract % aged 65+ ≥ 18 | people-focused |

Titles on screen are a fixed id → short-label map (`SHORT_TITLES` in `brief.ts`).

### Horizon / cost / timeline / impact badge

| Rule cost tier | Horizon | Cost line | Timeline |
| --- | --- | --- | --- |
| `quick_win` | Immediate Action | Low: <$50K | 1–6 months |
| `programmatic` | Short-term Project | Medium: $50K–$250K | 1–2 years |
| `capital_project` | Long-term Strategy | High: $250K+ | 2–4 years |

The **°C reduction** badge rounds the study range: both ends rounded, low floored at 1 if the range is non-zero. `0–0` (cooling centres, outreach) shows **people-focused** — those rules save people, not outdoor air temperature.

The Implementation block repeats the selected row’s cost line, timeline, and `Impact: {badge} expected.`

**Why bands, not point estimates:** realised cooling depends on geometry, irrigation, and wind. A single “2.1 °C” would be false precision.

**Download Report** opens `/report/{analysisId}` for the **same** cached result (not a re-run).

---

## 13. Loading copy

“Satellite heat data / Land-cover sampling / Insight synthesis” is a **client-side progress narrative** timed to match pipeline order. It is not a live server event stream.

---

## 14. What you do *not* see on this UI (and why)

Hourly heat-index charts, climate-trend charts, and the long executive summary still exist in the pipeline and PDF. They were taken off the main screen because they compete with the decision: where it is hot, why, and what to do.

If a supporting source fails, that section degrades or disappears. The product does not invent an unlabelled number to fill the card.

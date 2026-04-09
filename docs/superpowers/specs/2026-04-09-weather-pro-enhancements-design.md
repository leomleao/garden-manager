# Weather Pro Enhancements — Design Spec
**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

Extend the existing weather widget with six new data-driven features grouped into two new panels — **Soil Intelligence** and **Forecast Confidence** — while reordering all panels for better information hierarchy.

New panel order:
1. Weather Alerts *(existing, extended)*
2. Gardening Insights *(existing, extended)*
3. Soil Intelligence *(new)*
4. Forecast Confidence *(new, progressive load)*

---

## Architecture & Data Flow

### API Calls (3 total, progressive loading)

#### Call 1 — Forecast (existing, extended)
Existing URL extended with additional variables. Fires on `fetchWeather()` and blocks initial render.

**New hourly variables added:**
- `soil_temperature_0_to_7cm`
- `soil_temperature_7_to_28cm`
- `soil_temperature_28_to_100cm`
- `diffuse_radiation`
- `precipitation_type`

**New daily variables added:**
- `growing_degree_days_base_5`
- `growing_degree_days_base_10`

Drives: Alerts, Insights, Soil Intelligence panel.

#### Call 2 — Ensemble (new, non-blocking)
```
https://api.open-meteo.com/v1/ensemble
  ?latitude=<lat>&longitude=<lng>
  &hourly=temperature_2m
  &models=icon_seamless
  &forecast_days=3
  &timezone=auto
```

Fires in parallel after Call 1 resolves. Returns 50 ensemble members' `temperature_2m`. Client counts members with overnight minimum (20:00–06:00) < 0°C per day to produce frost probability per day.

Drives: Frost Probability Meter in Forecast Confidence panel.

#### Call 3 — Historical Climate (new, non-blocking)
```
https://climate-api.open-meteo.com/v1/climate
  ?latitude=<lat>&longitude=<lng>
  &daily=temperature_2m_min
  &start_date=<year-start>&end_date=<year-end>
  &models=EC_Earth3P_HR
  &timezone=auto
```

Fetches `temperature_2m_min` for the current calendar window (March 1 – June 30) across the 1991–2020 climate normal period. Client computes per-day-of-year frost frequency to produce a `lastFrostRisk[dayOfYear]` array.

Drives: Spring Readiness Index in Forecast Confidence panel.

### State Additions to Alpine `weather` Object

```js
weather.confidence = {
  loading: true,        // drives shimmer skeleton
  frostProbability: [], // [{ date, dayName, prob, label, level }] per day
  springReadiness: null // { historicalRisk, forecastRisk, safeDate, status, body }
}
weather.soilLayers = {
  surface: null,  // { temp, status, advice }  — 0–7cm
  root: null,     // { temp, status, advice }  — 7–28cm
  deep: null,     // { temp, status, advice }  — 28–100cm
}
weather.precipType = [] // hourly precipitation_type codes for today (index 0–23)
weather.lightQuality = null // { diffuseFraction, label, advice } or null
weather.dualGDD = null      // { cool: { gdd, milestone, label }, warm: { gdd, milestone, label } }
```

---

## Module Changes

### `weather-helpers.js` — New Functions

#### `computeSoilLayers(hourly)`
Reads `soil_temperature_0_to_7cm`, `7_to_28cm`, `28_to_100cm` at midday (hour 12).

Status logic:
- **Surface (0–7cm):** `< 5°C` → Frozen; `< 10°C` → Too cold for seeds; `10–15°C` → Cool-season ready (Peas, Lettuce); `≥ 15°C` → Warm-season ready (Tomatoes)
- **Root (7–28cm):** If surface < 10°C but root ≥ 10°C → "Surface dry — roots still hydrated, hold irrigation"; else standard label
- **Deep (28–100cm):** In May+ (day-of-year ≥ 121), if < 8°C → "Deep-soil drought risk for fruit trees"; else standard label

Returns: `{ surface, root, deep }` each with `{ temp, status, advice }`.

#### `computePrecipTypeAlerts(hourly)`
Scans `precipitation_type` for hours 0–47 (today + tomorrow).

Type codes:
- Code `3` (Freezing rain) → red alert: "Freezing rain expected — ice coating damages leaves and weighs down branches"
- Code `6` (Wet snow) → amber alert: "Heavy wet snow expected — brush off evergreens and greenhouse roof to prevent structural damage"

Returns array of alert objects `{ level, text, body }` to be merged into `computeAlerts`.

#### `computeLightQuality(hourly)`
Reads `diffuse_radiation` and `direct_radiation` for today (hours 0–23).

- Compute `diffuseFraction = sum(diffuse) / (sum(diffuse) + sum(direct))` (guard against zero)
- If `diffuseFraction > 0.6`: `{ label: 'High Diffuse Light', advice: 'Ideal for indoor seedlings — even illumination without scorching', level: 'good' }`
- If peak `direct_radiation > 500 W/m²`: flag alongside existing greenhouse alert in meta
- Returns `null` if radiation data absent or total < 50 W/m² (night/overcast edge case)

Surfaces as a new insight card in Gardening Insights.

#### `computeDualGDD(daily)`
Replaces the single-base GDD in `computeSeasonGauge`. Reads:
- `growing_degree_days_base_5` → cool-season crops
- `growing_degree_days_base_10` → warm-season crops

Milestone thresholds:
- Cool (base 5): 100 GDD → "Peas ready to sow outdoors"; 200 GDD → "Lettuce flourishing season"
- Warm (base 10): 150 GDD → "Tomatoes approaching flowering"; 300 GDD → "Peak tomato/chilli season"

Returns:
```js
{
  cool: { accumulated, milestone, milestoneLabel, nextMilestone, daysToNext },
  warm: { accumulated, milestone, milestoneLabel, nextMilestone, daysToNext },
}
```

The existing `computeSeasonGauge` function is kept for backward compatibility but the Season Gauge insight uses `computeDualGDD` output and renders two progress bars.

#### `computeFrostEnsemble(ensembleData)`
Input: raw ensemble API response with `hourly` containing one key per member (e.g., `temperature_2m_member01` … `temperature_2m_member50`).

For each of the 3 forecast days:
- Extract overnight hours (20:00–06:00 next day)
- Count members where `min(overnight temps) < 0°C`
- `prob = count / totalMembers`

Threshold labels:
- `prob < 0.2` → level `low`, "Low risk"
- `0.2 ≤ prob < 0.5` → level `possible`, "Possible — cover tender plants"
- `prob ≥ 0.5` → level `high`, "High / Near-certain — protect everything"

Returns: `[{ date, dayName, prob, probPct, label, level }]`

#### `computeSpringReadiness(climateData, currentDayOfYear, ensembleFrostProb7d)`
Input: climate API response + current day-of-year + 7-day ensemble frost probability (max across days).

- From climate data, compute `historicalRisk` = fraction of climate years with frost on or after `currentDayOfYear`
- Compare to `ensembleFrostProb7d`

Status logic:
- `historicalRisk < 0.15` and `ensembleFrostProb7d < 0.1` → `status: 'safe'` — "Safe to plant tender seeds outdoors"
- `historicalRisk ≥ 0.15` and `ensembleFrostProb7d < 0.1` → `status: 'caution'` — "Low forecast risk but historically X% chance of late frost — consider waiting N more days"
- `ensembleFrostProb7d ≥ 0.1` → `status: 'warning'` — "Frost risk remains. Wait until forecast clears"

The "safe date" is derived as the first day-of-year in the climate data where `historicalRisk < 0.10`.

Returns: `{ historicalRisk, forecastRisk, safeDate, safeDateLabel, status, body }`

---

## UI Changes

### Panel Order (index.html)
Reorder the weather widget layers:
1. Stats bar (unchanged)
2. 7-day forecast strip (unchanged)
3. **Weather alerts** (was layer 5, now layer 3)
4. **Gardening insights** (was layer 4, now layer 4 — unchanged position relative to alerts)
5. **Soil Intelligence** (new)
6. **Forecast Confidence** (new, with shimmer skeleton)
7. Action text banner (unchanged)

### Soil Intelligence Panel
Three-row table, one row per soil layer. Each row:
- Depth label (e.g., "Surface · 0–7 cm")
- Temperature chip
- Status label (colour-coded: red/amber/green)
- Advice text

No interactive elements. Hides entirely if all three layer temperatures are null.

### Forecast Confidence Panel — Loading State (Shimmer)
While `weather.confidence.loading === true`, render a shimmer skeleton:
- Two shimmer blocks (one for Frost Probability Meter, one for Spring Readiness Index)
- CSS `@keyframes shimmer` with a moving `linear-gradient` sweep, matching existing `--bg-2` / `--bg-3` CSS variables
- No spinner, no text

### Forecast Confidence Panel — Loaded State

**Frost Probability Meter:**
- One row per day (up to 3 days)
- Horizontal bar filled to `prob%`, coloured by level: `--green` / `--amber` / `--red`
- Label text to the right
- Hover tooltip: "X of 50 ensemble members forecast sub-zero temperatures overnight"

**Spring Readiness Index:**
- Single card
- Two stat lines: "Historical frost risk after today: X%" and "Forecast frost risk next 7 days: Y%"
- Status chip (safe / caution / warning) with body text
- If `status: 'caution'` or `'warning'`, show safe date: "Safe window typically opens around [date]"

### Season Gauge Insight (extended)
Existing single GDD bar becomes two stacked bars:
```
Cool season (Peas, Lettuce)  ████████░░░░  80 GDD  → Peas ready to sow in ~8 days
Warm season (Tomatoes)       ████░░░░░░░░  45 GDD  → Flowering at 150 GDD, est. 3 weeks
```

### New Insight Card — Light Quality
Rendered in the Gardening Insights section (between existing insight cards).
- Icon: `☁️` or `🌤️`
- Label: "Light Quality · Diffuse" or "Light Quality · Direct"
- Desc: advice text from `computeLightQuality`
- Only rendered when `weather.lightQuality !== null`

---

## CSS Additions (style.css)

- `.soil-intel-table` — 3-row layout with temp chip, status, advice columns
- `.soil-layer-chip` — small coloured pill for temp value
- `.confidence-panel` — wrapper for Forecast Confidence
- `.shimmer-block` — shimmer animation skeleton
- `@keyframes shimmer` — `background-position` sweep using `--bg-2`/`--bg-3`
- `.frost-prob-bar` — horizontal bar with level-coloured fill
- `.spring-readiness-card` — card with two stat lines + status chip
- `.gdd-dual` — two-row GDD bar container extending existing `.gdd-bar`

---

## Error Handling

- Ensemble fetch failure: `weather.confidence.frostProbability = []`; Frost Probability Meter shows "Confidence data unavailable" in muted text
- Historical climate fetch failure: `weather.confidence.springReadiness = null`; Spring Readiness Index shows "Historical data unavailable"
- In both cases the Forecast Confidence panel is still rendered (not hidden), just with graceful degradation per sub-section
- `weather.confidence.loading` is set to `false` after both secondary fetches settle (Promise.allSettled)

---

## Testing

Existing `weather-helpers.test.js` to be extended with unit tests for all six new helper functions:
- `computeSoilLayers` — test all temperature boundary conditions per layer
- `computePrecipTypeAlerts` — test codes 3 and 6, and no-alert path
- `computeLightQuality` — test high-diffuse, high-direct, and null (night) paths
- `computeDualGDD` — test milestone boundary crossings for cool and warm base
- `computeFrostEnsemble` — test low/possible/high threshold boundaries with mock member data
- `computeSpringReadiness` — test safe/caution/warning paths

No new test infrastructure needed — Jest already configured.

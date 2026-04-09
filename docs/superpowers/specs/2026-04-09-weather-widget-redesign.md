# Weather Widget Redesign — Spec

**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

Redesign the weather widget on the Overview tab to match a Google Weather-style layout with gardening-specific intelligence. The widget gains a 7-day forecast strip (interactive — clicking a day updates the stat tiles), five new smart gardening insights, and enhanced alert copy.

No backend changes required. All new data comes from additional Open-Meteo hourly/daily variables added to the existing `fetchWeather()` call.

---

## Current State

The existing widget has four layers:
1. Header: weather icon, current temp, description, location name
2. Alert bar: red/amber/green pill alerts
3. Stats grid: Soil Temp · UV Index · Rain Today · Watering (4 tiles)
4. Action text footer

---

## New Widget Structure

```
┌─────────────────────────────────────────────────┐
│ HEADER  icon · temp · desc · location  │ Day H/L │
├─────────────────────────────────────────────────┤
│ STATS BAR  Soil Temp · Rain · UV · Watering     │  ← updates on day click
├─────────────────────────────────────────────────┤
│ 7-DAY STRIP  Thu Fri Sat Sun Mon Tue Wed        │  ← clickable
├─────────────────────────────────────────────────┤
│ GARDENING INSIGHTS  (new section)               │
│  • Work Window                                  │
│  • Disease Pressure                             │
│  • Greenhouse / Ventilation  (conditional)      │
│  • Pot Check (Wind + ET₀)                       │
│  • Season Gauge (GDD)                           │
├─────────────────────────────────────────────────┤
│ WEATHER ALERTS  frost · soil cold · watering    │  ← enhanced copy
├─────────────────────────────────────────────────┤
│ ACTION FOOTER                                   │
└─────────────────────────────────────────────────┘
```

---

## Feature Specs

### 1. Header — location & H/L

- Location (`config.location_name`) already shown; make it prominent with a 📍 prefix
- Add today's high/low (`daily.temperature_2m_max[0]` / `daily.temperature_2m_min[0]`) right-aligned in the header
- Day name (e.g. "Thursday") shown above H/L

### 2. Stats Bar — interactive

Four tiles: **Soil Temp**, **Rain**, **UV Index**, **Watering**

- On page load shows today's values (day index 0)
- Clicking a day in the 7-day strip updates all four tiles + header H/L + icon + description with a brief flash animation (`opacity` keyframe)
- Sub-labels update too (e.g. Rain sub-label changes from "Today" to the day name)

New `weather` state fields needed:
```js
weather.forecast = []   // array of 7 day objects, built in fetchWeather
weather.selectedDay = 0 // index of selected day (0 = today)
// Day name for header derived in template: weather.forecast[weather.selectedDay]?.name
```

### 3. 7-Day Strip

Each day cell shows:
- Day abbreviation (Mon, Tue…) — Today gets green colour + "Today" label
- Weather icon (derived from `weather_code`)
- High / Low temps
- Rain mm (`precipitation_sum`)
- Soil temp at 6cm (`soil_temperature_6cm` — take the midday hour for each day, i.e. hour index `dayIndex * 24 + 12`)
- Badge if frost risk (`temperature_2m_min ≤ 2°C`) → `❄️ frost`
- Badge if high UV (`uv_index_max ≥ 6`) → `☀️ UV N`

Active day gets a green-tinted highlight. Clicking sets `weather.selectedDay`.

### 4. Gardening Insights (new section)

Shown below the 7-day strip, above weather alerts. Each insight has:
- Colour-coded left border
- Icon, category label, title, description, meta line

Only shown when the computed condition is true. Order: Work Window → Disease Pressure → Greenhouse → Pot Check → Season Gauge.

#### 4a. Work Window (blue)
- **API:** `hourly.precipitation_probability`, `hourly.precipitation`
- **Logic:** Scan today's hours from current hour onwards (`new Date().getHours()`) for a contiguous ≥3-hour block where `precipitation_probability < 20%`
- **Display:** "Clear gap today HH:MM – HH:MM" + contextual text. If none found today, check tomorrow.
- **Meta:** Show next window after that, if any

#### 4b. Disease Pressure (amber)
- **API:** `hourly.relative_humidity_2m`, `hourly.leaf_wetness_probability`
- **Logic:** Count hours in next 24h where `relative_humidity_2m > 80%` AND `temperature_2m` between 10–20°C. If ≥ 6 hours → High risk.
- **Display:** "Fungal risk elevated [tonight/today]" + advice to open vents, avoid wetting foliage
- **Meta:** Show humidity % and leaf wetness %

#### 4c. Greenhouse / Ventilation (yellow) — conditional
- **Condition to show:** `this.zones.some(z => ['greenhouse','polytunnel'].includes(z.type))`
- **API:** `hourly.direct_radiation`
- **Logic:** Find tomorrow's (or today's) peak `direct_radiation` hour. If peak > 400 W/m² AND `temperature_2m_max < 15°C` → show alert.
- **Display:** "Open vents by HH:00 AM [day]" + radiation vs air temp explanation
- **Meta:** Lists the zone names that apply (e.g. "Applies to: Greenhouse · Polytunnel")

#### 4d. Pot Check — Wind (slate)
- **API:** `hourly.wind_gusts_10m` (already have `et0_fao_evapotranspiration` daily)
- **Logic:** If today's max `wind_gusts_10m > 30 km/h` AND `et0_fao_evapotranspiration[0] > 1.5` → show
- **Display:** "Check hanging baskets [this morning/afternoon]" + explanation of windward drying
- **Meta:** Max gust speed + ET₀ value

#### 4e. Season Gauge — GDD (purple)
- **API:** `daily.growing_degree_days_base_5_limit_30` (sum across available days)
- **Logic:** Sum `growing_degree_days_base_5_limit_30` across the 7 returned days. Compare to a static day-of-year lookup table (hardcoded approximate normals for ~56°N, base 5°C — e.g. day 99 ≈ 36 GDD). Calculate days ahead/behind from the ratio. This is an approximation, not live historical data.
- **Display:** Progress bar + "Spring is ~N days [ahead/behind] average"
- **Meta:** Accumulated GDD vs typical GDD

### 5. Weather Alerts — enhancements

#### Frost alert (existing, enhanced)
- **API:** add `hourly.dewpoint_2m`
- **Logic:** If frost day's dewpoint < 0°C → "dry frost" copy. If dewpoint ≥ 0°C → "soft frost / heavy dew" copy.
- Existing: `Frost Alert: Monday, 1°C`  
- Enhanced: `Frost Alert · Monday — 1°C (dry frost)` + body: "Dewpoint below 0°C: dehydrating frost more damaging to leaves. Cover dahlias and tender seedlings Sunday evening."

#### Soil cold alert (existing, enhanced)
- Add body text: "Wait until 10°C for cool-season crops, 15°C for tomatoes."

#### Watering alert (existing, enhanced)  
- Green alert body now includes: "Skip watering until [day] at earliest."

---

## API Changes

Single fetch URL change in `fetchWeather()` — add to existing params:

**Hourly variables to add:**
```
precipitation_probability
precipitation
relative_humidity_2m
leaf_wetness_probability
direct_radiation
wind_gusts_10m
dewpoint_2m
temperature_2m
```

**Daily variables to add:**
```
growing_degree_days_base_5_limit_30
```

All existing variables (`soil_temperature_6cm` hourly; `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `uv_index_max`, `et0_fao_evapotranspiration` daily) remain.

---

## State Changes

```js
// New fields on weather object:
weather.forecast = []    // [{name, icon, desc, hi, lo, rain, soilTemp, uvMax, code, frost, uvHigh, soilSub, watering, waterSub}, ...]
weather.selectedDay = 0  // currently selected day index (0 = today)
weather.insights = []    // [{type, icon, label, title, desc, meta}, ...] — computed in fetchWeather
// Day name for the header is derived in the template: weather.forecast[weather.selectedDay]?.name
```

---

## CSS Changes

New classes:
- `.weather-7day`, `.weather-day-cell`, `.weather-day-cell.active` — 7-day strip
- `.weather-insights`, `.insight`, `.insight--work`, `.insight--disease`, `.insight--glass`, `.insight--wind`, `.insight--season` — insight cards
- `.gdd-bar`, `.gdd-track`, `.gdd-fill` — season gauge progress bar
- `.weather-section-label` — section divider labels ("7-day gardening outlook", "Gardening insights", "Weather alerts")
- `@keyframes weather-flash` — stat tile update animation

---

## HTML Changes

In `index.html`, replace the weather widget block (lines ~70–121) with the new 6-layer structure. The stats grid and alerts keep their existing Alpine.js `x-text`/`x-show` bindings; the 7-day strip and insights use `x-for` over `weather.forecast` and `weather.insights`.

---

## Constraints

- No backend changes
- No new npm dependencies
- All logic in `fetchWeather()` in `app.js`
- CSS in `style.css` following existing naming conventions
- No changes to other tabs

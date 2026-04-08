# Calendar Sow Now — Enhanced Seed Cards with Weather Intelligence

**Date:** 2026-04-08  
**Status:** Approved

---

## Overview

Enhance the "Sow Indoors Now" and "Sow Outdoors Now" sections of the Calendar tab to display richer seed information and a weather forecast badge that indicates whether current and upcoming conditions are suitable for sowing a given seed.

---

## Current State

Each seed in the Sow Now sections is rendered as a single-line clickable row:
```
[emoji] Tomato · Cherry
```
The row opens the seed edit modal on click. No metadata is shown beyond the name. A `tooltipText(seed)` helper exists in `calendar.js` but is not wired up to the template.

---

## Goals

1. Show the following seed fields inline (when present): `purchase_year`, `sow_by_year`, `days_to_germinate`, `optimum_soil_temp`, `optimum_soil_type`, `light_requirements`.
2. Add a weather forecast badge per seed derived from `this.weatherData` (the root Alpine scope's Open-Meteo data).
3. Visually match the compact two-line style of the zone tab's loose-planting rows.
4. Never break if weather data has not yet loaded or failed to load.

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/public/app/calendar.js` | Add `weatherForecastBadge(seed, isOutdoor)` helper method |
| `dashboard/public/app/index.html` | Replace sowIndoorsNow / sowOutdoorsNow row templates |
| `dashboard/public/app/style.css` | Add `.sow-now-row`, `.sow-now-meta`, `.sow-now-badge-*` classes |

---

## Component Design

### Enhanced Row Layout

Each seed row becomes a two-line block inside a `div.sow-now-row`:

```
[emoji] Tomato · Cherry                          [🌡 Soil Good]
        📅 2024 · Sow by: 2026 · 🌱 7d · 🌡 18–22°C · 🪨 Loamy · ☀ Full sun
```

- **Line 1**: emoji + `name · variety` (existing) + weather badge (right-aligned via `margin-left:auto`)
- **Line 2** (`.sow-now-meta`): metadata chips — each chip only rendered when its field is non-empty
  - `📅 {purchase_year}` — purchase year
  - `Sow by: {sow_by_year}` — sow-by year
  - `🌱 {days_to_germinate}d` — germination days
  - `🌡 {optimum_soil_temp}` — optimum soil temp (raw string, e.g. "18–22°C")
  - `🪨 {optimum_soil_type}` — soil type
  - `☀ {light_requirements}` — light requirements

Row click behaviour unchanged: `@click="openSeedEdit(s)"`.

---

### Weather Forecast Badge

**Method:** `weatherForecastBadge(seed, isOutdoor)` added to `calendarTab` in `calendar.js`.

**Returns:** An object `{ label, title, cls }` or `null`.
- `label` — short badge text (e.g. "🌡 Soil Good", "🌡 Good Conditions")
- `title` — tooltip string shown on hover (e.g. "Avg soil temp 19°C over next 7 days — ideal for this seed")
- `cls` — CSS modifier class (`sow-now-badge--good`, `sow-now-badge--cold`, `sow-now-badge--warm`)

**Guard conditions (return `null`):**
- `this.weatherData` is falsy → not loaded or failed
- `this.weatherData.hourly` or `this.weatherData.daily` absent
- `seed.optimum_soil_temp` is empty/falsy → no range to compare

**Parsing `optimum_soil_temp`:**
1. Try range regex: `/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/` → `min`, `max`
2. Fallback single-value regex: `/(\d+(?:\.\d+)?)/` → `min = max = value`, tolerance ±3°C applied
3. If both fail → return `null`

**Outdoor badge logic** (called from Sow Outdoors Now rows, `isOutdoor = true`):
- Source: `weatherData.hourly.soil_temperature_6cm` (array of up to 168 values)
- Computation: filter out `null`/`undefined`, then compute mean → `avgSoilTemp`
- Decision:
  - `avgSoilTemp >= min && avgSoilTemp <= max` → `{ label: '🌡 Soil Good', cls: 'good', title: 'Avg soil temp Xc over next 7 days — ideal for this seed' }`
  - `avgSoilTemp < min` → `{ label: '❄ Too Cold', cls: 'cold', title: 'Avg soil temp Xc — below the Yc–Zc optimum range' }`
  - `avgSoilTemp > max` → `{ label: '🔥 Too Warm', cls: 'warm', title: 'Avg soil temp Xc — above the Yc–Zc optimum range' }`

**Indoor badge logic** (called from Sow Indoors Now rows, `isOutdoor = false`):
- Source: `weatherData.daily.temperature_2m_max` (array of up to 7 values)
- Computation: filter nulls, compute mean → `avgAirTemp`
- Decision: **only show positive signal** — indoors sowing should not be alarmed by outdoor temps
  - `avgAirTemp >= min && avgAirTemp <= max` → `{ label: '🌤 Good Conditions', cls: 'good', title: 'Avg air temp Xc over next 7 days — seasonally ideal for starting indoors' }`
  - Otherwise → `null` (no badge — avoids confusing users about unheated-space temperature proxies)

---

### CSS Classes

```css
/* Row wrapper — matches loose-planting-row feel */
.sow-now-row {
  display: flex;
  flex-direction: column;
  gap: .2rem;
  padding: .5rem 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .15s;
}
.sow-now-row:hover { background: var(--bg-elevated); }

/* Top line */
.sow-now-top {
  display: flex;
  align-items: center;
  gap: .5rem;
}

/* Metadata chip row */
.sow-now-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .375rem;
  font-size: .72rem;
  color: var(--text-3);
  padding-left: 1.6rem; /* indent under emoji */
}

/* Weather badge */
.sow-now-badge {
  margin-left: auto;
  font-size: .7rem;
  padding: .1rem .45rem;
  border-radius: 9999px;
  white-space: nowrap;
}
.sow-now-badge--good  { background: var(--green-dim); color: var(--green); }
.sow-now-badge--cold  { background: var(--blue-dim);  color: var(--blue);  }
.sow-now-badge--warm  { background: var(--red-dim);   color: var(--red);   }
```

---

## Data Flow

```
weatherData (root Alpine scope, may be null)
    │
    └─▶ calendarTab.weatherForecastBadge(seed, isOutdoor)
            │
            ├── null guard (weatherData absent, or field missing) → null
            ├── parse seed.optimum_soil_temp → [min, max]
            ├── isOutdoor=true  → avg hourly soil_temperature_6cm
            └── isOutdoor=false → avg daily temperature_2m_max
                    │
                    └─▶ { label, title, cls } | null
                            │
                            └─▶ rendered as <span class="sow-now-badge sow-now-badge--{cls}" :title="title">
```

---

## Safety / Error Handling

- All access to `weatherData` properties is guarded with optional chaining (`?.`) and nullish fallbacks.
- Array averaging functions filter nulls before computing — empty arrays return `null` to trigger the null guard.
- `optimum_soil_temp` parse failures silently return `null` — no badge shown.
- No changes to API calls or data fetching.
- Existing `tooltipText(seed)` method in calendar.js is kept but remains unused (cleanup is out of scope).

---

## Out of Scope

- Changes to seed data structure or API
- Multi-week forecast logic (only 7-day window used)
- Push notifications or persistent alerts
- Modifying zone tab

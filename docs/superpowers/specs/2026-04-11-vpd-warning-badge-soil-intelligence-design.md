# VPD Warning Badge — Soil Intelligence

**Date:** 2026-04-11
**Status:** Approved

## Summary

Add a Vapour Pressure Deficit (VPD) warning badge to the Surface row of the Soil Intelligence section. The badge appears to the right of the existing temp chip + text, using the same `sow-now-badge` pill style as the calendar warnings. A tooltip explains the transplant-shock reasoning.

VPD measures how aggressively the air is pulling moisture through leaves. When soil is cold (roots sluggish) and VPD is high (air demanding water faster than roots can supply), transplant shock risk is elevated. The badge surfaces that combined condition inline — no new section, no permanent row.

---

## 1. API Change

**File:** `dashboard/public/app/app.js`

Append `vapour_pressure_deficit` to the hourly param string (currently ends at `soil_moisture_0_to_7cm`). Open-Meteo returns this field as kPa per hour for the full forecast window.

No other API or backend changes required.

---

## 2. Helper — `computeVPD(hourly)`

**File:** `dashboard/public/app/weather-helpers.js`

New standalone function. Picks the midday value (index 12, same convention as `computeSoilLayers`).

```
computeVPD(hourly) → { kPa: number, level: string, badge: string|null, tooltip: string|null } | null
```

**Level thresholds:**

| kPa range     | Level       | Badge class     | Badge shown? |
|---------------|-------------|-----------------|--------------|
| < 0.4         | `low`       | —               | No           |
| 0.4 – < 1.2   | `moderate`  | —               | No           |
| 1.2 – < 2.0   | `high`      | `caution`       | Yes          |
| ≥ 2.0         | `very-high` | `warn`          | Yes          |

Returns `null` if `hourly.vapour_pressure_deficit` is absent or index 12 is null.

**Tooltip text (when badge shown):**
> "VPD [X.X kPa] — leaves are losing water faster than cold roots can supply. Transplant shock risk elevated."

---

## 3. Data Flow — `soilLayers.vpd`

**File:** `dashboard/public/app/weather-helpers.js`

`computeSoilLayers(hourly, now)` already receives `hourly`. It will call `computeVPD(hourly)` internally and attach the result as a top-level `vpd` field on the returned object:

```js
return { surface, root, deep, vpd }
```

`vpd` is `null` when data is unavailable or VPD is in the normal range (no badge to show). The template guards against null before rendering.

`computeVPD` is also exported for unit tests.

---

## 4. Template — Surface row 4th column

**File:** `dashboard/public/app/index.html`

The Surface row gets a 4th child div containing a conditional badge. Root and Deep rows each get an empty `<div>` placeholder to keep grid columns aligned.

Badge markup pattern (Surface row only):

```html
<template x-if="weather.soilLayers.vpd && weather.soilLayers.vpd.badge">
  <span class="sow-now-badge"
        :class="'sow-now-badge--' + weather.soilLayers.vpd.badge"
        :title="weather.soilLayers.vpd.tooltip"
        x-text="'⚠ VPD'">
  </span>
</template>
<template x-else><div></div></template>
```

---

## 5. CSS — Grid column extension

**File:** `dashboard/public/app/style.css`

`.soil-intel-row` grid changes from:

```css
grid-template-columns: 5rem auto 1fr;
```

to:

```css
grid-template-columns: 5rem auto 1fr auto;
```

The 4th `auto` column collapses to zero when the slot is an empty `<div>`, so Root and Deep rows are visually unaffected.

No new CSS classes needed — `sow-now-badge`, `sow-now-badge--caution`, and `sow-now-badge--warn` are already defined.

---

## Out of Scope

- No persistent storage of VPD values
- No VPD display in the 7-day forecast table
- No VPD threshold configuration

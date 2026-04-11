# Watering Window Insight — Design Spec

**Date:** 2026-04-11
**Scope:** Enhancement to the existing Water Balance insight card

---

## Problem

The Water Balance insight tells the user whether soil moisture is surplus or deficit, but gives no timing guidance. On hot days, irrigating during peak surface temperature causes significant evaporative loss before water reaches the root zone. The user needs a signal for *when* to water, not just *whether* to water.

---

## Design Summary

Add a "Watering Window" sub-section inside the existing Water Balance insight card. It appears only when conditions make timing relevant: root zone soil moisture is low AND surface evaporation risk is actively elevated. When shown, it recommends the earliest suitable evening window (17:00–20:00) to irrigate.

---

## Data Requirements

### New API field

Add `soil_moisture_1_to_3cm` to the `&hourly=` query parameter in `fetchWeather()` in `app.js`.

**Safety:** This is a purely additive change — an extra key in `d.hourly`. No existing function reads `d.hourly` as a whole-object scan; each function destructures only the specific keys it uses. Adding a new key is safe.

**Downstream audit (functions that read `d.hourly`):**

| Function | Keys used | Safe to add new key? |
|---|---|---|
| `computeSoilLayers` | `soil_temperature_0_to_7cm`, `soil_temperature_7_to_28cm`, `soil_temperature_28_to_100cm` | Yes |
| `computePrecipTypeAlerts` | `precipitation_type` | Yes |
| `computeLightQuality` | `direct_radiation`, `diffuse_radiation` | Yes |
| `computeDiseaseRisk` | `relative_humidity_2m`, `temperature_2m`, `leaf_wetness_probability` | Yes |
| `computeGreenhouseAlert` | `direct_radiation`, `temperature_2m` | Yes |
| `computePotCheck` | `wind_gusts_10m`, `precipitation_probability` | Yes |
| `computeWaterBalance` | `d.daily` only — does not use hourly | Yes |
| `computeBlightPressure` | `temperature_2m`, `relative_humidity_2m`, `leaf_wetness_probability` | Yes |
| `findWorkWindow` | `precipitation_probability` | Yes |

No function iterates over all hourly keys dynamically, so the addition is non-breaking.

### Existing fields used

- `hourly.soil_temperature_0_to_7cm` — surface temp (already fetched)
- `hourly.temperature_2m` — air temp (already fetched)

---

## Logic — `computeWateringWindow(hourly, now)`

New pure function in `weather-helpers.js`.

**Inputs:** `hourly` object, `now` = current Date (defaults to `new Date()`)

**Step 1 — Gate on soil moisture**
Read `soil_moisture_1_to_3cm[currentHour]`. If null or `>= 25`, return null. Condition not met; no indicator shown.

**Step 2 — Check surface evaporation risk in current conditions**
Read `soil_temperature_0_to_7cm[currentHour]` and `temperature_2m[currentHour]`. The condition is active when `surfaceTemp > airTemp + 5`. If this is also not met, return null. (Both gates must be true: low moisture AND high surface heat.)

**Step 3 — Find recommended window**
Scan hours 17–20 (indices from today's 0-based hourly array). Find the **first** hour where `soil_temperature_0_to_7cm[h] <= temperature_2m[h] + 5` (surface cooling down). If found, that is `recommendedHour`. If none found in range, default to 18.

**Output:**
```js
{ recommendedHour: 18, soilMoisture: 19.4 }
// or null
```

---

## Integration — `computeInsights()`

After `computeWaterBalance()` produces `wb` and the insight is pushed, call `computeWateringWindow(d.hourly)`. If it returns a result, attach it to the already-pushed insight:

```js
const wateringWindow = computeWateringWindow(d.hourly);
const wbInsight = { type: 'waterbalance', ... };
if (wateringWindow) wbInsight.wateringWindow = wateringWindow;
insights.push(wbInsight);
```

No change to the insight schema's required fields — `wateringWindow` is an optional enrichment.

---

## UI — `index.html`

Within the water balance insight card template, below the existing battery bar and description, add a conditional block:

```
template x-if="insight.wateringWindow"
  ⏳  Delay irrigation until HH:00 — surface evaporation is high 
      (root moisture X%). Water reaches the root zone better once 
      the soil surface cools.
```

Formatted as a small muted row, consistent with the `meta` line style already used in insight cards. No new card, no new insight type.

---

## Constraints

- Only show when **both** gates are true: `soilMoisture < 25%` AND current `surfaceTemp > airTemp + 5°C`
- Recommended hour is always within 17:00–20:00
- No change to existing insight types or card layout — purely additive

---

## Out of Scope

- Soil moisture gauge or history chart
- Per-zone moisture tracking
- Push notifications or scheduling

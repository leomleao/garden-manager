# Weather-Driven Sow-Now Badges — Design Spec
**Date:** 2026-04-10  
**Status:** Approved

---

## Overview

Extend the calendar tab's "Sow Now" rows with an array of weather-driven badges (existing single badge → multi-badge array). Each badge shows a contextual label with a tooltip explaining the reasoning. A new "Transition / Plant Out" section is introduced for seeds approaching their outdoor transplant date.

---

## Architecture

**Single function, array output.**

`getSowNowBadge(weatherData, seed, isOutdoor)` → `getSowNowBadges(weatherData, seed, mode, confidence)`

- `mode`: `'outdoor' | 'indoor' | 'transition'`
- `confidence`: `{ frostProbability, springReadiness }` from `this.weather.confidence`
- Returns: `Array<{ label: string, cls: string, title: string }>`

All badge logic stays in `weather-helpers.js` (Jest-testable, no DOM dependency).

The Alpine `weatherForecastBadge(seed, mode)` method in `calendar.js` calls this function and returns the array. HTML iterates with `x-for`.

---

## parseSoilTempRange Fix

**Current behaviour:** single value `"6°C"` → `{ min: 3, max: 9 }` (±3 heuristic)  
**Correct behaviour:** single value `"6°C"` means "6 or higher" → `{ min: 6, max: Infinity }`

Range `"22-24°C"` stays `{ min: 22, max: 24 }`.

Impact: "Too Warm" (`soil_temp > max`) will never trigger for single-value seeds. "Too Cold" triggers when `soil_temp < min`. This is the correct gardening interpretation.

---

## Badge Sets

### Sow Outdoors Now

| Badge | Class | Trigger | Tooltip example |
|---|---|---|---|
| ❄ Too Cold | `cold` (blue) | `soil_temp_avg < optimum_soil_temp.min` | "Calendar says YES, but Soil says NO. Soil is 7.4°C; Basil needs 18°C+ to germinate. Wait for a warmer spell." |
| 🔥 Too Warm | `warm` (red) | `soil_temp_avg > optimum_soil_temp.max` (range seeds only) | "Soil is 26°C — above the 22–24°C optimum. Seeds may fail to germinate." |
| 🌡 Soil Good | `good` (green) | `soil_temp_avg` within range | "Avg soil temp 19.2°C — ideal for this seed over the next 7 days." |
| 🧊 Frost Risk | `cold` (blue) | frost ensemble prob > 20% within `days_to_germinate` days | "Frost expected Thursday (38% chance). Seeds germinate in 7–10 days — they may surface during a late freeze. Use cloche protection." |
| 🌧 Rain Helps | `good` (green) | today's `precipitation_sum[0]` > 2mm AND soil is good | "Rain today (4.2mm) will help settle seeds into the soil." |
| 💨 High Winds | `caution` (amber) | max `wind_gusts_10m` today > 35 km/h | "Wind gusts of 42 km/h today. Newly sown seeds may dry out faster — water after sowing or add a light cover." |
| 💧 Thirsty Soil | `warn` (red-orange) | 3-day `et0` sum > 3-day `precipitation_sum` | "Evaporation (ET₀ 8.4mm) exceeds rainfall (3.1mm) over 3 days. Soil moisture is dropping — water before sowing." |
| 🍄 Fungal Risk | `caution` (amber) | `relative_humidity_2m` avg > 80% AND `temperature_2m` avg 15–22°C | "Humidity is 84% with mild temps — ideal conditions for downy mildew. Ensure good airflow and avoid overhead watering." |

### Sow Indoors Now

| Badge | Class | Trigger | Tooltip example |
|---|---|---|---|
| 🌤 Good Conditions | `good` | air temp avg within optimum range (existing logic) | "Avg air temp 19.5°C — seasonally ideal for starting indoors." |
| ☁ Grow Light Needed | `cold` (blue) | 4-day avg total radiation < 150 W/m² AND `light_requirements` contains "sun" or "light" | "Next 4 days are heavily overcast. Windowsill light won't be enough — use grow lights to prevent leggy seedlings." |
| 📉 Season Behind | `cold` (blue) | GDD ratio < 0.7 | "Season is 30% behind average GDD. Sowing is fine, but expect a later transplant date than usual." |
| 📈 Season Ahead | `good` (green) | GDD ratio > 1.3 | "Season is 30% ahead of average GDD — warming fast. You may be able to plant out earlier than the calendar suggests." |

### Transition (Plant Out Now) — New Section

**When shown:** seeds where today's date is within 10 days before `plant_out_start`, or within the first 3 days after `plant_out_start`.

New `plantOutNow` computed property in `calendarTab`:
```js
get plantOutNow() {
  const today = new Date();
  return this.seeds.filter(s => {
    if (!s.plant_out_start) return false;
    const [dd, mm] = s.plant_out_start.split('-').map(Number);
    const startDate = new Date(today.getFullYear(), mm - 1, dd);
    const diffDays = (startDate - today) / 86400000;
    return diffDays > -3 && diffDays <= 10;
  });
},
```

| Badge | Class | Trigger | Tooltip example |
|---|---|---|---|
| 🪜 Hardening Off | `caution` (amber) | within 10 days of `plant_out_start` AND `temperature_2m_min[0]` > 10°C | "Plant out window starts in 6 days. Begin hardening off — place outside for 2 hours in shade, increasing daily." |
| ☀️ UV Shock Risk | `warn` (red-orange) | date within first 3 days of `plant_out_start` AND `uv_index_max[0]` > 6 | "Danger: UV index is 7 today. Do not move indoor seedlings into direct sun. Start hardening off in a shaded spot for 2 hours only." |

---

## CSS Changes

Two new badge modifier classes added to `style.css`:

- `.sow-now-badge--caution` — amber (non-urgent warnings: wind, fungal, hardening off)
- `.sow-now-badge--warn` — red-orange (urgent action: UV shock, thirsty soil)

Both themed for dark and light mode, following the existing pattern.

---

## API Change

Add `soil_moisture_0_to_7cm` to the hourly params in `fetchWeather()` in `app.js`.  
(Required for future 🌊 Saturated badge — threshold 0.4 m³/m³ needs real-data validation before shipping that badge. Adding the field now costs nothing.)

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/public/app/weather-helpers.js` | Rename `getSowNowBadge` → `getSowNowBadges`, fix `parseSoilTempRange`, add all new badge logic |
| `dashboard/public/app/calendar.js` | Update `weatherForecastBadge` signature, add `plantOutNow` computed property |
| `dashboard/public/app/app.js` | Add `soil_moisture_0_to_7cm` to hourly API params |
| `dashboard/public/app/index.html` | Update sow-now badge HTML to `x-for` array, add new Transition section |
| `dashboard/public/app/style.css` | Add `--caution` and `--warn` badge classes (light + dark) |

---

## Out of Scope

- 🌊 Saturated badge (`soil_moisture_0_to_7cm > 0.4`) — deferred; needs threshold validation against real data
- Plant Out section in the Gantt calendar grid (no changes to grid rows)

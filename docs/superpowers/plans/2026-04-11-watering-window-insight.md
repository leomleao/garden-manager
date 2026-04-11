# Watering Window Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Watering Window" sub-section to the existing Water Balance insight card that tells the user what time to irrigate when surface evaporation loss is high and root zone moisture is low.

**Architecture:** Add `soil_moisture_1_to_3cm` to the Open-Meteo API request (additive, non-breaking), implement a `computeWateringWindow(hourly, now)` pure function in `weather-helpers.js`, wire it into `computeInsights()` to enrich the waterbalance insight, and render a conditional row in the existing water balance card in `index.html`.

**Tech Stack:** Vanilla JS (no framework in helpers), Alpine.js (UI), Jest (tests), Open-Meteo API

---

## File Map

| File | Change |
|---|---|
| `dashboard/public/app/app.js` | Add `soil_moisture_1_to_3cm` to `&hourly=` param string |
| `dashboard/public/app/weather-helpers.js` | Add `computeWateringWindow()` function; enrich waterbalance insight in `computeInsights()`; export the function |
| `dashboard/public/app/index.html` | Add conditional watering window row below soil battery bar |
| `dashboard/tests/weather-helpers.test.js` | Add tests for `computeWateringWindow` and integration test for waterbalance insight enrichment |

---

### Task 1: Add `soil_moisture_1_to_3cm` to API request

**Files:**
- Modify: `dashboard/public/app/app.js:229-232`

- [ ] **Step 1: Edit the hourly param string**

In `app.js`, the `&hourly=` string currently ends with `precipitation_type`. Add `soil_moisture_1_to_3cm` to the same list:

```js
// Before (line ~229-232):
`&hourly=soil_temperature_6cm,soil_temperature_0_to_7cm,soil_temperature_7_to_28cm,` +
`soil_temperature_28_to_100cm,temperature_2m,precipitation_probability,precipitation,` +
`relative_humidity_2m,leaf_wetness_probability,direct_radiation,diffuse_radiation,` +
`wind_gusts_10m,dewpoint_2m,precipitation_type`

// After:
`&hourly=soil_temperature_6cm,soil_temperature_0_to_7cm,soil_temperature_7_to_28cm,` +
`soil_temperature_28_to_100cm,temperature_2m,precipitation_probability,precipitation,` +
`relative_humidity_2m,leaf_wetness_probability,direct_radiation,diffuse_radiation,` +
`wind_gusts_10m,dewpoint_2m,precipitation_type,soil_moisture_1_to_3cm`
```

- [ ] **Step 2: Verify no other callers depend on the URL shape**

No other function reads the URL string itself — they all consume `d.hourly`. This step is a sanity check only.

Run: `grep -n "soil_moisture" dashboard/public/app/app.js`
Expected: one match on the line you just edited.

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/app.js
git commit -m "feat(weather): add soil_moisture_1_to_3cm to hourly API request"
```

---

### Task 2: Write failing tests for `computeWateringWindow`

**Files:**
- Modify: `dashboard/tests/weather-helpers.test.js`

The function signature is `computeWateringWindow(hourly, now)` where `now` defaults to `new Date()`. Add the import and tests. The function does not exist yet — tests must fail.

- [ ] **Step 1: Add import**

At the top of `dashboard/tests/weather-helpers.test.js`, add `computeWateringWindow` to the destructured require:

```js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeSeasonGauge, computeInsights, computeAlerts,
  computeSoilLayers, computePrecipTypeAlerts, computeLightQuality,
  computeDualGDD, computeFrostEnsemble, computeSpringReadiness,
  computeWateringWindow,                                          // ← new
} = require('../public/app/weather-helpers');
```

- [ ] **Step 2: Add the test suite**

Append to `dashboard/tests/weather-helpers.test.js`:

```js
// ── computeWateringWindow ─────────────────────────────────────────────────────

describe('computeWateringWindow', () => {
  // Helper: build a minimal hourly object with 24 slots for today
  function makeHourly({ moisture, surfaceTemp, airTemp } = {}) {
    return {
      soil_moisture_1_to_3cm:    moisture    ?? Array(24).fill(20),
      soil_temperature_0_to_7cm: surfaceTemp ?? Array(24).fill(15),
      temperature_2m:            airTemp     ?? Array(24).fill(10),
    };
  }

  // Freeze time at 10:00 so hour-indexed reads are deterministic
  const at10 = new Date('2026-04-11T10:00:00');

  test('returns null when soil_moisture_1_to_3cm is missing', () => {
    const hourly = makeHourly();
    delete hourly.soil_moisture_1_to_3cm;
    expect(computeWateringWindow(hourly, at10)).toBeNull();
  });

  test('returns null when root moisture >= 25%', () => {
    const moisture = Array(24).fill(30); // 30% — above threshold
    expect(computeWateringWindow(makeHourly({ moisture }), at10)).toBeNull();
  });

  test('returns null when surface temp not elevated at current hour', () => {
    // surfaceTemp <= airTemp + 5 at hour 10 → no evap risk
    const surfaceTemp = Array(24).fill(14); // 14 = 10 + 4 (not > +5)
    expect(computeWateringWindow(makeHourly({ surfaceTemp }), at10)).toBeNull();
  });

  test('returns result when both gates pass', () => {
    // moisture < 25, surfaceTemp[10] = 20 > airTemp[10] (10) + 5 = 15 ✓
    const result = computeWateringWindow(makeHourly(), at10);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('recommendedHour');
    expect(result).toHaveProperty('soilMoisture');
  });

  test('soilMoisture is rounded to 1 decimal place', () => {
    const moisture = Array(24).fill(19.456);
    const result = computeWateringWindow(makeHourly({ moisture }), at10);
    expect(result.soilMoisture).toBe(19.5);
  });

  test('finds first hour in 17-20 where surface cools (surf <= air + 5)', () => {
    // Hours 17-19 still hot (surf = 20, air = 10 → delta 10 > 5)
    // Hour 20: surf = 14, air = 10 → delta 4 ≤ 5 → cool
    const surfaceTemp = Array(24).fill(20);
    surfaceTemp[20] = 14;
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result.recommendedHour).toBe(20);
  });

  test('defaults to 18 when all hours 17-20 remain hot', () => {
    // All hours 17-20: surf = 20, air = 10 → still above +5
    const result = computeWateringWindow(makeHourly(), at10);
    expect(result.recommendedHour).toBe(18);
  });

  test('picks earliest qualifying hour in range', () => {
    // Hour 17 already cool, hour 18 also cool — should pick 17
    const surfaceTemp = Array(24).fill(20);
    surfaceTemp[17] = 14; // 14 ≤ 10 + 5 = 15 → cool
    surfaceTemp[18] = 14;
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result.recommendedHour).toBe(17);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd dashboard && npx jest weather-helpers.test.js --no-coverage 2>&1 | tail -10
```

Expected output contains: `computeWateringWindow is not a function` or similar TypeError.

---

### Task 3: Implement `computeWateringWindow` and export it

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`

- [ ] **Step 1: Add the function**

Locate the comment `// ── CommonJS export` near the bottom of `weather-helpers.js`. Insert the new function **directly above** that comment block:

```js
// ── Watering Window indicator ─────────────────────────────────────────────────
// Returns { recommendedHour, soilMoisture } when both gates are true:
//   1. Root zone soil moisture (1-3cm) < 25%
//   2. Surface temp is > air temp + 5°C at current hour (evap risk active)
// Recommended hour is the first slot in 17–20 where surface has cooled,
// defaulting to 18 if all slots remain hot.
// Returns null when conditions are not met.

function computeWateringWindow(hourly, now = new Date()) {
  const moisture    = hourly.soil_moisture_1_to_3cm;
  const surfaceTemp = hourly.soil_temperature_0_to_7cm;
  const airTemp     = hourly.temperature_2m;

  if (!moisture || !surfaceTemp || !airTemp) return null;

  const currentHour  = now.getHours();
  const soilMoisture = moisture[currentHour];

  // Gate 1: root zone must be dry enough to need irrigation
  if (soilMoisture == null || soilMoisture >= 25) return null;

  // Gate 2: surface evaporation risk must be active right now
  const surfNow = surfaceTemp[currentHour];
  const airNow  = airTemp[currentHour];
  if (surfNow == null || airNow == null || surfNow <= airNow + 5) return null;

  // Find first evening slot where evaporation pressure drops
  let recommendedHour = 18;
  for (let h = 17; h <= 20; h++) {
    const surf = surfaceTemp[h];
    const air  = airTemp[h];
    if (surf != null && air != null && surf <= air + 5) {
      recommendedHour = h;
      break;
    }
  }

  return {
    recommendedHour,
    soilMoisture: Math.round(soilMoisture * 10) / 10,
  };
}
```

- [ ] **Step 2: Add to CommonJS export**

In the `module.exports` block at the bottom of `weather-helpers.js`, add `computeWateringWindow` to the object:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
    buildForecastDays, findWorkWindow, computeDiseaseRisk,
    computeGreenhouseAlert, computePotCheck, computeSeasonGauge,
    gddBaseline, computeInsights, computeAlerts, computeActionText,
    computeSoilLayers, computePrecipTypeAlerts, computeLightQuality,
    computeDualGDD, computeFrostEnsemble, computeSpringReadiness,
    computeWaterBalance, computeBlightPressure, computeFrostCurve,
    computeWateringWindow,  // ← new
  };
}
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
cd dashboard && npx jest weather-helpers.test.js --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 102 passed` (94 existing + 8 new).

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js
git commit -m "feat(weather): add computeWateringWindow to weather helpers"
```

---

### Task 4: Wire `computeWateringWindow` into `computeInsights`

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js` (inside `computeInsights`)
- Modify: `dashboard/tests/weather-helpers.test.js` (integration test)

- [ ] **Step 1: Write integration test first**

Append to `dashboard/tests/weather-helpers.test.js`:

```js
// ── computeInsights: waterbalance insight enrichment ──────────────────────────

describe('computeInsights waterbalance wateringWindow', () => {
  // Minimal d object that satisfies computeInsights without throwing.
  // Only fields used by computeWaterBalance and computeWateringWindow are set.
  function makeD({ moisture, surfaceTemp, airTemp } = {}) {
    const daily = {
      time: ['2026-04-11'],
      precipitation_sum:              [0],
      et0_fao_evapotranspiration:     [4],
      temperature_2m_max:             [15],
      temperature_2m_min:             [5],
      weather_code:                   [0],
      uv_index_max:                   [3],
      growing_degree_days_base_0_limit_50: [5],
    };
    const hourly = {
      soil_temperature_6cm:          Array(168).fill(12),
      soil_temperature_0_to_7cm:     surfaceTemp ?? Array(168).fill(20),
      soil_temperature_7_to_28cm:    Array(168).fill(14),
      soil_temperature_28_to_100cm:  Array(168).fill(10),
      temperature_2m:                airTemp     ?? Array(168).fill(10),
      precipitation_probability:     Array(168).fill(90),
      precipitation:                 Array(168).fill(0),
      relative_humidity_2m:          Array(168).fill(50),
      leaf_wetness_probability:      Array(168).fill(10),
      direct_radiation:              Array(168).fill(0),
      diffuse_radiation:             Array(168).fill(0),
      wind_gusts_10m:                Array(168).fill(20),
      dewpoint_2m:                   Array(168).fill(5),
      precipitation_type:            Array(168).fill(0),
      soil_moisture_1_to_3cm:        moisture ?? Array(168).fill(20),
    };
    return { daily, hourly };
  }

  const at10 = new Date('2026-04-11T10:00:00');

  test('waterbalance insight has wateringWindow when both gates pass', () => {
    const insights = computeInsights(makeD(), null, at10);
    const wb = insights.find(i => i.type === 'waterbalance');
    expect(wb).toBeDefined();
    expect(wb.wateringWindow).toBeDefined();
    expect(wb.wateringWindow.soilMoisture).toBe(20);
  });

  test('waterbalance insight has no wateringWindow when moisture is high', () => {
    const insights = computeInsights(makeD({ moisture: Array(168).fill(30) }), null, at10);
    const wb = insights.find(i => i.type === 'waterbalance');
    expect(wb).toBeDefined();
    expect(wb.wateringWindow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run integration tests — verify they fail**

```bash
cd dashboard && npx jest weather-helpers.test.js --no-coverage -t "wateringWindow" 2>&1 | tail -15
```

Expected: FAIL — `wateringWindow` is undefined because `computeInsights` doesn't call `computeWateringWindow` yet.

- [ ] **Step 3: Update `computeInsights` signature and body**

`computeInsights` currently has signature `computeInsights(d, zones)`. Add an optional third `now` param for testability:

```js
function computeInsights(d, zones, now = new Date()) {
```

Then, **after** the `wb` insight is pushed (the `if (wb)` block, around line 701), add:

```js
  // Watering Window — enrich the waterbalance insight if conditions are met
  const wateringWindow = computeWateringWindow(d.hourly, now);
  if (wb && wateringWindow) {
    insights[insights.length - 1].wateringWindow = wateringWindow;
  }
```

> **Note:** The `wateringWindow` enrichment must be placed immediately after the `insights.push(wbInsight)` call so `insights[insights.length - 1]` reliably refers to the waterbalance insight. If the structure makes this fragile, assign the insight to a `const wbInsight = {...}` local, push it, then mutate it directly.

The cleanest version — assign to variable before push:

```js
  // 5. Water Balance (Soil Battery)
  const wb = computeWaterBalance(d.daily);
  if (wb) {
    const wbIcon       = wb.level === 'surplus' ? '🪣' : wb.level === 'deficit' ? '🏜️' : '⚖️';
    const wbLevelLabel = wb.level === 'surplus' ? 'Surplus' : wb.level === 'deficit' ? 'Deficit' : 'Balanced';
    const wbInsight = {
      type:       'waterbalance',
      icon:        wbIcon,
      label:      `Water Balance · ${wbLevelLabel}`,
      title:      wb.level === 'surplus'
                    ? 'Soil tank full — skip irrigation'
                    : wb.level === 'deficit'
                    ? 'Soil tank draining — check pots'
                    : 'Soil moisture balanced',
      desc:       wb.action,
      meta:       `7-day: Rain ${wb.weekRain}mm · ET\u2080 ${wb.weekET0}mm · Net ${wb.weekNet >= 0 ? '+' : ''}${wb.weekNet}mm`,
      batteryPct: wb.batteryPct,
      level:      wb.level,
    };
    const wateringWindow = computeWateringWindow(d.hourly, now);
    if (wateringWindow) wbInsight.wateringWindow = wateringWindow;
    insights.push(wbInsight);
  }
```

- [ ] **Step 4: Run all weather tests — verify they pass**

```bash
cd dashboard && npx jest weather-helpers.test.js --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (102 + 2 new = 104 total).

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js
git commit -m "feat(weather): wire computeWateringWindow into computeInsights"
```

---

### Task 5: Render watering window row in `index.html`

**Files:**
- Modify: `dashboard/public/app/index.html` (water balance card section, around line 200)

No automated test — verify visually via browser or by inspecting Alpine data.

- [ ] **Step 1: Add the watering window row**

In `index.html`, locate the closing `</div>` of the `x-show="insight.type === 'waterbalance'"` block (currently at line 201). Insert the following block **immediately after** it (between line 201 and the `<div x-show="insight.type === 'season'">` block):

```html
                    <div x-show="insight.type === 'waterbalance' && insight.wateringWindow"
                         style="margin-top:8px; display:flex; align-items:flex-start; gap:6px; font-size:0.8rem; color:var(--text-muted);">
                      <span>⏳</span>
                      <span>Delay irrigation until
                        <strong x-text="String(insight.wateringWindow?.recommendedHour ?? 18).padStart(2,'0') + ':00'"></strong>
                        — surface evaporation is high
                        (<span x-text="insight.wateringWindow?.soilMoisture"></span>% root moisture).
                        Water reaches the root zone better once the soil surface cools.
                      </span>
                    </div>
```

- [ ] **Step 2: Verify the block is in the right place**

The final structure in `index.html` should read in order:
1. `<div class="weather-insight-desc" x-text="insight.desc">` — description row
2. `<div x-show="insight.type === 'waterbalance'">` — soil battery bar
3. **`<div x-show="insight.type === 'waterbalance' && insight.wateringWindow">` — new watering window row**
4. `<div x-show="insight.type === 'season'">` — GDD bars

Run: `grep -n "wateringWindow\|soil-battery\|type === 'season'" dashboard/public/app/index.html`

Expected: lines appear in the order described above.

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/index.html
git commit -m "feat(weather): render watering window row in water balance card"
```

---

## Done

All tasks complete. The watering window indicator will appear inside the Water Balance card when both conditions are met: root zone soil moisture < 25% and current surface temp > air temp + 5°C.

# VPD Warning Badge — Soil Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VPD (Vapour Pressure Deficit) warning badge to the Surface row of the Soil Intelligence panel, using the existing `sow-now-badge` pill style with a tooltip explaining transplant shock risk.

**Architecture:** A new `computeVPD(hourly)` helper reads the midday `vapour_pressure_deficit` value, classifies it into levels, and returns badge metadata. `computeSoilLayers()` calls it internally and attaches the result as a top-level `vpd` field on the returned object. The Surface row in the HTML gains a 4th grid column for the conditional badge; Root and Deep rows get empty placeholder divs to maintain column alignment.

**Tech Stack:** Vanilla JS, Alpine.js (x-if / :class / :title / x-text), CSS Grid, Jest for unit tests. Open-Meteo Forecast API for `vapour_pressure_deficit` hourly field.

---

## Files

| File | Change |
|------|--------|
| `dashboard/public/app/app.js` | Append `vapour_pressure_deficit` to hourly API param string |
| `dashboard/public/app/weather-helpers.js` | Add `computeVPD()`, update `computeSoilLayers()` return, add to exports |
| `dashboard/public/app/style.css` | Extend `.soil-intel-row` grid to 4 columns |
| `dashboard/public/app/index.html` | Add badge slot to Surface row; add empty `<div>` placeholders to Root/Deep rows |
| `dashboard/tests/weather-helpers.test.js` | Add `computeVPD` import and test suite |

---

## Task 1: Add `vapour_pressure_deficit` to the API request

**Files:**
- Modify: `dashboard/public/app/app.js:240`

- [ ] **Step 1: Edit the hourly param string**

In `app.js`, the hourly param string currently ends at line 240:

```
`wind_gusts_10m,dewpoint_2m,precipitation_type,soil_moisture_1_to_3cm,soil_moisture_0_to_7cm`
```

Change it to:

```
`wind_gusts_10m,dewpoint_2m,precipitation_type,soil_moisture_1_to_3cm,soil_moisture_0_to_7cm,vapour_pressure_deficit`
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/app/app.js
git commit -m "feat(weather): add vapour_pressure_deficit to hourly API params"
```

---

## Task 2: Write failing tests for `computeVPD`

**Files:**
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add `computeVPD` to the import at the top of the test file**

The current import block (lines 1–10) ends with `computeWateringWindow`. Add `computeVPD` to it:

```js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeSeasonGauge, computeInsights, computeAlerts,
  computeSoilLayers, computePrecipTypeAlerts, computeLightQuality,
  computeDualGDD, computeFrostEnsemble, computeSpringReadiness,
  computeWateringWindow, computeVPD,
} = require('../public/app/weather-helpers');
```

- [ ] **Step 2: Append the `computeVPD` test suite at the end of the test file**

```js
// ── computeVPD ────────────────────────────────────────────────────────────────
describe('computeVPD', () => {
  function makeHourly(middayKpa) {
    const arr = Array(24).fill(null);
    if (middayKpa !== null) arr[12] = middayKpa;
    return { vapour_pressure_deficit: arr };
  }

  test('returns null when vapour_pressure_deficit absent', () => {
    expect(computeVPD({})).toBeNull();
  });

  test('returns null when midday value is null', () => {
    expect(computeVPD(makeHourly(null))).toBeNull();
  });

  test('kPa < 0.4 → level low, no badge', () => {
    const r = computeVPD(makeHourly(0.3));
    expect(r.level).toBe('low');
    expect(r.badge).toBeNull();
    expect(r.tooltip).toBeNull();
  });

  test('kPa 0.4–1.19 → level moderate, no badge', () => {
    const r = computeVPD(makeHourly(0.8));
    expect(r.level).toBe('moderate');
    expect(r.badge).toBeNull();
    expect(r.tooltip).toBeNull();
  });

  test('kPa 1.2 → level high, badge caution', () => {
    const r = computeVPD(makeHourly(1.2));
    expect(r.level).toBe('high');
    expect(r.badge).toBe('caution');
    expect(r.tooltip).toContain('1.2 kPa');
    expect(r.tooltip).toContain('Transplant shock risk elevated');
  });

  test('kPa 1.99 → level high, badge caution', () => {
    const r = computeVPD(makeHourly(1.99));
    expect(r.level).toBe('high');
    expect(r.badge).toBe('caution');
  });

  test('kPa 2.0 → level very-high, badge warn', () => {
    const r = computeVPD(makeHourly(2.0));
    expect(r.level).toBe('very-high');
    expect(r.badge).toBe('warn');
    expect(r.tooltip).toContain('2.0 kPa');
  });

  test('kPa value is rounded to 1 decimal in tooltip', () => {
    const r = computeVPD(makeHourly(1.456));
    expect(r.tooltip).toContain('1.5 kPa');
  });
});
```

- [ ] **Step 3: Run tests and confirm they fail with "computeVPD is not a function"**

```bash
cd dashboard && npx jest tests/weather-helpers.test.js --testNamePattern="computeVPD" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `computeVPD is not a function` or similar.

- [ ] **Step 4: Commit the failing tests**

```bash
git add dashboard/tests/weather-helpers.test.js
git commit -m "test(weather): add failing tests for computeVPD"
```

---

## Task 3: Implement `computeVPD` and update `computeSoilLayers`

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`

- [ ] **Step 1: Add `computeVPD` function before `computeSoilLayers`**

Insert this block immediately before the `// ── Multi-depth soil layer analysis` comment (around line 36):

```js
// ── Vapour Pressure Deficit (VPD) ─────────────────────────────────────────────
// Reads hourly.vapour_pressure_deficit at midday (index 12).
// Returns { kPa, level, badge, tooltip } or null if data unavailable.
// badge is 'caution' (1.2–2.0 kPa) or 'warn' (≥ 2.0 kPa); null below threshold.

function computeVPD(hourly) {
  const arr = hourly.vapour_pressure_deficit;
  if (!arr || arr[12] == null) return null;

  const kPa = Math.round(arr[12] * 10) / 10;

  let level, badge, tooltip;
  if (kPa < 0.4) {
    level = 'low'; badge = null; tooltip = null;
  } else if (kPa < 1.2) {
    level = 'moderate'; badge = null; tooltip = null;
  } else if (kPa < 2.0) {
    level = 'high';
    badge = 'caution';
    tooltip = `VPD ${kPa} kPa — leaves are losing water faster than cold roots can supply. Transplant shock risk elevated.`;
  } else {
    level = 'very-high';
    badge = 'warn';
    tooltip = `VPD ${kPa} kPa — leaves are losing water faster than cold roots can supply. Transplant shock risk elevated.`;
  }

  return { kPa, level, badge, tooltip };
}
```

- [ ] **Step 2: Update `computeSoilLayers` to attach `vpd`**

In `computeSoilLayers`, the return statement (around line 103) currently returns:

```js
return {
  surface: s != null ? { temp: s, status: surfaceStatus(s),    advice: surfaceAdvice(s)    } : null,
  root:    r != null ? { temp: r, status: rootStatus(s, r),     advice: rootAdvice(s, r)    } : null,
  deep:    d != null ? { temp: d, status: deepStatus(d, doy),   advice: deepAdvice(d, doy)  } : null,
};
```

Change it to:

```js
return {
  surface: s != null ? { temp: s, status: surfaceStatus(s),    advice: surfaceAdvice(s)    } : null,
  root:    r != null ? { temp: r, status: rootStatus(s, r),     advice: rootAdvice(s, r)    } : null,
  deep:    d != null ? { temp: d, status: deepStatus(d, doy),   advice: deepAdvice(d, doy)  } : null,
  vpd:     computeVPD(hourly),
};
```

- [ ] **Step 3: Add `computeVPD` to the `module.exports` block at the bottom of the file**

The current exports block ends with:

```js
computeWateringWindow,  // ← new
```

Change it to:

```js
computeWateringWindow,
computeVPD,
```

- [ ] **Step 4: Run the `computeVPD` tests and confirm they pass**

```bash
cd dashboard && npx jest tests/weather-helpers.test.js --testNamePattern="computeVPD" --no-coverage 2>&1 | tail -20
```

Expected: All `computeVPD` tests PASS.

- [ ] **Step 5: Run the full test suite and confirm no regressions**

```bash
cd dashboard && npx jest tests/weather-helpers.test.js --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add dashboard/public/app/weather-helpers.js
git commit -m "feat(weather): add computeVPD and attach vpd to soilLayers result"
```

---

## Task 4: Update CSS grid to 4 columns

**Files:**
- Modify: `dashboard/public/app/style.css:1382`

- [ ] **Step 1: Change the grid column definition on `.soil-intel-row`**

Find this rule (around line 1382):

```css
.soil-intel-row {
  display: grid;
  grid-template-columns: 5rem auto 1fr;
  gap: .625rem;
```

Change the `grid-template-columns` line to:

```css
  grid-template-columns: 5rem auto 1fr auto;
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/app/style.css
git commit -m "style(soil): extend soil-intel-row to 4-column grid for VPD badge slot"
```

---

## Task 5: Update HTML — Surface row badge + Root/Deep placeholders

**Files:**
- Modify: `dashboard/public/app/index.html:259–294`

- [ ] **Step 1: Update the Surface row to add the badge slot as a 4th child**

Find the Surface row block (lines 259–270):

```html
<template x-if="weather.soilLayers.surface">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Surface<span>0–7 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.surface.temp < 5 ? 'chip--red' : weather.soilLayers.surface.temp < 10 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.surface.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.surface.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.surface.advice"></span>
    </div>
  </div>
</template>
```

Replace it with:

```html
<template x-if="weather.soilLayers.surface">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Surface<span>0–7 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.surface.temp < 5 ? 'chip--red' : weather.soilLayers.surface.temp < 10 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.surface.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.surface.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.surface.advice"></span>
    </div>
    <template x-if="weather.soilLayers.vpd && weather.soilLayers.vpd.badge">
      <span class="sow-now-badge"
            :class="'sow-now-badge--' + weather.soilLayers.vpd.badge"
            :title="weather.soilLayers.vpd.tooltip"
            x-text="'⚠ VPD'">
      </span>
    </template>
    <template x-if="!(weather.soilLayers.vpd && weather.soilLayers.vpd.badge)">
      <div></div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Add empty 4th-column placeholder to Root row**

Find the Root row block (lines 271–282):

```html
<template x-if="weather.soilLayers.root">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Root<span>7–28 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.root.temp < 10 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.root.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.root.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.root.advice"></span>
    </div>
  </div>
</template>
```

Replace it with:

```html
<template x-if="weather.soilLayers.root">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Root<span>7–28 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.root.temp < 10 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.root.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.root.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.root.advice"></span>
    </div>
    <div></div>
  </div>
</template>
```

- [ ] **Step 3: Add empty 4th-column placeholder to Deep row**

Find the Deep row block (lines 283–294):

```html
<template x-if="weather.soilLayers.deep">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Deep<span>28–100 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.deep.temp < 8 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.deep.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.deep.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.deep.advice"></span>
    </div>
  </div>
</template>
```

Replace it with:

```html
<template x-if="weather.soilLayers.deep">
  <div class="soil-intel-row">
    <div class="soil-intel-depth">Deep<span>28–100 cm</span></div>
    <div class="soil-layer-chip"
         :class="weather.soilLayers.deep.temp < 8 ? 'chip--amber' : 'chip--green'"
         x-text="weather.soilLayers.deep.temp + '°C'"></div>
    <div class="soil-intel-text">
      <span class="soil-intel-status" x-text="weather.soilLayers.deep.status"></span>
      <span class="soil-intel-advice" x-text="weather.soilLayers.deep.advice"></span>
    </div>
    <div></div>
  </div>
</template>
```

- [ ] **Step 4: Run full test suite to confirm no breakage**

```bash
cd dashboard && npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/app/index.html
git commit -m "feat(soil): add VPD warning badge to Surface row in Soil Intelligence panel"
```

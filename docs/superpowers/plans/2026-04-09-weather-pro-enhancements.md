# Weather Pro Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six new weather data features grouped into two new panels (Soil Intelligence and Forecast Confidence) using progressive API loading, with panel reorder: Alerts → Insights → Soil Intelligence → Forecast Confidence.

**Architecture:** Extend the existing single Open-Meteo forecast fetch with new hourly/daily variables (Tier 1). After that resolves, fire two non-blocking fetches — Ensemble API for frost probability and Archive API for historical spring frost stats — whose results populate the Forecast Confidence panel via `weather.confidence`. All new computation lives in `weather-helpers.js` as pure functions following the existing module pattern.

**Tech Stack:** Vanilla JS (Alpine.js), Open-Meteo REST APIs, Jest (existing test setup), CSS custom properties.

---

## File Map

| File | Change |
|---|---|
| `dashboard/public/app/weather-helpers.js` | Add 6 new functions; update `computeInsights`, `computeAlerts`, and module exports |
| `dashboard/tests/weather-helpers.test.js` | Add test suites for 6 new functions; update imports |
| `dashboard/public/app/app.js` | Extend forecast URL; add new state fields; add secondary fetches; wire new helpers |
| `dashboard/public/app/index.html` | Reorder panels; add Soil Intelligence and Forecast Confidence markup |
| `dashboard/public/app/style.css` | Add shimmer, soil table, frost probability bar, spring readiness card, dual GDD styles |

---

## Task 1: `computeSoilLayers` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Open `dashboard/tests/weather-helpers.test.js`. At the top, add `computeSoilLayers` to the destructured require:

```js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeSeasonGauge, computeInsights, computeAlerts,
  computeSoilLayers,
} = require('../public/app/weather-helpers');
```

Then append this describe block at the bottom of the file:

```js
// ── computeSoilLayers ─────────────────────────────────────────────────────────
describe('computeSoilLayers', () => {
  function makeHourly(s0, s1, s2) {
    const arr = v => Array(24).fill(null).map((_, i) => i === 12 ? v : null);
    return {
      soil_temperature_0_to_7cm:    arr(s0),
      soil_temperature_7_to_28cm:   arr(s1),
      soil_temperature_28_to_100cm: arr(s2),
    };
  }

  test('returns null when no soil arrays present', () => {
    expect(computeSoilLayers({})).toBeNull();
  });

  test('surface < 5°C → status "Frozen"', () => {
    expect(computeSoilLayers(makeHourly(3, 8, 10)).surface.status).toBe('Frozen');
  });

  test('surface 5–9°C → status "Too cold for seeds"', () => {
    expect(computeSoilLayers(makeHourly(7, 8, 10)).surface.status).toBe('Too cold for seeds');
  });

  test('surface 10–14°C → status "Cool-season ready (Peas, Lettuce)"', () => {
    expect(computeSoilLayers(makeHourly(12, 13, 14)).surface.status).toBe('Cool-season ready (Peas, Lettuce)');
  });

  test('surface ≥ 15°C → status "Warm-season ready (Tomatoes)"', () => {
    expect(computeSoilLayers(makeHourly(16, 15, 14)).surface.status).toBe('Warm-season ready (Tomatoes)');
  });

  test('root layer: cold surface + warm root → "Surface dry — roots still hydrated"', () => {
    expect(computeSoilLayers(makeHourly(8, 12, 14)).root.status).toBe('Surface dry — roots still hydrated');
  });

  test('root layer: both cold → "Too cold for transplanting"', () => {
    expect(computeSoilLayers(makeHourly(7, 8, 10)).root.status).toBe('Too cold for transplanting');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: `computeSoilLayers is not a function` or similar.

- [ ] **Step 3: Implement `computeSoilLayers` in weather-helpers.js**

Add after the `soilStatus` function (around line 34):

```js
// ── Multi-depth soil layer analysis ──────────────────────────────────────────
// Reads three hourly soil temperature arrays at hour 12 (midday).
// Returns { surface, root, deep } each { temp, status, advice }, or null if
// no soil data present.

function computeSoilLayers(hourly) {
  const a0 = hourly.soil_temperature_0_to_7cm;
  const a1 = hourly.soil_temperature_7_to_28cm;
  const a2 = hourly.soil_temperature_28_to_100cm;
  if (!a0 && !a1 && !a2) return null;

  const pick = arr => arr ? (arr[12] != null ? Math.round(arr[12] * 10) / 10 : null) : null;
  const s = pick(a0);
  const r = pick(a1);
  const d = pick(a2);

  const now = new Date();
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  function surfaceStatus(t) {
    if (t == null) return '';
    if (t < 5)  return 'Frozen';
    if (t < 10) return 'Too cold for seeds';
    if (t < 15) return 'Cool-season ready (Peas, Lettuce)';
    return 'Warm-season ready (Tomatoes)';
  }

  function surfaceAdvice(t) {
    if (t == null) return '';
    if (t < 5)  return 'Soil is frozen — no outdoor sowing.';
    if (t < 10) return 'Wait until 10°C for cool-season crops, 15°C for tomatoes.';
    if (t < 15) return 'Good for peas, lettuce, and spinach outdoors.';
    return 'Ideal for tomatoes, peppers, and basil.';
  }

  function rootStatus(surf, root) {
    if (root == null) return '';
    if (surf != null && surf < 10 && root >= 10) return 'Surface dry — roots still hydrated';
    if (root < 10) return 'Too cold for transplanting';
    if (root < 15) return 'Cool zone (perennials OK)';
    return 'Warm zone (good for transplanting)';
  }

  function rootAdvice(surf, root) {
    if (root == null) return '';
    if (surf != null && surf < 10 && root >= 10)
      return 'Hold irrigation — root zone is still moist despite dry surface.';
    if (root < 10) return 'Avoid transplanting — roots will cold-shock.';
    return 'Good depth for established perennials and shrubs.';
  }

  function deepStatus(t, dayOfYear) {
    if (t == null) return '';
    if (dayOfYear >= 121 && t < 8) return 'Deep-soil drought risk for fruit trees';
    if (t < 8) return 'Cold deep soil — dormant conditions';
    return 'Adequate for established trees';
  }

  function deepAdvice(t, dayOfYear) {
    if (t == null) return '';
    if (dayOfYear >= 121 && t < 8)
      return 'Monitor fruit trees — deep drought stress can suppress fruiting.';
    if (t < 8) return 'Deep soil cold — fruit trees still dormant.';
    return 'Deep zone stable for established fruit trees and perennials.';
  }

  return {
    surface: s != null ? { temp: s, status: surfaceStatus(s),    advice: surfaceAdvice(s)    } : null,
    root:    r != null ? { temp: r, status: rootStatus(s, r),     advice: rootAdvice(s, r)    } : null,
    deep:    d != null ? { temp: d, status: deepStatus(d, doy),   advice: deepAdvice(d, doy)  } : null,
  };
}
```

Also add `computeSoilLayers` to the module.exports at the bottom of the file:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
    buildForecastDays, findWorkWindow, computeDiseaseRisk,
    computeGreenhouseAlert, computePotCheck, computeSeasonGauge,
    gddBaseline, computeInsights, computeAlerts, computeActionText,
    computeSoilLayers,
  };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all `computeSoilLayers` tests PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computeSoilLayers with 3-depth soil analysis"
```

---

## Task 2: `computePrecipTypeAlerts` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Add `computePrecipTypeAlerts` to the destructured require at the top of the test file:

```js
const {
  // ...existing...
  computeSoilLayers,
  computePrecipTypeAlerts,
} = require('../public/app/weather-helpers');
```

Append at the bottom:

```js
// ── computePrecipTypeAlerts ───────────────────────────────────────────────────
describe('computePrecipTypeAlerts', () => {
  test('returns empty array for normal precipitation codes', () => {
    expect(computePrecipTypeAlerts({ precipitation_type: Array(48).fill(1) })).toEqual([]);
  });

  test('returns empty array when precipitation_type absent', () => {
    expect(computePrecipTypeAlerts({})).toEqual([]);
  });

  test('code 3 in next 48h → red alert for freezing rain', () => {
    const types = Array(48).fill(0);
    types[10] = 3;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('red');
    expect(alerts[0].text).toMatch(/Freezing rain/);
  });

  test('code 6 in next 48h → amber alert for wet snow', () => {
    const types = Array(48).fill(0);
    types[30] = 6;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('amber');
    expect(alerts[0].text).toMatch(/wet snow/i);
  });

  test('both codes 3 and 6 → two alerts, red first', () => {
    const types = Array(48).fill(0);
    types[5] = 3;
    types[25] = 6;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(2);
    expect(alerts[0].level).toBe('red');
    expect(alerts[1].level).toBe('amber');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: `computePrecipTypeAlerts is not a function`.

- [ ] **Step 3: Implement `computePrecipTypeAlerts`**

Add after `computeSoilLayers` in `weather-helpers.js`:

```js
// ── Precipitation type alerts ─────────────────────────────────────────────────
// Scans hourly precipitation_type for the next 48h.
// Code 3 = Freezing Rain, Code 6 = Wet Snow.
// Returns array of alert objects to be merged into computeAlerts output.

function computePrecipTypeAlerts(hourly) {
  const types = hourly.precipitation_type || [];
  const alerts = [];
  const hasCode = code => types.slice(0, 48).some(t => t === code);

  if (hasCode(3)) {
    alerts.push({
      level: 'red',
      text:  'Freezing rain expected',
      body:  'Ice coating damages leaves and weighs down branches — cover tender plants and shake ice off evergreens.',
    });
  }
  if (hasCode(6)) {
    alerts.push({
      level: 'amber',
      text:  'Heavy wet snow expected',
      body:  'Brush wet snow off evergreens and your greenhouse roof to prevent structural damage.',
    });
  }
  return alerts;
}
```

Add to module.exports:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
    buildForecastDays, findWorkWindow, computeDiseaseRisk,
    computeGreenhouseAlert, computePotCheck, computeSeasonGauge,
    gddBaseline, computeInsights, computeAlerts, computeActionText,
    computeSoilLayers, computePrecipTypeAlerts,
  };
}
```

Also wire into `computeAlerts`: at the top of the `computeAlerts` function body, after `const alerts = [];`, add:

```js
  // Precipitation type alerts (freezing rain, wet snow)
  const precipAlerts = computePrecipTypeAlerts(hourly);
  alerts.push(...precipAlerts);
```

- [ ] **Step 4: Run tests**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computePrecipTypeAlerts for freezing rain and wet snow"
```

---

## Task 3: `computeLightQuality` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Add `computeLightQuality` to the require destructure, then append:

```js
// ── computeLightQuality ───────────────────────────────────────────────────────
describe('computeLightQuality', () => {
  function makeHourly(directPeak, diffuseVal) {
    const direct  = Array(24).fill(0);
    const diffuse = Array(24).fill(0);
    direct[12]  = directPeak;
    diffuse[12] = diffuseVal;
    return { direct_radiation: direct, diffuse_radiation: diffuse };
  }

  test('returns null when total radiation < 50', () => {
    expect(computeLightQuality(makeHourly(0, 0))).toBeNull();
  });

  test('returns null when both arrays absent', () => {
    expect(computeLightQuality({})).toBeNull();
  });

  test('diffuse fraction > 0.6 → High Diffuse Light, level good', () => {
    const r = computeLightQuality(makeHourly(20, 80));
    expect(r.label).toBe('High Diffuse Light');
    expect(r.level).toBe('good');
  });

  test('peak direct > 500 → level caution', () => {
    const r = computeLightQuality(makeHourly(600, 100));
    expect(r.level).toBe('caution');
    expect(r.advice).toMatch(/500 W/);
  });

  test('dominant direct but ≤ 500 → High Direct Light, level good', () => {
    const r = computeLightQuality(makeHourly(300, 50));
    expect(r.label).toBe('High Direct Light');
    expect(r.level).toBe('good');
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

- [ ] **Step 3: Implement `computeLightQuality`**

Add after `computePrecipTypeAlerts`:

```js
// ── Light quality / photosynthesis indicator ──────────────────────────────────
// Compares today's diffuse vs direct radiation.
// Returns { diffuseFraction, peakDirect, label, advice, level } or null.

function computeLightQuality(hourly) {
  const direct  = hourly.direct_radiation  || [];
  const diffuse = hourly.diffuse_radiation || [];

  const sumOf = arr => arr.slice(0, 24).reduce((s, v) => s + (v ?? 0), 0);
  const sumD  = sumOf(direct);
  const sumDf = sumOf(diffuse);
  const total = sumD + sumDf;

  if (total < 50) return null;

  const diffuseFraction = sumDf / total;
  const peakDirect = Math.max(...direct.slice(0, 24).map(v => v ?? 0));

  if (diffuseFraction > 0.6) {
    return {
      diffuseFraction,
      peakDirect,
      label:  'High Diffuse Light',
      advice: 'Even, non-scorching light — ideal for indoor seedlings and greenhouse growing today.',
      level:  'good',
    };
  }

  return {
    diffuseFraction,
    peakDirect,
    label:  'High Direct Light',
    advice: peakDirect > 500
      ? 'Peak direct radiation exceeds 500 W/m² — ensure greenhouse ventilation and shade netting for sensitive seedlings.'
      : 'Good direct sunlight today — position full-sun crops to make the most of it.',
    level: peakDirect > 500 ? 'caution' : 'good',
  };
}
```

Add to `computeInsights` at the end of the function, before `return insights;`:

```js
  // 6. Light Quality
  const lq = computeLightQuality(d.hourly);
  if (lq) {
    insights.push({
      type:  'light',
      icon:  lq.diffuseFraction > 0.6 ? '☁️' : '🌤️',
      label: `Light Quality · ${lq.label}`,
      title: lq.label,
      desc:  lq.advice,
      meta:  `Diffuse ${Math.round(lq.diffuseFraction * 100)}% · Peak direct ${Math.round(lq.peakDirect)} W/m²`,
    });
  }
```

Add to module.exports: `computeLightQuality`.

- [ ] **Step 4: Run tests**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computeLightQuality diffuse/direct radiation insight"
```

---

## Task 4: `computeDualGDD` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Add `computeDualGDD` to the require destructure, then append:

```js
// ── computeDualGDD ────────────────────────────────────────────────────────────
describe('computeDualGDD', () => {
  function makeDaily(base5, base10) {
    return {
      growing_degree_days_base_5:  base5,
      growing_degree_days_base_10: base10,
    };
  }

  test('returns null cool and warm when arrays absent', () => {
    const r = computeDualGDD({});
    expect(r.cool).toBeNull();
    expect(r.warm).toBeNull();
  });

  test('sums 7-day base_5 array correctly', () => {
    const r = computeDualGDD(makeDaily([5, 5, 5, 5, 5, 5, 5], [2, 2, 2, 2, 2, 2, 2]));
    expect(r.cool.accumulated).toBe(35);
  });

  test('sums 7-day base_10 array correctly', () => {
    const r = computeDualGDD(makeDaily([5, 5, 5, 5, 5, 5, 5], [2, 2, 2, 2, 2, 2, 2]));
    expect(r.warm.accumulated).toBe(14);
  });

  test('cool ratio is accumulated / baseline (capped at 1.5)', () => {
    // Use a zero baseline scenario: dayOfYear is < 60, baseline = 0
    // With baseline 0, ratio should be 1 (the guard case)
    const r = computeDualGDD(makeDaily([10], [5]));
    expect(r.cool.ratio).toBeGreaterThan(0);
  });

  test('handles null values in GDD arrays gracefully', () => {
    const r = computeDualGDD(makeDaily([5, null, 5, null, 5], [null, 2, null, 2, null]));
    expect(r.cool.accumulated).toBe(15);
    expect(r.warm.accumulated).toBe(4);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

- [ ] **Step 3: Implement `computeDualGDD`**

Add after `computeLightQuality`:

```js
// ── Dual-base GDD (cool + warm season) ───────────────────────────────────────
// Returns { cool, warm } each { accumulated, baseline, ratio } or null.
// Uses the same gddBaseline curve as computeSeasonGauge for cool (base 5).
// Warm (base 10) baseline is 55% of the cool baseline — typical for Scotland.

function computeDualGDD(daily) {
  function sumArr(arr) {
    if (!arr || !arr.length) return null;
    return Math.round(arr.reduce((s, v) => s + (v ?? 0), 0));
  }

  const coolAcc = sumArr(daily.growing_degree_days_base_5);
  const warmAcc = sumArr(daily.growing_degree_days_base_10);

  if (coolAcc === null && warmAcc === null) return { cool: null, warm: null };

  const now = new Date();
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const coolBase = gddBaseline(doy);
  const warmBase = Math.round(coolBase * 0.55);

  function makeTrack(acc, baseline) {
    if (acc === null) return null;
    const ratio = baseline > 0 ? Math.min(acc / baseline, 1.5) : 1;
    const daysDiff = baseline > 0 ? Math.round((ratio - 1) * 7) : 0;
    return { accumulated: acc, baseline, ratio, daysDiff };
  }

  return {
    cool: makeTrack(coolAcc, coolBase),
    warm: makeTrack(warmAcc, warmBase),
  };
}
```

Update `computeInsights` to replace the `computeSeasonGauge` block (the `// 5. Season Gauge` section) with:

```js
  // 5. Season Gauge — dual GDD (cool + warm)
  const dual = computeDualGDD(d.daily);
  const hasGDD = dual.cool || dual.warm;
  if (hasGDD) {
    const coolDiff = dual.cool?.daysDiff ?? 0;
    const dirLabel = coolDiff < -3 ? `~${Math.abs(coolDiff)} days behind average`
                   : coolDiff > 3  ? `~${Math.abs(coolDiff)} days ahead of average`
                   : 'on track with average';
    insights.push({
      type:      'season',
      icon:      '📅',
      label:     'Season Progress · GDD',
      title:     `Spring is ${dirLabel}`,
      desc:      coolDiff < -3
        ? `Cool-season crops accumulating less heat than typical — hold off on tender seeds.`
        : coolDiff > 3
        ? `Season running warm — cool-season crops ahead of schedule.`
        : `Heat accumulation on track for this time of year.`,
      meta:      [
        dual.cool ? `Cool: ${dual.cool.accumulated} GDD (base 5)` : null,
        dual.warm ? `Warm: ${dual.warm.accumulated} GDD (base 10)` : null,
      ].filter(Boolean).join(' · '),
      coolRatio: dual.cool?.ratio ?? 0,
      warmRatio: dual.warm?.ratio ?? 0,
      coolAcc:   dual.cool?.accumulated ?? 0,
      warmAcc:   dual.warm?.accumulated ?? 0,
    });
  }
```

Add `computeDualGDD` to module.exports.

- [ ] **Step 4: Run tests**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all PASS, including pre-existing `computeSeasonGauge` tests (it still exists and is still exported).

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computeDualGDD for cool/warm season GDD tracks"
```

---

## Task 5: `computeFrostEnsemble` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Add `computeFrostEnsemble` to the require destructure, then append:

```js
// ── computeFrostEnsemble ──────────────────────────────────────────────────────
describe('computeFrostEnsemble', () => {
  function makeEnsemble(numMembers, dayTemps) {
    // dayTemps: array of arrays [day0temps, day1temps, day2temps]
    // each inner array has 72 values (3 days × 24h)
    const hourly = { time: [] };
    const base = new Date('2026-04-09T00:00:00');
    for (let h = 0; h < 72; h++) {
      const d = new Date(base.getTime() + h * 3600000);
      hourly.time.push(d.toISOString().slice(0, 16));
    }
    for (let m = 1; m <= numMembers; m++) {
      const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
      hourly[key] = dayTemps[m - 1] || Array(72).fill(5);
    }
    return { hourly };
  }

  test('returns empty array when no ensemble data', () => {
    expect(computeFrostEnsemble(null)).toEqual([]);
    expect(computeFrostEnsemble({})).toEqual([]);
  });

  test('returns empty array when no member keys found', () => {
    expect(computeFrostEnsemble({ hourly: { time: Array(72).fill('2026-04-09T00:00') } })).toEqual([]);
  });

  test('0% frost when all members warm overnight', () => {
    // 4 members, all 5°C throughout
    const data = makeEnsemble(4, Array(4).fill(Array(72).fill(5)));
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(0);
    expect(result[0].level).toBe('low');
  });

  test('100% frost when all members sub-zero overnight', () => {
    // 4 members, all -2°C throughout
    const data = makeEnsemble(4, Array(4).fill(Array(72).fill(-2)));
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(1);
    expect(result[0].level).toBe('high');
  });

  test('50% frost when half members sub-zero → level possible', () => {
    const coldTemps = Array(72).fill(-2);
    const warmTemps = Array(72).fill(5);
    const data = makeEnsemble(4, [coldTemps, coldTemps, warmTemps, warmTemps]);
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(0.5);
    expect(result[0].level).toBe('possible');
  });

  test('result includes date, dayName, probPct, freezeCount, totalMembers', () => {
    const data = makeEnsemble(2, Array(2).fill(Array(72).fill(5)));
    const result = computeFrostEnsemble(data);
    expect(result[0]).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      dayName: expect.any(String),
      probPct: 0,
      freezeCount: 0,
      totalMembers: 2,
    });
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

- [ ] **Step 3: Implement `computeFrostEnsemble`**

Add after `computeDualGDD`:

```js
// ── Ensemble frost probability ────────────────────────────────────────────────
// Input: raw Open-Meteo ensemble API response.
// Counts member keys matching "temperature_2m_member*" and checks overnight
// hours (20:00–06:00 next day) for sub-zero minimums per day.
// Returns array of up to 3 day objects: { date, dayName, prob, probPct,
//   label, level, freezeCount, totalMembers }.

function computeFrostEnsemble(ensembleData) {
  if (!ensembleData || !ensembleData.hourly) return [];

  const hourly      = ensembleData.hourly;
  const times       = hourly.time || [];
  const memberKeys  = Object.keys(hourly).filter(k => /^temperature_2m_member\d+$/.test(k));
  const totalMembers = memberKeys.length;
  if (totalMembers === 0) return [];

  const numDays = Math.min(3, Math.floor(times.length / 24));
  const result  = [];

  for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
    const dateStr = (times[dayIdx * 24] || '').slice(0, 10);
    if (!dateStr) continue;

    // overnight = hours 20–23 of this day + hours 0–6 of next day
    const overnight = [];
    for (let h = 20; h < 24; h++) overnight.push(dayIdx * 24 + h);
    for (let h = 0;  h <  7; h++) {
      const idx = (dayIdx + 1) * 24 + h;
      if (idx < times.length) overnight.push(idx);
    }

    let freezeCount = 0;
    for (const key of memberKeys) {
      const temps    = hourly[key] || [];
      const oTemps   = overnight.map(i => temps[i] ?? Infinity);
      if (Math.min(...oTemps) < 0) freezeCount++;
    }

    const prob    = freezeCount / totalMembers;
    const probPct = Math.round(prob * 100);
    const dayName = new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' });

    let level, label;
    if (prob < 0.2)      { level = 'low';      label = 'Low risk'; }
    else if (prob < 0.5) { level = 'possible'; label = 'Possible — cover tender plants'; }
    else                 { level = 'high';     label = 'High risk — protect everything'; }

    result.push({ date: dateStr, dayName, prob, probPct, label, level, freezeCount, totalMembers });
  }

  return result;
}
```

Add `computeFrostEnsemble` to module.exports.

- [ ] **Step 4: Run tests**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computeFrostEnsemble for probabilistic frost prediction"
```

---

## Task 6: `computeSpringReadiness` — test and implement

**Files:**
- Modify: `dashboard/public/app/weather-helpers.js`
- Modify: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Add failing tests**

Add `computeSpringReadiness` to the require destructure, then append:

```js
// ── computeSpringReadiness ────────────────────────────────────────────────────
describe('computeSpringReadiness', () => {
  function makeClimate(entries) {
    // entries: [{ date: 'YYYY-MM-DD', minTemp }]
    return {
      daily: {
        time:                entries.map(e => e.date),
        temperature_2m_min:  entries.map(e => e.minTemp),
      },
    };
  }

  const currentDoy = 99; // ~April 9

  test('returns null when climate data absent', () => {
    expect(computeSpringReadiness(null, currentDoy, 0)).toBeNull();
    expect(computeSpringReadiness({}, currentDoy, 0)).toBeNull();
  });

  test('status safe when historical < 15% and forecast < 10%', () => {
    // No frost days at all in historical data
    const data = makeClimate([
      { date: '2020-04-09', minTemp: 5 },
      { date: '2021-04-09', minTemp: 6 },
    ]);
    const r = computeSpringReadiness(data, currentDoy, 0.05);
    expect(r.status).toBe('safe');
  });

  test('status caution when historical ≥ 15% but forecast < 10%', () => {
    // 1 of 2 years had frost after currentDoy → 50% historical risk
    const data = makeClimate([
      { date: '2020-04-10', minTemp: -1 }, // frost AFTER currentDoy
      { date: '2021-04-10', minTemp: 5 },
    ]);
    const r = computeSpringReadiness(data, currentDoy, 0.05);
    expect(r.status).toBe('caution');
    expect(r.body).toMatch(/historically/i);
  });

  test('status warning when forecast ≥ 10%', () => {
    const data = makeClimate([{ date: '2020-04-09', minTemp: 5 }]);
    const r = computeSpringReadiness(data, currentDoy, 0.4);
    expect(r.status).toBe('warning');
    expect(r.body).toMatch(/frost risk/i);
  });

  test('returns historicalRisk and forecastRisk as percentages', () => {
    const data = makeClimate([{ date: '2020-04-09', minTemp: 5 }]);
    const r = computeSpringReadiness(data, currentDoy, 0.3);
    expect(r.forecastRisk).toBe(30);
    expect(typeof r.historicalRisk).toBe('number');
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

- [ ] **Step 3: Implement `computeSpringReadiness`**

Add after `computeFrostEnsemble`:

```js
// ── Spring Readiness Index ────────────────────────────────────────────────────
// Input: historical archive API response, current day-of-year, 7-day ensemble
// frost probability (0–1 fraction).
// Computes: what % of historical years had a frost on or after currentDayOfYear,
// and combines with ensemble forecast to produce a safe/caution/warning status.
// Returns { historicalRisk, forecastRisk, safeDate, status, body } or null.

function computeSpringReadiness(climateData, currentDayOfYear, ensembleFrostProb7d) {
  if (!climateData || !climateData.daily) return null;
  const { time, temperature_2m_min } = climateData.daily;
  if (!time || !temperature_2m_min) return null;

  // For each year: did it have a frost on or after currentDayOfYear?
  const allYears         = new Set();
  const yearsWithLateFrost = new Set();

  time.forEach((dateStr, i) => {
    const d   = new Date(dateStr + 'T12:00:00');
    const year = d.getFullYear();
    const doy  = Math.floor((d - new Date(year, 0, 0)) / 86400000);
    const temp = temperature_2m_min[i];

    allYears.add(year);
    if (doy >= currentDayOfYear && temp != null && temp <= 0) {
      yearsWithLateFrost.add(year);
    }
  });

  if (allYears.size === 0) return null;

  const historicalRisk = yearsWithLateFrost.size / allYears.size;
  const forecastRisk   = ensembleFrostProb7d ?? 0;

  // Derive safe date: last date in history where any year had frost, + 14d buffer
  let safeDate = null;
  const lastFrostEntry = [...time].reverse().find((dateStr, ri) => {
    const i    = time.length - 1 - ri;
    const d    = new Date(dateStr + 'T12:00:00');
    const year = d.getFullYear();
    const doy  = Math.floor((d - new Date(year, 0, 0)) / 86400000);
    return doy >= currentDayOfYear && (temperature_2m_min[i] ?? 1) <= 0;
  });
  if (lastFrostEntry) {
    const base     = new Date(lastFrostEntry + 'T12:00:00');
    const safe     = new Date(new Date().getFullYear(), base.getMonth(), base.getDate() + 14);
    safeDate       = safe.toLocaleDateString('en', { month: 'long', day: 'numeric' });
  }

  let status, body;
  if (forecastRisk >= 0.1) {
    status = 'warning';
    body   = `Active frost risk in the 7-day forecast (${Math.round(forecastRisk * 100)}% probability). Wait until the forecast clears before planting tender crops outdoors.`;
  } else if (historicalRisk >= 0.15) {
    const pct = Math.round(historicalRisk * 100);
    status    = 'caution';
    body      = `Forecast looks clear, but historically this location has a ${pct}% chance of a late frost after this date.${safeDate ? ` Safe window typically opens around ${safeDate}.` : ''}`;
  } else {
    status = 'safe';
    body   = 'Both historical records and the current forecast confirm low frost risk — safe to plant tender seeds outdoors.';
  }

  return {
    historicalRisk: Math.round(historicalRisk * 100),
    forecastRisk:   Math.round(forecastRisk * 100),
    safeDate,
    status,
    body,
  };
}
```

Add `computeSpringReadiness` to module.exports.

- [ ] **Step 4: Run tests**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --testPathPattern=weather-helpers --verbose 2>&1 | tail -20
```

Expected: all PASS. No regressions.

- [ ] **Step 5: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/weather-helpers.js dashboard/tests/weather-helpers.test.js && git commit -m "feat(weather): add computeSpringReadiness for historical late-frost index"
```

---

## Task 7: Extend forecast API URL and Alpine state

**Files:**
- Modify: `dashboard/public/app/app.js`

- [ ] **Step 1: Add new state fields to the `weather` object**

In `app.js`, find the `weather:` object in the `app()` return (around line 18). Add three new fields:

```js
    weather: {
      temp: null, desc: '', icon: '',
      alerts: [],
      soil: { temp: null, status: '' },
      uv: null, rain: null,
      wateringStatus: '', actionText: '',
      forecast:    [],
      selectedDay: 0,
      insights:    [],
      statsFlash:  false,
      soilLayers:  null,
      lightQuality: null,
      dualGDD:      null,
      confidence: {
        loading:         false,
        frostProbability: [],
        springReadiness:  null,
      },
    },
```

- [ ] **Step 2: Extend the forecast fetch URL with new variables**

Find the `fetchWeather` function (around line 178). The current URL string spans several lines ending with `&forecast_days=7`. Replace the full URL with:

```js
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,weathercode` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,` +
          `uv_index_max,et0_fao_evapotranspiration,growing_degree_days_base_0_limit_50,` +
          `growing_degree_days_base_5,growing_degree_days_base_10` +
          `&hourly=soil_temperature_6cm,soil_temperature_0_to_7cm,soil_temperature_7_to_28cm,` +
          `soil_temperature_28_to_100cm,temperature_2m,precipitation_probability,precipitation,` +
          `relative_humidity_2m,leaf_wetness_probability,direct_radiation,diffuse_radiation,` +
          `wind_gusts_10m,dewpoint_2m,precipitation_type` +
          `&timezone=auto&forecast_days=7`
```

- [ ] **Step 3: Verify the app still loads**

```bash
cd c:/dev/garden-manager/dashboard && npm run dev 2>&1 &
```

Open the browser and confirm the weather widget still renders with no JS errors in the console. Kill the dev server: `pkill -f "npm run dev"` (or close the terminal).

- [ ] **Step 4: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/app.js && git commit -m "feat(weather): extend forecast API URL with soil layers, dual GDD, diffuse radiation, precipitation type"
```

---

## Task 8: Wire Tier 1 helpers into `fetchWeather`

**Files:**
- Modify: `dashboard/public/app/app.js`

- [ ] **Step 1: Add import references for new helpers at the top of app.js**

The helpers are loaded as `<script>` tags globally, so no import needed. Verify the `weather-helpers.js` script tag in `index.html` appears before `app.js`. (It should already — no change needed here.)

- [ ] **Step 2: Wire `computeSoilLayers` after building forecast days**

In `fetchWeather`, after `this.weather.soil.temp = today.soilTemp;` and `this.weather.soil.status = today.soilSub;`, add:

```js
        // Multi-depth soil layers
        this.weather.soilLayers = computeSoilLayers(d.hourly);
```

- [ ] **Step 3: Wire `computeDualGDD` into the insights pipeline**

`computeDualGDD` is already called inside `computeInsights` (added in Task 4). No extra wiring needed — the insights array returned by `computeInsights(d, this.zones)` already includes the updated season insight with `coolRatio` / `warmRatio`.

- [ ] **Step 4: Confirm `computePrecipTypeAlerts` is wired**

`computePrecipTypeAlerts` is called from inside `computeAlerts` (added in Task 2). No extra wiring needed.

- [ ] **Step 5: Confirm `computeLightQuality` is wired**

`computeLightQuality` is called from inside `computeInsights` (added in Task 3). No extra wiring needed.

- [ ] **Step 6: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/app.js && git commit -m "feat(weather): wire computeSoilLayers into fetchWeather"
```

---

## Task 9: Add secondary API fetches (Ensemble + Historical)

**Files:**
- Modify: `dashboard/public/app/app.js`

- [ ] **Step 1: Add secondary fetch block after the main fetch resolves**

In `fetchWeather`, find the end of the try block — just before the `} catch(e)` — and insert:

```js
        // ── Secondary (non-blocking) fetches: Ensemble + Historical ──────────
        this.weather.confidence.loading = true;
        this.weather.confidence.frostProbability = [];
        this.weather.confidence.springReadiness  = null;

        const ensembleUrl =
          `https://api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lng}` +
          `&hourly=temperature_2m&models=icon_seamless&forecast_days=3&timezone=auto`;

        const now       = new Date();
        const yearStart = `${now.getFullYear() - 10}-03-01`;
        const yearEnd   = `${now.getFullYear() - 1}-06-30`;
        const archiveUrl =
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
          `&daily=temperature_2m_min&start_date=${yearStart}&end_date=${yearEnd}&timezone=auto`;

        Promise.allSettled([
          fetch(ensembleUrl).then(r => r.json()),
          fetch(archiveUrl).then(r => r.json()),
        ]).then(([ensRes, archRes]) => {
          // Ensemble frost probability
          if (ensRes.status === 'fulfilled' && ensRes.value?.hourly) {
            this.weather.confidence.frostProbability = computeFrostEnsemble(ensRes.value);
          }

          // Spring Readiness Index
          if (archRes.status === 'fulfilled' && archRes.value?.daily) {
            const currentDoy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
            const maxProb7d  = this.weather.confidence.frostProbability.length
              ? Math.max(...this.weather.confidence.frostProbability.map(d => d.prob))
              : 0;
            this.weather.confidence.springReadiness = computeSpringReadiness(
              archRes.value, currentDoy, maxProb7d
            );
          }

          this.weather.confidence.loading = false;
        });
```

- [ ] **Step 2: Verify no console errors on load**

Start the dev server and open the app. Check the browser console — you should see the ensemble and archive requests firing (they may be blocked by CORS in local dev; that is acceptable as long as there are no JS exceptions).

- [ ] **Step 3: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/app.js && git commit -m "feat(weather): add non-blocking ensemble + historical archive fetches"
```

---

## Task 10: Reorder weather panels in index.html

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Find the current panel order**

In `index.html`, search for the comment markers for each layer:
- `<!-- Layer 4: Gardening insights -->`
- `<!-- Layer 5: Weather alerts (with body text) -->`

- [ ] **Step 2: Swap the two sections**

Move the entire **Layer 5: Weather alerts** block (from `<div class="weather-section-label" x-show="weather.alerts.length > 0">` through the closing `</div>` of `.weather-alerts`) to appear **before** the Layer 4 gardening insights block.

Update the HTML comments to reflect the new order:
- `<!-- Layer 3: Weather alerts -->`
- `<!-- Layer 4: Gardening insights -->`

- [ ] **Step 3: Verify visually**

Start the dev server and confirm alerts now appear above insights on the weather tab.

- [ ] **Step 4: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/index.html && git commit -m "feat(weather): reorder panels — alerts before insights"
```

---

## Task 11: Add Soil Intelligence panel HTML

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Add the panel after Gardening Insights**

After the closing `</div>` of the `.weather-insights` block, add:

```html
            <!-- Layer 5: Soil Intelligence -->
            <template x-if="weather.soilLayers">
              <div>
                <div class="weather-section-label">Soil intelligence</div>
                <div class="soil-intel-table">
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
                </div>
              </div>
            </template>
```

- [ ] **Step 2: Verify renders**

Start dev server. Confirm Soil Intelligence panel appears with three rows (assuming lat/lng is configured).

- [ ] **Step 3: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/index.html && git commit -m "feat(weather): add Soil Intelligence panel HTML"
```

---

## Task 12: Update Season Gauge HTML for dual GDD bars

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Find the season gauge block**

Search for `x-show="insight.type === 'season'"` in `index.html`. The current block looks like:

```html
                    <div x-show="insight.type === 'season'">
                      <div class="gdd-bar">
                        <div class="gdd-track">
                          <div class="gdd-fill" :style="'width:' + Math.min((insight.gddRatio || 0) * 100, 100) + '%'"></div>
                        </div>
                        <span style="font-size:.8rem;color:var(--text-3)"
                              x-text="Math.round((insight.gddRatio || 0) * 100) + '% of avg'"></span>
                      </div>
                      <div class="gdd-labels"><span>0</span><span>Typical GDD</span></div>
                    </div>
```

- [ ] **Step 2: Replace with dual-bar version**

```html
                    <div x-show="insight.type === 'season'" class="gdd-dual">
                      <div class="gdd-dual-row">
                        <span class="gdd-dual-label">Cool (Peas, Lettuce)</span>
                        <div class="gdd-track">
                          <div class="gdd-fill gdd-fill--cool"
                               :style="'width:' + Math.min((insight.coolRatio || 0) * 100, 100) + '%'"></div>
                        </div>
                        <span class="gdd-dual-pct"
                              x-text="Math.round((insight.coolRatio || 0) * 100) + '%'"></span>
                      </div>
                      <div class="gdd-dual-row">
                        <span class="gdd-dual-label">Warm (Tomatoes)</span>
                        <div class="gdd-track">
                          <div class="gdd-fill gdd-fill--warm"
                               :style="'width:' + Math.min((insight.warmRatio || 0) * 100, 100) + '%'"></div>
                        </div>
                        <span class="gdd-dual-pct"
                              x-text="Math.round((insight.warmRatio || 0) * 100) + '%'"></span>
                      </div>
                      <div class="gdd-labels"><span>0</span><span>Typical week</span></div>
                    </div>
```

- [ ] **Step 3: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/index.html && git commit -m "feat(weather): update Season Gauge to dual cool/warm GDD bars"
```

---

## Task 13: Add Forecast Confidence panel HTML

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Add the panel after Soil Intelligence**

After the closing `</template>` of the Soil Intelligence section (Task 11), add:

```html
            <!-- Layer 6: Forecast Confidence -->
            <div>
              <div class="weather-section-label">Forecast confidence</div>

              <!-- Shimmer skeleton while loading -->
              <template x-if="weather.confidence.loading">
                <div class="confidence-skeleton">
                  <div class="shimmer-block" style="height:4.5rem;margin-bottom:.75rem"></div>
                  <div class="shimmer-block" style="height:5.5rem"></div>
                </div>
              </template>

              <!-- Loaded: Frost Probability Meter -->
              <template x-if="!weather.confidence.loading">
                <div class="confidence-panel">

                  <template x-if="weather.confidence.frostProbability.length > 0">
                    <div class="frost-prob-section">
                      <div class="confidence-sub-label">Frost probability (ensemble)</div>
                      <template x-for="day in weather.confidence.frostProbability" :key="day.date">
                        <div class="frost-prob-row">
                          <span class="frost-prob-day" x-text="day.dayName"></span>
                          <div class="frost-prob-track">
                            <div class="frost-prob-fill"
                                 :class="'frost-prob-fill--' + day.level"
                                 :style="'width:' + day.probPct + '%'"
                                 :title="day.freezeCount + ' of ' + day.totalMembers + ' ensemble members forecast sub-zero temperatures overnight'"></div>
                          </div>
                          <span class="frost-prob-pct" x-text="day.probPct + '%'"></span>
                          <span class="frost-prob-label" :class="'frost-label--' + day.level" x-text="day.label"></span>
                        </div>
                      </template>
                    </div>
                  </template>

                  <template x-if="weather.confidence.frostProbability.length === 0 && !weather.confidence.loading">
                    <p class="confidence-unavailable">Ensemble data unavailable</p>
                  </template>

                  <!-- Spring Readiness Index -->
                  <template x-if="weather.confidence.springReadiness">
                    <div class="spring-readiness-card"
                         :class="'spring-readiness--' + weather.confidence.springReadiness.status">
                      <div class="confidence-sub-label">Spring readiness index</div>
                      <div class="spring-stat-row">
                        <span>Historical frost risk after today</span>
                        <strong x-text="weather.confidence.springReadiness.historicalRisk + '%'"></strong>
                      </div>
                      <div class="spring-stat-row">
                        <span>Forecast frost risk next 7 days</span>
                        <strong x-text="weather.confidence.springReadiness.forecastRisk + '%'"></strong>
                      </div>
                      <p class="spring-readiness-body" x-text="weather.confidence.springReadiness.body"></p>
                    </div>
                  </template>

                  <template x-if="!weather.confidence.springReadiness && !weather.confidence.loading">
                    <p class="confidence-unavailable">Historical data unavailable</p>
                  </template>

                </div>
              </template>
            </div>
```

- [ ] **Step 2: Verify loading state renders**

Start the dev server. Before the secondary fetches resolve, the shimmer skeleton should flash. After a second or two, the Frost Probability Meter and Spring Readiness Index should appear (or "unavailable" messages if the API is unreachable in dev).

- [ ] **Step 3: Commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/index.html && git commit -m "feat(weather): add Forecast Confidence panel with shimmer, frost meter, spring readiness"
```

---

## Task 14: Add Light Quality insight card in HTML

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Check existing insight rendering**

The existing insight cards use:
```html
<div class="weather-insight" :class="'weather-insight--' + insight.type">
```

The `type: 'light'` insight added by `computeLightQuality` (Task 3) will already render via the existing `x-for` loop. No new markup needed for the card itself — it inherits the existing insight styles.

However, confirm no `x-show="insight.type === 'season'"` sibling block accidentally shows for `type === 'light'`. It won't, because those blocks use `x-show`, not `x-if`, so only the season-specific GDD bars are hidden/shown — the rest of the card always renders.

- [ ] **Step 2: Confirm Light Quality card renders in browser**

Start dev server. On a day with sufficient radiation (any non-zero total), the Light Quality insight card should appear in the Gardening Insights section.

- [ ] **Step 3: Commit (no code change if step 1 confirms no HTML edit needed)**

If no HTML change was needed: document the verification in git anyway:

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/index.html && git status
```

If there are no staged changes, skip commit — the feature is already live through the helper wiring.

---

## Task 15: CSS for all new elements

**Files:**
- Modify: `dashboard/public/app/style.css`

- [ ] **Step 1: Add shimmer animation and skeleton**

Append to `style.css`:

```css
/* ── Shimmer skeleton ────────────────────────────────────────────────────── */

@keyframes shimmer {
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
}

.shimmer-block {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 0%,
    var(--bg-input)    50%,
    var(--bg-elevated) 100%
  );
  background-size: 1600px 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}

.confidence-skeleton {
  padding: .5rem 0;
}
```

- [ ] **Step 2: Add soil intelligence table styles**

```css
/* ── Soil Intelligence panel ─────────────────────────────────────────────── */

.soil-intel-table {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  padding: .25rem 0;
}

.soil-intel-row {
  display: grid;
  grid-template-columns: 5.5rem 3.5rem 1fr;
  align-items: start;
  gap: .5rem;
  padding: .5rem .75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.soil-intel-depth {
  font-size: .75rem;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.3;
}

.soil-intel-depth span {
  display: block;
  font-size: .65rem;
  color: var(--text-3);
  font-weight: 400;
}

.soil-layer-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .2rem .45rem;
  border-radius: 5px;
  font-size: .75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip--green { background: var(--green-dim); color: var(--green); }
.chip--amber { background: var(--amber-dim); color: var(--amber); }
.chip--red   { background: var(--red-dim);   color: var(--red);   }

.soil-intel-text {
  display: flex;
  flex-direction: column;
  gap: .15rem;
}

.soil-intel-status {
  font-size: .8rem;
  font-weight: 600;
  color: var(--text-1);
}

.soil-intel-advice {
  font-size: .72rem;
  color: var(--text-3);
  line-height: 1.35;
}
```

- [ ] **Step 3: Add Forecast Confidence panel styles**

```css
/* ── Forecast Confidence panel ───────────────────────────────────────────── */

.confidence-panel {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.confidence-sub-label {
  font-size: .7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-3);
  margin-bottom: .35rem;
}

.confidence-unavailable {
  font-size: .78rem;
  color: var(--text-3);
  font-style: italic;
  margin: 0;
}

/* Frost probability meter */

.frost-prob-section {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: .65rem .75rem;
}

.frost-prob-row {
  display: grid;
  grid-template-columns: 2.5rem 1fr 2.5rem auto;
  align-items: center;
  gap: .5rem;
  margin-bottom: .4rem;
}

.frost-prob-row:last-child { margin-bottom: 0; }

.frost-prob-day {
  font-size: .75rem;
  font-weight: 600;
  color: var(--text-2);
}

.frost-prob-track {
  height: 8px;
  background: var(--bg-input);
  border-radius: 4px;
  overflow: hidden;
}

.frost-prob-fill {
  height: 100%;
  border-radius: 4px;
  transition: width .4s ease;
}

.frost-prob-fill--low      { background: var(--green); }
.frost-prob-fill--possible { background: var(--amber); }
.frost-prob-fill--high     { background: var(--red);   }

.frost-prob-pct {
  font-size: .72rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.frost-prob-label {
  font-size: .7rem;
  font-weight: 500;
  white-space: nowrap;
}

.frost-label--low      { color: var(--green); }
.frost-label--possible { color: var(--amber); }
.frost-label--high     { color: var(--red);   }

/* Spring Readiness card */

.spring-readiness-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: .65rem .75rem;
}

.spring-readiness--safe    { border-left: 3px solid var(--green); }
.spring-readiness--caution { border-left: 3px solid var(--amber); }
.spring-readiness--warning { border-left: 3px solid var(--red);   }

.spring-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: .78rem;
  color: var(--text-2);
  margin-bottom: .25rem;
}

.spring-stat-row strong {
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.spring-readiness-body {
  font-size: .76rem;
  color: var(--text-3);
  margin: .4rem 0 0;
  line-height: 1.45;
}
```

- [ ] **Step 4: Add dual GDD bar styles**

```css
/* ── Dual GDD bars ───────────────────────────────────────────────────────── */

.gdd-dual {
  margin-top: .4rem;
}

.gdd-dual-row {
  display: grid;
  grid-template-columns: 9rem 1fr 2.5rem;
  align-items: center;
  gap: .5rem;
  margin-bottom: .35rem;
}

.gdd-dual-label {
  font-size: .72rem;
  color: var(--text-3);
  white-space: nowrap;
}

.gdd-dual-pct {
  font-size: .72rem;
  color: var(--text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.gdd-fill--cool { background: var(--green); }
.gdd-fill--warm { background: var(--amber); }
```

- [ ] **Step 5: Run all tests to confirm no regressions**

```bash
cd c:/dev/garden-manager/dashboard && npx jest --verbose 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 6: Final visual check in browser**

Start dev server, confirm:
- Alerts appear above Insights
- Soil Intelligence panel shows three rows
- Season Gauge shows two GDD bars (cool + warm)
- Forecast Confidence panel shows shimmer then loads frost probability + spring readiness
- No layout breakage on narrow viewport

- [ ] **Step 7: Final commit**

```bash
cd c:/dev/garden-manager && git add dashboard/public/app/style.css && git commit -m "feat(weather): add CSS for shimmer, soil intel, forecast confidence, dual GDD bars"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Multi-depth soil (0–7, 7–28, 28–100cm) | Task 1, 8, 11 |
| Precipitation type alerts (codes 3, 6) | Task 2 |
| Light quality / diffuse radiation insight | Task 3, 14 |
| Dual GDD (base 5 cool, base 10 warm) | Task 4, 12 |
| Ensemble frost probability meter | Task 5, 9, 13 |
| Historical spring readiness index | Task 6, 9, 13 |
| Panel reorder (Alerts → Insights → Soil → Confidence) | Task 10, 11, 13 |
| Shimmer skeleton loading state | Task 13, 15 |

All spec requirements covered. ✓

**Placeholder scan:** No TBDs or incomplete steps. ✓

**Type consistency:** `coolRatio`/`warmRatio` used consistently from Task 4 (helper) through Task 12 (HTML). `weather.soilLayers.surface/root/deep` consistent from Task 1 through Task 11. `weather.confidence.frostProbability` and `weather.confidence.springReadiness` consistent from Task 7 (init) through Tasks 9 and 13. ✓

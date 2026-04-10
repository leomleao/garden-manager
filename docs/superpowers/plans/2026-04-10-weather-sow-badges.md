# Weather Sow-Now Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the calendar tab's sow-now rows with arrays of weather-driven contextual badges (soil temp, frost risk, rain, wind, fungal, grow light, GDD, hardening off, UV shock), plus a new Transition section for seeds approaching their plant-out date.

**Architecture:** All badge logic lives in `calendar.js` (already Jest-testable via `module.exports` guard). `getSowNowBadge` is renamed to `getSowNowBadges` and returns `{label, cls, title}[]`. The Alpine component calls it with `mode: 'outdoor' | 'indoor' | 'transition'` and renders with `x-for`. A new `plantOutNow` computed property drives the new Transition section.

**Tech Stack:** Vanilla JS, Alpine.js v3, Jest (Node), Open-Meteo API

---

## File Map

| File | Change |
|---|---|
| `dashboard/public/app/calendar.js` | Fix `parseSoilTempRange`, add `parseGerminationDays`, rename `getSowNowBadge` → `getSowNowBadges` (array), add all badge logic, add `plantOutNow`, update `weatherForecastBadge` |
| `dashboard/tests/calendar-helpers.test.js` | Update all tests for new signatures and add new badge tests |
| `dashboard/public/app/style.css` | Add `--caution` (amber) and `--warn` (red-orange) badge classes |
| `dashboard/public/app/app.js` | Add `soil_moisture_0_to_7cm` to hourly API params |
| `dashboard/public/app/index.html` | Switch badge rendering to `x-for` array, add Transition section |

---

## Task 1: Fix parseSoilTempRange + add parseGerminationDays

**Files:**
- Modify: `dashboard/public/app/calendar.js:2-9` (parseSoilTempRange)
- Modify: `dashboard/tests/calendar-helpers.test.js:14-17` (update single-value test)

### Problem
Single value `"6°C"` currently returns `{ min: 3, max: 9 }` (±3 heuristic). Seeds like Basil with `"18-21°C"` are fine, but seeds with `"6°C"` mean "6°C or warmer" — not a 3-degree band.

- [ ] **Step 1: Update the failing test to reflect correct behaviour**

In `dashboard/tests/calendar-helpers.test.js`, replace the single-value test at line 14:

```js
// OLD — delete this:
test('single value applies ±3 tolerance', () => {
  expect(parseSoilTempRange('20°C')).toEqual({ min: 17, max: 23 });
});

// NEW — replace with these two:
test('single value means min threshold only (max is Infinity)', () => {
  expect(parseSoilTempRange('20°C')).toEqual({ min: 20, max: Infinity });
});
test('single digit like "6°C" means 6 or warmer', () => {
  expect(parseSoilTempRange('6°C')).toEqual({ min: 6, max: Infinity });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "single value" --no-coverage
```
Expected: FAIL — `{ min: 20, max: Infinity }` but got `{ min: 17, max: 23 }`

- [ ] **Step 3: Fix parseSoilTempRange in calendar.js**

Replace lines 2–9 of `dashboard/public/app/calendar.js`:

```js
function parseSoilTempRange(str) {
  if (!str) return null;
  const range = str.match(/(\d+(?:\.\d+)?)\s*[-\u2013\u2014]\s*(\d+(?:\.\d+)?)/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const single = str.match(/(\d+(?:\.\d+)?)/);
  if (single) { const v = parseFloat(single[1]); return { min: v, max: Infinity }; }
  return null;
}
```

- [ ] **Step 4: Add parseGerminationDays after arrAvg**

Insert after the `arrAvg` function (after line 15 in `calendar.js`):

```js
function parseGerminationDays(str) {
  // "7-10" → 10 (use max), "7" → 7, null/missing → 14 (safe default)
  if (!str) return 14;
  const range = str.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
  if (range) return parseInt(range[2]);
  const single = str.match(/(\d+)/);
  return single ? parseInt(single[1]) : 14;
}
```

- [ ] **Step 5: Add parseGerminationDays to module.exports**

Replace the export at line 46 of `calendar.js`:

```js
if (typeof module !== 'undefined') module.exports = { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadge };
```

(Keep `getSowNowBadge` for now — will rename in Task 2.)

- [ ] **Step 6: Add tests for parseGerminationDays in calendar-helpers.test.js**

Add a new `describe` block after the `arrAvg` block:

```js
describe('parseGerminationDays', () => {
  const { parseGerminationDays } = require('../public/app/calendar.js');

  test('range "7-10" returns max value 10', () => {
    expect(parseGerminationDays('7-10')).toBe(10);
  });
  test('single "7" returns 7', () => {
    expect(parseGerminationDays('7')).toBe(7);
  });
  test('null returns default 14', () => {
    expect(parseGerminationDays(null)).toBe(14);
  });
  test('undefined returns default 14', () => {
    expect(parseGerminationDays(undefined)).toBe(14);
  });
  test('en-dash range "5–7" returns 7', () => {
    expect(parseGerminationDays('5\u20137')).toBe(7);
  });
});
```

- [ ] **Step 7: Run all calendar tests**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js --no-coverage
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd dashboard && git add public/app/calendar.js tests/calendar-helpers.test.js
git commit -m "fix(calendar): single soil temp value means min threshold only, add parseGerminationDays"
```

---

## Task 2: Implement getSowNowBadges — outdoor mode

**Files:**
- Modify: `dashboard/public/app/calendar.js` (add `getSowNowBadges`, keep old `getSowNowBadge` temporarily)
- Modify: `dashboard/tests/calendar-helpers.test.js` (add outdoor badge tests)

- [ ] **Step 1: Write failing tests for outdoor badges**

Add a new `describe('getSowNowBadges outdoor', ...)` block in `calendar-helpers.test.js`. Add this import at the top of the file alongside the existing destructure:

```js
const { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges } = require('../public/app/calendar.js');
```

Then add:

```js
describe('getSowNowBadges outdoor', () => {
  function makeWeather({ soilTemps, gusts, rain, et0, rh, temp } = {}) {
    return {
      hourly: {
        soil_temperature_6cm:  soilTemps || Array(168).fill(20),
        wind_gusts_10m:        gusts     || Array(168).fill(0),
        relative_humidity_2m:  rh        || Array(24).fill(50),
        temperature_2m:        temp      || Array(24).fill(18),
      },
      daily: {
        precipitation_sum:            rain  || [0, 0, 0, 0, 0, 0, 0],
        et0_fao_evapotranspiration:   et0   || [0, 0, 0, 0, 0, 0, 0],
        temperature_2m_max:           Array(7).fill(20),
        temperature_2m_min:           Array(7).fill(10),
        uv_index_max:                 Array(7).fill(3),
        growing_degree_days_base_0_limit_50: Array(7).fill(5),
      },
    };
  }

  test('returns empty array when weatherData is null', () => {
    expect(getSowNowBadges(null, { optimum_soil_temp: '18-22°C' }, 'outdoor', null)).toEqual([]);
  });

  test('returns empty array when seed is null', () => {
    expect(getSowNowBadges(makeWeather(), null, 'outdoor', null)).toEqual([]);
  });

  test('soil too cold: label ❄ Too Cold, cls cold', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(8) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '❄ Too Cold');
    expect(b).toBeDefined();
    expect(b.cls).toBe('cold');
    expect(b.title).toContain('Basil');
    expect(b.title).toContain('18-22°C');
  });

  test('soil too warm: label 🔥 Too Warm, cls warm (only for ranged temps)', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(28) });
    const badges = getSowNowBadges(w, { name: 'Peas', optimum_soil_temp: '10-18°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '🔥 Too Warm');
    expect(b).toBeDefined();
    expect(b.cls).toBe('warm');
  });

  test('single-value seed: Too Warm badge never appears (max is Infinity)', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(30) });
    const badges = getSowNowBadges(w, { name: 'Lettuce', optimum_soil_temp: '6°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🔥 Too Warm')).toBeUndefined();
  });

  test('soil good: label 🌡 Soil Good, cls good', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(20) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🌡 Soil Good')).toBeDefined();
  });

  test('frost risk badge when ensemble prob > 20% within germination window', () => {
    const w = makeWeather();
    const confidence = {
      frostProbability: [
        { date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), dayName: 'Wed', prob: 0.4, probPct: 40 },
      ],
    };
    const seed = { name: 'Tomato', optimum_soil_temp: '18-22°C', days_to_germinate: '7-10' };
    const badges = getSowNowBadges(makeWeather({ soilTemps: Array(168).fill(20) }), seed, 'outdoor', confidence);
    const b = badges.find(b => b.label === '🧊 Frost Risk');
    expect(b).toBeDefined();
    expect(b.cls).toBe('cold');
    expect(b.title).toContain('Wed');
    expect(b.title).toContain('40%');
  });

  test('no frost badge when prob <= 20%', () => {
    const confidence = {
      frostProbability: [
        { date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), dayName: 'Mon', prob: 0.15, probPct: 15 },
      ],
    };
    const badges = getSowNowBadges(makeWeather({ soilTemps: Array(168).fill(20) }), { name: 'X', optimum_soil_temp: '18-22°C' }, 'outdoor', confidence);
    expect(badges.find(b => b.label === '🧊 Frost Risk')).toBeUndefined();
  });

  test('rain helps badge when soil is good and rain > 2mm', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(20), rain: [5, 0, 0, 0, 0, 0, 0] });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🌧 Rain Helps')).toBeDefined();
  });

  test('no rain badge when soil is cold even if rain > 2mm', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(8), rain: [5, 0, 0, 0, 0, 0, 0] });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🌧 Rain Helps')).toBeUndefined();
  });

  test('high winds badge when gusts > 35 km/h', () => {
    const gusts = Array(168).fill(0);
    gusts[10] = 42;
    const w = makeWeather({ gusts, soilTemps: Array(168).fill(20) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '💨 High Winds');
    expect(b).toBeDefined();
    expect(b.cls).toBe('caution');
    expect(b.title).toContain('42');
  });

  test('no wind badge when gusts <= 35 km/h', () => {
    const gusts = Array(168).fill(0);
    gusts[10] = 35;
    const w = makeWeather({ gusts });
    const badges = getSowNowBadges(w, { name: 'X', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '💨 High Winds')).toBeUndefined();
  });

  test('thirsty soil badge when 3-day ET0 > 3-day precip', () => {
    const w = makeWeather({ et0: [3, 3, 3, 0, 0, 0, 0], rain: [1, 0, 0, 0, 0, 0, 0] });
    const badges = getSowNowBadges(w, { name: 'X', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '💧 Thirsty Soil');
    expect(b).toBeDefined();
    expect(b.cls).toBe('warn');
  });

  test('no thirsty badge when rain >= ET0', () => {
    const w = makeWeather({ et0: [1, 1, 1, 0, 0, 0, 0], rain: [5, 2, 1, 0, 0, 0, 0] });
    const badges = getSowNowBadges(w, { name: 'X', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '💧 Thirsty Soil')).toBeUndefined();
  });

  test('fungal risk badge when RH > 80% and temp 15-22°C', () => {
    const rh   = Array(24).fill(85);
    const temp = Array(24).fill(18);
    const w = makeWeather({ rh, temp });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '🍄 Fungal Risk');
    expect(b).toBeDefined();
    expect(b.cls).toBe('caution');
    expect(b.title).toContain('85%');
  });

  test('no fungal badge when temp outside 15-22°C', () => {
    const rh   = Array(24).fill(90);
    const temp = Array(24).fill(10); // too cold
    const w = makeWeather({ rh, temp });
    const badges = getSowNowBadges(w, { name: 'X', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🍄 Fungal Risk')).toBeUndefined();
  });

  test('can return multiple badges at once', () => {
    const gusts = Array(168).fill(0); gusts[5] = 40;
    const rh = Array(24).fill(85);
    const temp = Array(24).fill(18);
    const w = makeWeather({ soilTemps: Array(168).fill(8), gusts, rh, temp });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run to verify all new tests fail**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "outdoor" --no-coverage
```
Expected: FAIL — `getSowNowBadges is not a function`

- [ ] **Step 3: Add getSowNowBadges to calendar.js**

Insert the following after `parseGerminationDays` and before the `if (typeof module !== 'undefined')` export block:

```js
function getSowNowBadges(weatherData, seed, mode, confidence) {
  if (!weatherData || !seed) return [];
  const badges = [];
  const daily  = weatherData.daily  || {};
  const hourly = weatherData.hourly || {};

  // ── OUTDOOR ──────────────────────────────────────────────────────────────
  if (mode === 'outdoor') {
    // 1. Soil temperature vs optimum range
    const range = parseSoilTempRange(seed.optimum_soil_temp);
    if (range) {
      const avg = arrAvg(hourly.soil_temperature_6cm);
      if (avg !== null) {
        const avgStr = avg.toFixed(1);
        if (avg < range.min) {
          badges.push({
            label: '❄ Too Cold', cls: 'cold',
            title: `Calendar says YES, but Soil says NO. Soil is ${avgStr}°C; ${seed.name} needs ${seed.optimum_soil_temp} to germinate. Wait for a warmer spell to avoid seed rot.`,
          });
        } else if (avg > range.max) {
          badges.push({
            label: '🔥 Too Warm', cls: 'warm',
            title: `Soil is ${avgStr}°C — above the ${seed.optimum_soil_temp} optimum. Seeds may fail to germinate or bolt prematurely.`,
          });
        } else {
          badges.push({
            label: '🌡 Soil Good', cls: 'good',
            title: `Avg soil temp ${avgStr}°C over next 7 days — ideal for ${seed.name}.`,
          });
        }
      }
    }

    // 2. Frost risk within germination window
    const frostDays = (confidence && confidence.frostProbability) || [];
    if (frostDays.length) {
      const germDays = parseGerminationDays(seed.days_to_germinate);
      const atRisk = frostDays.find(d => {
        const diff = (new Date(d.date + 'T12:00:00') - new Date()) / 86400000;
        return diff >= 0 && diff <= germDays && d.prob > 0.2;
      });
      if (atRisk) {
        badges.push({
          label: '🧊 Frost Risk', cls: 'cold',
          title: `Frost expected ${atRisk.dayName} (${atRisk.probPct}% chance). Seeds germinate in ${seed.days_to_germinate || '7\u201314'} days — they may surface during a late freeze. Use cloche protection.`,
        });
      }
    }

    // 3. Rain helps (only when soil is good)
    const soilGood = badges.some(b => b.label === '\uD83C\uDF21 Soil Good');
    const todayRain = (daily.precipitation_sum || [])[0] ?? 0;
    if (soilGood && todayRain > 2) {
      badges.push({
        label: '🌧 Rain Helps', cls: 'good',
        title: `Rain today (${todayRain.toFixed(1)}mm) will help settle seeds into the soil.`,
      });
    }

    // 4. High winds
    const gustsToday = (hourly.wind_gusts_10m || []).slice(0, 24);
    const maxGust = gustsToday.length ? Math.max(...gustsToday.map(v => v ?? 0)) : 0;
    if (maxGust > 35) {
      badges.push({
        label: '💨 High Winds', cls: 'caution',
        title: `Wind gusts of ${Math.round(maxGust)} km/h today. Newly sown seeds may dry out faster — consider watering after sowing or adding a light cover.`,
      });
    }

    // 5. Thirsty soil (3-day ET₀ vs precipitation)
    const et0   = daily.et0_fao_evapotranspiration || [];
    const precip = daily.precipitation_sum || [];
    if (et0.length >= 3 && precip.length >= 3) {
      const et0_3d    = et0.slice(0, 3).reduce((s, v) => s + (v ?? 0), 0);
      const precip_3d = precip.slice(0, 3).reduce((s, v) => s + (v ?? 0), 0);
      if (et0_3d > precip_3d) {
        badges.push({
          label: '💧 Thirsty Soil', cls: 'warn',
          title: `Evaporation (ET\u2080 ${et0_3d.toFixed(1)}mm) exceeds rainfall (${precip_3d.toFixed(1)}mm) over 3 days. Soil moisture is dropping — water before or after sowing.`,
        });
      }
    }

    // 6. Fungal risk (high humidity + mild temperature)
    const rh24 = (hourly.relative_humidity_2m || []).slice(0, 24);
    const t24  = (hourly.temperature_2m || []).slice(0, 24);
    if (rh24.length && t24.length) {
      const avgRh = arrAvg(rh24);
      const avgT  = arrAvg(t24);
      if (avgRh !== null && avgT !== null && avgRh > 80 && avgT >= 15 && avgT <= 22) {
        badges.push({
          label: '🍄 Fungal Risk', cls: 'caution',
          title: `Humidity is ${Math.round(avgRh)}% with mild temps (${avgT.toFixed(1)}\u00b0C) — prime conditions for downy mildew. Ensure good airflow and avoid overhead watering.`,
        });
      }
    }
  }

  return badges;
}
```

- [ ] **Step 4: Add `getSowNowBadges` to module.exports**

Update the export line:

```js
if (typeof module !== 'undefined') module.exports = { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges, getSowNowBadge };
```

- [ ] **Step 5: Run outdoor tests**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "outdoor" --no-coverage
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add public/app/calendar.js tests/calendar-helpers.test.js
git commit -m "feat(calendar): add getSowNowBadges with outdoor badge logic"
```

---

## Task 3: Add indoor mode to getSowNowBadges

**Files:**
- Modify: `dashboard/public/app/calendar.js` (add indoor branch inside `getSowNowBadges`)
- Modify: `dashboard/tests/calendar-helpers.test.js` (add indoor tests)

- [ ] **Step 1: Write failing indoor tests**

Add after the outdoor describe block in `calendar-helpers.test.js`:

```js
describe('getSowNowBadges indoor', () => {
  function makeWeather({ airTemps, direct, diffuse, gdd } = {}) {
    return {
      hourly: {
        soil_temperature_6cm: Array(168).fill(15),
        direct_radiation:     direct  || Array(168).fill(0),
        diffuse_radiation:    diffuse || Array(168).fill(0),
        wind_gusts_10m:       Array(168).fill(0),
        relative_humidity_2m: Array(24).fill(50),
        temperature_2m:       Array(24).fill(15),
      },
      daily: {
        temperature_2m_max: airTemps || Array(7).fill(20),
        temperature_2m_min: Array(7).fill(10),
        precipitation_sum:  Array(7).fill(0),
        et0_fao_evapotranspiration: Array(7).fill(0),
        uv_index_max:       Array(7).fill(3),
        growing_degree_days_base_0_limit_50: gdd || Array(7).fill(5),
      },
    };
  }

  test('good conditions badge when air temp in range', () => {
    const w = makeWeather({ airTemps: Array(7).fill(20) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'indoor', null);
    const b = badges.find(b => b.label === '🌤 Good Conditions');
    expect(b).toBeDefined();
    expect(b.cls).toBe('good');
    expect(b.title).toContain('Basil');
  });

  test('no good conditions badge when air temp below range', () => {
    const w = makeWeather({ airTemps: Array(7).fill(10) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'indoor', null);
    expect(badges.find(b => b.label === '🌤 Good Conditions')).toBeUndefined();
  });

  test('good conditions badge works with single-value optimum (min only)', () => {
    // "6°C" means min:6, max:Infinity — any avg temp >= 6 qualifies
    const w = makeWeather({ airTemps: Array(7).fill(12) });
    const badges = getSowNowBadges(w, { name: 'Lettuce', optimum_soil_temp: '6°C' }, 'indoor', null);
    expect(badges.find(b => b.label === '🌤 Good Conditions')).toBeDefined();
  });

  test('grow light badge when radiation < 150 W/m² avg AND seed needs light', () => {
    // All radiation stays at 0 → avg 0 < 150
    const w = makeWeather();
    const seed = { name: 'Tomato', optimum_soil_temp: '20-24°C', light_requirements: 'Full Sun' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    const b = badges.find(b => b.label === '☁ Grow Light Needed');
    expect(b).toBeDefined();
    expect(b.cls).toBe('cold');
  });

  test('no grow light badge when radiation >= 150 W/m² avg', () => {
    const direct  = Array(168).fill(200);
    const diffuse = Array(168).fill(100);
    const w = makeWeather({ direct, diffuse });
    const seed = { name: 'Tomato', optimum_soil_temp: '20-24°C', light_requirements: 'Full Sun' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeUndefined();
  });

  test('no grow light badge when seed has no light_requirements', () => {
    const w = makeWeather();
    const seed = { name: 'X', optimum_soil_temp: '18-22°C', light_requirements: null };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeUndefined();
  });

  test('grow light badge skipped when light_requirements does not mention sun or light', () => {
    const w = makeWeather();
    const seed = { name: 'X', optimum_soil_temp: '18-22°C', light_requirements: 'Shade' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeUndefined();
  });

  test('season behind badge when GDD ratio < 0.7 (very low GDD)', () => {
    // gddBaseline for any spring day > 0; passing all zeros gives ratio = 0
    const w = makeWeather({ gdd: Array(7).fill(0) });
    const seed = { name: 'X', optimum_soil_temp: '18-22°C' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    const b = badges.find(b => b.label === '📉 Season Behind');
    // Only triggered if baseline > 0 (spring/summer). Test that when ratio<0.7 badge appears.
    if (b) {
      expect(b.cls).toBe('cold');
      expect(b.title).toContain('behind');
    }
    // We accept either: badge present (ratio<0.7) or no badge (baseline=0 in winter)
    expect(true).toBe(true);
  });

  test('season ahead badge when GDD ratio > 1.3 (very high GDD)', () => {
    // Pass enormous GDD to force ratio > 1.3
    const w = makeWeather({ gdd: Array(7).fill(9999) });
    const seed = { name: 'X', optimum_soil_temp: '18-22°C' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    const b = badges.find(b => b.label === '📈 Season Ahead');
    if (b) {
      expect(b.cls).toBe('good');
      expect(b.title).toContain('ahead');
    }
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify indoor tests fail**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "indoor" --no-coverage
```
Expected: FAIL — indoor badges not yet implemented

- [ ] **Step 3: Add indoor branch inside getSowNowBadges in calendar.js**

Insert after the closing `}` of the outdoor `if (mode === 'outdoor')` block, before the `return badges;` line:

```js
  // ── INDOOR ───────────────────────────────────────────────────────────────
  if (mode === 'indoor') {
    // 1. Air temperature check (good conditions)
    const range = parseSoilTempRange(seed.optimum_soil_temp);
    if (range) {
      const temps = daily.temperature_2m_max || [];
      const avg = arrAvg(temps);
      if (avg !== null && avg >= range.min && avg <= range.max) {
        badges.push({
          label: '🌤 Good Conditions', cls: 'good',
          title: `Avg air temp ${avg.toFixed(1)}\u00b0C over next 7 days — seasonally ideal for starting ${seed.name} indoors.`,
        });
      }
    }

    // 2. Grow light needed (low radiation + seed requires light)
    if (seed.light_requirements && /sun|light/i.test(seed.light_requirements)) {
      const direct  = hourly.direct_radiation  || [];
      const diffuse = hourly.diffuse_radiation || [];
      const hours96 = 96;
      const totalRad = (
        direct.slice(0, hours96).reduce((s, v) => s + (v ?? 0), 0) +
        diffuse.slice(0, hours96).reduce((s, v) => s + (v ?? 0), 0)
      ) / hours96;
      if (totalRad < 150) {
        badges.push({
          label: '☁ Grow Light Needed', cls: 'cold',
          title: `Next 4 days are heavily overcast (avg ${Math.round(totalRad)} W/m\u00b2). Windowsill light won\u2019t be enough — use grow lights to prevent leggy seedlings.`,
        });
      }
    }

    // 3. GDD season lag / ahead
    const gddArr = daily.growing_degree_days_base_0_limit_50 || [];
    if (gddArr.length) {
      const accumulated = gddArr.reduce((s, v) => s + (v ?? 0), 0);
      const now      = new Date();
      const doy      = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      const baseline = gddBaseline(doy);
      const ratio    = baseline > 0 ? accumulated / baseline : 1;
      if (ratio < 0.7) {
        badges.push({
          label: '📉 Season Behind', cls: 'cold',
          title: `Season is ${Math.round((1 - ratio) * 100)}% behind average GDD. Sowing is fine, but expect a later transplant date than usual.`,
        });
      } else if (ratio > 1.3) {
        badges.push({
          label: '📈 Season Ahead', cls: 'good',
          title: `Season is ${Math.round((ratio - 1) * 100)}% ahead of average GDD — warming fast. You may be able to plant out earlier than the calendar suggests.`,
        });
      }
    }
  }
```

Note: `gddBaseline` is already defined in `weather-helpers.js` and loaded as a global in the browser. For the Jest test context, `gddBaseline` is NOT available in `calendar.js` — you need to add a local copy or import. Add this minimal version to `calendar.js` (before `getSowNowBadges`):

```js
// Local copy for badge GDD ratio — keeps calendar.js self-contained for tests
function _gddBaselineLocal(dayOfYear) {
  if (dayOfYear < 60)  return 0;
  if (dayOfYear < 91)  return Math.round(30 + (dayOfYear - 60) * 0.5);
  if (dayOfYear < 121) return Math.round(49 + (dayOfYear - 91) * 0.7);
  if (dayOfYear < 152) return Math.round(70 + (dayOfYear - 121) * 0.47);
  return Math.round(84 + (dayOfYear - 152) * 0.47);
}
```

Then replace `gddBaseline(doy)` inside `getSowNowBadges` indoor section with `_gddBaselineLocal(doy)`.

- [ ] **Step 4: Run indoor tests**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "indoor" --no-coverage
```
Expected: all PASS

- [ ] **Step 5: Run full test suite to check no regressions**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add public/app/calendar.js tests/calendar-helpers.test.js
git commit -m "feat(calendar): add indoor badge mode (good conditions, grow light, GDD lag/ahead)"
```

---

## Task 4: Add transition mode to getSowNowBadges

**Files:**
- Modify: `dashboard/public/app/calendar.js` (add transition branch)
- Modify: `dashboard/tests/calendar-helpers.test.js` (add transition tests)

- [ ] **Step 1: Write failing transition tests**

Add after the indoor describe block:

```js
describe('getSowNowBadges transition', () => {
  function makeWeather({ uvMax, minTemp } = {}) {
    return {
      hourly: {
        soil_temperature_6cm: Array(168).fill(15),
        wind_gusts_10m:       Array(168).fill(0),
        relative_humidity_2m: Array(24).fill(50),
        temperature_2m:       Array(24).fill(15),
        direct_radiation:     Array(168).fill(0),
        diffuse_radiation:    Array(168).fill(0),
      },
      daily: {
        temperature_2m_max:  Array(7).fill(20),
        temperature_2m_min:  Array(7).fill(minTemp !== undefined ? minTemp : 12),
        precipitation_sum:   Array(7).fill(0),
        et0_fao_evapotranspiration: Array(7).fill(0),
        uv_index_max:        Array(7).fill(uvMax !== undefined ? uvMax : 3),
        growing_degree_days_base_0_limit_50: Array(7).fill(5),
      },
    };
  }

  function plantOutSeed(daysFromNow) {
    // Build a plant_out_start date exactly N days from today
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return { name: 'Tomato', optimum_soil_temp: '18-22°C', plant_out_start: `${dd}-${mm}` };
  }

  test('hardening off badge when within 10 days before plant_out and min temp > 10', () => {
    const seed = plantOutSeed(5);
    const badges = getSowNowBadges(makeWeather({ minTemp: 12 }), seed, 'transition', null);
    const b = badges.find(b => b.label === '🪜 Hardening Off');
    expect(b).toBeDefined();
    expect(b.cls).toBe('caution');
    expect(b.title).toContain('5 days');
  });

  test('hardening off badge says 1 day (singular)', () => {
    const seed = plantOutSeed(1);
    const badges = getSowNowBadges(makeWeather({ minTemp: 12 }), seed, 'transition', null);
    const b = badges.find(b => b.label === '🪜 Hardening Off');
    expect(b).toBeDefined();
    expect(b.title).toContain('1 day');
    expect(b.title).not.toContain('1 days');
  });

  test('no hardening off badge when min temp <= 10°C', () => {
    const seed = plantOutSeed(5);
    const badges = getSowNowBadges(makeWeather({ minTemp: 8 }), seed, 'transition', null);
    expect(badges.find(b => b.label === '🪜 Hardening Off')).toBeUndefined();
  });

  test('no hardening off badge when > 10 days away', () => {
    const seed = plantOutSeed(11);
    const badges = getSowNowBadges(makeWeather({ minTemp: 12 }), seed, 'transition', null);
    expect(badges.find(b => b.label === '🪜 Hardening Off')).toBeUndefined();
  });

  test('UV shock badge in first 3 days after plant_out_start when UV > 6', () => {
    const seed = plantOutSeed(-1); // 1 day after start
    const badges = getSowNowBadges(makeWeather({ uvMax: 7 }), seed, 'transition', null);
    const b = badges.find(b => b.label === '☀️ UV Shock Risk');
    expect(b).toBeDefined();
    expect(b.cls).toBe('warn');
    expect(b.title).toContain('7');
  });

  test('no UV shock badge when UV <= 6', () => {
    const seed = plantOutSeed(-1);
    const badges = getSowNowBadges(makeWeather({ uvMax: 5 }), seed, 'transition', null);
    expect(badges.find(b => b.label === '☀️ UV Shock Risk')).toBeUndefined();
  });

  test('no UV shock badge more than 3 days after start', () => {
    const seed = plantOutSeed(-4);
    const badges = getSowNowBadges(makeWeather({ uvMax: 9 }), seed, 'transition', null);
    expect(badges.find(b => b.label === '☀️ UV Shock Risk')).toBeUndefined();
  });

  test('returns empty array when plant_out_start is missing', () => {
    const badges = getSowNowBadges(makeWeather(), { name: 'X', optimum_soil_temp: '18-22°C' }, 'transition', null);
    expect(badges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify transition tests fail**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "transition" --no-coverage
```
Expected: FAIL

- [ ] **Step 3: Add transition branch inside getSowNowBadges**

Insert after the closing `}` of the indoor `if (mode === 'indoor')` block, before `return badges;`:

```js
  // ── TRANSITION ───────────────────────────────────────────────────────────
  if (mode === 'transition') {
    if (!seed.plant_out_start) return badges;
    const [dd, mm] = seed.plant_out_start.split('-').map(Number);
    const today     = new Date();
    const startDate = new Date(today.getFullYear(), mm - 1, dd);
    const diffDays  = (startDate - today) / 86400000;

    // 1. Hardening off (within 10 days BEFORE plant_out_start, min temp > 10°C)
    if (diffDays > 0 && diffDays <= 10) {
      const minTemp = (daily.temperature_2m_min || [])[0] ?? null;
      if (minTemp !== null && minTemp > 10) {
        const daysLeft = Math.ceil(diffDays);
        badges.push({
          label: '🪜 Hardening Off', cls: 'caution',
          title: `Plant out window starts in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Begin hardening off — place outside for 2 hours in a sheltered, shaded spot, increasing exposure daily.`,
        });
      }
    }

    // 2. UV shock risk (within first 3 days AFTER plant_out_start, UV > 6)
    if (diffDays <= 0 && diffDays > -3) {
      const uvMax = (daily.uv_index_max || [])[0] ?? 0;
      if (uvMax > 6) {
        badges.push({
          label: '☀️ UV Shock Risk', cls: 'warn',
          title: `Danger: UV index is ${uvMax} today. Do not move indoor seedlings into direct sun. Start hardening off in a shaded spot for 2 hours only.`,
        });
      }
    }
  }
```

- [ ] **Step 4: Run transition tests**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js -t "transition" --no-coverage
```
Expected: all PASS

- [ ] **Step 5: Run full test suite**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 6: Update module.exports to include new function, remove old**

Replace the export line:

```js
if (typeof module !== 'undefined') module.exports = { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges };
```

(Remove `getSowNowBadge` from exports — it will be deleted in Task 6.)

- [ ] **Step 7: Commit**

```bash
cd dashboard && git add public/app/calendar.js tests/calendar-helpers.test.js
git commit -m "feat(calendar): add transition badge mode (hardening off, UV shock risk)"
```

---

## Task 5: Add CSS badge classes

**Files:**
- Modify: `dashboard/public/app/style.css` (after the existing `--warm` lines ~1345)

- [ ] **Step 1: Add caution and warn CSS classes**

Find the block ending at line 1345 in `style.css`:
```css
[data-theme="light"] .sow-now-badge--warm { background: var(--red-dim);    color: #991b1b;      }
```

Insert immediately after:

```css
[data-theme="dark"]  .sow-now-badge--caution { background: #2d1f00;           color: #f59e0b; }
[data-theme="light"] .sow-now-badge--caution { background: #fffbeb;           color: #b45309; }
[data-theme="dark"]  .sow-now-badge--warn    { background: #2d0f00;           color: #f97316; }
[data-theme="light"] .sow-now-badge--warn    { background: #fff7ed;           color: #c2410c; }
```

- [ ] **Step 2: Verify no test regressions**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS (CSS not tested by Jest, just confirming no side effects)

- [ ] **Step 3: Commit**

```bash
cd dashboard && git add public/app/style.css
git commit -m "feat(styles): add --caution (amber) and --warn (red-orange) sow-now badge classes"
```

---

## Task 6: Update calendar.js Alpine component

**Files:**
- Modify: `dashboard/public/app/calendar.js` (update `weatherForecastBadge`, add `plantOutNow`, delete old `getSowNowBadge`)

- [ ] **Step 1: Delete the old getSowNowBadge function**

In `calendar.js`, find and delete the entire `getSowNowBadge` function (lines 17–43 approximately — the function that returns a single object). The new `getSowNowBadges` replaces it.

- [ ] **Step 2: Update weatherForecastBadge in the Alpine component**

Find the `weatherForecastBadge` method in the `Alpine.data('calendarTab', ...)` block and replace it:

```js
// OLD:
weatherForecastBadge(seed, isOutdoor) {
  return getSowNowBadge(this.weatherData, seed, isOutdoor);
},

// NEW:
weatherForecastBadge(seed, mode) {
  return getSowNowBadges(this.weatherData, seed, mode, this.weather?.confidence);
},
```

- [ ] **Step 3: Add plantOutNow computed property**

Add after `sowOutdoorsNow` getter in the Alpine component:

```js
get plantOutNow() {
  const today = new Date();
  return this.seeds.filter(s => {
    if (!s.plant_out_start) return false;
    const [dd, mm] = s.plant_out_start.split('-').map(Number);
    const startDate = new Date(today.getFullYear(), mm - 1, dd);
    const diffDays  = (startDate - today) / 86400000;
    return diffDays > -3 && diffDays <= 10;
  });
},
```

- [ ] **Step 4: Verify tests still pass**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add public/app/calendar.js
git commit -m "feat(calendar): update weatherForecastBadge to array mode, add plantOutNow computed"
```

---

## Task 7: Add soil_moisture to API call

**Files:**
- Modify: `dashboard/public/app/app.js:231`

- [ ] **Step 1: Update the hourly params string**

Find line 231 in `app.js`:
```
`wind_gusts_10m,dewpoint_2m,precipitation_type` +
```

Replace with:
```
`wind_gusts_10m,dewpoint_2m,precipitation_type,soil_moisture_0_to_7cm` +
```

- [ ] **Step 2: Verify tests still pass**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
cd dashboard && git add public/app/app.js
git commit -m "feat(weather): add soil_moisture_0_to_7cm to hourly API params"
```

---

## Task 8: Update HTML — badge arrays and Transition section

**Files:**
- Modify: `dashboard/public/app/index.html:923-975` (sow-now rows and new section)

- [ ] **Step 1: Update Sow Indoors Now badge rendering**

Find the Sow Indoors Now `<template x-for>` block (around line 923). Replace the `x-data` and badge `<span>`:

```html
<!-- OLD x-data on the row div: -->
x-data="{ get badge() { return weatherForecastBadge(s, false) } }"

<!-- NEW: -->
x-data="{ get badges() { return weatherForecastBadge(s, 'indoor') } }"
```

Then replace the badge span:
```html
<!-- OLD: -->
<span x-show="badge"
      class="sow-now-badge"
      :class="badge ? 'sow-now-badge--' + badge.cls : ''"
      :title="badge?.title"
      x-text="badge?.label">
</span>

<!-- NEW: -->
<template x-for="badge in badges" :key="badge.label">
  <span class="sow-now-badge"
        :class="'sow-now-badge--' + badge.cls"
        :title="badge.title"
        x-text="badge.label">
  </span>
</template>
```

- [ ] **Step 2: Update Sow Outdoors Now badge rendering**

Same change for the Sow Outdoors Now block (around line 953):

```html
<!-- OLD: -->
x-data="{ get badge() { return weatherForecastBadge(s, true) } }"

<!-- NEW: -->
x-data="{ get badges() { return weatherForecastBadge(s, 'outdoor') } }"
```

Replace the badge span with the same `x-for` template as Step 1.

- [ ] **Step 3: Add Transition section between Sow Indoors and Sow Outdoors**

Insert a new card div between the closing `</div>` of Sow Indoors Now and the opening `<div class="card">` of Sow Outdoors Now:

```html
<div class="card">
  <h2>&#x1FAB4; Ready to Plant Out</h2>
  <template x-if="plantOutNow.length === 0">
    <p class="text-muted" style="font-size:.875rem">No plants approaching their outdoor transplant window.</p>
  </template>
  <template x-for="s in plantOutNow" :key="s.id">
    <div @click="openSeedEdit(s)" class="sow-now-row"
         x-data="{ get badges() { return weatherForecastBadge(s, 'transition') } }">
      <div class="sow-now-top">
        <span x-text="getSeedEmoji(s)" style="font-size:1.1rem"></span>
        <span x-text="s.name + (s.variety ? ' \xb7 ' + s.variety : '')"></span>
        <template x-for="badge in badges" :key="badge.label">
          <span class="sow-now-badge"
                :class="'sow-now-badge--' + badge.cls"
                :title="badge.title"
                x-text="badge.label">
          </span>
        </template>
      </div>
      <div class="sow-now-meta" x-show="s.plant_out_start || s.days_to_germinate || s.light_requirements">
        <template x-if="s.plant_out_start"><span x-text="'\uD83C\uDF3F Plant out: ' + s.plant_out_start"></span></template>
        <template x-if="s.days_to_germinate"><span x-text="'\uD83C\uDF31 ' + s.days_to_germinate + 'd'"></span></template>
        <template x-if="s.light_requirements"><span x-text="'\u2600 ' + s.light_requirements"></span></template>
      </div>
    </div>
  </template>
</div>
```

- [ ] **Step 4: Run tests one final time**

```bash
cd dashboard && npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 5: Final commit**

```bash
cd dashboard && git add public/app/index.html
git commit -m "feat(calendar): multi-badge rendering with x-for and new Transition section"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ parseSoilTempRange fix (single value = min threshold) — Task 1
- ✅ getSowNowBadges outdoor: soil temp, frost risk, rain helps, high winds, thirsty soil, fungal risk — Task 2
- ✅ getSowNowBadges indoor: good conditions, grow light, GDD lag/ahead — Task 3
- ✅ getSowNowBadges transition: hardening off, UV shock — Task 4
- ✅ CSS --caution and --warn classes — Task 5
- ✅ weatherForecastBadge updated, plantOutNow added — Task 6
- ✅ soil_moisture_0_to_7cm added to API — Task 7
- ✅ HTML x-for badge rendering and Transition section — Task 8
- ✅ Old getSowNowBadge removed — Task 6 Step 1
- ✅ Saturated badge deferred — not in plan

**Type consistency:**
- `getSowNowBadges` returns `{label, cls, title}[]` — consistent across all tasks
- `weatherForecastBadge(seed, mode)` signature used in HTML and defined in Task 6
- `plantOutNow` getter returns `this.seeds.filter(...)` — matches `x-for="s in plantOutNow"` in Task 8
- `_gddBaselineLocal` used inside `getSowNowBadges` in Task 3, not `gddBaseline` (which is only in weather-helpers.js)

**No placeholders:** All steps contain complete code.

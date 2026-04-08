# Calendar Sow Now — Enhanced Seed Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the "Sow Indoors Now" and "Sow Outdoors Now" calendar sections to show rich seed metadata and a weather forecast badge derived from the root Alpine `weatherData`.

**Architecture:** Pure helper functions (`parseSoilTempRange`, `arrAvg`, `getSowNowBadge`) sit at the top of `calendar.js` outside Alpine so they can be unit-tested. The `calendarTab` Alpine component gains a thin `weatherForecastBadge(seed, isOutdoor)` method that delegates to `getSowNowBadge(this.weatherData, seed, isOutdoor)`. The HTML templates are expanded to two-line cards using new CSS classes.

**Tech Stack:** Alpine.js 3 (browser, no build step), vanilla CSS custom properties, Jest 29 + Node.js for unit tests of pure helpers.

---

## File Map

| File | Change |
|---|---|
| `dashboard/public/app/style.css` | Add `.sow-now-row`, `.sow-now-top`, `.sow-now-meta`, `.sow-now-badge`, theme-aware badge modifier classes |
| `dashboard/public/app/calendar.js` | Add pure helpers at top; add `weatherForecastBadge` method to `calendarTab`; add conditional CommonJS export for testing |
| `dashboard/public/app/index.html` | Replace sowIndoorsNow and sowOutdoorsNow `<template x-for>` blocks |
| `dashboard/tests/calendar-helpers.test.js` | New Jest test file for pure helper functions |

---

## Task 1: Add CSS classes for enhanced rows

**Files:**
- Modify: `dashboard/public/app/style.css` (append before the `/* ── Responsive` block at line 960)

- [ ] **Step 1: Add the CSS**

Open `dashboard/public/app/style.css`. Find the line that reads `/* ── Responsive` (around line 960). Insert the following block immediately before it:

```css
/* ── Sow Now enhanced rows ──────────────────────────────────────── */
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

.sow-now-top {
  display: flex;
  align-items: center;
  gap: .5rem;
}

.sow-now-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .375rem;
  font-size: .72rem;
  color: var(--text-3);
  padding-left: 1.6rem;
}

.sow-now-badge {
  margin-left: auto;
  font-size: .7rem;
  padding: .1rem .45rem;
  border-radius: 9999px;
  white-space: nowrap;
}
[data-theme="dark"]  .sow-now-badge--good { background: #0b2510;           color: var(--green); }
[data-theme="dark"]  .sow-now-badge--cold { background: var(--blue-dim);   color: var(--blue);  }
[data-theme="dark"]  .sow-now-badge--warm { background: var(--red-dim);    color: var(--red);   }
[data-theme="light"] .sow-now-badge--good { background: var(--green-dim);  color: #166534;      }
[data-theme="light"] .sow-now-badge--cold { background: var(--blue-dim);   color: #1e40af;      }
[data-theme="light"] .sow-now-badge--warm { background: var(--red-dim);    color: #991b1b;      }
```

- [ ] **Step 2: Verify no syntax errors**

Open the app in a browser (or run `node app.js` and visit the page). Confirm the page loads without console CSS errors. No visual change is expected yet — the classes have no elements to attach to.

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/style.css
git commit -m "style: add sow-now-row, meta, and badge CSS classes"
```

---

## Task 2: Add pure helper functions to calendar.js

**Files:**
- Modify: `dashboard/public/app/calendar.js`
- Create: `dashboard/tests/calendar-helpers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/tests/calendar-helpers.test.js` with this content:

```js
// We require calendar.js which will conditionally export helpers via CommonJS.
// Alpine is not present in Node — the module export guard handles this.
const { parseSoilTempRange, arrAvg, getSowNowBadge } = require('../public/app/calendar.js');

describe('parseSoilTempRange', () => {
  test('parses range with hyphen like "18-22°C"', () => {
    expect(parseSoilTempRange('18-22°C')).toEqual({ min: 18, max: 22 });
  });
  test('parses range with en-dash like "10–15"', () => {
    expect(parseSoilTempRange('10–15')).toEqual({ min: 10, max: 15 });
  });
  test('parses decimal range like "15.5-20.5°C"', () => {
    expect(parseSoilTempRange('15.5-20.5°C')).toEqual({ min: 15.5, max: 20.5 });
  });
  test('single value applies ±3 tolerance', () => {
    expect(parseSoilTempRange('20°C')).toEqual({ min: 17, max: 23 });
  });
  test('returns null for empty string', () => {
    expect(parseSoilTempRange('')).toBeNull();
  });
  test('returns null for null', () => {
    expect(parseSoilTempRange(null)).toBeNull();
  });
  test('returns null for non-numeric text like "warm"', () => {
    expect(parseSoilTempRange('warm')).toBeNull();
  });
});

describe('arrAvg', () => {
  test('returns mean of array', () => {
    expect(arrAvg([10, 20, 30])).toBeCloseTo(20);
  });
  test('filters out null values', () => {
    expect(arrAvg([10, null, 30])).toBeCloseTo(20);
  });
  test('filters out undefined values', () => {
    expect(arrAvg([10, undefined, 30])).toBeCloseTo(20);
  });
  test('returns null for empty array', () => {
    expect(arrAvg([])).toBeNull();
  });
  test('returns null when all values are null', () => {
    expect(arrAvg([null, null, null])).toBeNull();
  });
});

describe('getSowNowBadge', () => {
  function makeWeather({ soilTemps, airTemps }) {
    return {
      hourly: { soil_temperature_6cm: soilTemps },
      daily:  { temperature_2m_max:   airTemps  },
    };
  }

  test('returns null when weatherData is null', () => {
    expect(getSowNowBadge(null, { optimum_soil_temp: '18-22°C' }, true)).toBeNull();
  });

  test('returns null when optimum_soil_temp is empty', () => {
    const w = makeWeather({ soilTemps: [20], airTemps: [20] });
    expect(getSowNowBadge(w, { optimum_soil_temp: '' }, true)).toBeNull();
  });

  test('returns null when optimum_soil_temp is missing', () => {
    const w = makeWeather({ soilTemps: [20], airTemps: [20] });
    expect(getSowNowBadge(w, {}, true)).toBeNull();
  });

  // ── Outdoor (isOutdoor = true) ──────────────────────────────────
  test('outdoor: good badge when avg soil temp is inside range', () => {
    const w = makeWeather({ soilTemps: [20, 20, 20], airTemps: [20] });
    const r = getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, true);
    expect(r).not.toBeNull();
    expect(r.cls).toBe('good');
    expect(r.label).toBe('🌡 Soil Good');
    expect(r.title).toContain('20.0°C');
    expect(r.title).toContain('ideal');
  });

  test('outdoor: cold badge when avg soil temp is below range', () => {
    const w = makeWeather({ soilTemps: [8, 8, 8], airTemps: [8] });
    const r = getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, true);
    expect(r.cls).toBe('cold');
    expect(r.label).toBe('❄ Too Cold');
    expect(r.title).toContain('below');
  });

  test('outdoor: warm badge when avg soil temp is above range', () => {
    const w = makeWeather({ soilTemps: [28, 28, 28], airTemps: [28] });
    const r = getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, true);
    expect(r.cls).toBe('warm');
    expect(r.label).toBe('🔥 Too Warm');
    expect(r.title).toContain('above');
  });

  test('outdoor: returns null when soil_temperature_6cm array is missing', () => {
    const w = { hourly: {}, daily: { temperature_2m_max: [20] } };
    expect(getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, true)).toBeNull();
  });

  test('outdoor: returns null when all soil temps are null', () => {
    const w = makeWeather({ soilTemps: [null, null], airTemps: [20] });
    expect(getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, true)).toBeNull();
  });

  // ── Indoor (isOutdoor = false) ──────────────────────────────────
  test('indoor: good badge when avg air temp is inside range', () => {
    const w = makeWeather({ soilTemps: [5], airTemps: [20, 21, 19] });
    const r = getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, false);
    expect(r).not.toBeNull();
    expect(r.cls).toBe('good');
    expect(r.label).toBe('🌤 Good Conditions');
    expect(r.title).toContain('indoor');
  });

  test('indoor: returns null when avg air temp is below range (no negative badge)', () => {
    const w = makeWeather({ soilTemps: [5], airTemps: [5, 6] });
    expect(getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, false)).toBeNull();
  });

  test('indoor: returns null when avg air temp is above range (no negative badge)', () => {
    const w = makeWeather({ soilTemps: [30], airTemps: [35, 36] });
    expect(getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, false)).toBeNull();
  });

  test('indoor: returns null when temperature_2m_max is missing', () => {
    const w = { hourly: { soil_temperature_6cm: [20] }, daily: {} };
    expect(getSowNowBadge(w, { optimum_soil_temp: '18-22°C' }, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js --no-coverage 2>&1 | head -20
```

Expected: error like `Cannot find module '../public/app/calendar.js'` or `parseSoilTempRange is not a function` — confirms the test file loads but helpers don't exist yet.

- [ ] **Step 3: Add helpers to calendar.js**

Open `dashboard/public/app/calendar.js`. Replace the entire file content with:

```js
// ── Pure helpers — exported for Jest when running in Node ─────────
function parseSoilTempRange(str) {
  if (!str) return null;
  const range = str.match(/(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const single = str.match(/(\d+(?:\.\d+)?)/);
  if (single) { const v = parseFloat(single[1]); return { min: v - 3, max: v + 3 }; }
  return null;
}

function arrAvg(arr) {
  const valid = (arr || []).filter(v => v != null && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function getSowNowBadge(weatherData, seed, isOutdoor) {
  if (!weatherData) return null;
  const range = parseSoilTempRange(seed.optimum_soil_temp);
  if (!range) return null;
  const { min, max } = range;

  if (isOutdoor) {
    const temps = weatherData.hourly?.soil_temperature_6cm;
    if (!temps) return null;
    const avg = arrAvg(temps);
    if (avg === null) return null;
    const avgStr = avg.toFixed(1);
    if (avg >= min && avg <= max)
      return { label: '🌡 Soil Good', cls: 'good', title: `Avg soil temp ${avgStr}°C over next 7 days — ideal for this seed` };
    if (avg < min)
      return { label: '❄ Too Cold', cls: 'cold', title: `Avg soil temp ${avgStr}°C — below the ${min}–${max}°C optimum` };
    return   { label: '🔥 Too Warm', cls: 'warm', title: `Avg soil temp ${avgStr}°C — above the ${min}–${max}°C optimum` };
  } else {
    const temps = weatherData.daily?.temperature_2m_max;
    if (!temps) return null;
    const avg = arrAvg(temps);
    if (avg === null) return null;
    if (avg >= min && avg <= max)
      return { label: '🌤 Good Conditions', cls: 'good', title: `Avg air temp ${avg.toFixed(1)}°C over next 7 days — seasonally ideal for starting indoors` };
    return null;
  }
}

// Allow Jest to require this file in Node (Alpine is absent there)
if (typeof module !== 'undefined') module.exports = { parseSoilTempRange, arrAvg, getSowNowBadge };

// ── Alpine component ──────────────────────────────────────────────
function monthInWindow(month, start, end) {
  // month: 1-12, start/end: "DD-MM" strings
  // Returns true if any day of `month` falls within [start, end]
  if (!start) return false;
  const s = parseInt(start.slice(3, 5)); // DD-MM: month is chars 3-4
  const e = end ? parseInt(end.slice(3, 5)) : 12;
  if (s <= e) return month >= s && month <= e;
  // year-crossing window (e.g. Oct-Mar): month >= s OR month <= e
  return month >= s || month <= e;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('calendarTab', () => ({
    calYear: new Date().getFullYear(),
    hoveredSeed: null,

    get sowIndoorsNow() {
      const m = new Date().getMonth() + 1;
      return this.seeds.filter(s => monthInWindow(m, s.sow_indoors_start, s.sow_indoors_end));
    },

    get sowOutdoorsNow() {
      const m = new Date().getMonth() + 1;
      return this.seeds.filter(s => monthInWindow(m, s.sow_outdoors_start, s.sow_outdoors_end));
    },

    get calendarSeeds() {
      return [...this.seeds].sort((a, b) => {
        const t = (a.type||'').localeCompare(b.type||'');
        return t !== 0 ? t : a.name.localeCompare(b.name);
      });
    },

    // Returns inline style for a spanning Gantt-style bar.
    // row 0=indoor, 1=outdoor, 2=plantout, 3=harvest
    barStyle(start, end, row) {
      if (!start) return 'display:none';
      const s = parseInt(start.slice(3, 5));
      const e = end ? parseInt(end.slice(3, 5)) : 12;
      const actualEnd = (e >= s) ? e : 12; // clip year-crossing at Dec
      const left = ((s - 1) / 12 * 100).toFixed(2);
      const width = ((actualEnd - s + 1) / 12 * 100).toFixed(2);
      const top = row * 7 + 3;
      return `position:absolute;left:${left}%;width:${width}%;top:${top}px;height:5px;border-radius:2px`;
    },

    prevYear() { this.calYear--; },
    nextYear() { this.calYear++; },
    typeEmoji(type) { return { herb: '\u{1F33F}', vegetable: '\u{1F955}', flower: '\u{1F338}' }[type] || ''; },

    tooltipText(seed) {
      const parts = [];
      if (seed.days_to_germinate) parts.push(`Germinates: ${seed.days_to_germinate} days`);
      if (seed.optimum_soil_temp) parts.push(`Soil temp: ${seed.optimum_soil_temp}`);
      if (seed.optimum_soil_type) parts.push(`Soil type: ${seed.optimum_soil_type}`);
      if (seed.light_requirements) parts.push(`Light: ${seed.light_requirements}`);
      if (seed.growing_instructions) parts.push(seed.growing_instructions);
      return parts.join(' · ') || 'No growing info';
    },

    weatherForecastBadge(seed, isOutdoor) {
      return getSowNowBadge(this.weatherData, seed, isOutdoor);
    },
  }));
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd dashboard && npx jest tests/calendar-helpers.test.js --no-coverage
```

Expected output:
```
PASS tests/calendar-helpers.test.js
  parseSoilTempRange
    ✓ parses range with hyphen like "18-22°C"
    ✓ parses range with en-dash like "10–15"
    ✓ parses decimal range like "15.5-20.5°C"
    ✓ single value applies ±3 tolerance
    ✓ returns null for empty string
    ✓ returns null for null
    ✓ returns null for non-numeric text like "warm"
  arrAvg
    ✓ returns mean of array
    ✓ filters out null values
    ✓ filters out undefined values
    ✓ returns null for empty array
    ✓ returns null when all values are null
  getSowNowBadge
    ✓ returns null when weatherData is null
    ... (all pass)

Tests: 22 passed
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/app/calendar.js dashboard/tests/calendar-helpers.test.js
git commit -m "feat: add weather forecast badge helpers for sow-now calendar sections"
```

---

## Task 3: Update HTML templates for Sow Indoors Now

**Files:**
- Modify: `dashboard/public/app/index.html` (around line 515)

The current sowIndoorsNow template (lines 515–520) is:
```html
<template x-for="s in sowIndoorsNow" :key="s.id">
  <div @click="openSeedEdit(s)" style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid var(--border);cursor:pointer">
    <span x-text="typeEmoji(s.type)" style="font-size:1.1rem"></span>
    <span x-text="s.name + (s.variety ? ' · ' + s.variety : '')"></span>
  </div>
</template>
```

- [ ] **Step 1: Replace the sowIndoorsNow template**

Find the `<template x-for="s in sowIndoorsNow"` block and replace it entirely with:

```html
<template x-for="s in sowIndoorsNow" :key="s.id">
  <div @click="openSeedEdit(s)" class="sow-now-row">
    <div class="sow-now-top">
      <span x-text="typeEmoji(s.type)" style="font-size:1.1rem"></span>
      <span x-text="s.name + (s.variety ? ' · ' + s.variety : '')"></span>
      <span x-show="weatherForecastBadge(s, false)"
            class="sow-now-badge"
            :class="weatherForecastBadge(s, false) ? 'sow-now-badge--' + weatherForecastBadge(s, false).cls : ''"
            :title="weatherForecastBadge(s, false)?.title"
            x-text="weatherForecastBadge(s, false)?.label">
      </span>
    </div>
    <div class="sow-now-meta" x-show="s.purchase_year || s.sow_by_year || s.days_to_germinate || s.optimum_soil_temp || s.optimum_soil_type || s.light_requirements">
      <template x-if="s.purchase_year"><span x-text="'📅 ' + s.purchase_year"></span></template>
      <template x-if="s.sow_by_year"><span x-text="'Sow by: ' + s.sow_by_year"></span></template>
      <template x-if="s.days_to_germinate"><span x-text="'🌱 ' + s.days_to_germinate + 'd'"></span></template>
      <template x-if="s.optimum_soil_temp"><span x-text="'🌡 ' + s.optimum_soil_temp"></span></template>
      <template x-if="s.optimum_soil_type"><span x-text="'🪨 ' + s.optimum_soil_type"></span></template>
      <template x-if="s.light_requirements"><span x-text="'☀ ' + s.light_requirements"></span></template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify in browser**

Start the app (`node app.js` from `dashboard/`) and open the Calendar tab. The "Sow Indoors Now" section should show:
- Each seed as a two-line row
- Line 1: emoji + name · variety, with a coloured badge on the right if `weatherData` has loaded and `optimum_soil_temp` is set
- Line 2: metadata chips for any non-empty fields
- Clicking still opens the seed edit modal
- Seeds with no metadata fields show only line 1 (meta row is hidden via `x-show`)
- With no weather data loaded (or API failure) no badge appears

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/index.html
git commit -m "feat: expand Sow Indoors Now rows with seed metadata and weather badge"
```

---

## Task 4: Update HTML templates for Sow Outdoors Now

**Files:**
- Modify: `dashboard/public/app/index.html` (around line 528)

The current sowOutdoorsNow template (lines 528–533) is:
```html
<template x-for="s in sowOutdoorsNow" :key="s.id">
  <div @click="openSeedEdit(s)" style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid var(--border);cursor:pointer">
    <span x-text="typeEmoji(s.type)" style="font-size:1.1rem"></span>
    <span x-text="s.name + (s.variety ? ' · ' + s.variety : '')"></span>
  </div>
</template>
```

- [ ] **Step 1: Replace the sowOutdoorsNow template**

Find the `<template x-for="s in sowOutdoorsNow"` block and replace it entirely with:

```html
<template x-for="s in sowOutdoorsNow" :key="s.id">
  <div @click="openSeedEdit(s)" class="sow-now-row">
    <div class="sow-now-top">
      <span x-text="typeEmoji(s.type)" style="font-size:1.1rem"></span>
      <span x-text="s.name + (s.variety ? ' · ' + s.variety : '')"></span>
      <span x-show="weatherForecastBadge(s, true)"
            class="sow-now-badge"
            :class="weatherForecastBadge(s, true) ? 'sow-now-badge--' + weatherForecastBadge(s, true).cls : ''"
            :title="weatherForecastBadge(s, true)?.title"
            x-text="weatherForecastBadge(s, true)?.label">
      </span>
    </div>
    <div class="sow-now-meta" x-show="s.purchase_year || s.sow_by_year || s.days_to_germinate || s.optimum_soil_temp || s.optimum_soil_type || s.light_requirements">
      <template x-if="s.purchase_year"><span x-text="'📅 ' + s.purchase_year"></span></template>
      <template x-if="s.sow_by_year"><span x-text="'Sow by: ' + s.sow_by_year"></span></template>
      <template x-if="s.days_to_germinate"><span x-text="'🌱 ' + s.days_to_germinate + 'd'"></span></template>
      <template x-if="s.optimum_soil_temp"><span x-text="'🌡 ' + s.optimum_soil_temp"></span></template>
      <template x-if="s.optimum_soil_type"><span x-text="'🪨 ' + s.optimum_soil_type"></span></template>
      <template x-if="s.light_requirements"><span x-text="'☀ ' + s.light_requirements"></span></template>
    </div>
  </div>
</template>
```

Note: the only difference from Task 3 is `isOutdoor = true` — all four `weatherForecastBadge(s, true)` calls.

- [ ] **Step 2: Verify in browser**

On the Calendar tab, check "Sow Outdoors Now":
- Same two-line layout as indoor section
- Outdoor badge uses soil temp (`weatherData.hourly.soil_temperature_6cm`) — can show "❄ Too Cold", "🌡 Soil Good", or "🔥 Too Warm" depending on 7-day soil forecast
- Indoor section still shows "🌤 Good Conditions" or nothing (no negative badge)
- Both sections: no badge if `weatherData` is null, seed has no `optimum_soil_temp`, or parse fails

- [ ] **Step 3: Run full test suite to confirm nothing broken**

```bash
cd dashboard && npx jest --no-coverage
```

Expected: all tests pass including the existing `api-routes.test.js` and `db.test.js`.

- [ ] **Step 4: Final commit**

```bash
git add dashboard/public/app/index.html
git commit -m "feat: expand Sow Outdoors Now rows with seed metadata and outdoor soil forecast badge"
```

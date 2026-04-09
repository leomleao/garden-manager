# Weather Widget Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the overview weather widget to show a Google-style 7-day interactive strip, five gardening-specific smart insights, and enhanced alert copy — all driven by additional Open-Meteo hourly/daily variables.

**Architecture:** Extract all pure weather computation into a new `weather-helpers.js` file (testable via CommonJS export guard, same pattern as `calendar.js`). Keep `fetchWeather()` in `app.js` as a thin orchestrator that calls helpers and assigns results to Alpine state. The HTML widget is fully replaced; CSS gains new classes for the strip, insights, and section labels.

**Tech Stack:** Alpine.js v3 (reactive getters), Open-Meteo API, Jest (server-side unit tests via CommonJS export guard), vanilla CSS custom properties.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `dashboard/public/app/weather-helpers.js` | **Create** | All pure weather computation functions |
| `dashboard/tests/weather-helpers.test.js` | **Create** | Jest unit tests for helpers |
| `dashboard/public/app/app.js` | **Modify** | Extended state shape, thin `fetchWeather()`, new `selectForecastDay()` method, new `selectedForecast` getter |
| `dashboard/public/app/index.html` | **Modify** | Replace weather widget block (~lines 70–121) with 6-layer widget |
| `dashboard/public/app/style.css` | **Modify** | Add new weather widget CSS classes after line 844 |

---

## Task 1: Create `weather-helpers.js` with pure functions

**Files:**
- Create: `dashboard/public/app/weather-helpers.js`

- [ ] **Step 1: Create the file**

```js
// dashboard/public/app/weather-helpers.js
// Pure weather computation helpers — no DOM, no Alpine, no fetch.
// CommonJS export at bottom allows Jest unit testing.

// ── Icon / description from WMO weather code ─────────────────────────────────

function codeToIcon(code) {
  if (code === 0)       return '☀️';
  if (code <= 3)        return '⛅';
  if (code <= 48)       return '🌫️';
  if (code <= 67)       return '🌧️';
  if (code <= 77)       return '🌨️';
  return '⛈️';
}

function codeToDesc(code) {
  if (code === 0)       return 'Clear';
  if (code <= 3)        return 'Partly cloudy';
  if (code <= 48)       return 'Foggy';
  if (code <= 67)       return 'Rainy';
  if (code <= 77)       return 'Snowy';
  return 'Stormy';
}

// ── Soil status label ─────────────────────────────────────────────────────────

function soilStatus(soilTemp) {
  if (soilTemp == null)    return '';
  if (soilTemp < 10)       return 'Dormant / Too Cold';
  if (soilTemp <= 18)      return 'Cool Season (Peas, Lettuce)';
  return 'Warm Season (Tomatoes, Peppers)';
}

// ── Watering status from water balance ────────────────────────────────────────

function wateringFromBalance(precipSum, et0, uvMax) {
  const balance = (precipSum ?? 0) - (et0 ?? 0);
  if (balance < -2 && (uvMax ?? 0) >= 5) return { status: 'High Water Need',      sub: 'Dry & sunny' };
  if (balance < 0)                        return { status: 'Adequate — monitor',   sub: '' };
  return                                         { status: 'Well Watered',          sub: 'Rain covers deficit' };
}

// ── Build 7-day forecast array ────────────────────────────────────────────────
// Reads: d.daily.*, d.hourly.soil_temperature_6cm
// Returns array of 7 day objects.

function buildForecastDays(d) {
  const daily  = d.daily;
  const hourly = d.hourly;
  return daily.time.map((t, i) => {
    const midday   = i * 24 + 12;
    const soilTemp = hourly.soil_temperature_6cm[midday] != null
      ? Math.round(hourly.soil_temperature_6cm[midday] * 10) / 10
      : null;
    const hi  = Math.round(daily.temperature_2m_max[i]);
    const lo  = Math.round(daily.temperature_2m_min[i]);
    const rain = daily.precipitation_sum[i] ?? 0;
    const uvMax = daily.uv_index_max[i] ?? 0;
    const et0   = daily.et0_fao_evapotranspiration[i] ?? 0;
    const code  = daily.weather_code[i];
    const watering = wateringFromBalance(rain, et0, uvMax);
    return {
      date:     t,
      name:     new Date(t + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }),
      fullName: new Date(t + 'T12:00:00').toLocaleDateString('en', { weekday: 'long' }),
      icon:     codeToIcon(code),
      desc:     codeToDesc(code),
      hi, lo, rain, uvMax,
      soilTemp,
      soilSub:   soilStatus(soilTemp),
      watering:  watering.status,
      waterSub:  watering.sub,
      frost:    lo <= 2,
      uvHigh:   uvMax >= 6,
    };
  });
}

// ── Work Window ───────────────────────────────────────────────────────────────
// Scans hourly precipitation_probability from currentHour for ≥3h block <20%.
// Returns { startHour, endHour, day:'today'|'tomorrow' } or null.

function findWorkWindow(hourly, currentHour) {
  const probs = hourly.precipitation_probability;
  if (!probs) return null;

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const startSearch = dayOffset === 0 ? currentHour : 24;
    const endSearch   = dayOffset === 0 ? 24 : 48;
    let runStart = -1, runLen = 0;
    for (let h = startSearch; h < endSearch; h++) {
      if ((probs[h] ?? 100) < 20) {
        if (runStart === -1) runStart = h;
        runLen++;
        if (runLen >= 3) {
          return {
            startHour: runStart % 24,
            endHour:   (runStart + runLen - 1) % 24,
            day:       dayOffset === 0 ? 'today' : 'tomorrow',
          };
        }
      } else {
        runStart = -1; runLen = 0;
      }
    }
  }
  return null;
}

// ── Disease risk ──────────────────────────────────────────────────────────────
// Returns { highRisk, hours, maxHumidity, leafWetness }

function computeDiseaseRisk(hourly) {
  const rh  = hourly.relative_humidity_2m   || [];
  const t   = hourly.temperature_2m         || [];
  const lw  = hourly.leaf_wetness_probability || [];
  let count = 0;
  for (let h = 0; h < 24; h++) {
    if ((rh[h] ?? 0) > 80 && (t[h] ?? 0) >= 10 && (t[h] ?? 0) <= 20) count++;
  }
  const maxHumidity   = rh.slice(0, 24).reduce((m, v) => Math.max(m, v ?? 0), 0);
  const leafWetness   = lw.length
    ? Math.round(lw.slice(0, 24).reduce((s, v) => s + (v ?? 0), 0) / 24)
    : 0;
  return { highRisk: count >= 6, hours: count, maxHumidity: Math.round(maxHumidity), leafWetness };
}

// ── Greenhouse ventilation alert ──────────────────────────────────────────────
// Returns { day, ventHour, peakRad, tMax, zoneNames } or null.
// Only runs if zones contains greenhouse or polytunnel types.

function computeGreenhouseAlert(hourly, daily, zones) {
  const relevant = (zones || []).filter(z => ['greenhouse', 'polytunnel'].includes(z.type));
  if (!relevant.length) return null;
  const rad = hourly.direct_radiation || [];
  for (let dayIdx = 0; dayIdx < 2; dayIdx++) {
    const slice   = rad.slice(dayIdx * 24, dayIdx * 24 + 24);
    const peakRad = Math.max(...slice.map(v => v ?? 0));
    const peakH   = slice.findIndex(v => (v ?? 0) === peakRad);
    const tMax    = daily.temperature_2m_max[dayIdx] ?? 20;
    if (peakRad > 400 && tMax < 15) {
      return {
        day:       dayIdx === 0 ? 'today' : 'tomorrow',
        ventHour:  Math.max(6, (peakH - 2 + 24) % 24),
        peakRad:   Math.round(peakRad),
        tMax:      Math.round(tMax),
        zoneNames: relevant.map(z => z.name).join(' · '),
      };
    }
  }
  return null;
}

// ── Pot check (wind + ET₀) ────────────────────────────────────────────────────
// Returns { maxGust, et0, peakHour } or null.

function computePotCheck(hourly, daily) {
  const gusts = hourly.wind_gusts_10m || [];
  const et0   = daily.et0_fao_evapotranspiration[0] ?? 0;
  const today  = gusts.slice(0, 24).map(v => v ?? 0);
  const maxGust = Math.max(...today);
  if (maxGust > 30 && et0 > 1.5) {
    const peakHour = today.indexOf(maxGust);
    return { maxGust: Math.round(maxGust), et0: Math.round(et0 * 10) / 10, peakHour };
  }
  return null;
}

// ── Season gauge (GDD) ────────────────────────────────────────────────────────
// Approximate cumulative GDD (base 5°C) seasonal baseline for ~56°N.
// Returns { accumulated, baseline, ratio, daysDiff }

function gddBaseline(dayOfYear) {
  if (dayOfYear < 60)  return 0;
  if (dayOfYear < 91)  return Math.round((dayOfYear - 60) * 0.6);
  if (dayOfYear < 121) return Math.round(18 + (dayOfYear - 91) * 2.4);
  if (dayOfYear < 152) return Math.round(90 + (dayOfYear - 121) * 2.3);
  return Math.round(161 + (dayOfYear - 152) * 2.2);
}

function computeSeasonGauge(daily) {
  const gddArr = daily.growing_degree_days_base_5_limit_30 || [];
  const accumulated = Math.round(gddArr.reduce((s, v) => s + (v ?? 0), 0));
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const baseline = gddBaseline(dayOfYear);
  const ratio    = baseline > 0 ? accumulated / baseline : 1;
  // Each ~0.5 GDD ≈ 1 calendar day at this latitude in spring
  const daysDiff = baseline > 0 ? Math.round((accumulated - baseline) / 0.5) : 0;
  return { accumulated, baseline, ratio: Math.min(ratio, 1.5), daysDiff };
}

// ── Compute insights array ────────────────────────────────────────────────────
// Returns array of insight objects for display. Only includes insights with
// conditions met.

function computeInsights(d, zones) {
  const insights = [];
  const currentHour = new Date().getHours();

  // 1. Work Window
  const win = findWorkWindow(d.hourly, currentHour);
  if (win) {
    const fmt  = h => `${String(h).padStart(2,'0')}:00`;
    const len  = ((win.endHour - win.startHour + 24) % 24) + 1;
    insights.push({
      type:  'work',
      icon:  '🪟',
      label: 'Work Window',
      title: `Clear gap ${win.day} ${fmt(win.startHour)}–${fmt((win.endHour + 1) % 24 || 24)}`,
      desc:  `${len}-hour dry window with <20% rain chance. Good time for outdoor planting or bed prep.`,
      meta:  `Precipitation probability stays below 20% through ${fmt((win.endHour + 1) % 24 || 24)}`,
    });
  }

  // 2. Disease Pressure
  const disease = computeDiseaseRisk(d.hourly);
  if (disease.highRisk) {
    insights.push({
      type:  'disease',
      icon:  '🍄',
      label: 'Disease Pressure · High',
      title: 'Fungal risk elevated in the next 24h',
      desc:  `Humidity >${disease.maxHumidity}% with 10–20°C for ${disease.hours}h — ideal blight conditions. Avoid wetting foliage; ensure good airflow in enclosed spaces.`,
      meta:  `Humidity ${disease.maxHumidity}% · Leaf wetness ${disease.leafWetness}%`,
    });
  }

  // 3. Greenhouse / Ventilation (zone-conditional)
  const gh = computeGreenhouseAlert(d.hourly, d.daily, zones);
  if (gh) {
    insights.push({
      type:  'glass',
      icon:  '🌡️',
      label: 'Greenhouse · Ventilation',
      title: `Open vents by ${String(gh.ventHour).padStart(2,'0')}:00 ${gh.day}`,
      desc:  `Air temp only ${gh.tMax}°C but direct radiation peaks at ${gh.peakRad} W/m² — greenhouse can spike 15–20°C above ambient. Heat stress risk for seedlings.`,
      meta:  `Applies to: ${gh.zoneNames}`,
    });
  }

  // 4. Pot Check (Wind)
  const pot = computePotCheck(d.hourly, d.daily);
  if (pot) {
    const time = pot.peakHour < 12 ? 'this morning' : 'this afternoon';
    insights.push({
      type:  'wind',
      icon:  '💨',
      label: 'Pot Check · Wind',
      title: `Check hanging baskets ${time}`,
      desc:  `Gusts to ${pot.maxGust} km/h. Even with rain, ET₀ is ${pot.et0}mm — windward side of pots and baskets may have dried out.`,
      meta:  `ET₀ today: ${pot.et0}mm · Max gusts: ${pot.maxGust} km/h`,
    });
  }

  // 5. Season Gauge — always shown
  const gauge = computeSeasonGauge(d.daily);
  const absDiff = Math.abs(gauge.daysDiff);
  const dirLabel = gauge.daysDiff < -3 ? `~${absDiff} days behind average`
                 : gauge.daysDiff > 3  ? `~${absDiff} days ahead of average`
                 : 'on track with average';
  insights.push({
    type:     'season',
    icon:     '📅',
    label:    'Season Progress · GDD',
    title:    `Spring is ${dirLabel}`,
    desc:     gauge.daysDiff < -3
      ? `Accumulated ${gauge.accumulated} GDD (base 5°C) vs typical ${gauge.baseline} GDD. Conditions are equivalent to ~${absDiff} days earlier in the season — hold off on tender seeds.`
      : gauge.daysDiff > 3
      ? `Accumulated ${gauge.accumulated} GDD (base 5°C) vs typical ${gauge.baseline} GDD — season is running warm.`
      : `Accumulated ${gauge.accumulated} GDD (base 5°C) — right on track with the seasonal average.`,
    meta:     `${gauge.accumulated} GDD accumulated · typical ${gauge.baseline} GDD by this date`,
    gddRatio: gauge.ratio,
  });

  return insights;
}

// ── Compute alerts array ──────────────────────────────────────────────────────
// Returns array of { level, text, body } objects.
// Enhanced over the original: frost uses dewpoint, alerts have body text.

function computeAlerts(d, soilTemp) {
  const alerts = [];
  const daily   = d.daily;
  const hourly  = d.hourly;
  const dayNames = daily.time.map(t =>
    new Date(t + 'T12:00:00').toLocaleDateString('en', { weekday: 'long' })
  );

  // Frost
  const frostIdx = daily.temperature_2m_min.findIndex(t => t <= 2);
  if (frostIdx !== -1) {
    const dewSlice = (hourly.dewpoint_2m || []).slice(frostIdx * 24, frostIdx * 24 + 24);
    const minDew   = dewSlice.length ? Math.min(...dewSlice) : 0;
    const frostType = minDew < 0 ? 'dry frost' : 'soft frost';
    const body      = minDew < 0
      ? 'Dewpoint below 0°C — dehydrating frost, more damaging to leaves. Cover tender plants the evening before.'
      : 'Dewpoint above 0°C — soft frost or heavy dew. Cover dahlias and tender seedlings to be safe.';
    alerts.push({
      level: 'red',
      text:  `Frost Alert · ${dayNames[frostIdx]}, ${Math.round(daily.temperature_2m_min[frostIdx])}°C (${frostType})`,
      body,
    });
  }

  // Severe weather
  const severeIdx = daily.weather_code.findIndex(c => c >= 96);
  if (severeIdx !== -1) {
    alerts.push({
      level: 'red',
      text:  `Severe Weather: ${dayNames[severeIdx]}`,
      body:  'Avoid outdoor work on this day.',
    });
  }

  // High wind
  const windIdx = daily.weather_code.findIndex(c => c >= 85 && c <= 95);
  if (windIdx !== -1) {
    alerts.push({
      level: 'amber',
      text:  `High Winds: ${dayNames[windIdx]}`,
      body:  'Stake tall plants and secure polytunnel covers.',
    });
  }

  // High UV today
  if ((daily.uv_index_max[0] ?? 0) >= 7) {
    alerts.push({
      level: 'amber',
      text:  'High UV today — avoid midday watering',
      body:  'Water early morning or evening to avoid leaf scorch.',
    });
  }

  // Soil too cold
  if (soilTemp != null && soilTemp < 10) {
    alerts.push({
      level: 'amber',
      text:  'Soil too cold for sowing this week',
      body:  `${soilTemp}°C at 6cm — wait until 10°C for cool-season crops, 15°C for tomatoes.`,
    });
  }

  // Watering (green)
  const totalRain = daily.precipitation_sum.reduce((s, v) => s + (v ?? 0), 0);
  if (totalRain > 10) {
    const firstDryIdx = daily.precipitation_sum.findIndex((r, i) => i > 0 && (r ?? 0) < 1);
    const skipUntil   = firstDryIdx > 0 ? dayNames[firstDryIdx] : 'next week';
    alerts.push({
      level: 'green',
      text:  'No irrigation needed this week',
      body:  `${Math.round(totalRain)}mm forecast — skip watering until ${skipUntil} at earliest.`,
    });
  } else if (!alerts.some(a => a.level === 'red' || a.level === 'amber')) {
    if (soilTemp != null && soilTemp >= 10) {
      alerts.push({ level: 'green', text: 'Good conditions for sowing', body: '' });
    }
  }

  return alerts;
}

// ── Action text ───────────────────────────────────────────────────────────────
// Derives a single action sentence from the computed state.

function computeActionText(alerts, soilTemp, workWindow) {
  const topLevel = alerts[0]?.level;
  const topText  = alerts[0]?.text || '';
  if (topLevel === 'red' && topText.includes('Frost') && topText.includes('today')) {
    return 'Protect tender plants tonight';
  }
  if (topLevel === 'red' && topText.includes('Frost')) {
    return `Cover tender plants before ${alerts[0].text.split('·')[1]?.trim().split(',')[0] || 'the frost'}`;
  }
  if (topLevel === 'red') return 'Severe weather forecast — avoid outdoor work';
  if (workWindow)         return `Work window available ${workWindow.day} — ${workWindow.startHour}:00–${workWindow.endHour + 1}:00`;
  if (soilTemp != null && soilTemp < 10) return 'Too cold for sowing — focus on indoor propagation';
  if (soilTemp != null && soilTemp > 18) return 'Ideal conditions for warm-season crops';
  if (soilTemp != null && soilTemp >= 10) return 'Good day for sowing peas or lettuce';
  return 'Good day for general garden maintenance';
}

// ── CommonJS export (for Jest tests) ─────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
    buildForecastDays, findWorkWindow, computeDiseaseRisk,
    computeGreenhouseAlert, computePotCheck, computeSeasonGauge,
    gddBaseline, computeInsights, computeAlerts, computeActionText,
  };
}
```

- [ ] **Step 2: Commit skeleton**

```bash
cd dashboard
git add public/app/weather-helpers.js
git commit -m "feat(weather): add weather-helpers.js pure computation module"
```

---

## Task 2: Write tests for `weather-helpers.js`

**Files:**
- Create: `dashboard/tests/weather-helpers.test.js`

- [ ] **Step 1: Write the test file**

```js
// dashboard/tests/weather-helpers.test.js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeInsights, computeAlerts,
} = require('../public/app/weather-helpers');

// ── codeToIcon / codeToDesc ───────────────────────────────────────────────────
describe('codeToIcon', () => {
  test('code 0 is clear', () => expect(codeToIcon(0)).toBe('☀️'));
  test('code 2 is partly cloudy', () => expect(codeToIcon(2)).toBe('⛅'));
  test('code 45 is foggy', () => expect(codeToIcon(45)).toBe('🌫️'));
  test('code 61 is rainy', () => expect(codeToIcon(61)).toBe('🌧️'));
  test('code 71 is snowy', () => expect(codeToIcon(71)).toBe('🌨️'));
  test('code 99 is stormy', () => expect(codeToIcon(99)).toBe('⛈️'));
});

describe('codeToDesc', () => {
  test('code 0 → Clear', () => expect(codeToDesc(0)).toBe('Clear'));
  test('code 80 → Stormy', () => expect(codeToDesc(80)).toBe('Stormy'));
});

// ── soilStatus ────────────────────────────────────────────────────────────────
describe('soilStatus', () => {
  test('null returns empty string', () => expect(soilStatus(null)).toBe(''));
  test('below 10 is dormant', () => expect(soilStatus(8)).toBe('Dormant / Too Cold'));
  test('10 is cool season', () => expect(soilStatus(10)).toBe('Cool Season (Peas, Lettuce)'));
  test('18 is still cool season', () => expect(soilStatus(18)).toBe('Cool Season (Peas, Lettuce)'));
  test('above 18 is warm season', () => expect(soilStatus(19)).toBe('Warm Season (Tomatoes, Peppers)'));
});

// ── wateringFromBalance ───────────────────────────────────────────────────────
describe('wateringFromBalance', () => {
  test('large deficit with high UV → High Water Need', () =>
    expect(wateringFromBalance(0, 5, 6)).toEqual({ status: 'High Water Need', sub: 'Dry & sunny' }));
  test('small deficit → Adequate monitor', () =>
    expect(wateringFromBalance(2, 3, 3)).toEqual({ status: 'Adequate — monitor', sub: '' }));
  test('positive balance → Well Watered', () =>
    expect(wateringFromBalance(5, 2, 2)).toEqual({ status: 'Well Watered', sub: 'Rain covers deficit' }));
});

// ── findWorkWindow ────────────────────────────────────────────────────────────
describe('findWorkWindow', () => {
  function makeHourly(probs) {
    return { precipitation_probability: probs };
  }

  test('finds 3h window today', () => {
    const probs = Array(168).fill(80);
    probs[14] = 10; probs[15] = 5; probs[16] = 10; // 3h block at 14:00
    const result = findWorkWindow(makeHourly(probs), 12);
    expect(result).toEqual({ startHour: 14, endHour: 16, day: 'today' });
  });

  test('skips hours before currentHour', () => {
    const probs = Array(168).fill(80);
    probs[8] = 5; probs[9] = 5; probs[10] = 5; // window at 8–10, before currentHour 12
    const result = findWorkWindow(makeHourly(probs), 12);
    expect(result).toBeNull();
  });

  test('finds window tomorrow if none today', () => {
    const probs = Array(168).fill(80);
    probs[26] = 10; probs[27] = 10; probs[28] = 10; // tomorrow 02:00–04:00
    const result = findWorkWindow(makeHourly(probs), 20);
    expect(result).toEqual({ startHour: 2, endHour: 4, day: 'tomorrow' });
  });

  test('returns null when no window exists', () => {
    const probs = Array(168).fill(80);
    expect(findWorkWindow(makeHourly(probs), 0)).toBeNull();
  });

  test('2h block is not enough', () => {
    const probs = Array(168).fill(80);
    probs[14] = 10; probs[15] = 10; // only 2h
    expect(findWorkWindow(makeHourly(probs), 12)).toBeNull();
  });
});

// ── computeDiseaseRisk ────────────────────────────────────────────────────────
describe('computeDiseaseRisk', () => {
  function makeHourly({ rh, temp, lw } = {}) {
    return {
      relative_humidity_2m:    rh  || Array(24).fill(50),
      temperature_2m:          temp || Array(24).fill(15),
      leaf_wetness_probability: lw  || Array(24).fill(0),
    };
  }

  test('high risk when 6+ hours meet criteria', () => {
    const rh   = Array(24).fill(85);  // all hours >80%
    const temp = Array(24).fill(15);  // all hours 10–20°C
    const result = computeDiseaseRisk(makeHourly({ rh, temp }));
    expect(result.highRisk).toBe(true);
    expect(result.hours).toBe(24);
  });

  test('not high risk when <6 hours meet criteria', () => {
    const rh   = Array(24).fill(50);
    rh[0] = 85; rh[1] = 85; rh[2] = 85; // only 3 hours
    const temp = Array(24).fill(15);
    const result = computeDiseaseRisk(makeHourly({ rh, temp }));
    expect(result.highRisk).toBe(false);
  });

  test('not triggered when temp outside 10–20°C', () => {
    const rh   = Array(24).fill(90);
    const temp = Array(24).fill(5);  // too cold
    const result = computeDiseaseRisk(makeHourly({ rh, temp }));
    expect(result.highRisk).toBe(false);
  });
});

// ── computeGreenhouseAlert ────────────────────────────────────────────────────
describe('computeGreenhouseAlert', () => {
  const zones = [{ name: 'Greenhouse', type: 'greenhouse' }];

  function makeData(rad, tMax) {
    const radiation = Array(168).fill(0);
    radiation.forEach((_, i) => { radiation[i] = 0; });
    rad.forEach(({ h, v }) => { radiation[h] = v; });
    return {
      hourly: { direct_radiation: radiation },
      daily:  { temperature_2m_max: [tMax, tMax, tMax, tMax, tMax, tMax, tMax] },
    };
  }

  test('triggers when radiation >400 and tMax <15', () => {
    const d = makeData([{ h: 12, v: 500 }], 10);
    const result = computeGreenhouseAlert(d.hourly, d.daily, zones);
    expect(result).not.toBeNull();
    expect(result.zoneNames).toBe('Greenhouse');
    expect(result.peakRad).toBe(500);
  });

  test('no alert when tMax >=15 even with high radiation', () => {
    const d = makeData([{ h: 12, v: 500 }], 16);
    expect(computeGreenhouseAlert(d.hourly, d.daily, zones)).toBeNull();
  });

  test('no alert when no greenhouse/polytunnel zones', () => {
    const d = makeData([{ h: 12, v: 500 }], 10);
    expect(computeGreenhouseAlert(d.hourly, d.daily, [])).toBeNull();
    expect(computeGreenhouseAlert(d.hourly, d.daily, [{ name: 'Bed', type: 'outdoor' }])).toBeNull();
  });
});

// ── computePotCheck ───────────────────────────────────────────────────────────
describe('computePotCheck', () => {
  function makeData(maxGust, et0) {
    const gusts = Array(168).fill(0);
    gusts[14] = maxGust;
    return {
      hourly: { wind_gusts_10m: gusts },
      daily:  { et0_fao_evapotranspiration: [et0] },
    };
  }

  test('triggers when gusts >30 and ET0 >1.5', () => {
    const result = computePotCheck(makeData(38, 2.0).hourly, makeData(38, 2.0).daily);
    expect(result).not.toBeNull();
    expect(result.maxGust).toBe(38);
    expect(result.peakHour).toBe(14);
  });

  test('no alert when gusts low', () => {
    expect(computePotCheck(makeData(20, 2.0).hourly, makeData(20, 2.0).daily)).toBeNull();
  });

  test('no alert when ET0 low', () => {
    expect(computePotCheck(makeData(38, 1.0).hourly, makeData(38, 1.0).daily)).toBeNull();
  });
});

// ── gddBaseline ───────────────────────────────────────────────────────────────
describe('gddBaseline', () => {
  test('returns 0 before day 60', () => expect(gddBaseline(50)).toBe(0));
  test('returns 0 on day 60', () => expect(gddBaseline(60)).toBe(0));
  test('returns positive by April (day 99)', () => expect(gddBaseline(99)).toBeGreaterThan(0));
  test('increases over time', () => expect(gddBaseline(121)).toBeGreaterThan(gddBaseline(99)));
});

// ── computeAlerts — frost dewpoint classification ─────────────────────────────
describe('computeAlerts frost type', () => {
  function makeData(minTemp, dewpoints) {
    const dews = Array(168).fill(2);
    dewpoints.forEach((v, i) => { dews[i] = v; });
    return {
      daily: {
        time:                      ['2026-04-14'],
        temperature_2m_min:        [minTemp],
        temperature_2m_max:        [5],
        precipitation_sum:         [0],
        uv_index_max:              [2],
        et0_fao_evapotranspiration:[1],
        weather_code:              [61],
      },
      hourly: {
        dewpoint_2m: dews,
        soil_temperature_6cm: Array(168).fill(7),
      },
    };
  }

  test('frost with dewpoint <0 is classified as dry frost', () => {
    const d = makeData(1, Array(24).fill(-2));
    const alerts = computeAlerts(d, 7);
    expect(alerts[0].text).toContain('dry frost');
    expect(alerts[0].body).toContain('dehydrating');
  });

  test('frost with dewpoint >=0 is classified as soft frost', () => {
    const d = makeData(1, Array(24).fill(1));
    const alerts = computeAlerts(d, 7);
    expect(alerts[0].text).toContain('soft frost');
    expect(alerts[0].body).toContain('above 0°C');
  });
});
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
cd dashboard && npm test -- --testPathPattern=weather-helpers
```

Expected output: all tests pass (green).

- [ ] **Step 3: Commit**

```bash
git add tests/weather-helpers.test.js
git commit -m "test(weather): add unit tests for weather-helpers.js"
```

---

## Task 3: Update `app.js` — extend state, rewrite `fetchWeather()`, add `selectForecastDay()`

**Files:**
- Modify: `dashboard/public/app/app.js`

- [ ] **Step 1: Add `<script>` tag for `weather-helpers.js` in `index.html`**

In `dashboard/public/app/index.html`, the script tags are in `<head>` with `defer`. Find the line:

```html
  <script src="app.js" defer></script>
```

Add the helpers script **directly before** it:

```html
  <script src="weather-helpers.js" defer></script>
  <script src="app.js" defer></script>
```

- [ ] **Step 2: Extend the `weather` initial state in `app()`**

In `app.js`, find and replace the `weather:` initial value (currently around line 18–24):

```js
// OLD:
    weather: {
      temp: null, desc: '', icon: '',
      alerts: [],
      soil: { temp: null, status: '' },
      uv: null, rain: null,
      wateringStatus: '', actionText: '',
    },
```

```js
// NEW:
    weather: {
      temp: null, desc: '', icon: '',
      alerts: [],
      soil: { temp: null, status: '' },
      uv: null, rain: null,
      wateringStatus: '', actionText: '',
      forecast:    [],   // 7-day array built by buildForecastDays()
      selectedDay: 0,    // index of day shown in stats bar
      insights:    [],   // gardening insight objects
      statsFlash:  false, // triggers CSS flash animation on day change
    },
```

- [ ] **Step 3: Add `selectedForecast` getter after `filteredTasks` getter (around line 294)**

Find `get filteredTasks()` and add this getter after its closing `},`:

```js
    get selectedForecast() {
      return this.weather.forecast[this.weather.selectedDay] || {};
    },
```

- [ ] **Step 4: Add `selectForecastDay()` method after `selectedForecast` getter**

```js
    selectForecastDay(i) {
      this.weather.selectedDay = i;
      this.weather.statsFlash  = false;
      this.$nextTick(() => {
        this.weather.statsFlash = true;
        setTimeout(() => { this.weather.statsFlash = false; }, 350);
      });
    },
```

- [ ] **Step 5: Replace the entire `fetchWeather()` method**

Find the method starting at `async fetchWeather() {` and replace everything through its closing `},` with:

```js
    async fetchWeather() {
      const lat = this.config.latitude;
      const lng = this.config.longitude;
      if (!lat || !lng) return;
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,weathercode` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,` +
          `uv_index_max,et0_fao_evapotranspiration,growing_degree_days_base_5_limit_30` +
          `&hourly=soil_temperature_6cm,temperature_2m,precipitation_probability,precipitation,` +
          `relative_humidity_2m,leaf_wetness_probability,direct_radiation,wind_gusts_10m,dewpoint_2m` +
          `&timezone=auto&forecast_days=7`
        );
        const d = await r.json();
        if (!d.current || !d.daily || !d.hourly) return;
        this.weatherData = d;

        // Current conditions
        this.weather.temp = Math.round(d.current.temperature_2m);
        const code = d.current.weathercode;
        this.weather.icon = codeToIcon(code);
        this.weather.desc = codeToDesc(code);

        // 7-day forecast
        this.weather.forecast = buildForecastDays(d);

        // Stats for today (selectedDay stays at 0 on fresh load)
        const today = this.weather.forecast[0];
        this.weather.uv            = today.uvMax;
        this.weather.rain          = today.rain;
        this.weather.wateringStatus = today.watering;
        this.weather.soil.temp     = today.soilTemp;
        this.weather.soil.status   = today.soilSub;

        // Smart insights (greenhouse check uses loaded zones)
        this.weather.insights = computeInsights(d, this.zones);

        // Alerts
        this.weather.alerts = computeAlerts(d, today.soilTemp);

        // Action text
        const workWin = this.weather.insights.find(i => i.type === 'work') || null;
        this.weather.actionText = computeActionText(
          this.weather.alerts, today.soilTemp, workWin
        );

      } catch(e) { /* weather is optional */ }
    },
```

- [ ] **Step 6: Run existing tests to ensure nothing broke**

```bash
cd dashboard && npm test
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/app/app.js public/app/index.html
git commit -m "feat(weather): extend state, wire helpers into fetchWeather, add selectForecastDay"
```

---

## Task 4: Add CSS for new widget sections

**Files:**
- Modify: `dashboard/public/app/style.css`

- [ ] **Step 1: Insert new CSS after line 844 (after `.weather-action--green`)**

Find the comment `/* ── Calendar tab` and insert the following block **directly before** it:

```css
/* ── Weather widget — section labels ─────────────────────────────────── */
.weather-section-label {
  font-size: .58rem;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-3);
  padding: .5rem 1.125rem 0;
  display: flex;
  align-items: center;
  gap: .5rem;
}
.weather-section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
  opacity: .5;
}

/* ── Weather widget — header H/L ─────────────────────────────────────── */
.weather-header-right {
  margin-left: auto;
  text-align: right;
}
.weather-header-day {
  font-size: .88rem;
  font-weight: 600;
}
.weather-header-hilo {
  font-size: .72rem;
  color: var(--text-2);
}

/* ── Weather widget — stats bar (replaces old .weather-stats) ─────────── */
.weather-stats {
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 0;
  gap: 0;
}
.weather-stat {
  display: flex;
  flex-direction: column;
  gap: .125rem;
  padding: .625rem .875rem;
  border-right: 1px solid var(--border);
}
.weather-stat:last-child { border-right: none; }
.weather-stat-label {
  font-size: .58rem;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--text-3);
  margin-bottom: 2px;
}
.weather-stat-value {
  font-size: .92rem;
  font-weight: 600;
}
.weather-stat-sub {
  font-size: .65rem;
  color: var(--text-3);
}
@keyframes weather-flash {
  0%   { opacity: .3; }
  100% { opacity: 1; }
}
.weather-stats--flash { animation: weather-flash .3s ease-out; }

/* ── Weather widget — 7-day strip ────────────────────────────────────── */
.weather-7day {
  border-top: 1px solid var(--border);
  display: flex;
  overflow-x: auto;
  padding: .375rem .25rem;
}
.weather-day-cell {
  flex: 1;
  min-width: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: .5rem .25rem;
  border-radius: .5rem;
  cursor: pointer;
  transition: background .12s;
}
.weather-day-cell:hover { background: color-mix(in srgb, var(--text-1) 4%, transparent); }
.weather-day-cell--active {
  background: color-mix(in srgb, var(--green) 10%, transparent);
  outline: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
}
.wdc-name {
  font-size: .6rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-3);
}
.wdc-name--today { color: var(--green); font-weight: 700; }
.wdc-icon { font-size: 1.1rem; }
.wdc-hilo { font-size: .75rem; font-weight: 600; }
.wdc-lo   { font-weight: 400; color: var(--text-2); }
.wdc-rain { font-size: .58rem; color: #5a9ab5; }
.wdc-soil { font-size: .55rem; color: var(--text-3); }
.wdc-tag  { font-size: .48rem; border-radius: 3px; padding: 1px 4px; margin-top: 1px; }
.wdc-tag--frost { background: color-mix(in srgb, #6a88d0 20%, transparent); color: #7a9dd0; }
.wdc-tag--uv    { background: color-mix(in srgb, var(--yellow-ochre) 20%, transparent); color: var(--yellow-ochre); }

/* ── Weather widget — gardening insights ─────────────────────────────── */
.weather-insights { border-top: 1px solid var(--border); }

.weather-insight {
  display: flex;
  align-items: flex-start;
  gap: .625rem;
  padding: .625rem 1.125rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-left: 3px solid transparent;
  font-size: .78rem;
}
.weather-insight:first-child { border-top: none; }
.weather-insight-icon   { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
.weather-insight-body   { flex: 1; }
.weather-insight-label  {
  font-size: .56rem; text-transform: uppercase; letter-spacing: .08em;
  font-weight: 600; margin-bottom: 1px;
}
.weather-insight-title  { font-weight: 600; font-size: .78rem; margin-bottom: 2px; }
.weather-insight-desc   { color: var(--text-2); font-size: .71rem; line-height: 1.4; }
.weather-insight-meta   { font-size: .6rem; color: var(--text-3); margin-top: 3px; font-style: italic; }

/* GDD progress bar */
.gdd-bar { display: flex; align-items: center; gap: .5rem; margin-top: 4px; }
.gdd-track {
  flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;
}
.gdd-fill { height: 100%; background: #8a70b0; border-radius: 2px; transition: width .4s; }
.gdd-labels { display: flex; justify-content: space-between; font-size: .52rem; color: var(--text-3); margin-top: 2px; }

/* Insight colour variants */
.weather-insight--work    { border-left-color: #5a9ab5; }
.weather-insight--work    .weather-insight-label { color: #5a9ab5; }
.weather-insight--disease { border-left-color: var(--yellow-ochre); }
.weather-insight--disease .weather-insight-label { color: var(--yellow-ochre); }
.weather-insight--glass   { border-left-color: #c4a030; }
.weather-insight--glass   .weather-insight-label { color: #c4a030; }
.weather-insight--wind    { border-left-color: #7a90a0; }
.weather-insight--wind    .weather-insight-label { color: #7a90a0; }
.weather-insight--season  { border-left-color: #8a70b0; }
.weather-insight--season  .weather-insight-label { color: #8a70b0; }

/* ── Weather widget — alerts (updated to support .body text) ─────────── */
/* (existing .weather-alert classes are kept; alert layout updated in HTML) */
.weather-alert-title { font-weight: 600; display: block; font-size: .78rem; }
.weather-alert-body  { font-size: .71rem; color: var(--text-2); }

/* ── Responsive tweaks ───────────────────────────────────────────────── */
@media (max-width: 600px) {
  .weather-stats { grid-template-columns: repeat(2, 1fr); }
  .weather-stat:nth-child(2) { border-right: none; }
  .weather-day-cell { min-width: 44px; }
}
```

- [ ] **Step 2: Remove the old `.weather-stats` and `.weather-stat` blocks that are being replaced**

The old block starting at the original line 802 used different padding. Find and delete this old block (it was the old 4-column grid that had `padding: .75rem 1.125rem` — the new CSS above replaces it with border-separated tiles). Search for the old block:

```css
/* -- Stats grid ----------------------------------------------------------- */
.weather-stats {
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: .75rem 1.125rem;
  gap: .5rem;
}

.weather-stat {
  display: flex;
  flex-direction: column;
  gap: .125rem;
}

.weather-stat-label {
  font-size: .65rem;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--text-3);
}

.weather-stat-value {
  font-size: 1rem;
  font-weight: 600;
}

.weather-stat-sub {
  font-size: .7rem;
  color: var(--text-3);
}
```

And delete it (the new block added in Step 1 replaces it).

Also delete the old responsive tweak for `.weather-stats` near the bottom of the file:
```css
  .weather-stats { grid-template-columns: repeat(2, 1fr); }
```
(It will be replaced by the responsive block added in Step 1.)

- [ ] **Step 3: Commit**

```bash
git add public/app/style.css
git commit -m "feat(weather): add CSS for 7-day strip, insights, section labels, and updated stats bar"
```

---

## Task 5: Replace the weather widget HTML

**Files:**
- Modify: `dashboard/public/app/index.html`

- [ ] **Step 1: Replace the widget block**

Find the block from line 70 to 121 (the `<div class="card" x-show="weather.temp !== null">` through its closing `</div>`). Replace the entire block with:

```html
        <div class="card" x-show="weather.temp !== null">
          <div class="weather-widget">

            <!-- Layer 1: Header -->
            <div class="weather-header">
              <span style="font-size:2rem" x-text="weather.icon"></span>
              <div>
                <div style="font-weight:700;font-size:1.4rem" x-text="(weather.temp ?? '--') + '°C'"></div>
                <div class="text-muted" style="font-size:.8rem" x-text="selectedForecast.desc || weather.desc"></div>
                <div style="font-size:.68rem;color:var(--text-3)" x-show="!!config.location_name">
                  📍 <span x-text="config.location_name"></span>
                </div>
              </div>
              <div class="weather-header-right" x-show="weather.forecast.length > 0">
                <div class="weather-header-day"
                     x-text="weather.selectedDay === 0 ? 'Today' : selectedForecast.fullName || ''"></div>
                <div class="weather-header-hilo"
                     x-text="'H: ' + (selectedForecast.hi ?? '--') + '°  L: ' + (selectedForecast.lo ?? '--') + '°'"></div>
              </div>
            </div>

            <!-- Layer 2: Interactive stats bar (4 tiles) -->
            <div class="weather-stats"
                 x-show="weather.forecast.length > 0"
                 :class="{ 'weather-stats--flash': weather.statsFlash }">
              <div class="weather-stat">
                <div class="weather-stat-label">Soil Temp</div>
                <div class="weather-stat-value"
                     x-text="selectedForecast.soilTemp != null ? selectedForecast.soilTemp + '°C' : '--'"></div>
                <div class="weather-stat-sub" x-text="selectedForecast.soilSub || ''"></div>
              </div>
              <div class="weather-stat">
                <div class="weather-stat-label">Rain</div>
                <div class="weather-stat-value"
                     x-text="selectedForecast.rain != null ? selectedForecast.rain + 'mm' : '--'"></div>
                <div class="weather-stat-sub"
                     x-text="weather.selectedDay === 0 ? 'Today' : (selectedForecast.fullName || '')"></div>
              </div>
              <div class="weather-stat">
                <div class="weather-stat-label">UV Index</div>
                <div class="weather-stat-value"
                     x-text="selectedForecast.uvMax != null ? selectedForecast.uvMax : '--'"></div>
                <div class="weather-stat-sub"
                     x-text="selectedForecast.uvMax <= 2 ? 'Low' : selectedForecast.uvMax <= 5 ? 'Moderate' : selectedForecast.uvMax <= 7 ? 'High' : 'Very High'"></div>
              </div>
              <div class="weather-stat">
                <div class="weather-stat-label">Watering</div>
                <div class="weather-stat-value" style="font-size:.78rem"
                     x-text="selectedForecast.watering || '--'"></div>
                <div class="weather-stat-sub" x-text="selectedForecast.waterSub || ''"></div>
              </div>
            </div>

            <!-- Layer 3: 7-day strip -->
            <div class="weather-section-label" x-show="weather.forecast.length > 0">7-day gardening outlook</div>
            <div class="weather-7day" x-show="weather.forecast.length > 0">
              <template x-for="(day, i) in weather.forecast" :key="i">
                <div class="weather-day-cell"
                     :class="{ 'weather-day-cell--active': weather.selectedDay === i }"
                     @click="selectForecastDay(i)">
                  <div class="wdc-name" :class="{ 'wdc-name--today': i === 0 }"
                       x-text="i === 0 ? 'Today' : day.name"></div>
                  <div class="wdc-icon" x-text="day.icon"></div>
                  <div class="wdc-hilo">
                    <span x-text="day.hi + '°'"></span><span class="wdc-lo" x-text="'/' + day.lo + '°'"></span>
                  </div>
                  <div class="wdc-rain" x-text="day.rain > 0 ? '💧 ' + day.rain + 'mm' : '—'"></div>
                  <div class="wdc-soil" x-show="day.soilTemp != null" x-text="'🌱 ' + day.soilTemp + '°C'"></div>
                  <div class="wdc-tag wdc-tag--frost" x-show="day.frost">❄️ frost</div>
                  <div class="wdc-tag wdc-tag--uv" x-show="day.uvHigh" x-text="'☀️ UV ' + day.uvMax"></div>
                </div>
              </template>
            </div>

            <!-- Layer 4: Gardening insights -->
            <div class="weather-section-label" x-show="weather.insights.length > 0">Gardening insights</div>
            <div class="weather-insights" x-show="weather.insights.length > 0">
              <template x-for="insight in weather.insights" :key="insight.label">
                <div class="weather-insight" :class="'weather-insight--' + insight.type">
                  <div class="weather-insight-icon" x-text="insight.icon"></div>
                  <div class="weather-insight-body">
                    <div class="weather-insight-label" x-text="insight.label"></div>
                    <div class="weather-insight-title" x-text="insight.title"></div>
                    <div class="weather-insight-desc" x-text="insight.desc"></div>
                    <!-- GDD progress bar (season insight only) -->
                    <div x-show="insight.type === 'season'">
                      <div class="gdd-bar">
                        <div class="gdd-track">
                          <div class="gdd-fill" :style="'width:' + Math.min((insight.gddRatio || 0) * 100, 100) + '%'"></div>
                        </div>
                        <span style="font-size:.6rem;color:var(--text-3)"
                              x-text="Math.round((insight.gddRatio || 0) * 100) + '% of avg'"></span>
                      </div>
                      <div class="gdd-labels"><span>0</span><span x-text="'Typical GDD'"></span></div>
                    </div>
                    <div class="weather-insight-meta" x-text="insight.meta"></div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Layer 5: Weather alerts (with body text) -->
            <div class="weather-section-label" x-show="weather.alerts.length > 0">Weather alerts</div>
            <div class="weather-alerts" x-show="weather.alerts.length > 0">
              <template x-for="alert in weather.alerts" :key="alert.text">
                <div class="weather-alert" :class="'weather-alert--' + alert.level">
                  <span x-text="alert.level === 'green' ? '✅' : '⚠️'"></span>
                  <div>
                    <span class="weather-alert-title" x-text="alert.text"></span>
                    <span class="weather-alert-body" x-show="!!alert.body" x-text="alert.body"></span>
                  </div>
                </div>
              </template>
            </div>

            <!-- Layer 6: Action footer -->
            <div class="weather-action"
                 x-show="!!weather.actionText"
                 :class="weather.alerts[0] ? 'weather-action--' + weather.alerts[0].level : ''"
                 x-text="weather.actionText">
            </div>

          </div>
        </div>
```

- [ ] **Step 2: Run tests to make sure nothing broke server-side**

```bash
cd dashboard && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add public/app/index.html
git commit -m "feat(weather): replace widget HTML with 6-layer redesign (strip, insights, enhanced alerts)"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Start the app**

```bash
cd dashboard && npm run dev
```

Open `http://localhost:3000` in a browser.

- [ ] **Step 2: Check the widget renders**

- Header shows icon + temp + desc + 📍 location + today's H/L
- 4-stat bar shows Soil Temp / Rain / UV / Watering
- 7-day strip shows 7 cells with icon, H/L, rain, soil temp

- [ ] **Step 3: Test day-click interactivity**

Click each day cell — verify:
- Active cell gets green highlight
- Stats bar updates (Soil Temp, Rain, UV, Watering change to that day's values)
- Header H/L and day name update
- Stats flash briefly on change

- [ ] **Step 4: Check insights render**

- "Gardening insights" section appears with ≥1 insight (Season Gauge is always shown)
- Greenhouse insight only appears if user has a greenhouse/polytunnel zone
- Work Window appears only if a dry block exists today or tomorrow

- [ ] **Step 5: Check alerts**

- Alerts have both title text and body text beneath
- Frost alert shows "dry frost" or "soft frost" depending on dewpoint

- [ ] **Step 6: Final commit**

```bash
cd dashboard && git add -A
git commit -m "feat(weather): weather widget redesign complete"
```

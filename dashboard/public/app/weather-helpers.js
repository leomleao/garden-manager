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
  if (code <= 82)       return '🌧️';
  return '⛈️';
}

function codeToDesc(code) {
  if (code === 0)       return 'Clear';
  if (code <= 3)        return 'Partly cloudy';
  if (code <= 48)       return 'Foggy';
  if (code <= 67)       return 'Rainy';
  if (code <= 77)       return 'Snowy';
  if (code <= 82)       return 'Showers';
  return 'Stormy';
}

// ── Soil status label ─────────────────────────────────────────────────────────

function soilStatus(soilTemp) {
  if (soilTemp == null)    return '';
  if (soilTemp < 10)       return 'Dormant / Too Cold';
  if (soilTemp <= 18)      return 'Cool Season (Peas, Lettuce)';
  return 'Warm Season (Tomatoes, Peppers)';
}

// ── Multi-depth soil layer analysis ──────────────────────────────────────────
// Reads three hourly soil temperature arrays at hour 12 (midday).
// Returns { surface, root, deep } each { temp, status, advice }, or null if
// no soil data present.

function computeSoilLayers(hourly, now = new Date()) {
  const a0 = hourly.soil_temperature_0_to_7cm;
  const a1 = hourly.soil_temperature_7_to_28cm;
  const a2 = hourly.soil_temperature_28_to_100cm;
  if (!a0 && !a1 && !a2) return null;

  const pick = arr => arr ? (arr[12] != null ? Math.round(arr[12] * 10) / 10 : null) : null;
  const s = pick(a0);
  const r = pick(a1);
  const d = pick(a2);
  if (s == null && r == null && d == null) return null;

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
    if (surf != null && surf < 10 && root >= 10) return 'Surface cold — root zone warmer, hold irrigation';
    if (root < 10) return 'Too cold for transplanting';
    if (root < 15) return 'Cool zone (perennials OK)';
    return 'Warm zone (good for transplanting)';
  }

  function rootAdvice(surf, root) {
    if (root == null) return '';
    if (surf != null && surf < 10 && root >= 10)
      return 'Surface is cold but root zone retains warmth — no need to irrigate yet.';
    if (root < 10) return 'Avoid transplanting — roots will cold-shock.';
    if (root < 15) return 'Cool zone — good for perennials, borderline for tender transplants.';
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

// ── Precipitation type alerts ─────────────────────────────────────────────────
// Scans hourly precipitation_type for the next 48h.
// Code 3 = Freezing Rain, Code 6 = Wet Snow.
// Returns array of alert objects { level, text, body } to be merged into
// computeAlerts output.

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

// ── Light quality / photosynthesis indicator ──────────────────────────────────
// Compares today's diffuse vs direct radiation (hours 0–23).
// Returns { diffuseFraction, peakDirect, label, advice, level } or null when
// total radiation < 50 W/m² (night / heavy overcast — not meaningful).

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

// ── Dual-base GDD (cool + warm season) ───────────────────────────────────────
// Returns { cool, warm } each { accumulated, baseline, ratio, daysDiff } or null.
// Uses the existing gddBaseline() curve for the cool track (base 5).
// Warm (base 10) baseline is 55% of cool — typical for Scotland in spring.
// ratio is capped at 1.5 to prevent extreme bars.

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
    const ratio    = baseline > 0 ? Math.min(acc / baseline, 1.5) : 1;
    const daysDiff = baseline > 0 ? Math.round((ratio - 1) * 7) : 0;
    return { accumulated: acc, baseline, ratio, daysDiff };
  }

  return {
    cool: makeTrack(coolAcc, coolBase),
    warm: makeTrack(warmAcc, warmBase),
  };
}

// ── Ensemble frost probability ────────────────────────────────────────────────
// Input: raw Open-Meteo ensemble API response.
// Finds all member keys matching /^temperature_2m_member\d+$/ and checks
// overnight hours (20:00–06:00 next day) for sub-zero minimums per day.
// Returns array of up to 3 day objects:
//   { date, dayName, prob, probPct, label, level, freezeCount, totalMembers }
// Returns [] when input is missing or has no member keys.

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
      const temps  = hourly[key] || [];
      const oTemps = overnight.map(i => temps[i] ?? Infinity);
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

// ── Spring Readiness Index ────────────────────────────────────────────────────
// Input: historical archive API response (daily temperature_2m_min),
// current day-of-year, and 7-day ensemble frost probability (0–1 fraction).
//
// Computes: what % of historical years had a frost on or after currentDayOfYear,
// and combines with ensemble forecast to produce a safe/caution/warning status.
//
// Returns { historicalRisk, forecastRisk, safeDate, status, body } or null.

function computeSpringReadiness(climateData, currentDayOfYear, ensembleFrostProb7d) {
  if (!climateData || !climateData.daily) return null;
  const { time, temperature_2m_min } = climateData.daily;
  if (!time || !temperature_2m_min || time.length === 0) return null;

  // For each year: did it have a frost on or after currentDayOfYear?
  const allYears          = new Set();
  const yearsWithLateFrost = new Set();

  time.forEach((dateStr, i) => {
    const d    = new Date(dateStr + 'T12:00:00');
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

  // Derive safe date: find the latest date in historical data with a frost after
  // currentDayOfYear, then add a 14-day buffer.
  let safeDate = null;
  let lastFrostDoy = -1;
  time.forEach((dateStr, i) => {
    const d    = new Date(dateStr + 'T12:00:00');
    const year = d.getFullYear();
    const doy  = Math.floor((d - new Date(year, 0, 0)) / 86400000);
    const temp = temperature_2m_min[i];
    if (doy >= currentDayOfYear && temp != null && temp <= 0 && doy > lastFrostDoy) {
      lastFrostDoy = doy;
    }
  });
  if (lastFrostDoy > 0) {
    const safe = new Date(new Date().getFullYear(), 0, lastFrostDoy + 14);
    safeDate = safe.toLocaleDateString('en', { month: 'long', day: 'numeric' });
  }

  let status, body;
  const forecastPct     = Math.round(forecastRisk * 100);
  const historicalPct   = Math.round(historicalRisk * 100);

  if (forecastRisk >= 0.1) {
    status = 'warning';
    body   = `Active frost risk in the 7-day forecast (${forecastPct}% probability). Wait until the forecast clears before planting tender crops outdoors.`;
  } else if (historicalRisk >= 0.15) {
    status = 'caution';
    body   = `Forecast looks clear, but historically this location has a ${historicalPct}% chance of a late frost after this date.${safeDate ? ` Safe window typically opens around ${safeDate}.` : ''}`;
  } else {
    status = 'safe';
    body   = 'Both historical records and the current forecast confirm low frost risk — safe to plant tender seeds outdoors.';
  }

  return {
    historicalRisk: historicalPct,
    forecastRisk:   forecastPct,
    safeDate,
    status,
    body,
  };
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
// Typical 7-day GDD (base 0°C, limit 50°C) for ~56°N — used as baseline for
// the current forecast window. Values represent expected GDD over 7 days.
// Returns { accumulated, baseline, ratio, daysDiff }

function gddBaseline(dayOfYear) {
  if (dayOfYear < 60)  return 0;
  if (dayOfYear < 91)  return Math.round(30 + (dayOfYear - 60) * 0.5);  // Mar: ~30–45
  if (dayOfYear < 121) return Math.round(49 + (dayOfYear - 91) * 0.7);  // Apr: ~49–70
  if (dayOfYear < 152) return Math.round(70 + (dayOfYear - 121) * 0.47); // May: ~70–84
  return Math.round(84 + (dayOfYear - 152) * 0.47);                      // Jun+: ~84–98
}

function computeSeasonGauge(daily) {
  const gddArr = daily.growing_degree_days_base_0_limit_50;
  if (!gddArr || !gddArr.length) return null;
  const accumulated = Math.round(gddArr.reduce((s, v) => s + (v ?? 0), 0));
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const baseline = gddBaseline(dayOfYear);
  const ratio    = baseline > 0 ? accumulated / baseline : 1;
  // daysDiff: how many days ahead/behind typical pace over the 7-day window
  const daysDiff = baseline > 0 ? Math.round((ratio - 1) * 7) : 0;
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
      title: `Clear gap ${win.day} ${fmt(win.startHour)}–${fmt((win.endHour + 1) % 24)}`,
      desc:  `${len}-hour dry window with <20% rain chance. Good time for outdoor planting or bed prep.`,
      meta:  `Precipitation probability stays below 20% through ${fmt((win.endHour + 1) % 24)}`,
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
      level: lq.level,
    });
  }

  return insights;
}

// ── Compute alerts array ──────────────────────────────────────────────────────
// Returns array of { level, text, body } objects.
// Enhanced over the original: frost uses dewpoint, alerts have body text.

function computeAlerts(d, soilTemp) {
  const alerts = [];
  const daily   = d.daily;
  const hourly  = d.hourly;

  // Precipitation type alerts (freezing rain, wet snow)
  const precipAlerts = computePrecipTypeAlerts(hourly);
  alerts.push(...precipAlerts);
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
    const frostDayLabel = frostIdx === 0 ? 'Today' : dayNames[frostIdx];
    alerts.push({
      level: 'red',
      text:  `Frost Alert · ${frostDayLabel}, ${Math.round(daily.temperature_2m_min[frostIdx])}°C (${frostType})`,
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
  if (topLevel === 'red' && topText.includes('Frost') && topText.includes('Today')) {
    return 'Protect tender plants tonight';
  }
  if (topLevel === 'red' && topText.includes('Frost')) {
    return `Cover tender plants before ${alerts[0].text.split('·')[1]?.trim().split(',')[0] || 'the frost'}`;
  }
  if (topLevel === 'red') return 'Severe weather forecast — avoid outdoor work';
  if (workWindow) {
    const endDisplay = workWindow.endHour === 23 ? '00:00' : `${workWindow.endHour + 1}:00`;
    return `Work window available ${workWindow.day} — ${workWindow.startHour}:00–${endDisplay}`;
  }
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
    computeSoilLayers, computePrecipTypeAlerts, computeLightQuality,
    computeDualGDD, computeFrostEnsemble, computeSpringReadiness,
  };
}

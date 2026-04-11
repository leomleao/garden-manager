// ── Pure helpers — exported for Jest when running in Node ─────────
function parseSoilTempRange(str) {
  if (!str) return null;
  const range = str.match(/(\d+(?:\.\d+)?)\s*[-\u2013\u2014]\s*(\d+(?:\.\d+)?)/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const single = str.match(/(\d+(?:\.\d+)?)/);
  if (single) { const v = parseFloat(single[1]); return { min: v, max: Infinity }; }
  return null;
}

function arrAvg(arr) {
  const valid = (arr || []).filter(v => v != null && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function parseGerminationDays(str) {
  // "7-10" → 10 (use max), "7" → 7, null/missing → 14 (safe default)
  if (!str) return 14;
  const range = str.match(/(\d+)\s*[-\u2013\u2014]\s*(\d+)/);
  if (range) return parseInt(range[2]);
  const single = str.match(/(\d+)/);
  return single ? parseInt(single[1]) : 14;
}

// Local GDD baseline (mirrors gddBaseline in weather-helpers.js).
// Kept here to make calendar.js self-contained for Jest tests.
function _gddBaselineLocal(dayOfYear) {
  if (dayOfYear < 60)  return 0;
  if (dayOfYear < 91)  return Math.round(30 + (dayOfYear - 60) * 0.5);
  if (dayOfYear < 121) return Math.round(49 + (dayOfYear - 91) * 0.7);
  if (dayOfYear < 152) return Math.round(70 + (dayOfYear - 121) * 0.47);
  return Math.round(84 + (dayOfYear - 152) * 0.47);
}


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
        const optStr = isFinite(range.max)
          ? `${range.min}\u2013${range.max}\u00b0C`
          : `${range.min}\u00b0C+`;
        if (avg < range.min) {
          badges.push({
            label: '❄ Too Cold', cls: 'cold',
            title: `Calendar says YES, but Soil says NO. Soil is ${avgStr}\u00b0C; ${seed.name} needs ${seed.optimum_soil_temp} to germinate. Wait for a warmer spell to avoid seed rot.`,
          });
        } else if (avg > range.max) {
          badges.push({
            label: '🔥 Too Warm', cls: 'warm',
            title: `Soil is ${avgStr}\u00b0C \u2014 above the ${optStr} optimum. Seeds may fail to germinate or bolt prematurely.`,
          });
        } else {
          badges.push({
            label: '🌡 Soil Good', cls: 'good',
            title: `Avg soil temp ${avgStr}\u00b0C over next 7 days \u2014 ideal for ${seed.name}.`,
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
          title: `Frost expected ${atRisk.dayName} (${atRisk.probPct}% chance). Seeds germinate in ${seed.days_to_germinate || '7\u201314'} days \u2014 they may surface during a late freeze. Use cloche protection.`,
        });
      }
    }

    // 3. Rain helps (only when soil is good)
    const soilGood = badges.some(b => b.label === '🌡 Soil Good');
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
        title: `Wind gusts of ${Math.round(maxGust)} km/h today. Newly sown seeds may dry out faster \u2014 consider watering after sowing or adding a light cover.`,
      });
    }

    // 5. Thirsty soil (3-day ET0 vs precipitation)
    const et0   = daily.et0_fao_evapotranspiration || [];
    const precip = daily.precipitation_sum || [];
    if (et0.length >= 3 && precip.length >= 3) {
      const et0_3d    = et0.slice(0, 3).reduce((s, v) => s + (v ?? 0), 0);
      const precip_3d = precip.slice(0, 3).reduce((s, v) => s + (v ?? 0), 0);
      if (et0_3d > precip_3d) {
        badges.push({
          label: '💧 Thirsty Soil', cls: 'warn',
          title: `Evaporation (ET\u2080 ${et0_3d.toFixed(1)}mm) exceeds rainfall (${precip_3d.toFixed(1)}mm) over 3 days. Soil moisture is dropping \u2014 water before or after sowing.`,
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
          title: `Humidity is ${Math.round(avgRh)}% with mild temps (${avgT.toFixed(1)}\u00b0C) \u2014 prime conditions for downy mildew. Ensure good airflow and avoid overhead watering.`,
        });
      }
    }
  }

  // ── INDOOR ───────────────────────────────────────────────────────────────
  if (mode === 'indoor') {
    // 1. Air temperature check (good conditions for starting indoors)
    const range = parseSoilTempRange(seed.optimum_soil_temp);
    if (range) {
      const temps = daily.temperature_2m_max || [];
      const avg = arrAvg(temps);
      if (avg !== null && avg >= range.min && avg <= range.max) {
        badges.push({
          label: '🌤 Good Conditions', cls: 'good',
          title: `Avg air temp ${avg.toFixed(1)}°C over next 7 days — seasonally ideal for starting ${seed.name} indoors.`,
        });
      }
    }

    // 2. Grow light needed (low 4-day radiation AND seed requires light)
    if (seed.light_requirements && /sun|light/i.test(seed.light_requirements)) {
      const direct  = hourly.direct_radiation  || [];
      const diffuse = hourly.diffuse_radiation || [];
      const sliceD = direct.slice(0, 96);
      const sliceF = diffuse.slice(0, 96);
      const radHours = Math.max(sliceD.length, 1);
      const totalRad = (
        sliceD.reduce((s, v) => s + (v ?? 0), 0) +
        sliceF.reduce((s, v) => s + (v ?? 0), 0)
      ) / radHours;
      if (totalRad < 150) {
        badges.push({
          label: '☁ Grow Light Needed', cls: 'cold',
          title: `Next 4 days are heavily overcast (avg ${Math.round(totalRad)} W/m²). Windowsill light won't be enough — use grow lights to prevent leggy seedlings.`,
        });
      }
    }

    // 3. GDD season lag / ahead
    const gddArr = daily.growing_degree_days_base_0_limit_50 || [];
    if (gddArr.length) {
      const accumulated = gddArr.reduce((s, v) => s + (v ?? 0), 0);
      const now      = new Date();
      const doy      = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      const baseline = _gddBaselineLocal(doy);
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

  // ── TRANSITION ───────────────────────────────────────────────────────────
  if (mode === 'transition') {
    if (!seed.plant_out_start) return badges;
    const [dd, mm] = seed.plant_out_start.split('-').map(Number);
    const today     = new Date();
    const startDate = new Date(today.getFullYear(), mm - 1, dd);
    // Roll to next year if the date is more than 3 days in the past
    // (UV shock window is only 3 days; anything older is truly a next-year event)
    if ((today - startDate) / 86400000 > 3) startDate.setFullYear(today.getFullYear() + 1);
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

  return badges;
}

// Allow Jest to require this file in Node (Alpine is absent there)
if (typeof module !== 'undefined') module.exports = { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges };

// ── Alpine component ──────────────────────────────────────────────
// Only initialize Alpine component in browser environment (not in Node/Jest)
if (typeof document !== 'undefined') {
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
      calTypeFilter: null,

      get sowIndoorsNow() {
        const m = new Date().getMonth() + 1;
        return this.seeds.filter(s => monthInWindow(m, s.sow_indoors_start, s.sow_indoors_end));
      },

      get sowOutdoorsNow() {
        const m = new Date().getMonth() + 1;
        return this.seeds.filter(s => monthInWindow(m, s.sow_outdoors_start, s.sow_outdoors_end));
      },

      get plantOutNow() {
        const today = new Date();
        return this.seeds.filter(s => {
          if (!s.plant_out_start) return false;
          const [dd, mm] = s.plant_out_start.split('-').map(Number);
          const startDate = new Date(today.getFullYear(), mm - 1, dd);
          if ((today - startDate) / 86400000 > 3) startDate.setFullYear(today.getFullYear() + 1);
          const diffDays = (startDate - today) / 86400000;
          return diffDays > -3 && diffDays <= 10;
        });
      },

      get calendarTypes() {
        const types = [...new Set(this.seeds.map(s => s.type).filter(Boolean))].sort();
        return types;
      },

      get calendarSeeds() {
        return [...this.seeds]
          .filter(s => !this.calTypeFilter || s.type === this.calTypeFilter)
          .sort((a, b) => {
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
      typeEmoji(type) { return { herb: '\u{1F33F}', vegetable: '\u{1F955}', flower: '\u{1F338}', salad: '\u{1F96C}', fruit: '\u{1F345}' }[type] || ''; },

      getSeedEmoji(seed) {
        // Priority: use seed-specific emoji from the database, fallback to type-based emoji
        return (seed?.emoji && seed.emoji.trim()) || this.typeEmoji(seed?.type);
      },

      tooltipText(seed) {
        const parts = [];
        if (seed.days_to_germinate) parts.push(`Germinates: ${seed.days_to_germinate} days`);
        if (seed.optimum_soil_temp) parts.push(`Soil temp: ${seed.optimum_soil_temp}`);
        if (seed.optimum_soil_type) parts.push(`Soil type: ${seed.optimum_soil_type}`);
        if (seed.light_requirements) parts.push(`Light: ${seed.light_requirements}`);
        if (seed.growing_instructions) parts.push(seed.growing_instructions);
        return parts.join(' · ') || 'No growing info';
      },

      weatherForecastBadge(seed, mode) {
        return getSowNowBadges(this.weatherData, seed, mode, this.weather?.confidence);
      },
    }));
  });
}

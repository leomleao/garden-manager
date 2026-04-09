// ── Pure helpers — exported for Jest when running in Node ─────────
function parseSoilTempRange(str) {
  if (!str) return null;
  const range = str.match(/(\d+(?:\.\d+)?)\s*[-\u2013\u2014]\s*(\d+(?:\.\d+)?)/);
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
  if (!weatherData || !seed) return null;
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

      weatherForecastBadge(seed, isOutdoor) {
        return getSowNowBadge(this.weatherData, seed, isOutdoor);
      },
    }));
  });
}

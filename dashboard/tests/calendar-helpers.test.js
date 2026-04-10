// We require calendar.js which will conditionally export helpers via CommonJS.
// Alpine is not present in Node — the module export guard handles this.
const { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges, getSowNowBadge } = require('../public/app/calendar.js');

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
  test('single value means min threshold only (max is Infinity)', () => {
    expect(parseSoilTempRange('20°C')).toEqual({ min: 20, max: Infinity });
  });
  test('single digit like "6°C" means 6 or warmer', () => {
    expect(parseSoilTempRange('6°C')).toEqual({ min: 6, max: Infinity });
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

describe('parseGerminationDays', () => {
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
  test('em-dash range "5\u20147" returns 7', () => {
    expect(parseGerminationDays('5\u20147')).toBe(7);
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

  test('returns null when seed is null', () => {
    const w = makeWeather({ soilTemps: [20], airTemps: [20] });
    expect(getSowNowBadge(w, null, true)).toBeNull();
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

  test('soil too cold: label "❄ Too Cold", cls cold', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(8) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '❄ Too Cold');
    expect(b).toBeDefined();
    expect(b.cls).toBe('cold');
    expect(b.title).toContain('Basil');
    expect(b.title).toContain('18-22°C');
  });

  test('soil too cold tooltip does NOT contain "Infinity"', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(3) });
    const badges = getSowNowBadges(w, { name: 'Lettuce', optimum_soil_temp: '6°C' }, 'outdoor', null);
    const b = badges.find(b => b.label === '❄ Too Cold');
    expect(b).toBeDefined();
    expect(b.title).not.toContain('Infinity');
  });

  test('soil too warm: label "🔥 Too Warm", cls warm (only for ranged temps)', () => {
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

  test('soil good: label "🌡 Soil Good", cls good', () => {
    const w = makeWeather({ soilTemps: Array(168).fill(20) });
    const badges = getSowNowBadges(w, { name: 'Basil', optimum_soil_temp: '18-22°C' }, 'outdoor', null);
    expect(badges.find(b => b.label === '🌡 Soil Good')).toBeDefined();
  });

  test('frost risk badge when ensemble prob > 20% within germination window', () => {
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const confidence = {
      frostProbability: [{ date: futureDate, dayName: 'Wed', prob: 0.4, probPct: 40 }],
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
    const futureDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const confidence = {
      frostProbability: [{ date: futureDate, dayName: 'Mon', prob: 0.15, probPct: 15 }],
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
    const temp = Array(24).fill(10);
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

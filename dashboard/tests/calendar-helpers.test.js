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

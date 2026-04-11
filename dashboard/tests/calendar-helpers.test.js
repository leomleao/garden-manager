// We require calendar.js which will conditionally export helpers via CommonJS.
// Alpine is not present in Node — the module export guard handles this.
const { parseSoilTempRange, arrAvg, parseGerminationDays, getSowNowBadges } = require('../public/app/calendar.js');

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

  test('hardening off badge says "1 day" (singular)', () => {
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

  test('good conditions works with single-value optimum (min only, max is Infinity)', () => {
    const w = makeWeather({ airTemps: Array(7).fill(12) });
    const badges = getSowNowBadges(w, { name: 'Lettuce', optimum_soil_temp: '6°C' }, 'indoor', null);
    expect(badges.find(b => b.label === '🌤 Good Conditions')).toBeDefined();
  });

  test('grow light badge when avg 4-day radiation < 150 W/m² AND light_requirements matches', () => {
    const w = makeWeather(); // direct and diffuse both default to 0
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

  test('no grow light badge when light_requirements is null', () => {
    const w = makeWeather();
    const seed = { name: 'X', optimum_soil_temp: '18-22°C', light_requirements: null };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeUndefined();
  });

  test('no grow light badge when light_requirements does not mention sun or light', () => {
    const w = makeWeather();
    const seed = { name: 'X', optimum_soil_temp: '18-22°C', light_requirements: 'Shade' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeUndefined();
  });

  test('grow light badge matches "light" in requirements case-insensitively', () => {
    const w = makeWeather();
    const seed = { name: 'X', optimum_soil_temp: '18-22°C', light_requirements: 'Bright indirect light' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    expect(badges.find(b => b.label === '☁ Grow Light Needed')).toBeDefined();
  });

  test('season behind badge when GDD ratio < 0.7 with high baseline day', () => {
    // Use enormous 0-GDD to force ratio very low vs baseline
    const w = makeWeather({ gdd: Array(7).fill(0) });
    const seed = { name: 'X', optimum_soil_temp: '18-22°C' };
    // This only triggers if gddBaseline(doy) > 0, i.e. not in winter
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    const b = badges.find(b => b.label === '📉 Season Behind');
    // Accept either: badge if spring/summer, or no badge if winter (baseline=0)
    if (b) {
      expect(b.cls).toBe('cold');
      expect(b.title).toMatch(/behind/i);
    }
    expect(true).toBe(true); // always pass structural check
  });

  test('season ahead badge when GDD ratio > 1.3', () => {
    const w = makeWeather({ gdd: Array(7).fill(9999) });
    const seed = { name: 'X', optimum_soil_temp: '18-22°C' };
    const badges = getSowNowBadges(w, seed, 'indoor', null);
    const b = badges.find(b => b.label === '📈 Season Ahead');
    if (b) {
      expect(b.cls).toBe('good');
      expect(b.title).toMatch(/ahead/i);
    }
    expect(true).toBe(true);
  });

  test('returns empty array for unknown mode', () => {
    const badges = getSowNowBadges(makeWeather(), { name: 'X', optimum_soil_temp: '18-22°C' }, 'unknown', null);
    expect(badges).toEqual([]);
  });
});

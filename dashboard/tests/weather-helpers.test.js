// dashboard/tests/weather-helpers.test.js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeSeasonGauge, computeInsights, computeAlerts,
} = require('../public/app/weather-helpers');

// ── codeToIcon / codeToDesc ───────────────────────────────────────────────────
describe('codeToIcon', () => {
  test('code 0 is clear', () => expect(codeToIcon(0)).toBe('☀️'));
  test('code 2 is partly cloudy', () => expect(codeToIcon(2)).toBe('⛅'));
  test('code 45 is foggy', () => expect(codeToIcon(45)).toBe('🌫️'));
  test('code 61 is rainy', () => expect(codeToIcon(61)).toBe('🌧️'));
  test('code 71 is snowy', () => expect(codeToIcon(71)).toBe('🌨️'));
  test('code 81 is showers (not storm)', () => expect(codeToIcon(81)).toBe('🌧️'));
  test('code 99 is stormy', () => expect(codeToIcon(99)).toBe('⛈️'));
});

describe('codeToDesc', () => {
  test('code 0 → Clear', () => expect(codeToDesc(0)).toBe('Clear'));
  test('code 81 → Showers', () => expect(codeToDesc(81)).toBe('Showers'));
  test('code 80 → Stormy', () => expect(codeToDesc(99)).toBe('Stormy'));
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
    const d = makeData(38, 2.0);
    const result = computePotCheck(d.hourly, d.daily);
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
  test('returns positive from day 60 onward (base 0°C)', () => expect(gddBaseline(60)).toBeGreaterThan(0));
  test('returns positive by April (day 99)', () => expect(gddBaseline(99)).toBeGreaterThan(0));
  test('increases over time', () => expect(gddBaseline(121)).toBeGreaterThan(gddBaseline(99)));
});

// ── computeSeasonGauge ────────────────────────────────────────────────────────
describe('computeSeasonGauge', () => {
  test('returns null when GDD field absent', () => {
    expect(computeSeasonGauge({ growing_degree_days_base_0_limit_50: undefined })).toBeNull();
    expect(computeSeasonGauge({ growing_degree_days_base_0_limit_50: [] })).toBeNull();
  });

  test('returns object with accumulated, baseline, ratio when data present', () => {
    const result = computeSeasonGauge({ growing_degree_days_base_0_limit_50: [2, 3, 1, 2, 4, 3, 2] });
    expect(result).not.toBeNull();
    expect(result.accumulated).toBe(17);
    expect(result.ratio).toBeGreaterThanOrEqual(0);
    expect(result.ratio).toBeLessThanOrEqual(1.5);
  });
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
        temperature_2m: Array(168).fill(12),
        relative_humidity_2m: Array(168).fill(50),
        leaf_wetness_probability: Array(168).fill(0),
        wind_gusts_10m: Array(168).fill(0),
        direct_radiation: Array(168).fill(0),
        precipitation_probability: Array(168).fill(80),
        precipitation: Array(168).fill(0),
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

  test('frost on day 0 (today) uses Today label', () => {
    const d = makeData(1, Array(24).fill(1));
    const alerts = computeAlerts(d, 7);
    expect(alerts[0].text).toContain('Today');
  });
});

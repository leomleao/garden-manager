// dashboard/tests/weather-helpers.test.js
const {
  codeToIcon, codeToDesc, soilStatus, wateringFromBalance,
  buildForecastDays, findWorkWindow, computeDiseaseRisk,
  computeGreenhouseAlert, computePotCheck, gddBaseline,
  computeSeasonGauge, computeInsights, computeAlerts,
  computeSoilLayers, computePrecipTypeAlerts, computeLightQuality,
  computeDualGDD, computeFrostEnsemble, computeSpringReadiness,
  computeWateringWindow, computeVPD,                              // ← new
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

// ── computeSoilLayers ─────────────────────────────────────────────────────────
describe('computeSoilLayers', () => {
  function makeHourly(s0, s1, s2) {
    const arr = v => Array(24).fill(null).map((_, i) => i === 12 ? v : null);
    return {
      soil_temperature_0_to_7cm:    arr(s0),
      soil_temperature_7_to_28cm:   arr(s1),
      soil_temperature_28_to_100cm: arr(s2),
    };
  }

  test('returns null when no soil arrays present', () => {
    expect(computeSoilLayers({})).toBeNull();
  });

  test('surface < 5°C → status "Frozen"', () => {
    expect(computeSoilLayers(makeHourly(3, 8, 10)).surface.status).toBe('Frozen');
  });

  test('surface 5–9°C → status "Too cold for seeds"', () => {
    expect(computeSoilLayers(makeHourly(7, 8, 10)).surface.status).toBe('Too cold for seeds');
  });

  test('surface 10–14°C → status "Cool-season ready (Peas, Lettuce)"', () => {
    expect(computeSoilLayers(makeHourly(12, 13, 14)).surface.status).toBe('Cool-season ready (Peas, Lettuce)');
  });

  test('surface ≥ 15°C → status "Warm-season ready (Tomatoes)"', () => {
    expect(computeSoilLayers(makeHourly(16, 15, 14)).surface.status).toBe('Warm-season ready (Tomatoes)');
  });

  test('root layer: cold surface + warm root → "Surface cold — root zone warmer, hold irrigation"', () => {
    expect(computeSoilLayers(makeHourly(8, 12, 14)).root.status).toBe('Surface cold — root zone warmer, hold irrigation');
  });

  test('root layer: both cold → "Too cold for transplanting"', () => {
    expect(computeSoilLayers(makeHourly(7, 8, 10)).root.status).toBe('Too cold for transplanting');
  });

  test('surface exactly 5°C → "Too cold for seeds" (not Frozen)', () => {
    expect(computeSoilLayers(makeHourly(5, 8, 10)).surface.status).toBe('Too cold for seeds');
  });

  test('surface exactly 10°C → "Cool-season ready (Peas, Lettuce)"', () => {
    expect(computeSoilLayers(makeHourly(10, 11, 12)).surface.status).toBe('Cool-season ready (Peas, Lettuce)');
  });

  test('surface exactly 15°C → "Warm-season ready (Tomatoes)"', () => {
    expect(computeSoilLayers(makeHourly(15, 14, 13)).surface.status).toBe('Warm-season ready (Tomatoes)');
  });

  test('null midday value in present array → that layer is null', () => {
    const hourly = {
      soil_temperature_0_to_7cm:    Array(24).fill(null),
      soil_temperature_7_to_28cm:   Array(24).fill(null).map((_, i) => i === 12 ? 10 : null),
      soil_temperature_28_to_100cm: Array(24).fill(null).map((_, i) => i === 12 ? 12 : null),
    };
    const r = computeSoilLayers(hourly);
    expect(r.surface).toBeNull();
    expect(r.root).not.toBeNull();
    expect(r.deep).not.toBeNull();
  });

  test('deep layer: doy < 121, temp < 8 → "Cold deep soil — dormant conditions"', () => {
    const febDate = new Date(new Date().getFullYear(), 1, 19); // Feb 19 ≈ doy 50
    expect(computeSoilLayers(makeHourly(12, 13, 5), febDate).deep.status).toBe('Cold deep soil — dormant conditions');
  });

  test('deep layer: doy >= 121, temp < 8 → "Deep-soil drought risk for fruit trees"', () => {
    const mayDate = new Date(new Date().getFullYear(), 4, 20); // May 20 ≈ doy 140
    expect(computeSoilLayers(makeHourly(12, 13, 5), mayDate).deep.status).toBe('Deep-soil drought risk for fruit trees');
  });
});

// ── computePrecipTypeAlerts ───────────────────────────────────────────────────
describe('computePrecipTypeAlerts', () => {
  test('returns empty array for normal precipitation codes', () => {
    expect(computePrecipTypeAlerts({ precipitation_type: Array(48).fill(1) })).toEqual([]);
  });

  test('returns empty array when precipitation_type absent', () => {
    expect(computePrecipTypeAlerts({})).toEqual([]);
  });

  test('code 3 in next 48h → red alert for freezing rain', () => {
    const types = Array(48).fill(0);
    types[10] = 3;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('red');
    expect(alerts[0].text).toMatch(/Freezing rain/);
  });

  test('code 6 in next 48h → amber alert for wet snow', () => {
    const types = Array(48).fill(0);
    types[30] = 6;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('amber');
    expect(alerts[0].text).toMatch(/wet snow/i);
  });

  test('both codes 3 and 6 → two alerts, red first', () => {
    const types = Array(48).fill(0);
    types[5] = 3;
    types[25] = 6;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(2);
    expect(alerts[0].level).toBe('red');
    expect(alerts[1].level).toBe('amber');
  });

  test('code 3 beyond 48h (index 48+) → not detected', () => {
    const types = Array(72).fill(0);
    types[50] = 3;
    const alerts = computePrecipTypeAlerts({ precipitation_type: types });
    expect(alerts).toHaveLength(0);
  });
});

// ── computeLightQuality ───────────────────────────────────────────────────────
describe('computeLightQuality', () => {
  function makeHourly(directPeak, diffuseVal) {
    const direct  = Array(24).fill(0);
    const diffuse = Array(24).fill(0);
    direct[12]  = directPeak;
    diffuse[12] = diffuseVal;
    return { direct_radiation: direct, diffuse_radiation: diffuse };
  }

  test('returns null when total radiation < 50', () => {
    expect(computeLightQuality(makeHourly(0, 0))).toBeNull();
  });

  test('returns null when both arrays absent', () => {
    expect(computeLightQuality({})).toBeNull();
  });

  test('diffuse fraction > 0.6 → High Diffuse Light, level good', () => {
    const r = computeLightQuality(makeHourly(20, 80));
    expect(r.label).toBe('High Diffuse Light');
    expect(r.level).toBe('good');
  });

  test('peak direct > 500 → level caution', () => {
    const r = computeLightQuality(makeHourly(600, 100));
    expect(r.level).toBe('caution');
    expect(r.advice).toMatch(/500 W/);
  });

  test('dominant direct but ≤ 500 → High Direct Light, level good', () => {
    const r = computeLightQuality(makeHourly(300, 50));
    expect(r.label).toBe('High Direct Light');
    expect(r.level).toBe('good');
  });

  test('diffuse fraction exactly 0.6 → NOT High Diffuse (boundary is > 0.6)', () => {
    // direct=40, diffuse=60 → fraction = 60/100 = 0.6 exactly → should be High Direct Light
    const r = computeLightQuality(makeHourly(40, 60));
    expect(r.label).toBe('High Direct Light');
  });

  test('result includes diffuseFraction and peakDirect fields', () => {
    const r = computeLightQuality(makeHourly(20, 80));
    expect(typeof r.diffuseFraction).toBe('number');
    expect(typeof r.peakDirect).toBe('number');
  });
});

// ── computeDualGDD ────────────────────────────────────────────────────────────
describe('computeDualGDD', () => {
  // tmax=15, tmin=5 → avg=10 → cool GDD/day=5, warm GDD/day=0
  const cool7 = { temperature_2m_max: [15,15,15,15,15,15,15], temperature_2m_min: [5,5,5,5,5,5,5] };
  // tmax=25, tmin=15 → avg=20 → cool GDD/day=15, warm GDD/day=10
  const warm7 = { temperature_2m_max: [25,25,25,25,25,25,25], temperature_2m_min: [15,15,15,15,15,15,15] };

  test('returns null cool and warm when temperature arrays absent', () => {
    const r = computeDualGDD({});
    expect(r.cool).toBeNull();
    expect(r.warm).toBeNull();
  });

  test('computes cool GDD (base 5) from daily max/min temperatures', () => {
    // avg=10, base 5 → 5 GDD/day × 7 days = 35
    const r = computeDualGDD(cool7);
    expect(r.cool.accumulated).toBe(35);
  });

  test('warm GDD (base 10) is zero when avg temp equals base', () => {
    // avg=10, base 10 → 0 GDD/day
    const r = computeDualGDD(cool7);
    expect(r.warm.accumulated).toBe(0);
  });

  test('computes warm GDD (base 10) correctly for warm days', () => {
    // avg=20, base 10 → 10 GDD/day × 7 = 70
    const r = computeDualGDD(warm7);
    expect(r.warm.accumulated).toBe(70);
  });

  test('clamps negative GDD contribution to zero', () => {
    // avg=2, base 5 → negative → clamped to 0
    const cold = { temperature_2m_max: [4,4,4], temperature_2m_min: [0,0,0] };
    const r = computeDualGDD(cold);
    expect(r.cool.accumulated).toBe(0);
  });

  test('cool ratio is a number between 0 and 1.5', () => {
    const r = computeDualGDD(warm7);
    expect(r.cool.ratio).toBeGreaterThanOrEqual(0);
    expect(r.cool.ratio).toBeLessThanOrEqual(1.5);
  });

  test('each track includes accumulated, baseline, ratio, daysDiff', () => {
    const r = computeDualGDD(warm7);
    expect(r.cool).toMatchObject({
      accumulated: expect.any(Number),
      baseline:    expect.any(Number),
      ratio:       expect.any(Number),
      daysDiff:    expect.any(Number),
    });
  });
});

// ── computeFrostEnsemble ──────────────────────────────────────────────────────
describe('computeFrostEnsemble', () => {
  function makeEnsemble(numMembers, memberTemps) {
    // memberTemps: array of 72 values per member (3 days × 24h)
    // If memberTemps has fewer entries than numMembers, remaining members get 5°C
    const hourly = { time: [] };
    const base = new Date('2026-04-09T00:00:00');
    for (let h = 0; h < 72; h++) {
      const d = new Date(base.getTime() + h * 3600000);
      hourly.time.push(d.toISOString().slice(0, 16));
    }
    for (let m = 1; m <= numMembers; m++) {
      const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
      hourly[key] = memberTemps[m - 1] || Array(72).fill(5);
    }
    return { hourly };
  }

  test('returns empty array when null passed', () => {
    expect(computeFrostEnsemble(null)).toEqual([]);
  });

  test('returns empty array when no hourly data', () => {
    expect(computeFrostEnsemble({})).toEqual([]);
  });

  test('returns empty array when no member keys found', () => {
    expect(computeFrostEnsemble({ hourly: { time: Array(72).fill('2026-04-09T00:00') } })).toEqual([]);
  });

  test('0% frost when all members warm overnight', () => {
    const data = makeEnsemble(4, Array(4).fill(Array(72).fill(5)));
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(0);
    expect(result[0].level).toBe('low');
  });

  test('100% frost when all members sub-zero overnight', () => {
    const data = makeEnsemble(4, Array(4).fill(Array(72).fill(-2)));
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(1);
    expect(result[0].level).toBe('high');
  });

  test('50% frost when half members sub-zero → level high', () => {
    const coldTemps = Array(72).fill(-2);
    const warmTemps = Array(72).fill(5);
    const data = makeEnsemble(4, [coldTemps, coldTemps, warmTemps, warmTemps]);
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(0.5);
    expect(result[0].level).toBe('high');
  });

  test('result includes date, dayName, probPct, freezeCount, totalMembers', () => {
    const data = makeEnsemble(2, Array(2).fill(Array(72).fill(5)));
    const result = computeFrostEnsemble(data);
    expect(result[0]).toMatchObject({
      date:         expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      dayName:      expect.any(String),
      probPct:      0,
      freezeCount:  0,
      totalMembers: 2,
    });
  });

  test('returns up to 3 days', () => {
    const data = makeEnsemble(2, Array(2).fill(Array(72).fill(5)));
    expect(computeFrostEnsemble(data).length).toBeLessThanOrEqual(3);
    expect(computeFrostEnsemble(data).length).toBeGreaterThan(0);
  });

  test('prob < 0.2 → level low', () => {
    // 0 of 10 members freeze → prob 0 → low
    const data = makeEnsemble(10, Array(10).fill(Array(72).fill(5)));
    expect(computeFrostEnsemble(data)[0].level).toBe('low');
  });

  test('prob >= 0.5 → level high', () => {
    const coldTemps = Array(72).fill(-2);
    const warmTemps = Array(72).fill(5);
    // 6 cold, 4 warm = 60% → high
    const members = [...Array(6).fill(coldTemps), ...Array(4).fill(warmTemps)];
    const data = makeEnsemble(10, members);
    expect(computeFrostEnsemble(data)[0].level).toBe('high');
  });

  test('prob exactly 0.2 → level possible (boundary)', () => {
    const coldTemps = Array(72).fill(-2);
    const warmTemps = Array(72).fill(5);
    // 2 of 10 members freeze → prob = 0.2 → possible
    const members = [...Array(2).fill(coldTemps), ...Array(8).fill(warmTemps)];
    const data = makeEnsemble(10, members);
    const result = computeFrostEnsemble(data);
    expect(result[0].prob).toBe(0.2);
    expect(result[0].level).toBe('possible');
  });
});

// ── computeSpringReadiness ────────────────────────────────────────────────────
describe('computeSpringReadiness', () => {
  const currentDoy = 99; // ~April 9

  function makeClimate(entries) {
    return {
      daily: {
        time:               entries.map(e => e.date),
        temperature_2m_min: entries.map(e => e.minTemp),
      },
    };
  }

  test('returns null when climateData is null', () => {
    expect(computeSpringReadiness(null, currentDoy, 0)).toBeNull();
  });

  test('returns null when climateData has no daily', () => {
    expect(computeSpringReadiness({}, currentDoy, 0)).toBeNull();
  });

  test('status safe when historical < 15% and forecast < 10%', () => {
    // No frost days in historical data
    const data = makeClimate([
      { date: '2020-04-09', minTemp: 5 },
      { date: '2021-04-09', minTemp: 6 },
    ]);
    expect(computeSpringReadiness(data, currentDoy, 0.05).status).toBe('safe');
  });

  test('status caution when historical >= 15% and forecast < 10%', () => {
    // 1 of 2 years had frost after currentDoy → 50% historical risk
    const data = makeClimate([
      { date: '2020-04-10', minTemp: -1 },
      { date: '2021-04-10', minTemp: 5 },
    ]);
    expect(computeSpringReadiness(data, currentDoy, 0.05).status).toBe('caution');
  });

  test('status warning when forecast >= 10%', () => {
    const data = makeClimate([{ date: '2020-04-09', minTemp: 5 }]);
    expect(computeSpringReadiness(data, currentDoy, 0.4).status).toBe('warning');
  });

  test('caution body mentions historical percentage', () => {
    const data = makeClimate([
      { date: '2020-04-10', minTemp: -1 },
      { date: '2021-04-10', minTemp: 5 },
    ]);
    const r = computeSpringReadiness(data, currentDoy, 0.05);
    expect(r.body).toMatch(/historically/i);
    expect(r.body).toMatch(/50%/);
  });

  test('warning body mentions forecast percentage', () => {
    const data = makeClimate([{ date: '2020-04-09', minTemp: 5 }]);
    const r = computeSpringReadiness(data, currentDoy, 0.3);
    expect(r.body).toMatch(/30%/);
  });

  test('returns historicalRisk and forecastRisk as integers', () => {
    const data = makeClimate([{ date: '2020-04-09', minTemp: 5 }]);
    const r = computeSpringReadiness(data, currentDoy, 0.3);
    expect(Number.isInteger(r.historicalRisk)).toBe(true);
    expect(r.forecastRisk).toBe(30);
  });

  test('returns null when no years found in climate data', () => {
    expect(computeSpringReadiness({ daily: { time: [], temperature_2m_min: [] } }, currentDoy, 0)).toBeNull();
  });
});

// ── computeWateringWindow ─────────────────────────────────────────────────────

describe('computeWateringWindow', () => {
  // Helper: build a minimal hourly object with 24 slots for today
  function makeHourly({ moisture, surfaceTemp, airTemp } = {}) {
    return {
      soil_moisture_1_to_3cm:    moisture    ?? Array(24).fill(20),
      soil_temperature_0_to_7cm: surfaceTemp ?? Array(24).fill(15),
      temperature_2m:            airTemp     ?? Array(24).fill(10),
    };
  }

  // Freeze time at 10:00 so hour-indexed reads are deterministic
  const at10 = new Date('2026-04-11T10:00:00');

  test('returns null when soil_moisture_1_to_3cm is missing', () => {
    const hourly = makeHourly();
    delete hourly.soil_moisture_1_to_3cm;
    expect(computeWateringWindow(hourly, at10)).toBeNull();
  });

  test('returns null when root moisture >= 25%', () => {
    const moisture = Array(24).fill(30);    // 30% — above Gate 1 threshold
    const surfaceTemp = Array(24).fill(16); // ensure Gate 2 would pass; null is from Gate 1
    expect(computeWateringWindow(makeHourly({ moisture, surfaceTemp }), at10)).toBeNull();
  });

  test('returns null when surface temp not elevated at current hour', () => {
    // surfaceTemp <= airTemp + 5 at hour 10 → no evap risk
    const surfaceTemp = Array(24).fill(14); // 14 = 10 + 4 (not > +5)
    expect(computeWateringWindow(makeHourly({ surfaceTemp }), at10)).toBeNull();
  });

  test('returns result when both gates pass', () => {
    // Gate 1: moisture=20 < 25 ✓   Gate 2: surf=16 > air(10)+5=15 ✓ → expects non-null result
    const surfaceTemp = Array(24).fill(16);
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('recommendedHour');
    expect(result).toHaveProperty('soilMoisture');
  });

  test('soilMoisture is rounded to 1 decimal place', () => {
    const surfaceTemp = Array(24).fill(16);
    const moisture = Array(24).fill(19.456);
    const result = computeWateringWindow(makeHourly({ moisture, surfaceTemp }), at10);
    expect(result.soilMoisture).toBe(19.5);
  });

  test('finds first hour in 17-20 where surface cools (surf <= air + 5)', () => {
    // Hours 17-19 still hot (surf = 16, air = 10 → delta 6 > 5)
    // Hour 20: surf = 14, air = 10 → delta 4 ≤ 5 → cool
    const surfaceTemp = Array(24).fill(16);
    surfaceTemp[20] = 14;
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result.recommendedHour).toBe(20);
  });

  test('defaults to 18 when all hours 17-20 remain hot', () => {
    // All hours 17-20: surf = 16, air = 10 → still above +5
    const surfaceTemp = Array(24).fill(16);
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result.recommendedHour).toBe(18);
  });

  test('picks earliest qualifying hour in range', () => {
    // Hour 17 already cool, hour 18 also cool — should pick 17
    const surfaceTemp = Array(24).fill(16);
    surfaceTemp[17] = 14; // 14 ≤ 10 + 5 = 15 → cool
    surfaceTemp[18] = 14;
    const result = computeWateringWindow(makeHourly({ surfaceTemp }), at10);
    expect(result.recommendedHour).toBe(17);
  });
});

// ── computeInsights: waterbalance insight enrichment ──────────────────────────

describe('computeInsights waterbalance wateringWindow', () => {
  // Minimal d object that satisfies computeInsights without throwing.
  function makeD({ moisture, surfaceTemp, airTemp } = {}) {
    const daily = {
      time: ['2026-04-11'],
      precipitation_sum:              [0],
      et0_fao_evapotranspiration:     [4],
      temperature_2m_max:             [15],
      temperature_2m_min:             [5],
      weather_code:                   [0],
      uv_index_max:                   [3],
      growing_degree_days_base_0_limit_50: [5],
    };
    const hourly = {
      soil_temperature_6cm:          Array(168).fill(12),
      soil_temperature_0_to_7cm:     surfaceTemp ?? Array(168).fill(16),
      soil_temperature_7_to_28cm:    Array(168).fill(14),
      soil_temperature_28_to_100cm:  Array(168).fill(10),
      temperature_2m:                airTemp     ?? Array(168).fill(10),
      precipitation_probability:     Array(168).fill(90),
      precipitation:                 Array(168).fill(0),
      relative_humidity_2m:          Array(168).fill(50),
      leaf_wetness_probability:      Array(168).fill(10),
      direct_radiation:              Array(168).fill(0),
      diffuse_radiation:             Array(168).fill(0),
      wind_gusts_10m:                Array(168).fill(20),
      dewpoint_2m:                   Array(168).fill(5),
      precipitation_type:            Array(168).fill(0),
      soil_moisture_1_to_3cm:        moisture ?? Array(168).fill(20),
    };
    return { daily, hourly };
  }

  const at10 = new Date('2026-04-11T10:00:00');

  test('waterbalance insight has wateringWindow when both gates pass', () => {
    const insights = computeInsights(makeD(), null, at10);
    const wb = insights.find(i => i.type === 'waterbalance');
    expect(wb).toBeDefined();
    expect(wb.wateringWindow).toBeDefined();
    expect(wb.wateringWindow.soilMoisture).toBe(20);
  });

  test('waterbalance insight has no wateringWindow when moisture is high', () => {
    const insights = computeInsights(makeD({ moisture: Array(168).fill(30) }), null, at10);
    const wb = insights.find(i => i.type === 'waterbalance');
    expect(wb).toBeDefined();
    expect(wb.wateringWindow).toBeUndefined();
  });
});

// ── computeVPD ────────────────────────────────────────────────────────────────
describe('computeVPD', () => {
  function makeHourly(middayKpa) {
    const arr = Array(24).fill(null);
    if (middayKpa !== null) arr[12] = middayKpa;
    return { vapour_pressure_deficit: arr };
  }

  test('returns null when vapour_pressure_deficit absent', () => {
    expect(computeVPD({})).toBeNull();
  });

  test('returns null when midday value is null', () => {
    expect(computeVPD(makeHourly(null))).toBeNull();
  });

  test('kPa < 0.4 → level low, no badge', () => {
    const r = computeVPD(makeHourly(0.3));
    expect(r.level).toBe('low');
    expect(r.badge).toBeNull();
    expect(r.tooltip).toBeNull();
  });

  test('kPa 0.4–1.19 → level moderate, no badge', () => {
    const r = computeVPD(makeHourly(0.8));
    expect(r.level).toBe('moderate');
    expect(r.badge).toBeNull();
    expect(r.tooltip).toBeNull();
  });

  test('kPa 1.2 → level high, badge caution', () => {
    const r = computeVPD(makeHourly(1.2));
    expect(r.level).toBe('high');
    expect(r.badge).toBe('caution');
    expect(r.tooltip).toContain('1.2 kPa');
    expect(r.tooltip).toContain('Transplant shock risk elevated');
  });

  test('kPa 1.99 → level high, badge caution', () => {
    const r = computeVPD(makeHourly(1.99));
    expect(r.level).toBe('high');
    expect(r.badge).toBe('caution');
  });

  test('kPa 2.0 → level very-high, badge warn', () => {
    const r = computeVPD(makeHourly(2.0));
    expect(r.level).toBe('very-high');
    expect(r.badge).toBe('warn');
    expect(r.tooltip).toContain('2.0 kPa');
  });

  test('kPa value is rounded to 1 decimal in tooltip', () => {
    const r = computeVPD(makeHourly(1.456));
    expect(r.tooltip).toContain('1.5 kPa');
  });
});

function monthInWindow(month, start, end) {
  // month: 1-12, start/end: "MM-DD" strings
  // Returns true if any day of `month` falls within [start, end]
  if (!start) return false;
  const s = parseInt(start.slice(0,2));
  const e = end ? parseInt(end.slice(0,2)) : 12;
  if (s <= e) return month >= s && month <= e;
  // year-crossing window (e.g. Oct-Mar): month >= s OR month <= e
  return month >= s || month <= e;
}

function todayMMDD() {
  const d = new Date();
  return String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function mmddLe(a, b) {
  // "MM-DD" string comparison (lexicographic works for same format)
  return a <= b;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('calendarTab', () => ({
    calYear: new Date().getFullYear(), // display only — sowing windows are month-based and repeat annually
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
      // Seeds sorted by type then name
      return [...this.seeds].sort((a, b) => {
        const t = (a.type||'').localeCompare(b.type||'');
        return t !== 0 ? t : a.name.localeCompare(b.name);
      });
    },

    cellBands(seed, month) {
      // Returns array of band class names for this seed x month cell
      const bands = [];
      if (monthInWindow(month, seed.sow_indoors_start, seed.sow_indoors_end)) bands.push('cal-band-indoor');
      if (monthInWindow(month, seed.sow_outdoors_start, seed.sow_outdoors_end)) bands.push('cal-band-outdoor');
      if (monthInWindow(month, seed.plant_out_start, seed.plant_out_end)) bands.push('cal-band-plantout');
      if (monthInWindow(month, seed.harvest_start, seed.harvest_end)) bands.push('cal-band-harvest');
      return bands;
    },

    prevYear() { this.calYear--; },
    nextYear() { this.calYear++; },
    typeEmoji(type) { return { herb: '🌿', vegetable: '🥕', flower: '🌸' }[type] || ''; },

    tooltipText(seed) {
      const parts = [];
      if (seed.days_to_germinate) parts.push(`Germinates: ${seed.days_to_germinate} days`);
      if (seed.optimum_soil_temp) parts.push(`Soil temp: ${seed.optimum_soil_temp}`);
      if (seed.optimum_soil_type) parts.push(`Soil type: ${seed.optimum_soil_type}`);
      if (seed.light_requirements) parts.push(`Light: ${seed.light_requirements}`);
      if (seed.growing_instructions) parts.push(seed.growing_instructions);
      return parts.join(' · ') || 'No growing info';
    },
  }));
});

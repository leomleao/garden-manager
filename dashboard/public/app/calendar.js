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
  }));
});

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function app() {
  return {
    // Shared state
    tab: 'overview',
    darkMode: true,
    config: {},
    summary: { zones: 0, activePlants: 0, overdueTasks: 0, seedsInStock: 0 },
    zones: [],
    plantings: [],
    seeds: [],
    tasks: [],
    activity: [],
    weather: { temp: null, desc: '', icon: '' },
    lastRefresh: '',
    refreshError: null,
    taskFilter: { zone_id: '', status: 'pending', priority: '' },
    newTask: { title:'', due_date:'', priority:'medium', zone_id:'' },

    async init() {
      const saved = localStorage.getItem('garden-theme') || 'dark';
      this.darkMode = saved === 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      await this.refresh();
      setInterval(() => this.refresh(), 60000);
    },

    toggleTheme() {
      this.darkMode = !this.darkMode;
      const theme = this.darkMode ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('garden-theme', theme);
    },

    async refresh() {
      try {
        const [cfg, sum, zones, plantings, seeds, tasks, act] = await Promise.all([
          fetch('/api/config').then(r=>r.json()),
          fetch('/api/summary').then(r=>r.json()),
          fetch('/api/zones').then(r=>r.json()),
          fetch('/api/plant-lifecycle').then(r=>r.json()),
          fetch('/api/seeds').then(r=>r.json()),
          fetch('/api/tasks').then(r=>r.json()),
          fetch('/api/activity').then(r=>r.json()),
        ]);
        this.config = cfg;
        this.summary = sum;
        this.plantings = plantings;
        this.seeds = seeds;
        this.tasks = tasks;
        this.activity = act;
        this.lastRefresh = new Date().toLocaleTimeString();
        this.refreshError = null;

        // Fetch zone detail (with cells) for grid zones
        this.zones = await Promise.all(zones.map(z =>
          z.view_type === 'grid'
            ? fetch(`/api/zones/${z.id}`).then(r=>r.json())
            : Promise.resolve({ ...z, cells: [] })
        ));

        this.fetchWeather();
      } catch(e) {
        console.error('refresh failed:', e);
        this.refreshError = 'Refresh failed';
      }
    },

    async fetchWeather() {
      const lat = this.config.latitude;
      const lng = this.config.longitude;
      if (!lat || !lng) return;
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&timezone=auto`
        );
        const d = await r.json();
        this.weather.temp = Math.round(d.current.temperature_2m);
        const code = d.current.weathercode;
        if (code === 0) { this.weather.desc = 'Clear'; this.weather.icon = '☀️'; }
        else if (code <= 3) { this.weather.desc = 'Partly cloudy'; this.weather.icon = '⛅'; }
        else if (code <= 48) { this.weather.desc = 'Foggy'; this.weather.icon = '🌫️'; }
        else if (code <= 67) { this.weather.desc = 'Rainy'; this.weather.icon = '🌧️'; }
        else if (code <= 77) { this.weather.desc = 'Snowy'; this.weather.icon = '❄️'; }
        else { this.weather.desc = 'Stormy'; this.weather.icon = '⛈️'; }
      } catch(e) { /* weather is optional */ }
    },

    // Task management
    get filteredTasks() {
      return this.tasks.filter(t => {
        if (this.taskFilter.zone_id && t.zone_id !== parseInt(this.taskFilter.zone_id)) return false;
        if (this.taskFilter.status && t.status !== this.taskFilter.status) return false;
        if (this.taskFilter.priority && t.priority !== this.taskFilter.priority) return false;
        return true;
      });
    },

    isOverdue(t) {
      return t.status === 'pending' && t.due_date && t.due_date < new Date().toISOString().slice(0,10);
    },

    async addTask() {
      if (!this.newTask.title) return;
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.newTask, zone_id: this.newTask.zone_id || null })
      });
      this.newTask = { title:'', due_date:'', priority:'medium', zone_id:'' };
      await this.refresh();
    },

    async completeTask(id) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
      });
      await this.refresh();
    },

    // Tab navigation
    goToTab(name) {
      this.tab = name;
    },

    // ── Zone grid state ──────────────────────────────────────────
    showZoneModal: false,
    editingZone: null,
    zoneForm: {},

    menuCellId: null,
    menuTimeout: null,

    showSeedPicker: false,
    sowCellId: null,
    sowZoneId: null,

    showCellDetail: false,
    detailPlanting: null,
    detailForm: {},

    activeSeedId: {},
    dragging: false,
    dragMoved: false,
    dragCells: new Set(),
    dragJustEnded: false,

    getCellStatus(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId && !['harvested','failed'].includes(p.status));
      return p ? p.status : 'empty';
    },
    getCellDesc(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId && !['harvested','failed'].includes(p.status));
      return p ? `${p.seed_name} (${p.status})` : 'Empty';
    },
    getZonePlantings(zoneId) {
      return this.plantings.filter(p => p.zone_id === zoneId && !['harvested','failed'].includes(p.status));
    },
    activePlanting(cellId) {
      return this.plantings.find(p => p.cell_id === cellId && !['harvested','failed'].includes(p.status));
    },

    openZoneSettings(zone) {
      this.editingZone = zone;
      this.zoneForm = { name: zone.name, type: zone.type, soil_type: zone.soil_type||'', watering_type: zone.watering_type||'', heating_type: zone.heating_type||'', lighting_type: zone.lighting_type||'', grid_rows: zone.grid_rows, grid_cols: zone.grid_cols, notes: zone.notes||'' };
      this.showZoneModal = true;
    },
    closeZoneModal() { this.showZoneModal = false; },
    async saveZoneSettings() {
      try {
        const r = await fetch(`/api/zones/${this.editingZone.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(this.zoneForm)
        });
        if (!r.ok) throw new Error(await r.text());
        this.showZoneModal = false;
        await this.refresh();
      } catch(e) { console.error('Zone save failed:', e); }
    },

    showMenu(cellId) {
      clearTimeout(this.menuTimeout);
      this.menuCellId = cellId;
    },
    hideMenu() {
      this.menuTimeout = setTimeout(() => { this.menuCellId = null; }, 150);
    },
    keepMenu() { clearTimeout(this.menuTimeout); },

    openSeedPicker(cellId, zoneId) {
      this.sowCellId = cellId;
      this.sowZoneId = zoneId;
      this.showSeedPicker = true;
    },
    closeSeedPicker() { this.showSeedPicker = false; },
    async sowSeed(seedId) {
      try {
        const r = await fetch('/api/plant-lifecycle', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ seed_id: seedId, zone_id: this.sowZoneId, cell_id: this.sowCellId, sown_date: new Date().toISOString().slice(0,10) })
        });
        if (!r.ok) throw new Error(await r.text());
        this.showSeedPicker = false;
        await this.refresh();
      } catch(e) { console.error('Sow failed:', e); }
    },

    async markOk(cellId) {
      const p = this.activePlanting(cellId);
      if (!p) return;
      try {
        await fetch(`/api/plant-lifecycle/${p.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ germinated_date: new Date().toISOString().slice(0,10), status: 'germinated' })
        });
        this.menuCellId = null;
        await this.refresh();
      } catch(e) { console.error('Mark OK failed:', e); }
    },
    async markDead(cellId) {
      const p = this.activePlanting(cellId);
      if (!p) return;
      this.plantings = this.plantings.filter(pl => pl.id !== p.id);
      this.menuCellId = null;
      try {
        await fetch(`/api/plant-lifecycle/${p.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ failed_date: new Date().toISOString().slice(0,10), status: 'failed' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark dead failed:', e); await this.refresh(); }
    },
    async markLoosePlantingOk(plantingId) {
      try {
        await fetch(`/api/plant-lifecycle/${plantingId}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ germinated_date: new Date().toISOString().slice(0,10) })
        });
        await this.refresh();
      } catch(e) { console.error('Mark OK failed:', e); }
    },
    async markLoosePlantingDead(plantingId) {
      this.plantings = this.plantings.filter(p => p.id !== plantingId);
      try {
        await fetch(`/api/plant-lifecycle/${plantingId}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ failed_date: new Date().toISOString().slice(0,10), status: 'failed' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark dead failed:', e); await this.refresh(); }
    },

    openCellDetail(cellId) {
      if (this.dragging || this.dragJustEnded) { this.dragJustEnded = false; return; }
      const p = this.activePlanting(cellId);
      if (!p) return;
      this.detailPlanting = p;
      this.detailForm = { sown_date: p.sown_date||'', germinated_date: p.germinated_date||'', moved_date: p.moved_date||'', harvested_date: p.harvested_date||'', failed_date: p.failed_date||'', notes: p.notes||'', quantity: p.quantity||1 };
      this.showCellDetail = true;
    },
    closeCellDetail() { this.showCellDetail = false; },
    async saveCellDetail() {
      try {
        const r = await fetch(`/api/plant-lifecycle/${this.detailPlanting.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(this.detailForm)
        });
        if (!r.ok) throw new Error(await r.text());
        this.showCellDetail = false;
        await this.refresh();
      } catch(e) { console.error('Save detail failed:', e); }
    },

    dragStart(cellId, zoneId) {
      this.dragging = true;
      this.dragMoved = false;
      this.dragCells = new Set([cellId]);
      this.sowZoneId = zoneId;
    },
    dragEnter(cellId) {
      if (!this.dragging) return;
      this.dragMoved = true;
      const next = new Set(this.dragCells);
      next.add(cellId);
      this.dragCells = next;
    },
    async dragEnd() {
      if (!this.dragging) return;
      this.dragging = false;
      this.dragJustEnded = this.dragMoved;
      const cells = [...this.dragCells];
      this.dragCells = new Set();
      if (!this.dragMoved || cells.length <= 1) return;
      const zoneId = this.sowZoneId;
      const seedId = this.activeSeedId[zoneId];
      if (!seedId) return;
      const occupied = new Set(this.plantings.filter(p => !['harvested','failed'].includes(p.status)).map(p => p.cell_id));
      const freeCells = cells.filter(id => !occupied.has(id));
      try {
        await Promise.all(freeCells.map(cellId =>
          fetch('/api/plant-lifecycle', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ seed_id: seedId, zone_id: zoneId, cell_id: cellId, sown_date: new Date().toISOString().slice(0,10) })
          })
        ));
        await this.refresh();
      } catch(e) { console.error('Drag sow failed:', e); }
    },
    isDragSelected(cellId) {
      return this.dragCells.has(cellId);
    },
  };
}

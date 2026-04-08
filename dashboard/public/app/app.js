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
    weatherData: null,   // full raw Open-Meteo response — available to all tabs
    weather: {
      temp: null, desc: '', icon: '',
      alerts: [],
      soil: { temp: null, status: '' },
      uv: null, rain: null,
      wateringStatus: '', actionText: '',
    },
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

    // Seed edit modal (shared: accessible from seeds tab, calendar, etc.)
    seedModal: {
      show: false, editingId: null,
      form: { name:'', variety:'', type:'', quantity:0, box_id:null, supplier:'', purchase_year:null, sow_by_year:null, purchase_link:'', days_to_germinate:null, optimum_soil_temp:'', optimum_soil_type:'', plant_height:'', light_requirements:'', growing_instructions:'', sow_indoors_start:'', sow_indoors_end:'', sow_outdoors_start:'', sow_outdoors_end:'', plant_out_start:'', plant_out_end:'', harvest_start:'', harvest_end:'', picture:null }
    },

    openSeedEdit(seed) {
      const { name, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture } = seed;
      const pictureDataUrl = picture ? `data:image/jpeg;base64,${picture}` : null;
      this.seedModal = { show: true, editingId: seed.id, form: { name, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture: pictureDataUrl } };
    },

    openSeedAdd() {
      this.seedModal = { show: true, editingId: null, form: { name:'', variety:'', type:'', quantity:0, box_id:null, supplier:'', purchase_year:null, sow_by_year:null, purchase_link:'', days_to_germinate:null, optimum_soil_temp:'', optimum_soil_type:'', plant_height:'', light_requirements:'', growing_instructions:'', sow_indoors_start:'', sow_indoors_end:'', sow_outdoors_start:'', sow_outdoors_end:'', plant_out_start:'', plant_out_end:'', harvest_start:'', harvest_end:'', picture:null } };
    },

    closeSeedModal() { this.seedModal.show = false; },

    handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.seedModal.form.picture = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    async saveSeed() {
      if (!this.seedModal.form.name) return;
      try {
        const url = this.seedModal.editingId ? `/api/seeds/${this.seedModal.editingId}` : '/api/seeds';
        const method = this.seedModal.editingId ? 'PATCH' : 'POST';
        const formData = { ...this.seedModal.form };
        // Extract base64 from data URL if present
        if (formData.picture && formData.picture.startsWith('data:')) {
          formData.picture = formData.picture.split(',')[1];
        }
        const r = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(formData) });
        if (!r.ok) throw new Error(await r.text());
        this.seedModal.show = false;
        await this.refresh();
      } catch(e) { console.error('Save seed failed:', e); }
    },

    async fetchWeather() {
      const lat = this.config.latitude;
      const lng = this.config.longitude;
      if (!lat || !lng) return;
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,weathercode` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,et0_fao_evapotranspiration` +
          `&hourly=soil_temperature_6cm` +
          `&timezone=auto&forecast_days=7`
        );
        const d = await r.json();
        if (!d.current || !d.daily || !d.hourly) return;
        this.weatherData = d;

        // ── Current conditions (unchanged behaviour) ──────────────────────
        this.weather.temp = Math.round(d.current.temperature_2m);
        const code = d.current.weathercode;
        if (code === 0)       { this.weather.desc = 'Clear';        this.weather.icon = '\u2600\uFE0F'; }
        else if (code <= 3)   { this.weather.desc = 'Partly cloudy'; this.weather.icon = '\u26C5'; }
        else if (code <= 48)  { this.weather.desc = 'Foggy';        this.weather.icon = '\u{1F32B}\uFE0F'; }
        else if (code <= 67)  { this.weather.desc = 'Rainy';        this.weather.icon = '\u{1F327}\uFE0F'; }
        else if (code <= 77)  { this.weather.desc = 'Snowy';        this.weather.icon = '\u2744\uFE0F'; }
        else                  { this.weather.desc = 'Stormy';       this.weather.icon = '\u26C8\uFE0F'; }

        // ── Daily data ────────────────────────────────────────────────────
        const daily    = d.daily;
        const dayNames = daily.time.map(t =>
          new Date(t + 'T12:00:00').toLocaleDateString('en', { weekday: 'long' })
        );

        const alerts = [];

        // Frost: first day with min temp <= 2°C
        const frostIdx = daily.temperature_2m_min.findIndex(t => t <= 2);
        if (frostIdx !== -1) {
          alerts.push({ level: 'red',
            text: `Frost Alert: ${dayNames[frostIdx]}, ${Math.round(daily.temperature_2m_min[frostIdx])}°C` });
        }

        // Severe weather: first day with code >= 96 (thunderstorm with hail)
        const severeIdx = daily.weather_code.findIndex(c => c >= 96);
        if (severeIdx !== -1) {
          alerts.push({ level: 'red', text: `Severe Weather: ${dayNames[severeIdx]}` });
        }

        // High wind: first day with code 85–95 (snow/wind showers)
        const windIdx = daily.weather_code.findIndex(c => c >= 85 && c <= 95);
        if (windIdx !== -1) {
          alerts.push({ level: 'amber', text: `High Winds: ${dayNames[windIdx]}` });
        }

        // High UV today
        if ((daily.uv_index_max[0] ?? 0) >= 7) {
          alerts.push({ level: 'amber', text: 'High UV today \u2014 avoid midday watering' });
        }

        // ── Today's stats ─────────────────────────────────────────────────
        this.weather.uv   = daily.uv_index_max[0]       ?? null;
        this.weather.rain = daily.precipitation_sum[0]   ?? null;

        // Water balance: precip minus evapotranspiration
        const balance = (daily.precipitation_sum[0] ?? 0) - (daily.et0_fao_evapotranspiration[0] ?? 0);
        if (balance < -2 && (daily.uv_index_max[0] ?? 0) >= 5) {
          this.weather.wateringStatus = 'High Water Need';
        } else if (balance < 0) {
          this.weather.wateringStatus = 'Adequate \u2014 monitor';
        } else {
          this.weather.wateringStatus = 'Well Watered';
        }

        // ── Soil temperature (current hour, 6 cm depth) ───────────────────
        const currentHour = new Date().getHours();
        const soilTemp = d.hourly.soil_temperature_6cm[currentHour];
        this.weather.soil.temp = soilTemp != null ? Math.round(soilTemp * 10) / 10 : null;
        if (soilTemp == null)      { this.weather.soil.status = ''; }
        else if (soilTemp < 10)    { this.weather.soil.status = 'Dormant / Too Cold'; }
        else if (soilTemp <= 18)   { this.weather.soil.status = 'Cool Season (Peas, Lettuce)'; }
        else                       { this.weather.soil.status = 'Warm Season (Tomatoes, Peppers)'; }

        // Ideal conditions green alert (only if no red/amber)
        const hasRedAmber = alerts.some(a => a.level === 'red' || a.level === 'amber');
        if (!hasRedAmber && soilTemp != null && soilTemp >= 10) {
          alerts.push({ level: 'green', text: 'Good conditions for sowing' });
        }

        this.weather.alerts = alerts;

        // ── Action text ───────────────────────────────────────────────────
        const topLevel = alerts[0]?.level;
        if (topLevel === 'red' && frostIdx === 0) {
          this.weather.actionText = 'Protect tender plants tonight';
        } else if (topLevel === 'red') {
          this.weather.actionText = 'Severe weather forecast \u2014 avoid outdoor work';
        } else if ((daily.uv_index_max[0] ?? 0) >= 7) {
          this.weather.actionText = 'Avoid watering foliage today \u2014 high UV';
        } else if (this.weather.wateringStatus === 'High Water Need') {
          this.weather.actionText = 'Plants need watering today';
        } else if (soilTemp != null && soilTemp < 10) {
          this.weather.actionText = 'Too cold for sowing \u2014 focus on indoor propagation';
        } else if (soilTemp != null && soilTemp > 18) {
          this.weather.actionText = 'Ideal conditions for warm-season crops';
        } else if (soilTemp != null && soilTemp >= 10) {
          this.weather.actionText = 'Good day for sowing peas or lettuce';
        } else {
          this.weather.actionText = 'Good day for general garden maintenance';
        }

      } catch(e) { /* weather is optional — new fields stay at initial empty state */ }
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

    taskCallbackPayload(task) {
      if (!task?.callback_payload) return null;
      if (typeof task.callback_payload === 'object') return task.callback_payload;
      try {
        return JSON.parse(task.callback_payload);
      } catch (e) {
        return null;
      }
    },

    taskCallbackLabel(task) {
      if (task?.callback_type !== 'clear_failed_plant') return '';
      const payload = this.taskCallbackPayload(task);
      return payload?.view_type === 'grid' ? 'Auto reset soil' : 'Auto remove plant';
    },

    taskCallbackDescription(task) {
      if (task?.callback_type !== 'clear_failed_plant') return '';
      const payload = this.taskCallbackPayload(task);
      const location = payload?.view_type === 'grid'
        ? (payload?.cell_label || task.zone_name || 'grid cell')
        : (task.zone_name || 'zone');
      return payload?.view_type === 'grid'
        ? `Completing this task will reset the soil in ${location}.`
        : `Completing this task will remove the failed plant from ${location}.`;
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

    // Zone grid state
    showZoneModal: false,
    editingZone: null,
    zoneForm: {},

    menuCellId: null,
    menuTimeout: null,

    showSeedPicker: false,
    sowCellId: null,
    sowZoneId: null,

    cellModal: {
      show: false,
      mode: 'new',
      cellId: null,
      zoneId: null,
      planting: null,
      form: {},
      showTransplant: false
    },

    getCellStatus(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId);
      return p ? p.status : 'empty';
    },
    getCellDesc(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId);
      return p ? `${p.seed_name} (${p.status})` : 'Empty';
    },
    getCellLabel(cellId, zoneId = null) {
      if (!cellId) return '';
      for (const zone of this.zones) {
        if (zoneId !== null && zone.id !== zoneId) continue;
        const cell = (zone.cells || []).find(c => c.id === cellId);
        if (cell) return cell.label;
      }
      return '';
    },
    getZoneName(zoneId) {
      return this.zones.find(z => z.id === zoneId)?.name || '';
    },
    getSeedDisplayName(plantingOrSeed) {
      if (!plantingOrSeed) return '';
      const name = plantingOrSeed.seed_name || plantingOrSeed.name || 'Unknown seed';
      const variety = plantingOrSeed.seed_variety || plantingOrSeed.variety;
      return variety ? `${name} · ${variety}` : name;
    },
    getCellModalEditTitle() {
      if (!this.cellModal.planting) return '';
      const location = this.cellModal.cellId
        ? this.getCellLabel(this.cellModal.cellId, this.cellModal.zoneId)
        : this.getZoneName(this.cellModal.zoneId);
      return location
        ? `${location} · ${this.getSeedDisplayName(this.cellModal.planting)}`
        : this.getSeedDisplayName(this.cellModal.planting);
    },
    defaultCellModalForm() {
      return {
        seed_id: '',
        sown_date: new Date().toISOString().slice(0,10),
        germinated_date: '',
        moved_date: '',
        harvested_date: '',
        failed_date: '',
        notes: ''
      };
    },
    defaultTransplantZoneId(planting) {
      const zones = this.zones.filter(z => z.id !== planting?.zone_id);
      return zones[0]?.id || '';
    },
    isGridZone(zoneId) {
      return this.zones.find(z => z.id === Number(zoneId))?.view_type === 'grid';
    },
    transplantZoneOptions(planting) {
      return this.zones.filter(z => z.id !== planting?.zone_id);
    },
    transplantCellOptions(zoneId, plantingId = null) {
      const targetZone = this.zones.find(z => z.id === Number(zoneId));
      if (!targetZone || targetZone.view_type !== 'grid') return [];
      const occupied = new Set(
        this.plantings
          .filter(p => p.id !== plantingId && p.cell_id && p.status !== 'harvested')
          .map(p => p.cell_id)
      );
      return (targetZone.cells || []).filter(cell => !occupied.has(cell.id));
    },
    derivePlantingStatus(form) {
      if (form.failed_date) return 'failed';
      if (form.harvested_date) return 'harvested';
      if (form.germinated_date) return 'germinated';
      return 'sown';
    },
    getZonePlantings(zoneId) {
      return this.plantings.filter(p => p.zone_id === zoneId && p.status !== 'harvested');
    },
    getAllZonePlantings(zoneId) {
      return this.plantings.filter(p => p.zone_id === zoneId);
    },
    zoneHasActivePlantings(zoneId) {
      return this.getZonePlantings(zoneId).length > 0;
    },
    zoneGridLocked(zone) {
      return zone?.view_type === 'grid' && this.zoneHasActivePlantings(zone.id);
    },
    zoneGridLockReason(zone) {
      return this.zoneGridLocked(zone) ? 'Grid settings are locked while this zone has active plantings.' : '';
    },
    zoneDeleteBlockedReason(zone) {
      return this.zoneHasActivePlantings(zone?.id) ? 'This zone cannot be deleted while it has active plantings.' : '';
    },
    buildZoneForm(zone) {
      return {
        name: zone.name || '',
        type: zone.type || 'other',
        view_type: zone.view_type || 'loose',
        grid_rows: zone.grid_rows ?? null,
        grid_cols: zone.grid_cols ?? null,
        cell_width_cm: zone.cell_width_cm ?? null,
        cell_height_cm: zone.cell_height_cm ?? null,
        area_sqm: zone.area_sqm ?? null,
        covered: !!zone.covered,
        cover_type: zone.cover_type || '',
        has_auto_watering: !!zone.has_auto_watering,
        watering_type: zone.watering_type || '',
        has_heating: !!zone.has_heating,
        heating_type: zone.heating_type || '',
        has_lighting: !!zone.has_lighting,
        lighting_type: zone.lighting_type || '',
        orientation: zone.orientation || '',
        slope_degrees: zone.slope_degrees ?? null,
        soil_type: zone.soil_type || '',
        latitude: zone.latitude ?? null,
        longitude: zone.longitude ?? null,
        notes: zone.notes || ''
      };
    },
    activePlanting(cellId) {
      return this.plantings.find(p => p.cell_id === cellId && p.status !== 'harvested');
    },
    canMarkOk(planting) {
      return !!planting && !['germinated', 'failed', 'harvested'].includes(planting.status);
    },
    canMarkHarvest(planting) {
      return !!planting && planting.status === 'germinated';
    },

    openZoneSettings(zone) {
      this.editingZone = zone;
      this.zoneForm = this.buildZoneForm(zone);
      this.showZoneModal = true;
    },
    closeZoneModal() {
      this.showZoneModal = false;
      this.editingZone = null;
      this.zoneForm = {};
    },
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
    async deleteZone() {
      if (!this.editingZone || this.zoneHasActivePlantings(this.editingZone.id)) return;
      try {
        const r = await fetch(`/api/zones/${this.editingZone.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await r.text());
        this.closeZoneModal();
        await this.refresh();
      } catch(e) { console.error('Zone delete failed:', e); }
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
          body: JSON.stringify({
            germinated_date: new Date().toISOString().slice(0,10),
            failed_date: null,
            status: 'germinated'
          })
        });
        this.menuCellId = null;
        await this.refresh();
      } catch(e) { console.error('Mark OK failed:', e); }
    },
    async markDead(cellId) {
      const p = this.activePlanting(cellId);
      if (!p) return;
      this.menuCellId = null;
      try {
        await fetch(`/api/plant-lifecycle/${p.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ failed_date: new Date().toISOString().slice(0,10), status: 'failed' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark dead failed:', e); await this.refresh(); }
    },
    async markHarvest(cellId) {
      const p = this.activePlanting(cellId);
      if (!p) return;
      this.menuCellId = null;
      try {
        await fetch(`/api/plant-lifecycle/${p.id}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ harvested_date: new Date().toISOString().slice(0,10), status: 'harvested' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark harvest failed:', e); await this.refresh(); }
    },
    async markLoosePlantingOk(plantingId) {
      try {
        await fetch(`/api/plant-lifecycle/${plantingId}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            germinated_date: new Date().toISOString().slice(0,10),
            failed_date: null,
            status: 'germinated'
          })
        });
        await this.refresh();
      } catch(e) { console.error('Mark OK failed:', e); }
    },
    async markLoosePlantingDead(plantingId) {
      try {
        await fetch(`/api/plant-lifecycle/${plantingId}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ failed_date: new Date().toISOString().slice(0,10), status: 'failed' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark dead failed:', e); await this.refresh(); }
    },
    async markLoosePlantingHarvest(plantingId) {
      try {
        await fetch(`/api/plant-lifecycle/${plantingId}`, {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ harvested_date: new Date().toISOString().slice(0,10), status: 'harvested' })
        });
        await this.refresh();
      } catch(e) { console.error('Mark harvest failed:', e); }
    },

    openPlantingModal(planting, options = {}) {
      const zoneId = options.zoneId ?? planting?.zone_id ?? null;
      const cellId = options.cellId ?? planting?.cell_id ?? null;
      this.cellModal = {
        show: true,
        mode: 'edit',
        cellId,
        zoneId,
        planting,
        showTransplant: false,
        form: {
          seed_id: planting.seed_id || '',
          sown_date: planting.sown_date || '',
          germinated_date: planting.germinated_date || '',
          moved_date: planting.moved_date || '',
          harvested_date: planting.harvested_date || '',
          failed_date: planting.failed_date || '',
          notes: planting.notes || '',
          transplant_zone_id: this.defaultTransplantZoneId(planting),
          transplant_cell_id: ''
        }
      };
    },
    openCellModal(cellId, zoneId) {
      this.menuCellId = null;
      const p = this.activePlanting(cellId);
      if (p) {
        this.openPlantingModal(p, { cellId, zoneId });
        return;
      }
      this.cellModal = {
        show: true,
        mode: 'new',
        cellId,
        zoneId,
        planting: null,
        showTransplant: false,
        form: {
          ...this.defaultCellModalForm()
        }
      };
    },
    openNewPlantingModal(cellId, zoneId) {
      this.cellModal = {
        show: true,
        mode: 'new',
        cellId,
        zoneId,
        planting: null,
        showTransplant: false,
        form: {
          ...this.defaultCellModalForm()
        }
      };
      this.menuCellId = null;
    },
    openLoosePlantingModal(planting) {
      this.openPlantingModal(planting, { cellId: null, zoneId: planting.zone_id });
    },
    closeCellModal() {
      this.cellModal = { show: false, mode: 'new', cellId: null, zoneId: null, planting: null, form: {}, showTransplant: false };
    },
    async saveCellModal() {
      try {
        let r;
        if (this.cellModal.mode === 'new') {
          r = await fetch('/api/plant-lifecycle', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              seed_id: this.cellModal.form.seed_id || null,
              zone_id: this.cellModal.zoneId,
              cell_id: this.cellModal.cellId,
              sown_date: this.cellModal.form.sown_date,
              quantity: 1,
              notes: this.cellModal.form.notes || ''
            })
          });
        } else {
          r = await fetch(`/api/plant-lifecycle/${this.cellModal.planting.id}`, {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              ...this.cellModal.form,
              status: this.derivePlantingStatus(this.cellModal.form)
            })
          });
        }
        if (!r.ok) throw new Error(await r.text());
        this.closeCellModal();
        await this.refresh();
      } catch(e) { console.error('Save detail failed:', e); }
    },
    async markCellModalDead() {
      if (this.cellModal.mode !== 'edit' || !this.cellModal.planting) return;
      try {
        const failedDate = new Date().toISOString().slice(0,10);
        const r = await fetch(`/api/plant-lifecycle/${this.cellModal.planting.id}`, {
          method: 'PATCH',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ failed_date: failedDate, status: 'failed' })
        });
        if (!r.ok) throw new Error(await r.text());
        this.closeCellModal();
        await this.refresh();
      } catch(e) { console.error('Mark dead failed:', e); }
    },
    async transplantCellModal() {
      if (this.cellModal.mode !== 'edit' || !this.cellModal.planting) return;
      this.cellModal.showTransplant = true;
    },
    async confirmTransplantCellModal() {
      if (this.cellModal.mode !== 'edit' || !this.cellModal.planting) return;
      try {
        const targetZoneId = Number(this.cellModal.form.transplant_zone_id);
        if (!targetZoneId) return;
        const targetCellId = this.isGridZone(targetZoneId)
          ? Number(this.cellModal.form.transplant_cell_id || 0)
          : null;
        if (this.isGridZone(targetZoneId) && !targetCellId) return;
        const movedDate = new Date().toISOString().slice(0,10);
        const nextStatus = this.cellModal.form.germinated_date ? 'germinated' : 'sown';
        const r = await fetch(`/api/plant-lifecycle/${this.cellModal.planting.id}`, {
          method: 'PATCH',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ moved_date: movedDate, zone_id: targetZoneId, cell_id: targetCellId, status: nextStatus })
        });
        if (!r.ok) throw new Error(await r.text());
        this.closeCellModal();
        await this.refresh();
      } catch(e) { console.error('Transplant failed:', e); }
    },
    async resetSoilCellModal() {
      if (this.cellModal.mode !== 'edit' || !this.cellModal.planting) return;
      try {
        const r = await fetch(`/api/plant-lifecycle/${this.cellModal.planting.id}`, {
          method: 'DELETE'
        });
        if (!r.ok) throw new Error(await r.text());
        this.closeCellModal();
        await this.refresh();
      } catch(e) { console.error('Reset soil failed:', e); }
    },
  };
}

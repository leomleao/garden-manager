function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function app() {
  return {
    tab: 'overview',
    darkMode: true,
    config: {},
    summary: { zones: 0, activePlants: 0, overdueTasks: 0, seedsInStock: 0 },
    zones: [],
    plantings: [],
    seeds: [],
    tasks: [],
    calendar: [],
    activity: [],
    weather: { temp: null, desc: '', icon: '' },
    lastRefresh: '',
    refreshError: null,
    seedSearch: '',
    taskFilter: { zone_id: '', status: 'pending', priority: '' },
    newSeed: { name:'', variety:'', type:'', quantity:0, supplier:'' },
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
        const [cfg, sum, zones, plantings, seeds, tasks, cal, act] = await Promise.all([
          fetch('/api/config').then(r=>r.json()),
          fetch('/api/summary').then(r=>r.json()),
          fetch('/api/zones').then(r=>r.json()),
          fetch('/api/plantings').then(r=>r.json()),
          fetch('/api/seeds').then(r=>r.json()),
          fetch('/api/tasks').then(r=>r.json()),
          fetch('/api/calendar').then(r=>r.json()),
          fetch('/api/activity').then(r=>r.json()),
        ]);
        this.config = cfg;
        this.summary = sum;
        this.plantings = plantings;
        this.seeds = seeds;
        this.tasks = tasks;
        this.calendar = cal;
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

    // Grid helpers
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

    // Seeds tab
    get filteredSeeds() {
      if (!this.seedSearch) return this.seeds;
      const q = this.seedSearch.toLowerCase();
      return this.seeds.filter(s => s.name.toLowerCase().includes(q) || (s.variety||'').toLowerCase().includes(q));
    },
    async addSeed() {
      if (!this.newSeed.name) return;
      await fetch('/api/seeds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newSeed)
      });
      this.newSeed = { name:'', variety:'', type:'', quantity:0, supplier:'' };
      await this.refresh();
    },

    // Tasks tab
    get filteredTasks() {
      return this.tasks.filter(t => {
        if (this.taskFilter.zone_id && t.zone_id !== parseInt(this.taskFilter.zone_id)) return false;
        if (this.taskFilter.status && t.status !== this.taskFilter.status) return false;
        if (this.taskFilter.priority && t.priority !== this.taskFilter.priority) return false;
        return true;
      });
    },
    isOverdue(t) { return t.status === 'pending' && t.due_date && t.due_date < new Date().toISOString().slice(0,10); },
    async addTask() {
      if (!this.newTask.title) return;
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newTask)
      });
      this.newTask = { title:'', due_date:'', priority:'medium', zone_id:'' };
      await this.refresh();
    },
    async completeTask(id) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
      });
      await this.refresh();
    },

    // Calendar tab
    get calendarTabHtml() {
      const today = new Date();
      const mm = String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
      const relevant = this.calendar.filter(c =>
        (c.sow_indoors_start && c.sow_indoors_start <= mm && mm <= (c.sow_indoors_end||'12-31')) ||
        (c.sow_outdoors_start && c.sow_outdoors_start <= mm && mm <= (c.sow_outdoors_end||'12-31'))
      );
      const rows = this.calendar.map(c => `
        <tr>
          <td>${esc(c.crop_name)}</td>
          <td class="text-muted">${esc(c.sow_indoors_start||'')}${c.sow_indoors_end?' – '+esc(c.sow_indoors_end):''}</td>
          <td class="text-muted">${esc(c.sow_outdoors_start||'')}${c.sow_outdoors_end?' – '+esc(c.sow_outdoors_end):''}</td>
          <td style="color:var(--green)">${esc(c.harvest_start||'')}${c.harvest_end?' – '+esc(c.harvest_end):''}</td>
          <td class="text-muted" style="font-size:.75rem">${esc(c.notes||'')}</td>
        </tr>`).join('');
      const nowRows = relevant.map(c => `
        <div style="padding:.375rem 0;border-bottom:1px solid var(--border)">
          <strong>${esc(c.crop_name)}</strong>
          ${c.sow_indoors_start && c.sow_indoors_start<=mm ? '<span class="badge badge-sown" style="margin-left:.5rem">Sow indoors</span>' : ''}
          ${c.sow_outdoors_start && c.sow_outdoors_start<=mm ? '<span class="badge badge-germinated" style="margin-left:.5rem">Sow outdoors</span>' : ''}
        </div>`).join('');
      return `
        <div class="card">
          <h2>Sow Now</h2>
          ${nowRows || '<p class="text-muted">Nothing to sow right now.</p>'}
        </div>
        <div class="card">
          <h2>Full Calendar</h2>
          <table>
            <thead><tr><th>Crop</th><th>Sow Indoors</th><th>Sow Outdoors</th><th>Harvest</th><th>Notes</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    },

    // Settings tab
    get settingsTabHtml() {
      const zoneCards = this.zones.map(z => `
        <div class="card" style="margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between">
            <strong>${esc(z.name)}</strong>
            <span class="text-muted" style="font-size:.75rem">${esc(z.type)} · ${esc(z.view_type)}</span>
          </div>
        </div>`).join('');
      return `
        <div class="card">
          <h2>About</h2>
          <p class="text-muted" style="font-size:.875rem">
            Garden: <strong>${esc(this.config.location_name||'–')}</strong> ·
            Owner: <strong>${esc(this.config.owner_name||'–')}</strong> ·
            Timezone: <strong>${esc(this.config.timezone||'–')}</strong>
          </p>
        </div>
        <div class="card">
          <h2>Zones</h2>
          ${zoneCards}
          <p class="text-muted" style="font-size:.75rem;margin-top:.5rem">
            To add or edit zones, re-run setup: clear <code>setup_complete</code> from app_config and restart.
          </p>
        </div>
        <div class="card">
          <h2>OpenClaw</h2>
          <p class="text-muted" style="font-size:.875rem;margin-bottom:.75rem">
            ${this.config.openclaw_enabled==='1' ? '✓ Enabled' : 'Not configured'}
          </p>
          <p style="font-size:.875rem">Run <code>./openclaw/cron-setup.sh</code> from the repo root to install cron jobs.</p>
        </div>`;
    }
  };
}

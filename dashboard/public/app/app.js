function app() {
  return {
    tab: 'overview',
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
    seedSearch: '',
    taskFilter: { zone_id: '', status: 'pending', priority: '' },
    newSeed: { name:'', variety:'', type:'', quantity:0, supplier:'' },
    newTask: { title:'', due_date:'', priority:'medium', zone_id:'' },

    async init() {
      await this.refresh();
      setInterval(() => this.refresh(), 60000);
    },

    async refresh() {
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

      // Fetch zone detail (with cells) for grid zones
      this.zones = await Promise.all(zones.map(z =>
        z.view_type === 'grid'
          ? fetch(`/api/zones/${z.id}`).then(r=>r.json())
          : Promise.resolve({ ...z, cells: [] })
      ));

      this.fetchWeather();
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
    get seedsTabHtml() {
      const rows = this.filteredSeeds.map(s => `
        <tr>
          <td>${s.name}</td>
          <td style="color:#9ca3af">${s.variety||''}</td>
          <td><span class="badge badge-sown">${s.type||''}</span></td>
          <td style="text-align:center">${s.quantity}</td>
          <td style="color:#9ca3af">${s.supplier||''}</td>
          <td style="color:#9ca3af">${s.sow_by_year||''}</td>
        </tr>`).join('');
      return `
        <div class="card">
          <div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center">
            <h2 style="flex:1">Seed Inventory</h2>
            <input type="search" placeholder="Search…" style="width:200px" x-model="seedSearch">
          </div>
          <table>
            <thead><tr>
              <th>Name</th><th>Variety</th><th>Type</th>
              <th style="text-align:center">Qty</th><th>Supplier</th><th>Sow By</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Add Seed</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.5rem">
            <input placeholder="Name *" x-model="newSeed.name">
            <input placeholder="Variety" x-model="newSeed.variety">
            <input placeholder="Type" x-model="newSeed.type">
            <input placeholder="Quantity" type="number" x-model.number="newSeed.quantity">
            <input placeholder="Supplier" x-model="newSeed.supplier">
          </div>
          <button class="btn btn-primary btn-sm" @click="addSeed()">Add Seed</button>
        </div>`;
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
    get tasksTabHtml() {
      const zoneOptions = this.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
      const rows = this.filteredTasks.map(t => `
        <tr class="${this.isOverdue(t)?'overdue':''}">
          <td>${t.title}</td>
          <td><span class="badge badge-${t.priority}">${t.priority}</span></td>
          <td><span class="badge badge-${t.status}">${t.status}</span></td>
          <td style="color:#9ca3af">${t.due_date||''}</td>
          <td style="color:#9ca3af">${t.zone_name||'All zones'}</td>
          <td>
            <button class="btn btn-sm" style="background:#1a3a2e;color:#86efac"
              @click="completeTask(${t.id})">✓</button>
          </td>
        </tr>`).join('');
      return `
        <div class="card">
          <div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center;flex-wrap:wrap">
            <h2 style="flex:1">Tasks</h2>
            <select x-model="taskFilter.zone_id" style="width:130px">
              <option value="">All zones</option>${zoneOptions}
            </select>
            <select x-model="taskFilter.status" style="width:110px">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
            <select x-model="taskFilter.priority" style="width:100px">
              <option value="">All priorities</option>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <table>
            <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Zone</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Add Task</h2>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:.5rem;margin-bottom:.5rem">
            <input placeholder="Task title *" x-model="newTask.title">
            <input type="date" x-model="newTask.due_date">
            <select x-model="newTask.priority">
              <option>high</option><option selected>medium</option><option>low</option>
            </select>
            <select x-model.number="newTask.zone_id">
              <option value="">All zones</option>${zoneOptions}
            </select>
          </div>
          <button class="btn btn-primary btn-sm" @click="addTask()">Add Task</button>
        </div>`;
    },
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
          <td>${c.crop_name}</td>
          <td style="color:#9ca3af">${c.sow_indoors_start||''}${c.sow_indoors_end?' – '+c.sow_indoors_end:''}</td>
          <td style="color:#9ca3af">${c.sow_outdoors_start||''}${c.sow_outdoors_end?' – '+c.sow_outdoors_end:''}</td>
          <td style="color:var(--green)">${c.harvest_start||''}${c.harvest_end?' – '+c.harvest_end:''}</td>
          <td style="color:#9ca3af;font-size:.75rem">${c.notes||''}</td>
        </tr>`).join('');
      const nowRows = relevant.map(c => `
        <div style="padding:.375rem 0;border-bottom:1px solid #374151">
          <strong>${c.crop_name}</strong>
          ${c.sow_indoors_start && c.sow_indoors_start<=mm ? '<span class="badge badge-sown" style="margin-left:.5rem">Sow indoors</span>' : ''}
          ${c.sow_outdoors_start && c.sow_outdoors_start<=mm ? '<span class="badge badge-germinated" style="margin-left:.5rem">Sow outdoors</span>' : ''}
        </div>`).join('');
      return `
        <div class="card">
          <h2>Sow Now</h2>
          ${nowRows || '<p style="color:#9ca3af">Nothing to sow right now.</p>'}
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
            <strong>${z.name}</strong>
            <span style="color:#9ca3af;font-size:.75rem">${z.type} · ${z.view_type}</span>
          </div>
        </div>`).join('');
      return `
        <div class="card">
          <h2>About</h2>
          <p style="color:#9ca3af;font-size:.875rem">
            Garden: <strong>${this.config.location_name||'–'}</strong> ·
            Owner: <strong>${this.config.owner_name||'–'}</strong> ·
            Timezone: <strong>${this.config.timezone||'–'}</strong>
          </p>
        </div>
        <div class="card">
          <h2>Zones</h2>
          ${zoneCards}
          <p style="color:#9ca3af;font-size:.75rem;margin-top:.5rem">
            To add or edit zones, re-run setup: clear <code>setup_complete</code> from app_config and restart.
          </p>
        </div>
        <div class="card">
          <h2>OpenClaw</h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:.75rem">
            ${this.config.openclaw_enabled==='1' ? '✓ Enabled' : 'Not configured'}
          </p>
          <p style="font-size:.875rem">Run <code>./openclaw/cron-setup.sh</code> from the repo root to install cron jobs.</p>
        </div>`;
    }
  };
}

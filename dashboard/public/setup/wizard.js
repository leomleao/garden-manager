function wizard() {
  return {
    currentStep: 1,
    steps: [1,2,3,4,5,6],
    exampleDataLoaded: false,
    config: {
      owner_name: '', location_name: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: 'metric', latitude: null, longitude: null
    },
    zones: [],
    seedOption: 'keep',   // keep | clear | skip
    openclawEnabled: false,
    map: null, marker: null,

    // Step 4 HTML (seed inventory)
    get step4Html() {
      return `
        <div class="card">
          <h2>Seed Inventory</h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1rem">
            Example seeds are preloaded. What would you like to do?
          </p>
          <label class="toggle" style="margin-bottom:.5rem">
            <input type="radio" name="seeds" value="keep" x-model="seedOption"> Keep example seeds
          </label>
          <label class="toggle" style="margin-bottom:.5rem">
            <input type="radio" name="seeds" value="clear" x-model="seedOption"> Clear all — start fresh
          </label>
          <label class="toggle" style="margin-bottom:1rem">
            <input type="radio" name="seeds" value="skip" x-model="seedOption"> Skip — manage later in dashboard
          </label>
          <div class="btn-row">
            <button class="btn btn-secondary" @click="currentStep=3">← Back</button>
            <button class="btn btn-primary" @click="currentStep=5">Next →</button>
          </div>
        </div>`;
    },

    // Step 5 HTML (OpenClaw)
    get step5Html() {
      return `
        <div class="card">
          <h2>OpenClaw Integration <span style="font-size:.75rem;color:#9ca3af;font-weight:400">(optional)</span></h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1rem">
            OpenClaw is an AI agent that can query and update your garden by chat or WhatsApp.
            See <code>openclaw/README.md</code> for full details.
          </p>
          <label class="toggle" style="margin-bottom:1rem">
            <input type="checkbox" x-model="openclawEnabled"> I use OpenClaw
          </label>
          <div x-show="openclawEnabled" style="background:#111827;border-radius:.5rem;padding:1rem;font-size:.875rem">
            <p style="margin-bottom:.5rem"><strong>1. Copy the skill:</strong></p>
            <pre style="background:#1f2937;padding:.5rem;border-radius:.25rem;overflow-x:auto;margin-bottom:.75rem">cp -r openclaw/skills/garden-manager /path/to/openclaw/skills/</pre>
            <p style="margin-bottom:.5rem"><strong>2. Install cron jobs:</strong></p>
            <pre style="background:#1f2937;padding:.5rem;border-radius:.25rem;overflow-x:auto">chmod +x openclaw/cron-setup.sh && ./openclaw/cron-setup.sh</pre>
            <p style="margin-top:.75rem;color:#9ca3af">You can re-run these steps from Settings at any time.</p>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary" @click="currentStep=4">← Back</button>
            <button class="btn btn-primary" @click="currentStep=6">Next →</button>
          </div>
        </div>`;
    },

    // Step 6 HTML (review & launch) — built dynamically
    get step6Html() {
      const zoneList = this.zones.map(z =>
        `<div style="padding:.5rem;background:#111827;border-radius:.375rem;margin-bottom:.5rem">
          <strong>${z.name}</strong>
          <span style="color:#9ca3af;font-size:.875rem;margin-left:.5rem">${z.type} · ${z.view_type}</span>
          ${z.view_type==='grid' ? `<span style="color:#9ca3af;font-size:.75rem;margin-left:.5rem">${z.grid_rows}×${z.grid_cols} cells</span>` : ''}
        </div>`
      ).join('');
      return `
        <div class="card">
          <h2>Review & Launch</h2>
          <div style="margin-bottom:1rem">
            <p><strong>${this.config.owner_name || 'Your'}</strong> garden at
               <strong>${this.config.location_name || 'your location'}</strong></p>
            <p style="color:#9ca3af;font-size:.875rem">${this.config.timezone} · ${this.config.units}</p>
          </div>
          <p style="font-weight:600;margin-bottom:.5rem">Zones (${this.zones.length})</p>
          ${zoneList || '<p style="color:#9ca3af;font-size:.875rem">No zones configured</p>'}
          <div class="btn-row" style="margin-top:1.5rem">
            <button class="btn btn-secondary" @click="currentStep=5">← Back</button>
            <button class="btn btn-primary" @click="launch()">Launch Garden Manager →</button>
          </div>
        </div>`;
    },

    async init() {
      // Check if example data is loaded
      const res = await fetch('/api/config');
      const cfg = await res.json();
      this.exampleDataLoaded = cfg.example_data_loaded === '1';
      // Pre-fill if re-running wizard
      if (cfg.owner_name) this.config.owner_name = cfg.owner_name;
      if (cfg.location_name) this.config.location_name = cfg.location_name;
      if (cfg.timezone) this.config.timezone = cfg.timezone;
      if (cfg.units) this.config.units = cfg.units;

      // Init map after DOM is ready
      this.$nextTick(() => this.initMap());
    },

    initMap() {
      const lat = parseFloat(this.config.latitude) || 54.5;
      const lng = parseFloat(this.config.longitude) || -3.5;
      this.map = L.map('map').setView([lat, lng], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);
      if (this.config.latitude) {
        this.marker = L.marker([lat, lng]).addTo(this.map);
      }
      this.map.on('click', (e) => {
        this.config.latitude  = parseFloat(e.latlng.lat.toFixed(4));
        this.config.longitude = parseFloat(e.latlng.lng.toFixed(4));
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(this.map);
      });
    },

    updateMapPin() {
      if (!this.map || !this.config.latitude || !this.config.longitude) return;
      if (this.marker) this.map.removeLayer(this.marker);
      this.marker = L.marker([this.config.latitude, this.config.longitude]).addTo(this.map);
      this.map.setView([this.config.latitude, this.config.longitude], 12);
    },

    addZone() {
      this.zones.push({
        name: '', type: 'outdoor', view_type: 'loose',
        grid_rows: null, grid_cols: null, cell_width_cm: null, cell_height_cm: null,
        area_sqm: null, covered: false, cover_type: '',
        has_auto_watering: false, watering_type: '',
        has_heating: false, heating_type: '',
        has_lighting: false, lighting_type: '',
        orientation: '', slope_degrees: null, soil_type: '', notes: '',
        latitude: this.config.latitude, longitude: this.config.longitude
      });
    },

    async saveConfigStep() {
      const keys = ['owner_name','location_name','timezone','units','latitude','longitude'];
      for (const key of keys) {
        if (this.config[key] !== null && this.config[key] !== '') {
          await fetch('/api/setup/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: String(this.config[key]) })
          });
        }
      }
      this.currentStep = 3;
    },

    async launch() {
      // Handle seed option
      if (this.seedOption === 'clear') {
        await fetch('/api/setup/example-data', { method: 'DELETE' });
      }

      // Save zones
      for (const zone of this.zones) {
        await fetch('/api/setup/zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zone)
        });
      }

      // Save OpenClaw preference
      await fetch('/api/setup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'openclaw_enabled', value: this.openclawEnabled ? '1' : '0' })
      });

      // Mark complete
      await fetch('/api/setup/complete', { method: 'POST' });
      window.location.href = '/';
    }
  };
}

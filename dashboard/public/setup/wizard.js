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
    originalZoneIds: [],
    seedOption: 'keep',   // keep | clear | skip
    openclawEnabled: false,
    map: null, marker: null,

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
      // Load existing zones from DB into the zones array so user can edit/delete them
      const zonesRes = await fetch('/api/zones');
      const existing = await zonesRes.json();
      this.zones = existing;
      this.originalZoneIds = existing.map(z => z.id);
    },

    async initMap() {
      if (this.map) return;
      const lat = parseFloat(this.config.latitude) || 54.5;
      const lng = parseFloat(this.config.longitude) || -3.5;
      // Lazy-load Leaflet if not already loaded
      if (!window.L) {
        await Promise.all([
          new Promise(resolve => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.onload = resolve;
            document.head.appendChild(link);
          }),
          new Promise(resolve => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = resolve;
            document.body.appendChild(script);
          })
        ]);
      }
      this.map = window.L.map('map', { preferCanvas: true }).setView([lat, lng], 6);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        updateWhenIdle: true,
        updateWhenZooming: false
      }).addTo(this.map);
      if (this.config.latitude) {
        this.marker = window.L.marker([lat, lng]).addTo(this.map);
      }
      this.map.on('click', (e) => {
        const wrapped = e.latlng.wrap();
        this.config.latitude  = parseFloat(wrapped.lat.toFixed(4));
        this.config.longitude = parseFloat(wrapped.lng.toFixed(4));
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = window.L.marker([e.latlng.lat, e.latlng.lng]).addTo(this.map);
      });
    },

    updateMapPin() {
      if (!this.map || !this.config.latitude || !this.config.longitude) return;
      if (this.marker) this.map.removeLayer(this.marker);
      this.marker = window.L.marker([this.config.latitude, this.config.longitude]).addTo(this.map);
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
      // Handle seed inventory
      if (this.seedOption === 'clear') {
        await fetch('/api/setup/example-data', { method: 'DELETE' });
        // example-data wipes all zones too, so skip individual zone ops
        this.originalZoneIds = [];
        this.zones = this.zones.filter(z => !z.id);
      }

      // Delete any original DB zones the user removed
      const keptIds = new Set(this.zones.filter(z => z.id).map(z => z.id));
      for (const id of this.originalZoneIds) {
        if (!keptIds.has(id)) {
          await fetch(`/api/zones/${id}`, { method: 'DELETE' });
        }
      }

      // PATCH existing zones (edits), POST new zones
      for (const zone of this.zones) {
        if (zone.id) {
          await fetch(`/api/zones/${zone.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zone)
          });
        } else {
          await fetch('/api/setup/zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zone)
          });
        }
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

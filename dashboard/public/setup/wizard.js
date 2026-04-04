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

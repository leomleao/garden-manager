document.addEventListener('alpine:init', () => {
  Alpine.data('settingsTab', () => ({
    showMapModal: false,
    mapInstance: null,
    mapMarker: null,
    pendingLat: null,
    pendingLng: null,

    async saveConfig(key, value) {
      try {
        await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: String(value ?? '') })
        });
        await this.refresh();
      } catch (e) {
        console.error('Config save failed:', e);
      }
    },

    async openMapModal() {
      this.showMapModal = true;
      this.pendingLat = parseFloat(this.config.latitude) || 55.0;
      this.pendingLng = parseFloat(this.config.longitude) || -3.0;
      await this.$nextTick();
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
      if (this.mapInstance) {
        this.mapInstance.remove();
        this.mapInstance = null;
      }
      this.mapInstance = window.L.map('settings-map', { preferCanvas: true })
        .setView([this.pendingLat, this.pendingLng], 8);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        updateWhenIdle: true,
        updateWhenZooming: false
      }).addTo(this.mapInstance);
      this.mapMarker = window.L.marker([this.pendingLat, this.pendingLng]).addTo(this.mapInstance);
      this.mapInstance.on('click', (e) => {
        this.pendingLat = e.latlng.lat;
        this.pendingLng = e.latlng.lng;
        if (this.mapMarker) this.mapMarker.setLatLng(e.latlng);
        else this.mapMarker = window.L.marker(e.latlng).addTo(this.mapInstance);
      });
    },

    closeMapModal() {
      this.showMapModal = false;
      if (this.mapInstance) { this.mapInstance.remove(); this.mapInstance = null; }
    },

    async confirmLocation() {
      if (this.pendingLat === null) return;
      try {
        await Promise.all([
          fetch('/api/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'latitude', value: String(this.pendingLat) }) }),
          fetch('/api/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'longitude', value: String(this.pendingLng) }) })
        ]);
        this.closeMapModal();
        await this.refresh();
      } catch (e) {
        console.error('Location save failed:', e);
      }
    },

    get timezoneOptions() {
      // Common IANA timezones (not exhaustive, practical subset)
      return [
        'UTC', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
        'Europe/Rome', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Brussels',
        'Europe/Stockholm', 'Europe/Oslo', 'Europe/Helsinki', 'Europe/Warsaw',
        'Europe/Prague', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Lisbon',
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
        'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'
      ];
    },
  }));
});

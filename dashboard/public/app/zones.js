document.addEventListener('alpine:init', () => {
  Alpine.data('zonesTab', () => ({
    // Zone settings modal
    showZoneModal: false,
    editingZone: null,
    zoneForm: {},

    // Cell hover menu
    menuCellId: null,
    menuTimeout: null,

    // Seed picker modal (for sow action)
    showSeedPicker: false,
    sowCellId: null,
    sowZoneId: null,

    // Cell detail modal
    showCellDetail: false,
    detailPlanting: null,
    detailForm: {},

    // Drag-to-sow
    activeSeedId: {},
    dragging: false,
    dragMoved: false,
    dragCells: new Set(),
    dragJustEnded: false,

    // Helper methods
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

    // Zone settings modal
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

    // Cell hover menu
    showMenu(cellId) {
      clearTimeout(this.menuTimeout);
      this.menuCellId = cellId;
    },
    hideMenu() {
      this.menuTimeout = setTimeout(() => { this.menuCellId = null; }, 150);
    },
    keepMenu() { clearTimeout(this.menuTimeout); },

    // Sow action
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

    // OK and Dead actions
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
      // Optimistic UI: remove from plantings immediately
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

    // Cell detail modal
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

    // Drag-to-sow
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
      if (!this.dragMoved || cells.length <= 1) return; // single click — no drag sow
      const zoneId = this.sowZoneId;
      const seedId = this.activeSeedId[zoneId];
      if (!seedId) return;
      // Skip occupied cells, batch sow the rest
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
  }));
});

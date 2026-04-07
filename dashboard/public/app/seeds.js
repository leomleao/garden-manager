document.addEventListener('alpine:init', () => {
  Alpine.data('seedsTab', () => ({
    search: '',
    typeFilter: '',
    showModal: false,
    editingId: null,
    form: {
      name: '', variety: '', type: '',
      quantity: 0, supplier: '', purchase_year: null, sow_by_year: null,
      purchase_link: '',
      days_to_germinate: null, optimum_soil_temp: '', optimum_soil_type: '',
      plant_height: '', light_requirements: '', growing_instructions: '',
      sow_indoors_start: '', sow_indoors_end: '',
      sow_outdoors_start: '', sow_outdoors_end: '',
      plant_out_start: '', plant_out_end: '',
      harvest_start: '', harvest_end: ''
    },

    get filteredSeeds() {
      let list = this.$root.seeds;
      if (this.typeFilter) list = list.filter(s => s.type === this.typeFilter);
      if (this.search) {
        const q = this.search.toLowerCase();
        list = list.filter(s => s.name.toLowerCase().includes(q) || (s.variety||'').toLowerCase().includes(q));
      }
      return list;
    },

    typeEmoji(type) {
      return { herb: '🌿', vegetable: '🥕', flower: '🌸' }[type] || '';
    },

    badgeClass(type) {
      return { herb: 'badge-herb', vegetable: 'badge-vegetable', flower: 'badge-flower' }[type] || 'badge-sown';
    },

    openAdd() {
      this.editingId = null;
      this.form = {
        name: '', variety: '', type: '',
        quantity: 0, supplier: '', purchase_year: null, sow_by_year: null,
        purchase_link: '',
        days_to_germinate: null, optimum_soil_temp: '', optimum_soil_type: '',
        plant_height: '', light_requirements: '', growing_instructions: '',
        sow_indoors_start: '', sow_indoors_end: '',
        sow_outdoors_start: '', sow_outdoors_end: '',
        plant_out_start: '', plant_out_end: '',
        harvest_start: '', harvest_end: ''
      };
      this.showModal = true;
    },

    openEdit(seed) {
      this.editingId = seed.id;
      this.form = { ...seed };
      this.showModal = true;
    },

    closeModal() { this.showModal = false; },

    async save() {
      if (!this.form.name) return;
      const url = this.editingId ? `/api/seeds/${this.editingId}` : '/api/seeds';
      const method = this.editingId ? 'PATCH' : 'POST';
      await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(this.form) });
      this.showModal = false;
      await this.$root.refresh();
    }
  }));
});

document.addEventListener('alpine:init', () => {
  Alpine.data('seedsTab', () => ({
    search: '',
    typeFilter: '',

    get filteredSeeds() {
      let list = this.seeds;
      if (this.typeFilter) list = list.filter(s => s.type === this.typeFilter);
      if (this.search) {
        const q = this.search.toLowerCase();
        list = list.filter(s => s.name.toLowerCase().includes(q) || (s.variety||'').toLowerCase().includes(q));
      }
      return list;
    },

    typeEmoji(type) {
      return { herb: '\u{1F33F}', vegetable: '\u{1F955}', flower: '\u{1F338}', salad: '\u{1F96C}', fruit: '\u{1F345}' }[type] || '';
    },

    getSeedEmoji(seed) {
      // Priority: use seed-specific emoji from the database, fallback to type-based emoji
      return (seed?.emoji && seed.emoji.trim()) || this.typeEmoji(seed?.type);
    },

    typeLabel(type) {
      return { herb: 'herb', vegetable: 'veg', flower: 'flower' }[type] || (type || '');
    },

    badgeClass(type) {
      return { herb: 'badge-herb', vegetable: 'badge-vegetable', flower: 'badge-flower', fruit: 'badge-fruit', salad: 'badge-salad' }[type] || '';
    },
  }));
});

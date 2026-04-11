# Seed Emoji Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to type an emoji in the seed name field; on save, extract the first emoji into the `emoji` DB column and strip it from the name.

**Architecture:** A pure `extractEmoji(str)` helper is added to `app.js` (tested via a new Jest test file). `openSeedEdit` prepends the stored emoji back into the name field for editing. `saveSeed` calls `extractEmoji` on `formData.name` before sending. No backend changes needed — the API already accepts `emoji` on POST and PATCH.

**Tech Stack:** Vanilla JS, Alpine.js, Jest (Node.js 20), SQLite via better-sqlite3

---

## File Map

| File | Change |
|---|---|
| `dashboard/public/app/app.js` | Add `extractEmoji()` before `function app()`; add `module.exports` at bottom; update `openSeedEdit`; update `saveSeed` |
| `dashboard/tests/app-helpers.test.js` | New file — unit tests for `extractEmoji` |
| `dashboard/public/app/index.html` | Update name field placeholder text |

---

### Task 1: `extractEmoji` helper — TDD

**Files:**
- Create: `dashboard/tests/app-helpers.test.js`
- Modify: `dashboard/public/app/app.js` (top of file + bottom)

- [ ] **Step 1: Create the failing test file**

Create `dashboard/tests/app-helpers.test.js`:

```js
// dashboard/tests/app-helpers.test.js
const { extractEmoji } = require('../public/app/app.js');

describe('extractEmoji', () => {
  test('extracts emoji at start of string', () => {
    expect(extractEmoji('🍅 Tomato')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('extracts emoji at end of string', () => {
    expect(extractEmoji('Tomato 🍅')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('extracts emoji embedded in middle of string', () => {
    expect(extractEmoji('Tom🌿ato')).toEqual({ emoji: '🌿', name: 'Tomato' });
  });

  test('uses first emoji when multiple are present', () => {
    expect(extractEmoji('🍅🌿 Tomato')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('all emojis stripped from name when multiple present', () => {
    const result = extractEmoji('🍅🌿 Tomato');
    expect(result.name).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(result.name).toBe('Tomato');
  });

  test('returns null emoji when no emoji present', () => {
    expect(extractEmoji('Tomato')).toEqual({ emoji: null, name: 'Tomato' });
  });

  test('returns empty name when input is emoji only', () => {
    expect(extractEmoji('🍅')).toEqual({ emoji: '🍅', name: '' });
  });

  test('trims surrounding whitespace from name', () => {
    expect(extractEmoji('  Tomato  ')).toEqual({ emoji: null, name: 'Tomato' });
  });

  test('normalises multiple spaces after emoji strip', () => {
    expect(extractEmoji('🍅  Tomato  Basil')).toEqual({ emoji: '🍅', name: 'Tomato Basil' });
  });

  test('handles empty string', () => {
    expect(extractEmoji('')).toEqual({ emoji: null, name: '' });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd dashboard && npx jest app-helpers.test.js --no-coverage 2>&1 | tail -8
```

Expected: FAIL — `extractEmoji is not a function` (module.exports not yet added to app.js).

- [ ] **Step 3: Add `extractEmoji` to `app.js`**

Open `dashboard/public/app/app.js`. The file starts with:
```js
function esc(s) {
  return String(s ?? '').replace(...)
}

function app() {
```

Insert `extractEmoji` **between `esc` and `app`** (after line 3, before `function app()`):

```js
function extractEmoji(str) {
  const rx = /\p{Extended_Pictographic}/gu;
  const matches = str.match(rx) || [];
  const emoji = matches[0] ?? null;
  const name  = str.replace(rx, '').replace(/\s+/g, ' ').trim();
  return { emoji, name };
}
```

- [ ] **Step 4: Add CommonJS export at the bottom of `app.js`**

The file ends with:
```js
    },
  };
}
```

Append **after** the closing `}`:

```js

if (typeof module !== 'undefined') {
  module.exports = { extractEmoji };
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd dashboard && npx jest app-helpers.test.js --no-coverage 2>&1 | tail -8
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 6: Run full suite — verify no regressions**

```bash
cd dashboard && npx jest weather-helpers.test.js calendar-helpers.test.js app-helpers.test.js --no-coverage 2>&1 | tail -6
```

Expected: all tests pass (183 total).

- [ ] **Step 7: Commit**

```bash
git add dashboard/public/app/app.js dashboard/tests/app-helpers.test.js
git commit -m "feat(seeds): add extractEmoji helper with tests"
```

---

### Task 2: Wire `extractEmoji` into `openSeedEdit` and `saveSeed`

**Files:**
- Modify: `dashboard/public/app/app.js` (lines ~114-117 and ~197-217)

- [ ] **Step 1: Update `openSeedEdit` to prepend stored emoji**

Find `openSeedEdit` (around line 114). The current code is:

```js
openSeedEdit(seed) {
  const { name, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, notes, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture } = seed;
  const pictureDataUrl = picture ? `data:image/jpeg;base64,${picture}` : null;
  this.seedModal = { show: true, editingId: seed.id, germinationError: false, form: { name, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, notes, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture: pictureDataUrl } };
```

Add `const displayName` line and change `name` to `name: displayName` in the form:

```js
openSeedEdit(seed) {
  const { name, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, notes, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture } = seed;
  const pictureDataUrl = picture ? `data:image/jpeg;base64,${picture}` : null;
  const displayName = (seed.emoji ? seed.emoji + ' ' : '') + (name ?? '');
  this.seedModal = { show: true, editingId: seed.id, germinationError: false, form: { name: displayName, variety, type, quantity, box_id, supplier, purchase_year, sow_by_year, notes, purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type, plant_height, light_requirements, growing_instructions, sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end, plant_out_start, plant_out_end, harvest_start, harvest_end, picture: pictureDataUrl } };
```

- [ ] **Step 2: Update `saveSeed` to extract emoji before sending**

Find `saveSeed` (around line 197). The current code after the validation guards is:

```js
      try {
        const url = this.seedModal.editingId ? `/api/seeds/${this.seedModal.editingId}` : '/api/seeds';
        const method = this.seedModal.editingId ? 'PATCH' : 'POST';
        const formData = { ...this.seedModal.form };
        // Extract base64 from data URL if present
        if (formData.picture && formData.picture.startsWith('data:')) {
          formData.picture = formData.picture.split(',')[1];
        }
```

Add emoji extraction **immediately after** `const formData = { ...this.seedModal.form };`:

```js
      try {
        const url = this.seedModal.editingId ? `/api/seeds/${this.seedModal.editingId}` : '/api/seeds';
        const method = this.seedModal.editingId ? 'PATCH' : 'POST';
        const formData = { ...this.seedModal.form };
        // Extract emoji from name field before saving
        const { emoji, name: cleanName } = extractEmoji(formData.name ?? '');
        if (!cleanName) return;
        formData.name  = cleanName;
        formData.emoji = emoji;
        // Extract base64 from data URL if present
        if (formData.picture && formData.picture.startsWith('data:')) {
          formData.picture = formData.picture.split(',')[1];
        }
```

- [ ] **Step 3: Verify file looks correct**

Run: `grep -n "extractEmoji\|displayName\|cleanName" dashboard/public/app/app.js`

Expected: 3 matches — one at the function definition, one in `openSeedEdit`, one in `saveSeed`.

- [ ] **Step 4: Run tests — confirm no regressions**

```bash
cd dashboard && npx jest app-helpers.test.js --no-coverage 2>&1 | tail -5
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/app/app.js
git commit -m "feat(seeds): wire extractEmoji into openSeedEdit and saveSeed"
```

---

### Task 3: Update name field placeholder in `index.html`

**Files:**
- Modify: `dashboard/public/app/index.html` (line ~1299)

- [ ] **Step 1: Update the placeholder**

Find the name input in the seed modal (around line 1299):

```html
<input placeholder="Name *" x-model="seedModal.form.name" style="grid-column:1/-1">
```

Change to:

```html
<input placeholder="Name * (optional emoji)" x-model="seedModal.form.name" style="grid-column:1/-1">
```

- [ ] **Step 2: Verify the change**

```bash
grep -n "Name \*" dashboard/public/app/index.html
```

Expected: one match containing `Name * (optional emoji)`.

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/index.html
git commit -m "feat(seeds): update name field placeholder to hint emoji support"
```

---

## Done

All three tasks complete. Test with these scenarios in the browser:
- Type `🍅 Tomato` → saved as name `Tomato`, emoji `🍅`
- Type `Tomato` → saved as name `Tomato`, emoji `null`
- Edit a seed with stored emoji → name field shows `🍅 Tomato`
- Type `🍅` only → save is blocked (no name after extraction)

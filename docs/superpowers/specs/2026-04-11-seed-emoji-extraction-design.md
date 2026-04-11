# Seed Emoji Extraction — Design Spec

**Date:** 2026-04-11
**Scope:** Seed add/edit modal — embed emoji in name field, auto-extract to `emoji` DB column on save

---

## Problem

The `seeds` table has an `emoji` column and the API already accepts it, but the frontend form has no way to set it. Users must manually populate it via SQL or external tools. The goal is to allow emoji to be typed directly in the name field and have it automatically extracted and stored separately.

---

## Design Summary

Change the name field placeholder to hint that an emoji is welcome. On save, extract the first emoji from the raw name input, strip all emojis from the name string, and send both `name` and `emoji` to the API. On edit open, prepend the stored emoji (if any) back into the name field so the user can see and modify it naturally.

No backend changes required — the POST and PATCH handlers already accept `emoji` as an allowed field.

---

## Components

### 1. `extractEmoji(str)` helper — `dashboard/public/app/app.js`

New pure function, defined once at the top of the `app()` return or as a standalone function in `app.js`.

```js
function extractEmoji(str) {
  const rx = /\p{Extended_Pictographic}/gu;
  const matches = str.match(rx) || [];
  const emoji = matches[0] ?? null;
  const name  = str.replace(rx, '').replace(/\s+/g, ' ').trim();
  return { emoji, name };
}
```

**Why `Extended_Pictographic`:** Covers all pictographic emoji without false positives on digits (`0-9`), `*`, or `#` that `\p{Emoji}` would match. Supported in all modern browsers and Node.js 10+.

**Behaviour matrix:**

| Input | `name` | `emoji` |
|---|---|---|
| `"🍅 Tomato"` | `"Tomato"` | `"🍅"` |
| `"Tomato 🍅"` | `"Tomato"` | `"🍅"` |
| `"Tom🌿ato"` | `"Tomato"` | `"🌿"` |
| `"🍅🌿 Tomato"` | `"Tomato"` | `"🍅"` |
| `"Tomato"` | `"Tomato"` | `null` |
| `"🍅"` (emoji only) | `""` | `"🍅"` |
| `"  Tomato  "` | `"Tomato"` | `null` |

**Edge case — emoji-only input:** `extractEmoji("🍅")` returns `{ name: "", emoji: "🍅" }`. The existing validation guard `if (!this.seedModal.form.name) return` runs on the **raw** input before extraction, so a name of just `🍅` will correctly fail validation. No change needed to the validation logic.

---

### 2. `openSeedEdit` — `dashboard/public/app/app.js`

When building the form state for an existing seed, prepend the stored emoji to the display name:

```js
const displayName = (seed.emoji ? seed.emoji + ' ' : '') + (seed.name ?? '');
```

Use `displayName` as `name` in the `seedModal.form` object. The `emoji` field is **not** added to the form — it is derived at save time from the name field content.

---

### 3. `saveSeed` — `dashboard/public/app/app.js`

After the existing validation check and before sending the request, extract emoji from the raw name:

```js
const { emoji, name } = extractEmoji(formData.name ?? '');
formData.name  = name;
formData.emoji = emoji;  // null clears an existing emoji; the PATCH handler accepts it
```

**PATCH behaviour:** The existing PATCH handler at `dashboard/routes/api.js` builds its UPDATE from `Object.keys(req.body)` filtered to allowed fields. Sending `emoji: null` explicitly sets the column to NULL, correctly clearing a previously stored emoji if the user removes it.

---

### 4. Placeholder — `dashboard/public/app/index.html`

Single change on the name input in the seed modal (line ~1299):

```html
<!-- before -->
<input placeholder="Name *" x-model="seedModal.form.name" style="grid-column:1/-1">

<!-- after -->
<input placeholder="Name * (optional emoji)" x-model="seedModal.form.name" style="grid-column:1/-1">
```

---

## Validation guard — unchanged

The existing guard `if (!this.seedModal.form.name) return` in `saveSeed` runs on `this.seedModal.form.name` (the raw input from the field) **before** `extractEmoji` is called on `formData`. This means:
- A blank name → blocked as before
- An emoji-only name (e.g. `"🍅"`) → raw value is `"🍅"` (truthy) → passes guard → `extractEmoji` returns `name: ""` → `formData.name = ""` → the POST/PATCH sends an empty name string. To close this gap, add a second check after extraction:

```js
const { emoji, name } = extractEmoji(formData.name ?? '');
if (!name) return;   // guard against emoji-only input
formData.name  = name;
formData.emoji = emoji;
```

---

## Out of Scope

- Emoji picker UI
- Displaying emoji in the form field as a preview badge
- Multi-emoji support (first emoji only, rest discarded)
- Skin tone or ZWJ sequence handling beyond what `Extended_Pictographic` naturally captures

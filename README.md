# Garden Manager

A self-hosted garden management system with zone tracking, seed inventory,
task management, and AI integration via [OpenClaw](./openclaw/README.md).

## Features

- **Dynamic zones** — grid (cell-by-cell) or loose tracking, fully configurable
- **First-run wizard** — set up your zones, location, and preferences via browser
- **Dashboard** — overview, zone grids, seeds, tasks, sowing calendar
- **Weather** — live conditions via open-meteo.com (no API key needed)
- **OpenClaw AI** — natural-language queries and WhatsApp notifications
- **SQLite** — single file, easy to back up

## Quick Start

### With Docker

```bash
cp .env.example .env
# Edit .env — set DATA_DIR, PORT, DOMAIN
docker compose up -d
# garden-db-init runs once to create the DB then exits — this is normal
# Open http://localhost:8420 (or your configured PORT)
```

### Without Docker (local dev)

Requires Node.js 18+. No native compilation needed — the SQLite driver is pure WebAssembly and works on Windows, macOS, and Linux.

```bash
# Install dependencies
cd dashboard && npm install

# Initialise the database (run once)
node init-db.js

# Start the server with auto-reload on file changes
cd dashboard && DB_PATH=../data/garden.db npm run dev
# Open http://localhost:8420
```

On first launch, a setup wizard guides you through configuring your garden.

## Reverse Proxy

Traefik labels are **active by default** in `docker-compose.yml`.
If you're not using Traefik, see [SETUP.md](./SETUP.md).

## Backup

```bash
cp $DATA_DIR/garden.db /your/backup/location/garden.db
```

## OpenClaw Integration

See [openclaw/README.md](./openclaw/README.md) for setup.

## Tech Stack

Node.js · Express · SQLite · Alpine.js · Tailwind CSS (CDN) · Leaflet.js · Docker

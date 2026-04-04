# OpenClaw Integration

This folder contains everything needed to connect Garden Manager with OpenClaw,
an AI agent that provides natural-language garden queries and WhatsApp notifications.

## What OpenClaw can do with this skill

- Query any zone, cell, or planting by natural language
- Record sowing, germination, moves, harvests
- Generate WhatsApp-ready daily/weekly summaries
- Proactively flag overdue tasks and slow germination

## Requirements

- OpenClaw running on the same host (or with access to `GARDEN_DB_PATH`)
- `sqlite3` CLI available in the OpenClaw container

## Setup

**1. Copy the skill:**
```bash
cp -r skills/garden-manager /path/to/openclaw/skills/
```

**2. Set the DB path** in OpenClaw's environment:
```
GARDEN_DB_PATH=/home/leo/garden/garden.db
```

**3. Install cron jobs:**
```bash
chmod +x cron-setup.sh && ./cron-setup.sh
```

## Adapting for other AI agents

The skill works via plain `sqlite3` CLI calls. Any AI agent with shell access and sqlite3
can use the same queries. The full schema is documented in `skills/garden-manager/SKILL.md`.
The database format is stable — you can also build integrations directly against the SQLite file
using any sqlite3 library (Python, Node, Rust, etc).

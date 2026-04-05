# Skill: Garden Manager

You have access to a SQLite database at the path specified in `GARDEN_DB_PATH`
(default: `/path/to/garden.db`). Use the `sqlite3` command to query it.

## Schema Summary

- `zones(id, name, type, view_type, grid_rows, grid_cols, ...)`
- `zone_cells(id, zone_id, row, col, label)`
- `seeds(id, name, variety, type, quantity, ...)`
- `plantings(id, seed_id, zone_id, cell_id, status, sown_date, ...)`  
  status: sown | germinated | established | harvested | failed
- `tasks(id, zone_id, title, due_date, priority, status)`
- `growing_calendar(crop_name, sow_indoors_start, sow_outdoors_start, harvest_start, ...)`
- `activity_log(timestamp, action_type, zone_id, planting_id, description)`

Dates are ISO 8601 (YYYY-MM-DD). Calendar dates are MM-DD.

## Querying

```bash
sqlite3 "$GARDEN_DB_PATH" "SELECT * FROM zones;"
sqlite3 "$GARDEN_DB_PATH" "
  SELECT z.name, zc.label, s.name as seed, p.status
  FROM plantings p
  JOIN zones z ON p.zone_id=z.id
  LEFT JOIN zone_cells zc ON p.cell_id=zc.id
  LEFT JOIN seeds s ON p.seed_id=s.id
  WHERE p.status NOT IN ('harvested','failed')
  ORDER BY z.sort_order, zc.row, zc.col;"
```

## Recording

Always insert into `activity_log` after making changes:

```bash
# Sow a seed into a grid cell
sqlite3 "$GARDEN_DB_PATH" "
  INSERT INTO plantings(seed_id,zone_id,cell_id,sown_date,status,quantity)
  VALUES(1, 1, 5, date('now'), 'sown', 1);
  INSERT INTO activity_log(action_type,zone_id,planting_id,description)
  VALUES('sow', 1, last_insert_rowid(), 'Sowed Tomato in A5');"

# Update planting status (replace 42 with actual planting id, 1 with actual zone_id)
sqlite3 "$GARDEN_DB_PATH" "
  UPDATE plantings SET status='germinated', germinated_date=date('now') WHERE id=42;
  INSERT INTO activity_log(action_type,zone_id,planting_id,description)
  VALUES('germinated', 1, 42, 'Tomato germinated in A5');"
```

## WhatsApp-Friendly Summary Format

Keep responses under 300 words. Use this structure:

```
🌱 Garden Update — {date}

GERMINATOR ({n}/{total} occupied)
• A1: Tomato (Gardeners Delight) — germinated ✓
• A2: Basil — sown 3 days ago
• B4–B8: Empty

TASKS ({overdue} overdue)
⚠️ Water seedlings — due yesterday
• Pot on tomatoes — due Friday

CALENDAR — Sow this week:
• Lettuce (indoors), Peas (outdoors)
```

## Cron Triggers

This skill is called by three scheduled jobs (see `cron-setup.sh`):
1. **Daily 7:30 AM** — brief task + germinator check
2. **Weekly Sunday 9 AM** — full planning summary
3. **Every 6 hours** — germinator watch (flag overdue germination updates)

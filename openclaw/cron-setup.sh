#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_CMD="${OPENCLAW_CMD:-openclaw}"
GARDEN_DB="${GARDEN_DB_PATH:-/home/leo/garden/garden.db}"

echo "Installing Garden Manager cron jobs..."
echo "OpenClaw command: $OPENCLAW_CMD"
echo "DB path: $GARDEN_DB"

LOG_FILE="${GARDEN_LOG:-/var/log/garden-cron.log}"
if ! touch "$LOG_FILE" 2>/dev/null; then
  LOG_FILE="$HOME/garden-cron.log"
  echo "Warning: cannot write to /var/log/garden-cron.log, using $LOG_FILE instead"
fi

# Remove existing garden-manager cron jobs
crontab -l 2>/dev/null | grep -v 'garden-manager' | crontab -

# Add new jobs
(crontab -l 2>/dev/null; cat <<EOF

# Garden Manager — daily briefing (7:30 AM)
30 7 * * * GARDEN_DB_PATH="$GARDEN_DB" $OPENCLAW_CMD run garden-manager "Daily garden briefing: check germinator status and list today's tasks. Format for WhatsApp." >> $LOG_FILE 2>&1

# Garden Manager — weekly planning (Sunday 9 AM)
0 9 * * 0 GARDEN_DB_PATH="$GARDEN_DB" $OPENCLAW_CMD run garden-manager --model high "Weekly garden planning summary: full zone review, what to sow this week, upcoming tasks, seed stock warnings." >> $LOG_FILE 2>&1

# Garden Manager — germinator watch (every 6 hours)
0 */6 * * * GARDEN_DB_PATH="$GARDEN_DB" $OPENCLAW_CMD run garden-manager "Germinator check: flag any slots sown more than 14 days ago with no germination update. List by cell label." >> $LOG_FILE 2>&1
EOF
) | crontab -

echo "Cron jobs installed:"
crontab -l | grep garden-manager

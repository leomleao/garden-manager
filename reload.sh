#!/bin/sh
# Rebuild and restart garden-manager docker container after each push
(
  cd /home/leo/docker && \
  docker compose -f garden-manager/docker-compose.yml build --no-cache && \
  docker compose -f garden-manager/docker-compose.yml up -d
) >> /tmp/garden-manager-deploy.log 2>&1 &

echo "Deploy started in background. Tail /tmp/garden-manager-deploy.log to watch."

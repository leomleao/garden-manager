# Setup Without Traefik

By default, `docker-compose.yml` uses Traefik labels and assumes a `proxy` Docker network.

If you don't use Traefik:

**1. Edit `docker-compose.yml`:**

Comment out the `labels:` section and uncomment `ports:`:

```yaml
# labels:
#   - "traefik.enable=true"
#   ...

ports:
  - "${PORT:-8420}:8420"
```

**2. Remove the external network:**

Comment out or remove:
```yaml
networks:
  default:
    name: proxy
    external: true
```

**3. Start:**
```bash
docker compose up
```

Access at `http://localhost:8420`.

## Data Directory

Set `DATA_DIR` in `.env`. For a standalone install without a home server:
```
DATA_DIR=./data
```

The SQLite file will be at `./data/garden.db`.

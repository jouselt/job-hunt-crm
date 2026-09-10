#!/usr/bin/env sh
# Backend container entrypoint.
# Default (no args): run pending migrations, then start the API.
# With args (e.g. `docker compose run --rm backend npm run seed`): run THAT
# command instead — used for one-shot tasks like seeding sample data.
set -e

if [ "$#" -gt 0 ]; then
  echo "[entrypoint] running override command: $*"
  exec "$@"
fi

echo "[entrypoint] running migrations..."
npm run migration:run || echo "[entrypoint] migration:run failed (continuing — see logs)"

echo "[entrypoint] starting API..."
exec node dist/main

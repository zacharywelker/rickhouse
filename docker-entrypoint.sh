#!/bin/sh
set -e

# Unraid shares are owned by a specific uid/gid (99:100 by default). Align the
# container's `node` user with PUID/PGID so files written to the uploads share
# are readable from the Unraid UI and over SMB.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  if [ "$(id -g node)" != "$PGID" ]; then
    # `node` group may collide with an existing gid; delete and recreate.
    deluser node 2>/dev/null || true
    delgroup node 2>/dev/null || true
    addgroup -g "$PGID" node 2>/dev/null || addgroup node
    adduser -D -H -u "$PUID" -G node node 2>/dev/null || true
  elif [ "$(id -u node)" != "$PUID" ]; then
    deluser node 2>/dev/null || true
    adduser -D -H -u "$PUID" -G node node 2>/dev/null || true
  fi

  mkdir -p "${UPLOAD_DIR:-/data/uploads}"
  chown -R "$PUID:$PGID" "${UPLOAD_DIR:-/data/uploads}"
  chown -R "$PUID:$PGID" /app/.next 2>/dev/null || true
fi

run() {
  if [ "$(id -u)" = "0" ]; then
    su-exec "$PUID:$PGID" "$@"
  else
    "$@"
  fi
}

# Migrations are idempotent; the seed only inserts the example while the
# collection is empty. Set RUN_MIGRATIONS=false to manage them yourself.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "rickhouse: applying migrations"
  run node /app/dist/migrate.mjs
fi

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "rickhouse: seeding"
  run node /app/dist/seed.mjs
fi

echo "rickhouse: starting on port ${PORT:-1964}"
exec_cmd="$*"
if [ -z "$exec_cmd" ]; then
  set -- node server.js
fi
if [ "$(id -u)" = "0" ]; then
  exec su-exec "$PUID:$PGID" "$@"
fi
exec "$@"

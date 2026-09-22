#!/usr/bin/env bash
#
# Backs up a running Rickhouse: the Postgres database and the uploaded images.
# (SPEC M6.)
#
#   ./scripts/backup.sh                  # -> ./backups/rickhouse-<timestamp>/
#   BACKUP_DIR=/mnt/user/backups ./scripts/backup.sh
#   BACKUP_KEEP=30 ./scripts/backup.sh   # keep the 30 newest, prune the rest
#
# Run it from the directory holding docker-compose.yml. On Unraid that is
# wherever you put the stack; point BACKUP_DIR at a share that is actually
# part of your parity/backup plan, because ./backups sits next to the data it
# is meant to protect and that is not a backup.
#
# Each backup contains two independent copies of the data:
#
#   database.sql.gz  a full pg_dump, for restoring Rickhouse itself.
#   csv.tar.gz        every table as a plain CSV, for opening the data in
#                     something other than Rickhouse (Baserow, NocoDB, Excel,
#                     Google Sheets, ...) if Rickhouse is ever unavailable.
#                     These are a snapshot, not a restorable database: they
#                     drop foreign keys and column types.
#
# Restores are printed at the end, against the archive just written.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Compose v2 is a docker subcommand; v1 was its own binary. Support both.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: neither 'docker compose' nor 'docker-compose' is available" >&2
  exit 1
fi

if [ -f .env ]; then
  # Only to find the uploads path and database name; the app reads .env itself.
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PG_USER="${POSTGRES_USER:-rickhouse}"
PG_DB="${POSTGRES_DB:-rickhouse}"
UPLOADS="${UPLOADS_PATH:-./data/uploads}"

if ! "${COMPOSE[@]}" ps --status running db | grep -q db; then
  echo "error: the 'db' service is not running — start the stack first" >&2
  exit 1
fi

# Write to a .partial directory and rename at the end, so an interrupted run
# never leaves something that looks like a usable backup.
DEST="${BACKUP_DIR}/rickhouse-${STAMP}"
WORK="${DEST}.partial"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "==> dumping ${PG_DB}"
# -T: no TTY, so the dump is a clean byte stream rather than terminal output.
"${COMPOSE[@]}" exec -T db pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists \
  | gzip > "${WORK}/database.sql.gz"

echo "==> exporting tables to CSV"
mkdir -p "${WORK}/csv"
TABLES="$("${COMPOSE[@]}" exec -T db psql -U "$PG_USER" -d "$PG_DB" -Atc \
  "select tablename from pg_tables where schemaname = 'public' order by tablename")"
for TABLE in $TABLES; do
  "${COMPOSE[@]}" exec -T db psql -U "$PG_USER" -d "$PG_DB" -c \
    "\\copy (select * from \"${TABLE}\") to stdout with csv header" \
    > "${WORK}/csv/${TABLE}.csv"
done
tar -czf "${WORK}/csv.tar.gz" -C "${WORK}" csv
rm -rf "${WORK}/csv"

echo "==> archiving ${UPLOADS}"
if [ -d "$UPLOADS" ]; then
  tar -czf "${WORK}/uploads.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
else
  echo "    (no uploads directory yet — skipping)"
fi

# A record of what this came from, so a restore is not archaeology.
cat > "${WORK}/manifest.txt" <<META
rickhouse backup
taken:    $(date -Is)
database: ${PG_DB}
user:     ${PG_USER}
uploads:  ${UPLOADS}
image:    $("${COMPOSE[@]}" images app --format json 2>/dev/null | head -c 2000 || echo "unknown")
contents:
  database.sql.gz - full pg_dump, for restoring Rickhouse
  csv.tar.gz       - every table as plain CSV, for reading the data
                     elsewhere (Baserow, NocoDB, Excel, ...) if Rickhouse
                     itself is ever unavailable. Not restorable as-is.
  uploads.tar.gz   - uploaded photos/files
META

trap - EXIT
mv "$WORK" "$DEST"
echo "==> wrote ${DEST}"
du -sh "$DEST" | awk '{print "    " $1}'

# Prune oldest, newest-first by name — the timestamp sorts lexicographically.
if [ "$BACKUP_KEEP" -gt 0 ]; then
  mapfile -t OLD < <(ls -1d "${BACKUP_DIR}"/rickhouse-* 2>/dev/null | sort -r | tail -n +"$((BACKUP_KEEP + 1))")
  for dir in "${OLD[@]:-}"; do
    [ -n "$dir" ] || continue
    echo "==> pruning $dir"
    rm -rf "$dir"
  done
fi

cat <<RESTORE

To restore Rickhouse from this backup:

  gunzip -c ${DEST}/database.sql.gz | ${COMPOSE[*]} exec -T db psql -U ${PG_USER} -d ${PG_DB}
  tar -xzf ${DEST}/uploads.tar.gz -C $(dirname "$UPLOADS")
  ${COMPOSE[*]} restart app

The dump is --clean --if-exists, so it drops what it replaces: restore into
the database you meant to.

To just read the data in something other than Rickhouse (Baserow, NocoDB,
Excel, Google Sheets, ...) without running Postgres at all:

  tar -xzf ${DEST}/csv.tar.gz -C /tmp
  # -> /tmp/csv/*.csv, one file per table, ready to import.
RESTORE

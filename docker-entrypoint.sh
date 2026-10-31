#!/bin/sh
set -e

DATA_DIR="${SQLITE_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

# Host bind mounts are often root-owned; node (uid 1000) must write the DB.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" || true
  chmod -R u+rwX "$DATA_DIR" || true
  exec gosu node "$@"
fi

exec "$@"

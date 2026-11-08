#!/bin/bash
# =============================================================================
# deploy.sh — Production deployment for Tele-Pendant (API + sim + web)
# =============================================================================
#
# DEFAULT: pull prebuilt images from GHCR and restart (see .github/workflows/ci.yml).
# FALLBACK: DEPLOY_BUILD_LOCAL=1 ./deploy.sh
#
# Prerequisites: .env on host, docker compose, GHCR access for pull mode.
# CI path: push main → Actions builds images → SSH → git pull → this script.
#
# Required GitHub secrets (same pattern as freelancer_bot/server):
#   SERVER_HOST, SERVER_USERNAME, SERVER_PORT
#   Auth (either or both): SERVER_PASSWORD, SERVER_SSH_KEY
#   SERVER_DEPLOY_PATH (optional, default ~/tele-pendant)
#
# Manual server .env (pull mode):
#   GHCR_USERNAME=<github user>
#   GHCR_PULL_TOKEN=<PAT with read:packages>
#   Optional overrides:
#   TELE_PENDANT_API_IMAGE=ghcr.io/somadina94/tele-pendant-api:latest
#   TELE_PENDANT_SIM_IMAGE=ghcr.io/somadina94/tele-pendant-sim:latest
#   TELE_PENDANT_WEB_IMAGE=ghcr.io/somadina94/tele-pendant-web:latest
# =============================================================================

set -euo pipefail

echo "Starting deployment of Tele-Pendant..."

if command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
else
  echo "Neither docker-compose nor docker compose found"
  exit 1
fi

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    echo "Using sudo for Docker"
    DOCKER="sudo docker"
    DOCKER_COMPOSE="sudo $DOCKER_COMPOSE"
  else
    echo "Cannot access Docker"
    exit 1
  fi
fi

if [ ! -f ".env" ]; then
  echo "No .env file found. Create one from .env.example before deploying."
  exit 1
fi

read_env_var() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    return
  fi
  local line
  line="$(grep -E "^${key}=" .env 2>/dev/null | tail -1 || true)"
  if [ -z "$line" ]; then
    return
  fi
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  if [ -n "$val" ]; then
    export "${key}=${val}"
  fi
}

read_env_var GHCR_PULL_TOKEN
read_env_var GHCR_USERNAME
read_env_var TELE_PENDANT_API_IMAGE
read_env_var TELE_PENDANT_SIM_IMAGE
read_env_var TELE_PENDANT_WEB_IMAGE
read_env_var PORT
read_env_var WEB_PORT
read_env_var MODBUS_SIM_PORT

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT="tele-pendant-prod"
DEPLOY_LOCK="${TMPDIR:-/tmp}/tele-pendant-deploy.lock"
# Must be lowercase (Docker). Override in .env if your GHCR owner differs.
DEFAULT_OWNER="somadina94"
DEFAULT_API_IMAGE="ghcr.io/${DEFAULT_OWNER}/tele-pendant-api:latest"
DEFAULT_SIM_IMAGE="ghcr.io/${DEFAULT_OWNER}/tele-pendant-sim:latest"
DEFAULT_WEB_IMAGE="ghcr.io/${DEFAULT_OWNER}/tele-pendant-web:latest"
DEPLOY_BUILD_LOCAL="${DEPLOY_BUILD_LOCAL:-0}"
export PORT="${PORT:-3010}"
export WEB_PORT="${WEB_PORT:-8080}"
export MODBUS_SIM_PORT="${MODBUS_SIM_PORT:-1502}"
export TELE_PENDANT_API_IMAGE="${TELE_PENDANT_API_IMAGE:-$DEFAULT_API_IMAGE}"
export TELE_PENDANT_SIM_IMAGE="${TELE_PENDANT_SIM_IMAGE:-$DEFAULT_SIM_IMAGE}"
export TELE_PENDANT_WEB_IMAGE="${TELE_PENDANT_WEB_IMAGE:-$DEFAULT_WEB_IMAGE}"
export COMPOSE_BAKE=false

validate_image_ref() {
  local name="$1"
  local ref="$2"
  if [[ "$ref" == *OWNER* ]] || [[ "$ref" =~ [A-Z] ]]; then
    echo "ERROR: ${name} must be a real lowercase GHCR ref."
    echo "  Got: ${ref}"
    echo "  Set in .env, e.g. ${name}=ghcr.io/${DEFAULT_OWNER}/tele-pendant-api:latest"
    exit 1
  fi
}

validate_image_ref TELE_PENDANT_API_IMAGE "$TELE_PENDANT_API_IMAGE"
validate_image_ref TELE_PENDANT_SIM_IMAGE "$TELE_PENDANT_SIM_IMAGE"
validate_image_ref TELE_PENDANT_WEB_IMAGE "$TELE_PENDANT_WEB_IMAGE"

exec 9>"$DEPLOY_LOCK"
if ! flock -n 9; then
  echo "Another deploy is already running (lock: $DEPLOY_LOCK). Try again shortly."
  exit 1
fi

echo "Disk before deploy:"
df -h / /var/lib/docker 2>/dev/null || df -h /

# Free space before pull: stopped/idle containers + unused images.
echo "Removing stopped containers and unused Docker images..."
$DOCKER container prune -f >/dev/null || true
$DOCKER image prune -af
df -h / /var/lib/docker 2>/dev/null || df -h /

stop_own_stack() {
  echo "Stopping Tele-Pendant stack (if running)..."
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env stop 2>/dev/null || true
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env rm -f 2>/dev/null || true
}

login_ghcr() {
  local token="${GHCR_PULL_TOKEN:-}"
  local user="${GHCR_USERNAME:-}"
  if [ -n "$token" ] && [ -n "$user" ]; then
    echo "Logging in to ghcr.io as ${user}..."
    echo "$token" | $DOCKER login ghcr.io -u "$user" --password-stdin
    return
  fi
  if grep -q '"ghcr.io"' ~/.docker/config.json 2>/dev/null; then
    echo "Using existing ghcr.io credentials from docker config."
    return
  fi
  echo "ERROR: GHCR_PULL_TOKEN / GHCR_USERNAME not set and not logged in to ghcr.io."
  echo "Add to .env:"
  echo "  GHCR_USERNAME=<github user>"
  echo "  GHCR_PULL_TOKEN=<GitHub PAT with read:packages>"
  echo "Or run with: DEPLOY_BUILD_LOCAL=1 ./deploy.sh"
  exit 1
}

pull_images() {
  echo "Pulling prebuilt images:"
  echo "  API ${TELE_PENDANT_API_IMAGE}"
  echo "  SIM ${TELE_PENDANT_SIM_IMAGE}"
  echo "  WEB ${TELE_PENDANT_WEB_IMAGE}"
  login_ghcr
  local attempt
  for attempt in 1 2 3; do
    if $DOCKER pull "${TELE_PENDANT_API_IMAGE}" \
      && $DOCKER pull "${TELE_PENDANT_SIM_IMAGE}" \
      && $DOCKER pull "${TELE_PENDANT_WEB_IMAGE}"; then
      return 0
    fi
    echo "Pull failed (attempt ${attempt}/3), retrying in 15s..."
    sleep 15
  done
  echo "Failed to pull one or more Tele-Pendant images."
  echo "Fallback: DEPLOY_BUILD_LOCAL=1 ./deploy.sh"
  return 1
}

build_images_local() {
  echo "Building on server (DEPLOY_BUILD_LOCAL=1)..."
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env build
}

mkdir -p ./data
stop_own_stack

if [ "$DEPLOY_BUILD_LOCAL" = "1" ]; then
  build_images_local || exit 1
else
  echo "Deploy mode: pull prebuilt images (set DEPLOY_BUILD_LOCAL=1 to build on server)"
  pull_images || exit 1
fi

echo "Starting stack..."
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env up -d --no-build --force-recreate --remove-orphans

echo "Checking API health..."
MAX_ATTEMPTS=36
ATTEMPT=1
HEALTH_STATUS="missing"
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  HEALTH_STATUS=$($DOCKER inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' tele-pendant-api 2>/dev/null || echo "missing")

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "API container is healthy"
    break
  fi

  if [ "$HEALTH_STATUS" = "unhealthy" ] || [ "$HEALTH_STATUS" = "missing" ]; then
    echo "API health status: ${HEALTH_STATUS}"
    $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env logs --tail=100
    exit 1
  fi

  echo "Health status: $HEALTH_STATUS (attempt $ATTEMPT/$MAX_ATTEMPTS)"
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$HEALTH_STATUS" != "healthy" ] && [ "$HEALTH_STATUS" != "none" ]; then
  echo "Healthcheck did not become healthy in time"
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env logs --tail=100
  exit 1
fi

echo "Recent logs:"
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env logs --tail=20

# Images replaced by this deploy are now unused.
echo "Removing Docker images left unused by this deploy..."
$DOCKER image prune -af

echo "Deployment complete."
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env ps
echo "API:  http://localhost:${PORT}"
echo "Web:  http://localhost:${WEB_PORT}"
echo "Health: http://localhost:${PORT}/api/v1/health"

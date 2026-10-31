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

read_env_var TELE_PENDANT_API_IMAGE
read_env_var TELE_PENDANT_SIM_IMAGE
read_env_var TELE_PENDANT_WEB_IMAGE
read_env_var PORT
read_env_var WEB_PORT

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT="tele-pendant-prod"
DEPLOY_BUILD_LOCAL="${DEPLOY_BUILD_LOCAL:-0}"
export PORT="${PORT:-3010}"
export WEB_PORT="${WEB_PORT:-8080}"
export TELE_PENDANT_API_IMAGE="${TELE_PENDANT_API_IMAGE:-ghcr.io/OWNER/tele-pendant-api:latest}"
export TELE_PENDANT_SIM_IMAGE="${TELE_PENDANT_SIM_IMAGE:-ghcr.io/OWNER/tele-pendant-sim:latest}"
export TELE_PENDANT_WEB_IMAGE="${TELE_PENDANT_WEB_IMAGE:-ghcr.io/OWNER/tele-pendant-web:latest}"
export COMPOSE_BAKE=false

mkdir -p ./data

if [ "$DEPLOY_BUILD_LOCAL" = "1" ]; then
  echo "Building images locally (DEPLOY_BUILD_LOCAL=1)..."
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" build
else
  echo "Pulling images from GHCR..."
  $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" pull || true
fi

echo "Starting stack..."
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Deployment complete."
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" ps

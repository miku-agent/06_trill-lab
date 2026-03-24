#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/Users/bini/apps/06_trill-lab}"
PM2_APP_NAME="${PM2_APP_NAME:-trill-lab}"
PORT="${PORT:-23310}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/miku-agent/06_trill-lab.git}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Bootstrapping app repo into $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "APP_DIR does not look like a git clone after bootstrap: $APP_DIR" >&2
  exit 1
fi

log "Syncing git branch $BRANCH in $APP_DIR"
git -C "$APP_DIR" fetch --all --prune
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
git -C "$APP_DIR" clean -fd

log "Installing dependencies"
cd "$APP_DIR"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

log "Building app"
pnpm build

log "Reloading pm2 process $PM2_APP_NAME on port $PORT"
APP_DIR="$APP_DIR" PORT="$PORT" pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status "$PM2_APP_NAME"

log "Deploy finished"

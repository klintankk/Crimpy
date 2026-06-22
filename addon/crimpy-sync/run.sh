#!/usr/bin/with-contenv bashio
# Crimpy Sync add-on entrypoint.
# Reads HA add-on options, prepares a persistent git clone in /data, and runs
# the sync server from that clone (so the app/server code updates on restart).
set -e

REPO=$(bashio::config 'repo')
BRANCH=$(bashio::config 'branch')
TOKEN=$(bashio::config 'github_token')
SYNC_TOKEN=$(bashio::config 'sync_token')
PUSH=$(bashio::config 'push')
SERVE_STATIC=$(bashio::config 'serve_static')
ALLOWED_ORIGIN=$(bashio::config 'allowed_origin')

DATA=/data/repo
AUTH_URL="https://x-access-token:${TOKEN}@github.com/${REPO}.git"

if bashio::var.is_empty "${TOKEN}"; then
  bashio::exit.nok "github_token is required (fine-grained PAT with Contents: read/write on ${REPO})."
fi

git config --global user.name "Crimpy Pi"
git config --global user.email "crimpy@localhost"
git config --global --add safe.directory "${DATA}"

if [ ! -d "${DATA}/.git" ]; then
  bashio::log.info "Cloning ${REPO} (branch ${BRANCH}) into ${DATA}..."
  git clone --branch "${BRANCH}" "${AUTH_URL}" "${DATA}"
else
  bashio::log.info "Updating existing clone in ${DATA}..."
  git -C "${DATA}" remote set-url origin "${AUTH_URL}"
  git -C "${DATA}" fetch origin "${BRANCH}" || bashio::log.warning "fetch failed (offline?)"
  git -C "${DATA}" checkout "${BRANCH}" || true
  git -C "${DATA}" pull --rebase --autostash origin "${BRANCH}" || bashio::log.warning "pull failed (offline?)"
fi

export REPO_DIR="${DATA}"
export DATA_PATH="data/backup.json"
export GIT_BRANCH="${BRANCH}"
export GIT_REMOTE="origin"
export PORT="8787"
export SYNC_TOKEN="${SYNC_TOKEN}"
export ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"
export PUSH=$( [ "${PUSH}" = "true" ] && echo 1 || echo 0 )
export SERVE_STATIC=$( [ "${SERVE_STATIC}" = "true" ] && echo 1 || echo 0 )

bashio::log.info "Starting Crimpy sync server on :8787 (push=${PUSH}, static=${SERVE_STATIC})"
exec node "${DATA}/server/sync-server.js"

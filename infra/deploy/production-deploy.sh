#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACTS_DIR="${1:?Usage: production-deploy.sh <artifacts-dir> [release-id]}"
RELEASE_ID="${2:-manual-$(date -u +%Y%m%d%H%M%S)}"

API_ARCHIVE="${ARTIFACTS_DIR}/api-publish.tar.gz"
CAMP_ARCHIVE="${ARTIFACTS_DIR}/camp-dist.tar.gz"
LK_ARCHIVE="${ARTIFACTS_DIR}/lk-dist.tar.gz"

API_DIR="/opt/blagodaty/api"
CAMP_DIR="/var/www/blagodaty-camp-react"
LK_DIR="/var/www/blagodaty-lk"
SERVICE_NAME="blagodaty-api"
STAGING_ROOT="/tmp/blagodaty-release-${RELEASE_ID}"

if [[ ! -f "${API_ARCHIVE}" || ! -f "${CAMP_ARCHIVE}" || ! -f "${LK_ARCHIVE}" ]]; then
  echo "One or more deployment archives are missing in ${ARTIFACTS_DIR}" >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

wait_for_api() {
  python3 - <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

last_error = None

for _ in range(30):
    try:
        with urllib.request.urlopen("http://127.0.0.1:5080/api/health", timeout=5) as response:
            payload = json.load(response)
        if payload.get("status") == "ok":
            print(json.dumps(payload, ensure_ascii=False))
            sys.exit(0)
        last_error = f"Unexpected health payload: {payload}"
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        last_error = str(exc)
    time.sleep(2)

print(last_error or "Health check failed", file=sys.stderr)
sys.exit(1)
PY
}

cleanup() {
  rm -rf "${STAGING_ROOT}"
}

trap cleanup EXIT

mkdir -p "${STAGING_ROOT}/api" "${STAGING_ROOT}/camp" "${STAGING_ROOT}/lk"

tar -xzf "${API_ARCHIVE}" -C "${STAGING_ROOT}/api"
tar -xzf "${CAMP_ARCHIVE}" -C "${STAGING_ROOT}/camp"
tar -xzf "${LK_ARCHIVE}" -C "${STAGING_ROOT}/lk"

${SUDO} install -d -m 755 "${API_DIR}" "${CAMP_DIR}" "${LK_DIR}"

${SUDO} systemctl stop "${SERVICE_NAME}"

${SUDO} rsync -a --delete --delete-delay "${STAGING_ROOT}/api/" "${API_DIR}/"
${SUDO} chown -R root:root "${API_DIR}"
${SUDO} find "${API_DIR}" -type d -exec chmod 755 {} +
${SUDO} find "${API_DIR}" -type f -exec chmod 644 {} +

${SUDO} systemctl start "${SERVICE_NAME}"
${SUDO} systemctl is-active --quiet "${SERVICE_NAME}"

if ! wait_for_api; then
  ${SUDO} journalctl -u "${SERVICE_NAME}" -n 50 --no-pager || true
  exit 1
fi

${SUDO} rsync -a --delete --delete-delay "${STAGING_ROOT}/camp/" "${CAMP_DIR}/"
${SUDO} rsync -a --delete --delete-delay "${STAGING_ROOT}/lk/" "${LK_DIR}/"
${SUDO} chown -R root:root "${CAMP_DIR}" "${LK_DIR}"
${SUDO} find "${CAMP_DIR}" -type d -exec chmod 755 {} +
${SUDO} find "${CAMP_DIR}" -type f -exec chmod 644 {} +
${SUDO} find "${LK_DIR}" -type d -exec chmod 755 {} +
${SUDO} find "${LK_DIR}" -type f -exec chmod 644 {} +

${SUDO} nginx -t
${SUDO} systemctl reload nginx

echo "Deployment completed: ${RELEASE_ID}"

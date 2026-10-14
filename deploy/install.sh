#!/usr/bin/env bash
# One-command installer / updater for the IKEA Tweedekans systemd service.
#   sudo ./deploy/install.sh              install or update
#   sudo ./deploy/install.sh --uninstall  remove service (keeps data and config)
set -euo pipefail

NAME=ikea-tweedekans
APP_DIR=${APP_DIR:-/opt/ikea-tweedekans-grapper}
DATA_DIR=${DATA_DIR:-/var/lib/$NAME}
ENV_FILE=${ENV_FILE:-/etc/$NAME.env}
UNIT_FILE=${UNIT_FILE:-/etc/systemd/system/$NAME.service}
SERVICE_USER=${SERVICE_USER:-ikea}
SKIP_SYSTEM=${SKIP_SYSTEM:-0} # 1 = only copy files/config (testing)
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

die() { echo "Fout: $*" >&2; exit 1; }

if [[ $SKIP_SYSTEM != 1 && $EUID -ne 0 ]]; then
  die "start met sudo: sudo $0 $*"
fi

if [[ ${1:-} == --uninstall ]]; then
  systemctl disable --now "$NAME" 2>/dev/null || true
  rm -f "$UNIT_FILE" && systemctl daemon-reload
  echo "Service verwijderd. Data ($DATA_DIR) en config ($ENV_FILE) zijn behouden."
  exit 0
fi

command -v node >/dev/null || die "Node.js ontbreekt (>= 22.18 nodig, bijv. via https://nodejs.org of nvm)"
NODE_BIN=$(command -v node)
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || die "Node.js $(node -v) is te oud, minimaal 22.18 nodig"
command -v npm >/dev/null || die "npm ontbreekt"

echo "==> App kopiëren naar $APP_DIR"
mkdir -p "$APP_DIR" "$DATA_DIR"
rm -rf "$APP_DIR/src"
cp -R "$SRC_DIR/src" "$SRC_DIR/package.json" "$APP_DIR/"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund --silent)

if [[ $SKIP_SYSTEM != 1 ]]; then
  id "$SERVICE_USER" >/dev/null 2>&1 \
    || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  chown -R "$SERVICE_USER": "$DATA_DIR"
fi

GENERATED_PASSWORD=
if [[ ! -f $ENV_FILE ]]; then
  echo "==> Config aanmaken: $ENV_FILE"
  GENERATED_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)
  umask 077
  cat > "$ENV_FILE" <<ENV
PORT=8080
DB_PATH=$DATA_DIR/tweedekans.db
POLL_INTERVAL_MIN=15
AUTH_USERNAME=admin
AUTH_PASSWORD=$GENERATED_PASSWORD
SECRET_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
ENV
fi

if [[ $SKIP_SYSTEM == 1 ]]; then
  echo "SKIP_SYSTEM=1: klaar zonder systemd-stappen."
  exit 0
fi

echo "==> systemd-service installeren"
cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=IKEA Tweedekans watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN src/main.ts
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
UNIT
chmod 600 "$ENV_FILE"
chown "root:$SERVICE_USER" "$ENV_FILE" && chmod 640 "$ENV_FILE"

systemctl daemon-reload
systemctl enable --now "$NAME"
systemctl restart "$NAME"

PORT=$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)
echo
echo "Klaar. De service draait: http://$(hostname -I 2>/dev/null | awk '{print $1}' || hostname):${PORT}/"
if [[ -n $GENERATED_PASSWORD ]]; then
  echo "Login:  admin / $GENERATED_PASSWORD   (staat ook in $ENV_FILE)"
fi
echo "Logs:   journalctl -u $NAME -f"
echo "Config: $ENV_FILE  (daarna: sudo systemctl restart $NAME)"

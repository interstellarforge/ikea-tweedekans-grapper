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
NODE_DIR=${NODE_DIR:-/opt/$NAME-node}
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

node_ok() {
  "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' 2>/dev/null
}

# Downloads Node.js 24 (checksum-verified) into $NODE_DIR, leaving the system Node untouched.
install_private_node() {
  for tool in curl tar xz sha256sum; do
    command -v "$tool" >/dev/null || die "'$tool' ontbreekt (nodig om Node.js te installeren)"
  done
  local arch
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    armv7l) arch=armv7l ;;
    *) die "onbekende CPU-architectuur: $(uname -m)" ;;
  esac
  local base=https://nodejs.org/dist/latest-v24.x tmp file sum
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(awk -v a="linux-$arch.tar.xz" '$2 ~ a"$" {print $2}' "$tmp/SHASUMS256.txt" | head -1)
  [[ -n $file ]] || die "geen Node.js-download gevonden voor linux-$arch"
  echo "==> Node.js downloaden: $file"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  sum=$(awk -v f="$file" '$2 == f {print $1}' "$tmp/SHASUMS256.txt")
  echo "$sum  $tmp/$file" | sha256sum -c --status || die "checksum van $file klopt niet"
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/$file" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
}

if command -v node >/dev/null && node_ok node; then
  NODE_BIN=$(command -v node)
elif [[ -x $NODE_DIR/bin/node ]] && node_ok "$NODE_DIR/bin/node"; then
  NODE_BIN=$NODE_DIR/bin/node
else
  have=$(command -v node >/dev/null && node -v || echo "geen")
  echo "==> Node.js $have is niet geschikt (>= 22.18 nodig); installeer Node.js 24 in $NODE_DIR"
  install_private_node
  NODE_BIN=$NODE_DIR/bin/node
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
command -v npm >/dev/null || die "npm ontbreekt"
echo "==> Node.js: $NODE_BIN ($("$NODE_BIN" -v))"

mkdir -p "$APP_DIR" "$DATA_DIR"

# Consistent backup of the database before every install/update (the schema is migrated on start).
backup_database() {
  local db=$DATA_DIR/tweedekans.db
  if [[ -f $ENV_FILE ]]; then
    local configured
    configured=$(grep -E '^DB_PATH=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)
    [[ -n $configured ]] && db=$configured
  fi
  [[ -f $db ]] || return 0
  local dir out
  dir=$(dirname "$db")/backups
  out=$dir/tweedekans-$(date +%Y%m%d-%H%M%S).db
  mkdir -p "$dir"
  # VACUUM INTO writes a consistent snapshot even while the service is running.
  if "$NODE_BIN" -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    db.exec(`VACUUM INTO ${JSON.stringify(process.argv[2]).replace(/"/g, "\u0027")}`);
  ' "$db" "$out" 2>/dev/null; then
    chmod 600 "$out"
    [[ $SKIP_SYSTEM == 1 ]] || chown -R "$SERVICE_USER": "$dir" 2>/dev/null || true
    # keep the 10 most recent backups
    # shellcheck disable=SC2012
    ls -1t "$dir"/tweedekans-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
    echo "==> Backup gemaakt: $out"
  else
    rm -f "$out"
    cp "$db" "$out" && chmod 600 "$out" && echo "==> Backup (bestandskopie) gemaakt: $out" \
      || echo "Waarschuwing: backup van $db is mislukt" >&2
  fi
}
backup_database

echo "==> App kopiëren naar $APP_DIR"
rm -rf "$APP_DIR/src"
cp -R "$SRC_DIR/src" "$SRC_DIR/package.json" "$APP_DIR/"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund --silent)

if [[ $SKIP_SYSTEM != 1 ]]; then
  id "$SERVICE_USER" >/dev/null 2>&1 \
    || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  chown -R "$SERVICE_USER": "$DATA_DIR"
fi

if [[ ! -f $ENV_FILE ]]; then
  echo "==> Config aanmaken: $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<ENV
PORT=8080
DB_PATH=$DATA_DIR/tweedekans.db
POLL_INTERVAL_MIN=15
SECRET_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
# Alleen dit adres mag het eerste account (de beheerder) maken. Sterk aanbevolen.
ADMIN_EMAIL=${ADMIN_EMAIL:-}
# Publieke URL van deze app (voor links in meldingen), bijv. https://tweedekans.example.nl
APP_URL=${APP_URL:-}
# Basis-URL van je ntfy-server; elke gebruiker krijgt een eigen topic daaronder.
NTFY_BASE_URL=${NTFY_BASE_URL:-}
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
echo "Eerste keer: open de site en maak een account; het eerste account wordt beheerder."
if ! grep -q '^ADMIN_EMAIL=.\+' "$ENV_FILE"; then
  echo "Tip:    zet ADMIN_EMAIL in $ENV_FILE zodat alleen jouw adres het eerste (beheerders)account kan maken."
fi
echo "Logs:   journalctl -u $NAME -f"
echo "Config: $ENV_FILE  (daarna: sudo systemctl restart $NAME)"

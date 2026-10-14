#!/usr/bin/env bash
# Restores a database backup made by install.sh.
#   sudo ./deploy/restore-backup.sh --list            show available backups
#   sudo ./deploy/restore-backup.sh                   restore the most recent backup
#   sudo ./deploy/restore-backup.sh <file|name>       restore a specific backup
#   add -y to skip the confirmation prompt
#   undo a restore: restore vorige-database-<tijd>.db (kept next to the backups)
set -euo pipefail

NAME=ikea-tweedekans
DATA_DIR=${DATA_DIR:-/var/lib/$NAME}
ENV_FILE=${ENV_FILE:-/etc/$NAME.env}
NODE_DIR=${NODE_DIR:-/opt/$NAME-node}
SERVICE_USER=${SERVICE_USER:-ikea}
SKIP_SYSTEM=${SKIP_SYSTEM:-0} # 1 = do not touch systemd/ownership (testing)

die() { echo "Fout: $*" >&2; exit 1; }

ASSUME_YES=0
LIST_ONLY=0
TARGET=""
for arg in "$@"; do
  case $arg in
    -y | --yes) ASSUME_YES=1 ;;
    --list | -l) LIST_ONLY=1 ;;
    -h | --help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "onbekende optie: $arg" ;;
    *) TARGET=$arg ;;
  esac
done

if [[ $SKIP_SYSTEM != 1 && $EUID -ne 0 ]]; then
  die "start met sudo: sudo $0 $*"
fi

# Database location: DB_PATH from the env file, else the default.
DB=$DATA_DIR/tweedekans.db
if [[ -f $ENV_FILE ]]; then
  configured=$(grep -E '^DB_PATH=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)
  [[ -n $configured ]] && DB=$configured
fi
BACKUP_DIR=$(dirname "$DB")/backups

if command -v node >/dev/null; then
  NODE_BIN=$(command -v node)
elif [[ -x $NODE_DIR/bin/node ]]; then
  NODE_BIN=$NODE_DIR/bin/node
else
  die "Node.js niet gevonden (nodig om de back-up te controleren)"
fi

BACKUPS=()
while IFS= read -r file; do
  [[ -n $file ]] && BACKUPS+=("$file")
done < <(ls -1t "$BACKUP_DIR"/tweedekans-*.db 2>/dev/null || true)

if [[ $LIST_ONLY == 1 ]]; then
  [[ ${#BACKUPS[@]} -gt 0 ]] || { echo "Geen back-ups in $BACKUP_DIR"; exit 0; }
  echo "Back-ups in $BACKUP_DIR (nieuwste eerst):"
  for f in "${BACKUPS[@]}"; do
    printf '  %s  %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
  done
  undo=$(ls -1t "$BACKUP_DIR"/vorige-database-*.db 2>/dev/null || true)
  if [[ -n $undo ]]; then
    echo "Veiliggestelde databases van vóór een herstel (terugdraaien):"
    while IFS= read -r f; do printf '  %s\n' "$(basename "$f")"; done <<<"$undo"
  fi
  exit 0
fi

[[ ${#BACKUPS[@]} -gt 0 ]] || die "geen back-ups gevonden in $BACKUP_DIR"

# Resolve the backup to restore.
if [[ -z $TARGET || $TARGET == latest ]]; then
  SOURCE=${BACKUPS[0]}
elif [[ -f $TARGET ]]; then
  SOURCE=$TARGET
elif [[ -f $BACKUP_DIR/$TARGET ]]; then
  SOURCE=$BACKUP_DIR/$TARGET
else
  die "back-up niet gevonden: $TARGET (bekijk de lijst met --list)"
fi

# Refuse a damaged backup before touching anything.
if ! "$NODE_BIN" -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const ok = db.prepare("PRAGMA integrity_check").get();
  const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ?").get("table");
  process.exit(ok.integrity_check === "ok" && tables.n > 0 ? 0 : 1);
' "$SOURCE" 2>/dev/null; then
  die "$SOURCE is beschadigd of geen geldige database; niets is gewijzigd"
fi

echo "Te herstellen:  $SOURCE ($(du -h "$SOURCE" | cut -f1), $(date -r "$SOURCE" '+%Y-%m-%d %H:%M'))"
echo "Naar:           $DB"
echo "De huidige database wordt eerst veiliggesteld als vorige-database-<tijd>.db."
if [[ $ASSUME_YES != 1 ]]; then
  read -r -p "Doorgaan? Gebruikers en data van na deze back-up gaan verloren [j/N] " answer
  [[ $answer == j || $answer == J || $answer == y || $answer == Y ]] || { echo "Afgebroken."; exit 1; }
fi

was_active=0
if [[ $SKIP_SYSTEM != 1 ]] && systemctl is-active --quiet "$NAME"; then
  was_active=1
  echo "==> Service stoppen"
  systemctl stop "$NAME"
fi

# Keep the current database so the restore itself can be undone.
if [[ -f $DB ]]; then
  safety=$BACKUP_DIR/vorige-database-$(date +%Y%m%d-%H%M%S)-$$.db
  mkdir -p "$BACKUP_DIR"
  cp "$DB" "$safety"
  chmod 600 "$safety"
  echo "==> Huidige database veiliggesteld: $safety"
fi

# Replace the database; stale WAL/SHM files of the old one must not survive.
cp "$SOURCE" "$DB.restoring"
rm -f "$DB-wal" "$DB-shm"
mv "$DB.restoring" "$DB"
chmod 600 "$DB"
if [[ $SKIP_SYSTEM != 1 ]]; then
  chown "$SERVICE_USER": "$DB" "$BACKUP_DIR" 2>/dev/null || true
fi
echo "==> Database hersteld uit $(basename "$SOURCE")"

if [[ $was_active == 1 ]]; then
  echo "==> Service starten"
  systemctl start "$NAME"
fi
echo "Klaar."

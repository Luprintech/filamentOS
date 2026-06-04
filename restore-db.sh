#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# restore-db.sh — Restaurar FilamentOS desde un backup
#
# USO:
#   sudo bash restore-db.sh <archivo.db.gz>
#
# Ejemplo:
#   sudo bash /volume1/docker/Proyectos-web/filamentOS/restore-db.sh \
#       /volume1/homes/Lupe/backups-filamentos/data_20260604_030000.db.gz
#
# Qué hace:
#   1. Hace backup automático del estado actual (DB + uploads)
#   2. Muestra qué se va a restaurar y pide confirmación
#   3. Para el contenedor
#   4. Restaura la DB; si existe uploads_TIMESTAMP.tar.gz con el mismo
#      timestamp, también restaura los uploads
#   5. Reinicia el contenedor
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

CONTAINER="filamentos"
BACKUP_DIR="/volume1/homes/Lupe/backups-filamentos"

# ── Validación de argumentos ──────────────────────────────────────────────
if [ "$#" -ne 1 ]; then
    echo "Uso: sudo bash restore-db.sh <archivo.db.gz>"
    echo ""
    echo "Backups disponibles:"
    ls -lt "${BACKUP_DIR}"/data_*.db.gz 2>/dev/null | head -10 \
        || echo "  (ninguno encontrado en ${BACKUP_DIR})"
    exit 1
fi

RESTORE_FILE="$1"

if [ ! -f "${RESTORE_FILE}" ]; then
    echo "ERROR: El archivo '${RESTORE_FILE}' no existe."
    exit 1
fi

if [[ "${RESTORE_FILE}" != *.db.gz ]]; then
    echo "ERROR: El archivo debe tener extensión .db.gz"
    exit 1
fi

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker no encontrado. Verificá que Container Manager está instalado."
    exit 1
fi

# Detectar si existe un backup de uploads con el mismo timestamp
RESTORE_BASENAME=$(basename "${RESTORE_FILE}")
RESTORE_TS="${RESTORE_BASENAME#data_}"
RESTORE_TS="${RESTORE_TS%.db.gz}"
UPLOADS_BACKUP="$(dirname "${RESTORE_FILE}")/uploads_${RESTORE_TS}.tar.gz"

if [ -f "${UPLOADS_BACKUP}" ]; then
    RESTORE_UPLOADS=true
else
    RESTORE_UPLOADS=false
fi

# ── Presentación ──────────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│          RESTAURACIÓN DE FilamentOS                     │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""
echo "  DB a restaurar  : ${RESTORE_FILE} ($(du -sh "${RESTORE_FILE}" | cut -f1))"

if [ "${RESTORE_UPLOADS}" = "true" ]; then
    echo "  Uploads         : ${UPLOADS_BACKUP} ($(du -sh "${UPLOADS_BACKUP}" | cut -f1))"
else
    echo "  Uploads         : no hay backup de uploads para esta fecha"
    echo "                    (los uploads actuales se conservarán)"
fi

echo ""
echo "  ⚠  ADVERTENCIA: Se reemplazará la base de datos actual."
echo "     Se hará un backup automático del estado previo antes de restaurar."
echo ""
read -r -p "  ¿Confirmar restauración? (escribí 'SI' para confirmar): " CONFIRM

if [ "${CONFIRM}" != "SI" ]; then
    echo ""
    echo "  Restauración cancelada."
    exit 0
fi

echo ""
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "${BACKUP_DIR}"

# ── Paso 1: Backup del estado actual ─────────────────────────────────────
echo "[1/5] Backup automático del estado actual ..."

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    # Contenedor en marcha: sqlite3 .backup para snapshot consistente
    docker exec "${CONTAINER}" sh -c \
        "which sqlite3 >/dev/null 2>&1 || apk add --no-cache sqlite >/dev/null 2>&1; \
         sqlite3 /data/data.db \".backup '/tmp/pre_restore_${TIMESTAMP}.db'\""
    docker cp "${CONTAINER}:/tmp/pre_restore_${TIMESTAMP}.db" "${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db"
    docker exec "${CONTAINER}" rm -f "/tmp/pre_restore_${TIMESTAMP}.db"
else
    # Contenedor parado: acceder al volumen con un contenedor efímero
    docker run --rm \
        -v filamentos_sqlite_data:/data:ro \
        -v "${BACKUP_DIR}:/backup" \
        alpine:3.20 \
        sh -c "apk add --no-cache sqlite >/dev/null 2>&1; \
               sqlite3 /data/data.db \".backup '/backup/pre_restore_${TIMESTAMP}.db'\""
fi
gzip -9 "${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db"
echo "    → DB actual: ${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db.gz"

# Pre-backup de uploads también
if docker run --rm \
    -v filamentos_uploads_data:/uploads:ro \
    -v "${BACKUP_DIR}:/backup" \
    alpine:3.20 \
    tar czf "/backup/pre_restore_uploads_${TIMESTAMP}.tar.gz" -C /uploads . 2>/dev/null; then
    echo "    → Uploads actuales: ${BACKUP_DIR}/pre_restore_uploads_${TIMESTAMP}.tar.gz"
fi

echo "      (para revertir: sudo bash restore-db.sh ${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db.gz)"

# ── Paso 2: Parar el contenedor ───────────────────────────────────────────
echo "[2/5] Parando el contenedor ${CONTAINER} ..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker stop "${CONTAINER}"
    echo "    → Contenedor detenido."
else
    echo "    → El contenedor ya estaba parado."
fi

# ── Paso 3: Descomprimir el backup de DB ──────────────────────────────────
echo "[3/5] Descomprimiendo backup de DB ..."
TMPDIR_RESTORE="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_RESTORE}"' EXIT

gunzip -c "${RESTORE_FILE}" > "${TMPDIR_RESTORE}/data.db"
echo "    → OK"

# ── Paso 4: Restaurar volúmenes ───────────────────────────────────────────
echo "[4/5] Restaurando volúmenes ..."

# DB
docker run --rm \
    -v filamentos_sqlite_data:/data \
    -v "${TMPDIR_RESTORE}:/restore:ro" \
    alpine:3.20 \
    sh -c "cp /restore/data.db /data/data.db && chmod 644 /data/data.db"
echo "    → filamentos_sqlite_data restaurado"

# Uploads (solo si existe backup con el mismo timestamp)
if [ "${RESTORE_UPLOADS}" = "true" ]; then
    UPLOADS_DIR="$(dirname "${UPLOADS_BACKUP}")"
    UPLOADS_FILENAME="$(basename "${UPLOADS_BACKUP}")"
    docker run --rm \
        -v filamentos_uploads_data:/uploads \
        -v "${UPLOADS_DIR}:/source:ro" \
        alpine:3.20 \
        sh -c "find /uploads -mindepth 1 -delete 2>/dev/null; \
               tar xzf /source/${UPLOADS_FILENAME} -C /uploads"
    echo "    → filamentos_uploads_data restaurado"
fi

# ── Paso 5: Reiniciar el contenedor ──────────────────────────────────────
echo "[5/5] Iniciando el contenedor ${CONTAINER} ..."
docker start "${CONTAINER}"
echo "    → Contenedor iniciado."

echo ""
echo "✅  Restauración completada."
echo ""
echo "   Si algo no funciona como esperabas, revertí con:"
echo "   sudo bash restore-db.sh ${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db.gz"
echo ""

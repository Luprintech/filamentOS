#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# backup-db.sh — Backup diario de FilamentOS en Synology NAS
#
# CONFIGURAR EN DSM — Programador de tareas (Task Scheduler):
#   1. Panel de Control → Programador de tareas
#   2. Crear → Tarea programada → Script de usuario
#   3. Pestaña General:
#        - Nombre de la tarea: backup-filamentos
#        - Usuario: root
#        - Activada: ✓
#   4. Pestaña Programar:
#        - Ejecutar a la(s): 03:00
#        - Repetir: Diariamente
#   5. Pestaña Configuración de la tarea → Ejecutar comando:
#        bash /volume1/docker/Proyectos-web/filamentOS/backup-db.sh
#   6. Guardar → DSM pedirá tu contraseña de admin
#
#   Para recibir alertas si algo falla:
#     Panel de Control → Notificación → Email → activar
#     Luego en la tarea, activar "Enviar detalles por correo electrónico"
#
# USO MANUAL (SSH al Synology):
#   sudo bash /volume1/docker/Proyectos-web/filamentOS/backup-db.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuración ──────────────────────────────────────────────────────────
CONTAINER="filamentos"
BACKUP_DIR="/volume1/homes/Lupe/backups-filamentos"
RETENTION_DAYS=30
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${BACKUP_DIR}/backup.log"
# ──────────────────────────────────────────────────────────────────────────

mkdir -p "${BACKUP_DIR}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

# Rotar log: mantener las últimas 2000 líneas para no llenar el disco
if [ -f "${LOG_FILE}" ]; then
    line_count=$(wc -l < "${LOG_FILE}" 2>/dev/null || echo 0)
    if [ "${line_count}" -gt 2000 ]; then
        tail -n 2000 "${LOG_FILE}" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "${LOG_FILE}"
    fi
fi

log "=== Backup FilamentOS iniciado ==="

# ── Verificaciones previas ─────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "ERROR: docker no encontrado. Verificá que Container Manager está instalado y activo."
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log "ERROR: El contenedor '${CONTAINER}' no está corriendo. Backup abortado."
    exit 1
fi

# ── 1) Backup atómico con sqlite3 .backup ─────────────────────────────────
# sqlite3 .backup usa la API de backup de SQLite: snapshot consistente incluso
# si la app está escribiendo en ese momento. Nunca usar cp directo del .db.
log "[1/4] Snapshot SQLite con sqlite3 .backup ..."
docker exec "${CONTAINER}" sh -c \
    "which sqlite3 >/dev/null 2>&1 || apk add --no-cache sqlite >/dev/null 2>&1; \
     sqlite3 /data/data.db \".backup '/tmp/snapshot_${TIMESTAMP}.db'\""
docker cp "${CONTAINER}:/tmp/snapshot_${TIMESTAMP}.db" "${BACKUP_DIR}/data_${TIMESTAMP}.db"
docker exec "${CONTAINER}" rm -f "/tmp/snapshot_${TIMESTAMP}.db"
gzip -9 "${BACKUP_DIR}/data_${TIMESTAMP}.db"
log "    → ${BACKUP_DIR}/data_${TIMESTAMP}.db.gz"

# ── 2) Backup de uploads (logos de marcas/filamentos) ─────────────────────
# Monta el volumen como lectura sola en un contenedor efímero y empaqueta.
# El mismo timestamp que la DB permite que restore-db.sh empareje ambos archivos.
log "[2/4] Comprimiendo uploads ..."
if docker run --rm \
    -v filamentos_uploads_data:/uploads:ro \
    -v "${BACKUP_DIR}:/backup" \
    alpine:3.20 \
    tar czf "/backup/uploads_${TIMESTAMP}.tar.gz" -C /uploads . 2>/dev/null; then
    log "    → ${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"
else
    log "    ⚠ uploads vacío o imagen alpine no disponible — omitido (no es crítico)"
fi

# ── 3) Retención: borrar backups más viejos de RETENTION_DAYS días ─────────
log "[3/4] Limpiando backups con más de ${RETENTION_DAYS} días ..."
find "${BACKUP_DIR}" -type f -name 'data_*.db.gz'     -mtime "+${RETENTION_DAYS}" -print -delete
find "${BACKUP_DIR}" -type f -name 'uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -print -delete

# ── 4) Estado final ────────────────────────────────────────────────────────
total_db=$(find "${BACKUP_DIR}" -type f -name 'data_*.db.gz' | wc -l)
total_ul=$(find "${BACKUP_DIR}" -type f -name 'uploads_*.tar.gz' | wc -l)
size=$(du -sh "${BACKUP_DIR}" | cut -f1)
log "[4/4] ${total_db} DB backup(s), ${total_ul} uploads backup(s) — ${size} en disco"
log "=== Backup FilamentOS OK ==="

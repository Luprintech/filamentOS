# ═══════════════════════════════════════════════════════
# STAGE 1 — instalar dependencias
# ═══════════════════════════════════════════════════════

# Usamos Node 20 en Alpine (ligero, ideal para producción)
FROM node:20-alpine AS deps

# Instalar herramientas necesarias para compilar módulos nativos
# better-sqlite3 necesita python3, make y g++
RUN apk add --no-cache python3 make g++

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Copiar SOLO los package.json (optimiza cache de Docker)
# Así Docker no reinstala deps si no cambian
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Instalar dependencias backend
RUN cd backend && npm install

# Instalar dependencias frontend
RUN cd frontend && npm install


# ═══════════════════════════════════════════════════════
# STAGE 2 — build del proyecto
# ═══════════════════════════════════════════════════════

FROM node:20-alpine AS build

WORKDIR /app

# Copiar node_modules ya instalados (evita reinstalar)
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copiar el código fuente completo
COPY backend ./backend
COPY frontend ./frontend

# Compilar backend TypeScript → genera /backend/dist
RUN cd backend && npm run build

# Compilar frontend Vite → genera /frontend/dist
RUN cd frontend && npm run build


# ═══════════════════════════════════════════════════════
# STAGE 3 — imagen final de producción
# ═══════════════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

# Copiar SOLO lo necesario para producción
# backend compilado
COPY --from=build /app/backend/dist ./backend/dist

# dependencias backend (incluye better-sqlite3 ya compilado)
COPY --from=build /app/backend/node_modules ./backend/node_modules

# frontend compilado (archivos estáticos)
COPY --from=build /app/frontend/dist ./frontend/dist


# Exponer puerto del servidor Express
EXPOSE 3001


# movernos a carpeta backend
WORKDIR /app/backend


# comando que arranca el servidor
CMD ["node", "dist/index.js"]
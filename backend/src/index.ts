import express from 'express';
import cors from 'cors';
import multer from 'multer';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { fetchFilamentColorsSwatchesPage, fetchFilamentColorsVersionInfo, mapFilamentColorsSwatchToCatalogRecord } from './filamentcolors-client';


dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:9002';

/**
 * Resuelve el origen del cliente dinámicamente.
 * - Si hay request, usa las cabeceras X-Forwarded (enviadas por Nginx).
 * - Si no, usa CLIENT_ORIGIN del .env (fallback para contextos sin request).
 */
function resolveClientOrigin(req?: { headers: Record<string, string | string[] | undefined> }): string {
  if (!req) return CLIENT_ORIGIN;
  const proto = req.headers['x-forwarded-proto'];
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  if (proto && host) {
    const p = Array.isArray(proto) ? proto[0] : proto;
    const h = Array.isArray(host) ? host[0] : host;
    return `${p}://${h}`;
  }
  return CLIENT_ORIGIN;
}
const FEATURE_GLOBAL_FILAMENT_CATALOG = process.env.FEATURE_GLOBAL_FILAMENT_CATALOG !== 'false';
const FEATURE_FILAMENTCOLORS_SYNC = process.env.FEATURE_FILAMENTCOLORS_SYNC !== 'false';
// Use || (not ??) so that DB_PATH='' (empty string in .env) also falls back to the default path.
// With ??, an empty string would be passed to new Database('') which opens a temp SQLite
// database that is deleted on close — losing all data on every server restart.
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data.db');

// ── Base de datos SQLite ───────────────────────────────────────────────────────
const db = new Database(DB_PATH);

function migrateLegacyDatabases() {
  const legacyPaths = [
    path.resolve(__dirname, '../data.db'),
    path.resolve(process.cwd(), 'data.db'),
  ].filter((legacyPath) => legacyPath !== DB_PATH);

  const canonicalCounts = {
    users: (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c,
    projects: (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c,
    trackerProjects: (db.prepare('SELECT COUNT(*) as c FROM tracker_projects').get() as { c: number }).c,
    trackerPieces: (db.prepare('SELECT COUNT(*) as c FROM tracker_pieces').get() as { c: number }).c,
  };

  for (const legacyPath of legacyPaths) {
    try {
      if (!fs.existsSync(legacyPath)) continue;
      const legacyDb = new Database(legacyPath, { readonly: true });
      const tables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = new Set(tables.map((table) => table.name));

      const transaction = db.transaction(() => {
        if (tableNames.has('users') && canonicalCounts.users === 0) {
          const users = legacyDb.prepare('SELECT * FROM users').all() as DbUser[];
          const insert = db.prepare('INSERT OR IGNORE INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)');
          users.forEach((user) => insert.run(user.id, user.google_id, user.email, user.name, user.photo));
        }

        if (tableNames.has('projects') && canonicalCounts.projects === 0) {
          const projects = legacyDb.prepare('SELECT id, user_id, job_name, data, created_at FROM projects').all() as { id: string; user_id: string; job_name: string; data: string; created_at: string }[];
          const insert = db.prepare('INSERT OR IGNORE INTO projects (id, user_id, job_name, data, created_at) VALUES (?, ?, ?, ?, ?)');
          projects.forEach((project) => insert.run(project.id, project.user_id, project.job_name, project.data, project.created_at));
        }

        if (tableNames.has('tracker_projects') && canonicalCounts.trackerProjects === 0) {
          const trackerProjects = legacyDb.prepare('SELECT id, user_id, title, description, cover_image, goal, price_per_kg, currency, created_at, updated_at FROM tracker_projects').all() as {
            id: string; user_id: string; title: string; description: string; cover_image: string | null; goal: number; price_per_kg: number; currency: string; created_at: string; updated_at: string;
          }[];
          const insert = db.prepare('INSERT OR IGNORE INTO tracker_projects (id, user_id, title, description, cover_image, goal, price_per_kg, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          trackerProjects.forEach((project) => insert.run(project.id, project.user_id, project.title, project.description, project.cover_image, project.goal, project.price_per_kg, project.currency, project.created_at, project.updated_at));
        }

        if (tableNames.has('tracker_pieces') && canonicalCounts.trackerPieces === 0) {
          const trackerPieces = legacyDb.prepare('SELECT id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, created_at FROM tracker_pieces').all() as {
            id: string; project_id: string; user_id: string; order_index: number; label: string; name: string; time_text: string; gram_text: string; total_secs: number; total_grams: number; total_cost: number; time_lines: number; gram_lines: number; created_at: string;
          }[];
          const insert = db.prepare('INSERT OR IGNORE INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          trackerPieces.forEach((piece) => insert.run(piece.id, piece.project_id, piece.user_id, piece.order_index ?? 0, piece.label, piece.name, piece.time_text, piece.gram_text, piece.total_secs, piece.total_grams, piece.total_cost, piece.time_lines, piece.gram_lines, piece.created_at));
        }
      });

      transaction();
      legacyDb.close();
    } catch {
      // ignoramos bases legacy corruptas o incompatibles; la canónica sigue funcionando
    }
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    google_id     TEXT UNIQUE,
    email         TEXT,
    name          TEXT,
    photo         TEXT,
    password_hash TEXT,
    pref_date_format    TEXT DEFAULT 'dd-mm-yyyy',
    pref_length_unit    TEXT DEFAULT 'mm',
    pref_weight_unit    TEXT DEFAULT 'g'
  );
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_name   TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_projects (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    cover_image  TEXT,
    goal         INTEGER NOT NULL DEFAULT 30,
    price_per_kg REAL NOT NULL DEFAULT 0,
    currency     TEXT NOT NULL DEFAULT 'EUR',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_pieces (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES tracker_projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    label       TEXT NOT NULL,
    name        TEXT NOT NULL,
    time_text   TEXT NOT NULL DEFAULT '',
    gram_text   TEXT NOT NULL DEFAULT '',
    total_secs  INTEGER NOT NULL DEFAULT 0,
    total_grams REAL NOT NULL DEFAULT 0,
    total_cost  REAL NOT NULL DEFAULT 0,
    time_lines  INTEGER NOT NULL DEFAULT 0,
    gram_lines  INTEGER NOT NULL DEFAULT 0,
    image_url   TEXT,
    notes       TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'printed',
    printed_at  TEXT,
    incident    TEXT NOT NULL DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_piece_filaments (
    id         TEXT PRIMARY KEY,
    piece_id   TEXT NOT NULL REFERENCES tracker_pieces(id) ON DELETE CASCADE,
    spool_id   TEXT REFERENCES filament_inventory(id) ON DELETE SET NULL,
    color_hex  TEXT NOT NULL DEFAULT '#888888',
    color_name TEXT NOT NULL DEFAULT '',
    brand      TEXT NOT NULL DEFAULT '',
    material   TEXT NOT NULL DEFAULT '',
    grams      REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_piece_materials (
    id         TEXT PRIMARY KEY,
    piece_id   TEXT NOT NULL REFERENCES tracker_pieces(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    quantity   REAL NOT NULL DEFAULT 0,
    cost       REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    sess       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pdf_customization (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    logo_path       TEXT,
    primary_color   TEXT DEFAULT '#29aae1',
    secondary_color TEXT DEFAULT '#333333',
    accent_color    TEXT DEFAULT '#f0f4f8',
    company_name    TEXT,
    footer_text     TEXT,
    show_machine_costs   INTEGER DEFAULT 1,
    show_breakdown       INTEGER DEFAULT 1,
    show_other_costs     INTEGER DEFAULT 1,
    show_labor_costs     INTEGER DEFAULT 1,
    show_electricity     INTEGER DEFAULT 1,
    template_name   TEXT DEFAULT 'default',
    website_url     TEXT,
    instagram_url   TEXT,
    tiktok_url      TEXT,
    facebook_url    TEXT,
    x_url           TEXT,
    social_links    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS filament_inventory (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand        TEXT NOT NULL,
    material     TEXT NOT NULL,
    color        TEXT NOT NULL,
    color_hex    TEXT NOT NULL DEFAULT '#cccccc',
    total_grams  REAL NOT NULL DEFAULT 0,
    remaining_g  REAL NOT NULL DEFAULT 0,
    price        REAL NOT NULL DEFAULT 0,
    notes        TEXT NOT NULL DEFAULT '',
    shop_url     TEXT,
    inventory_source TEXT NOT NULL DEFAULT 'local',
    linked_at    TEXT,
    last_synced_at TEXT,
    catalog_filament_id TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS filament_catalog (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    external_id     TEXT NOT NULL,
    slug            TEXT NOT NULL,
    brand           TEXT NOT NULL,
    material        TEXT NOT NULL,
    color           TEXT NOT NULL,
    color_hex       TEXT,
    finish          TEXT,
    image_url       TEXT,
    custom_image    TEXT,
    purchase_url    TEXT,
    attribution     TEXT NOT NULL DEFAULT 'Data from FilamentColors.xyz (CC BY 4.0)',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    last_seen_at    TEXT NOT NULL,
    last_synced_at  TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(source, external_id)
  );
  CREATE TABLE IF NOT EXISTS filament_catalog_sync_state (
    provider         TEXT PRIMARY KEY,
    db_version       INTEGER,
    db_last_modified TEXT,
    last_checked_at  TEXT,
    last_success_at  TEXT,
    last_error       TEXT
  );
  CREATE TABLE IF NOT EXISTS user_custom_spool_options (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type    TEXT NOT NULL CHECK(type IN ('brand', 'material')),
    value   TEXT NOT NULL,
    UNIQUE(user_id, type, value)
  );
  CREATE TABLE IF NOT EXISTS consumos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bobina_id   TEXT NOT NULL REFERENCES filament_inventory(id) ON DELETE CASCADE,
    proyecto_id TEXT NOT NULL,
    gramos      REAL NOT NULL,
    fecha       TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS filamentos_comunidad (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo           TEXT NOT NULL,
    marca            TEXT,
    nombre           TEXT,
    color            TEXT,
    color_hex        TEXT,
    material         TEXT,
    diametro         REAL,
    peso             REAL,
    temp_min         INTEGER,
    temp_max         INTEGER,
    fecha_aportacion TEXT DEFAULT (datetime('now')),
    usuario_id       TEXT REFERENCES users(id) ON DELETE SET NULL
  );
`);

// ── Schema migrations for existing DBs ────────────────────────────────────────
const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as { name: string; notnull: number }[];
const userColNames = new Set(userColumns.map((c) => c.name));

if (!userColNames.has('password_hash')) {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
}

// Fix: google_id NOT NULL constraint on existing DBs — SQLite can't ALTER constraints
const googleIdCol = userColumns.find(c => c.name === 'google_id');
if (googleIdCol && googleIdCol.notnull === 1) {
  db.pragma('foreign_keys = OFF');
  const txn = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_mig (
        id            TEXT PRIMARY KEY,
        google_id     TEXT UNIQUE,
        email         TEXT,
        name          TEXT,
        photo         TEXT,
        password_hash TEXT
      );
      INSERT INTO users_mig (id, google_id, email, name, photo, password_hash)
        SELECT id, google_id, email, name, photo, password_hash FROM users;
      DROP TABLE users;
      ALTER TABLE users_mig RENAME TO users;
    `);
  });
  txn();
  db.pragma('foreign_keys = ON');
}

// Asegurar unique index en email para login local (ignora NULLs)
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE email IS NOT NULL
`);

// ── Preferencias de usuario ──────────────────────────────────────────────────
if (!userColNames.has('pref_date_format')) {
  db.exec("ALTER TABLE users ADD COLUMN pref_date_format TEXT DEFAULT 'dd-mm-yyyy'");
}
if (!userColNames.has('pref_length_unit')) {
  db.exec("ALTER TABLE users ADD COLUMN pref_length_unit TEXT DEFAULT 'mm'");
}
if (!userColNames.has('pref_weight_unit')) {
  db.exec("ALTER TABLE users ADD COLUMN pref_weight_unit TEXT DEFAULT 'g'");
}

db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

const pdfCustomizationColumns = db
  .prepare("PRAGMA table_info(pdf_customization)")
  .all() as { name: string }[];

for (const [column, type] of [
  ['website_url', 'TEXT'],
  ['instagram_url', 'TEXT'],
  ['tiktok_url', 'TEXT'],
  ['facebook_url', 'TEXT'],
  ['x_url', 'TEXT'],
  ['social_links', 'TEXT'],
] as const) {
  if (!pdfCustomizationColumns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE pdf_customization ADD COLUMN ${column} ${type}`);
  }
}

// ── Performance index for stats queries ──────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tracker_pieces_user_date
  ON tracker_pieces(user_id, created_at);
`);

const trackerProjectColumns = db
  .prepare("PRAGMA table_info(tracker_projects)")
  .all() as { name: string }[];

if (!trackerProjectColumns.some((column) => column.name === 'cover_image')) {
  db.exec("ALTER TABLE tracker_projects ADD COLUMN cover_image TEXT");
}

const trackerPieceColumns = db
  .prepare("PRAGMA table_info(tracker_pieces)")
  .all() as { name: string }[];

if (!trackerPieceColumns.some((column) => column.name === 'order_index')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0");
}

if (!trackerPieceColumns.some((column) => column.name === 'image_url')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN image_url TEXT");
}

if (!trackerPieceColumns.some((column) => column.name === 'notes')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}

if (!trackerPieceColumns.some((column) => column.name === 'status')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN status TEXT NOT NULL DEFAULT 'printed'");
}

if (!trackerPieceColumns.some((column) => column.name === 'printed_at')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN printed_at TEXT");
}

if (!trackerPieceColumns.some((column) => column.name === 'incident')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN incident TEXT NOT NULL DEFAULT ''");
}

// filament_inventory: add spool_id to tracker_pieces for deduction tracking
if (!trackerPieceColumns.some((column) => column.name === 'spool_id')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN spool_id TEXT");
}

// logbook-improvements: add plate_count and file_link columns
if (!trackerPieceColumns.some((column) => column.name === 'plate_count')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN plate_count INTEGER DEFAULT 1 NOT NULL");
}

if (!trackerPieceColumns.some((column) => column.name === 'file_link')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN file_link TEXT DEFAULT NULL");
}

// calculator-stats: add printed_at, total_cost, total_grams, total_secs to projects table
const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
if (!projectColumns.some(c => c.name === 'printed_at')) {
  db.exec('ALTER TABLE projects ADD COLUMN printed_at TEXT DEFAULT NULL');
}
if (!projectColumns.some(c => c.name === 'total_cost')) {
  db.exec('ALTER TABLE projects ADD COLUMN total_cost REAL NOT NULL DEFAULT 0');
}
if (!projectColumns.some(c => c.name === 'total_grams')) {
  db.exec('ALTER TABLE projects ADD COLUMN total_grams REAL NOT NULL DEFAULT 0');
}
if (!projectColumns.some(c => c.name === 'total_secs')) {
  db.exec('ALTER TABLE projects ADD COLUMN total_secs INTEGER NOT NULL DEFAULT 0');
}
if (!projectColumns.some(c => c.name === 'status')) {
  db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'delivered'");
}

// Ensure filament_inventory columns exist (future-proofing if schema changes)
const inventoryColumns = db
  .prepare("PRAGMA table_info(filament_inventory)")
  .all() as { name: string }[];

const inventoryColNames = new Set(inventoryColumns.map((c) => c.name));
if (inventoryColNames.size > 0) {
  // Table exists; check for any missing columns from schema evolution
  if (!inventoryColNames.has('color_hex')) {
    db.exec("ALTER TABLE filament_inventory ADD COLUMN color_hex TEXT NOT NULL DEFAULT '#cccccc'");
  }
  if (!inventoryColNames.has('notes')) {
    db.exec("ALTER TABLE filament_inventory ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (!inventoryColNames.has('shop_url')) {
    db.exec("ALTER TABLE filament_inventory ADD COLUMN shop_url TEXT");
  }
  if (!inventoryColNames.has('inventory_source')) {
    db.exec("ALTER TABLE filament_inventory ADD COLUMN inventory_source TEXT NOT NULL DEFAULT 'local'");
  }
  if (!inventoryColNames.has('linked_at')) {
    db.exec('ALTER TABLE filament_inventory ADD COLUMN linked_at TEXT');
  }
  if (!inventoryColNames.has('last_synced_at')) {
    db.exec('ALTER TABLE filament_inventory ADD COLUMN last_synced_at TEXT');
  }
  if (!inventoryColNames.has('catalog_filament_id')) {
    db.exec('ALTER TABLE filament_inventory ADD COLUMN catalog_filament_id TEXT');
  }
  db.exec("UPDATE filament_inventory SET inventory_source='local' WHERE inventory_source IS NULL OR TRIM(inventory_source) = ''");

}

// Ensure tracker_piece_filaments table exists (migration for existing DBs)
const trackerFilamentTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tracker_piece_filaments'")
  .all() as { name: string }[];
if (trackerFilamentTables.length === 0) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracker_piece_filaments (
      id         TEXT PRIMARY KEY,
      piece_id   TEXT NOT NULL REFERENCES tracker_pieces(id) ON DELETE CASCADE,
      spool_id   TEXT REFERENCES filament_inventory(id) ON DELETE SET NULL,
      color_hex  TEXT NOT NULL DEFAULT '#888888',
      color_name TEXT NOT NULL DEFAULT '',
      brand      TEXT NOT NULL DEFAULT '',
      material   TEXT NOT NULL DEFAULT '',
      grams      REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

const trackerMaterialTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tracker_piece_materials'")
  .all() as { name: string }[];
if (trackerMaterialTables.length === 0) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracker_piece_materials (
      id         TEXT PRIMARY KEY,
      piece_id   TEXT NOT NULL REFERENCES tracker_pieces(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      quantity   REAL NOT NULL DEFAULT 0,
      cost       REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

migrateLegacyDatabases();

// ── Tabla resources (enlaces de interés) ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'utils',
    is_ai       INTEGER NOT NULL DEFAULT 0,
    is_free     INTEGER NOT NULL DEFAULT 0,
    is_new      INTEGER NOT NULL DEFAULT 0,
    custom_image TEXT DEFAULT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`);

// Seed inicial — solo si la tabla está vacía
const resourceCount = (db.prepare('SELECT COUNT(*) as c FROM resources').get() as { c: number }).c;
if (resourceCount === 0) {
  const insertResource = db.prepare(`
    INSERT INTO resources (id, name, description, url, category, is_ai, is_free, is_new, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedResources = [
    ['res-001', 'Tencent Hunyuan 3D', 'Genera modelos 3D detallados a partir de texto o imagen con IA de Tencent.', 'https://3d.hunyuan.tencent.com/', 'ai', 1, 1, 0, 1],
    ['res-002', 'Tripo3D', 'Crea modelos 3D listos para imprimir en segundos desde una foto o descripción.', 'https://www.tripo3d.ai/es', 'ai', 1, 0, 0, 2],
    ['res-003', 'Meshy AI', 'Generador 3D con IA que produce meshes optimizados y texturas realistas.', 'https://www.meshy.ai/es', 'ai', 1, 0, 0, 3],
    ['res-004', 'CSM 3D', 'Convierte imágenes en modelos 3D de alta calidad con IA de última generación.', 'https://3d.csm.ai/', 'ai', 1, 1, 0, 4],
    ['res-005', 'Luma AI Genie', 'Genera objetos 3D fotorrealistas desde texto en pocos segundos.', 'https://lumalabs.ai/genie', 'ai', 1, 1, 0, 5],
    ['res-006', 'MakerWorld', 'Plataforma de Bambu Lab con miles de modelos optimizados para impresión FDM.', 'https://makerworld.com/es', 'models', 0, 1, 0, 10],
    ['res-007', 'Printables', 'Repositorio de Prusa con modelos verificados y comunidad muy activa.', 'https://www.printables.com/', 'models', 0, 1, 0, 11],
    ['res-008', 'Thingiverse', 'El repositorio de modelos 3D más grande del mundo. Referencia desde 2008.', 'https://www.thingiverse.com/', 'models', 0, 1, 0, 12],
    ['res-009', 'Cults3D', 'Marketplace con modelos gratuitos y de pago de diseñadores independientes.', 'https://cults3d.com/es', 'models', 0, 0, 0, 13],
    ['res-010', 'MyMiniFactory', 'Modelos curados y garantizados para impresión. Comunidad de calidad.', 'https://www.myminifactory.com/', 'models', 0, 0, 0, 14],
    ['res-011', 'Amazon', 'Amplia variedad de marcas y materiales con entrega rápida.', 'https://www.amazon.es/s?k=filamento+impresora+3d', 'filament', 0, 0, 0, 20],
    ['res-012', 'Impresoras3D.com', 'Tienda española especializada en filamentos, impresoras y accesorios 3D.', 'https://www.impresoras3d.com/', 'filament', 0, 0, 0, 21],
    ['res-013', 'Bambu Lab Store', 'Filamentos oficiales Bambu con perfiles optimizados para sus impresoras.', 'https://eu.store.bambulab.com/', 'filament', 0, 0, 0, 22],
    ['res-014', '3DJake', 'Gran catálogo europeo con materiales técnicos, resinas y filamentos especiales.', 'https://www.3djake.es/', 'filament', 0, 0, 0, 23],
    ['res-015', 'Filament2Print', 'Distribuidor europeo con más de 1000 referencias de filamentos y materiales.', 'https://filament2print.com/es/', 'filament', 0, 0, 0, 24],
    ['res-016', 'Bambu Studio', 'Slicer oficial de Bambu Lab. Potente, rápido y con soporte multi-color.', 'https://bambulab.com/es-es/download/studio', 'slicers', 0, 1, 0, 30],
    ['res-017', 'OrcaSlicer', 'Fork de Bambu Studio de código abierto. El favorito de los usuarios avanzados.', 'https://github.com/SoftFever/OrcaSlicer/releases', 'slicers', 0, 1, 0, 31],
    ['res-018', 'Ultimaker Cura', 'El slicer de referencia para principiantes. Miles de perfiles de impresoras.', 'https://ultimaker.com/software/ultimaker-cura/', 'slicers', 0, 1, 0, 32],
    ['res-019', 'PrusaSlicer', 'Slicer open source de Prusa. Excelente para modelos con soportes complejos.', 'https://www.prusa3d.com/page/prusaslicer_424/', 'slicers', 0, 1, 0, 33],
    ['res-020', 'Chitubox', 'Slicer especializado en impresoras de resina MSLA/DLP.', 'https://www.chitubox.com/', 'slicers', 0, 1, 0, 34],
    ['res-021', 'Teaching Tech Calibration', 'Guías interactivas paso a paso para calibrar tu impresora a la perfección.', 'https://teachingtechyt.github.io/calibration.html', 'utils', 0, 1, 0, 40],
    ['res-022', 'Filament Colors', 'Base de datos de colores de filamento de todas las marcas, con comparativa visual.', 'https://filamentcolors.xyz/', 'utils', 0, 1, 0, 41],
    ['res-023', 'Slicer Settings Search', 'Busca y compara configuraciones de slicer entre usuarios de la comunidad.', 'https://slicersettings.net/', 'utils', 0, 1, 0, 42],
    ['res-024', '3D Print Calc', 'Calculadora online de costes, tiempos y consumo de filamento por pieza.', 'https://www.3dprintcalc.com/', 'utils', 0, 1, 0, 43],
  ] as const;
  for (const r of seedResources) insertResource.run(...r);
}

// ── Tabla lupe_settings (configuración del admin) ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS lupe_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// ── Tabla resource_categories ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS resource_categories (
    id         TEXT PRIMARY KEY,
    label_es   TEXT NOT NULL,
    label_en   TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT 'text-muted-foreground',
    badge_cls  TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 99,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed inicial de categorías
const catCount = (db.prepare('SELECT COUNT(*) as c FROM resource_categories').get() as { c: number }).c;
if (catCount === 0) {
  const insertCat = db.prepare(`INSERT INTO resource_categories (id, label_es, label_en, color, badge_cls, sort_order) VALUES (?, ?, ?, ?, ?, ?)`);
  insertCat.run('ai',       'IA 3D',      'AI 3D',       'text-[hsl(var(--challenge-blue))]',  'border-[hsl(var(--challenge-blue))]/30 bg-[hsl(var(--challenge-blue))]/10 text-[hsl(var(--challenge-blue))]', 1);
  insertCat.run('models',   'Modelos',    'Models',      'text-[hsl(var(--challenge-green))]', 'border-[hsl(var(--challenge-green))]/30 bg-[hsl(var(--challenge-green))]/10 text-[hsl(var(--challenge-green))]', 2);
  insertCat.run('filament', 'Filamento',  'Filament',    'text-yellow-400',                   'border-yellow-400/30 bg-yellow-400/10 text-yellow-400', 3);
  insertCat.run('slicers',  'Slicers',    'Slicers',     'text-violet-400',                   'border-violet-400/30 bg-violet-400/10 text-violet-400', 4);
  insertCat.run('utils',    'Utilidades', 'Utilities',   'text-orange-400',                   'border-orange-400/30 bg-orange-400/10 text-orange-400', 5);
}

// Add extra_tags column to resources (safe migration)
try { db.exec(`ALTER TABLE resources ADD COLUMN extra_tags TEXT NOT NULL DEFAULT '[]'`); } catch (_) { /* already exists */ }

// Add is_disabled column to tracker_pieces (safe migration)
try { db.exec(`ALTER TABLE tracker_pieces ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0`); } catch (_) { /* already exists */ }

// Add custom_image column to filament_catalog (safe migration)
try { db.exec(`ALTER TABLE filament_catalog ADD COLUMN custom_image TEXT`); } catch (_) { /* already exists */ }

// ── Email auth migrations ─────────────────────────────────────────────────────
try { db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0'); } catch (_) { /* ya existe */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS email_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL CHECK(type IN ('verify', 'reset')),
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ── Session type augmentation ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS resource_tags (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    badge_cls  TEXT NOT NULL DEFAULT 'border-border/50 bg-muted/20 text-muted-foreground',
    sort_order INTEGER NOT NULL DEFAULT 99,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const tagCount = (db.prepare('SELECT COUNT(*) as c FROM resource_tags').get() as { c: number }).c;
if (tagCount === 0) {
  const insertTag = db.prepare(`INSERT INTO resource_tags (id, label, badge_cls, sort_order) VALUES (?, ?, ?, ?)`);
  insertTag.run('recomendado', 'Recomendado', 'border-amber-400/30 bg-amber-400/10 text-amber-400', 1);
  insertTag.run('popular',     'Popular',     'border-rose-400/30 bg-rose-400/10 text-rose-400',   2);
  insertTag.run('beta',        'Beta',        'border-cyan-400/30 bg-cyan-400/10 text-cyan-400',   3);
  insertTag.run('pro',         'Pro',         'border-purple-400/30 bg-purple-400/10 text-purple-400', 4);
  insertTag.run('espanol',     'En español',  'border-orange-400/30 bg-orange-400/10 text-orange-400', 5);
}

// ── Session type augmentation ─────────────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
  }
}

interface DbUser {
  id: string;
  google_id: string | null;
  email: string | null;
  name: string | null;
  photo: string | null;
  password_hash: string | null;
  email_verified: number;
  pref_date_format?: string;
  pref_length_unit?: string;
  pref_weight_unit?: string;
}

class SQLiteSessionStore extends session.Store {
  override get(sid: string, callback: (err?: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = db
        .prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?')
        .get(sid) as { sess: string; expires_at: number } | undefined;

      if (!row) {
        callback(undefined, null);
        return;
      }

      if (row.expires_at <= Date.now()) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        callback(undefined, null);
        return;
      }

      callback(undefined, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  override set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    try {
      const expiresAt = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 7 * 24 * 60 * 60 * 1000;

      db.prepare(
        `INSERT INTO sessions (sid, sess, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`
      ).run(sid, JSON.stringify(sess), expiresAt);

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    const expiresAt = sess.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?').run(expiresAt, sid);
    callback?.();
  }
}

const sessionStore = new SQLiteSessionStore();

// ── Passport: Google OAuth ────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // callbackURL se pasa dinámicamente en la ruta (abajo) para que funcione
      // tanto en local como en producción sin depender de CLIENT_ORIGIN estático.
      callbackURL: '/api/auth/google/callback',
    },
    (_accessToken, _refreshToken, profile, done) => {
      const existing = db
        .prepare('SELECT * FROM users WHERE google_id = ?')
        .get(profile.id) as DbUser | undefined;

      if (existing) return done(null, existing);

      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)'
      ).run(
        id,
        profile.id,
        profile.emails?.[0]?.value ?? null,
        profile.displayName,
        profile.photos?.[0]?.value ?? null,
      );

      const newUser = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(id) as DbUser;
      done(null, newUser);
    }
  )
);

passport.serializeUser((user, done) => done(null, (user as DbUser).id));

passport.deserializeUser((id: unknown, done) => {
  try {
    const user = db
      .prepare('SELECT id, google_id, email, name, photo, password_hash, email_verified, pref_date_format, pref_length_unit, pref_weight_unit FROM users WHERE id = ?')
      .get(id as string) as DbUser | undefined;
    done(null, user ?? false);
  } catch (error) {
    console.error('[Passport] deserializeUser error:', error);
    done(error);
  }
});

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // necesario detrás de Nginx

// Configuración de multer para subir archivos
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configuración de multer para logos (disk storage)
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadsDir = path.resolve(__dirname, '../uploads/logos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const user = req.user as DbUser;
    const ext = path.extname(file.originalname);
    cb(null, `${user.id}-${Date.now()}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Rechazar el archivo con un error
      cb(new Error('Solo se permiten imágenes PNG, JPG o SVG'));
    }
  },
});

// Configuración de multer para fotos de perfil
const profilePhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadsDir = path.resolve(__dirname, '../uploads/profile-photos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const user = req.user as DbUser;
    const ext = path.extname(file.originalname);
    cb(null, `${user.id}-${Date.now()}${ext}`);
  },
});

const uploadProfilePhoto = multer({
  storage: profilePhotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes PNG, JPG o WebP'));
    }
  },
});


// Multer para imágenes de recursos (panel /lupe)
const resourceImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(__dirname, '../uploads/resources');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resource-${crypto.randomUUID()}${ext}`);
  },
});
const uploadResourceImage = multer({
  storage: resourceImageStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const allowedOrigins = [
  CLIENT_ORIGIN,
  'https://filamentos.luprintech.com',
  'http://filamentos.luprintech.com',
];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (curl, mobile apps) y los orígenes conocidos.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || '*');
    } else {
      callback(new Error(`CORS: origin no permitido: ${origin}`));
    }
  },
  credentials: true,
}));

// Confiar en los headers de Nginx (X-Forwarded-Proto, X-Forwarded-Host)
// Necesario para que req.protocol, req.hostname y las URLs absolutas de Passport
// funcionen correctamente detrás de un proxy inverso.
app.set('trust proxy', 1);

app.use(express.json({ limit: '25mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-cambia-en-produccion',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get(
  '/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get(
  '/api/auth/google/callback',
  (req, _res, next) => {
    // Sobrescribir failureRedirect dinámicamente
    const origin = resolveClientOrigin(req);
    passport.authenticate('google', {
      failureRedirect: `${origin}?error=auth_failed`,
    })(req, _res, next);
  },
  (req, res) => res.redirect(resolveClientOrigin(req))
);

app.get('/api/auth/logout', (req, res) => {
  const origin = resolveClientOrigin(req);
  req.logout(() => res.redirect(origin));
});

// ── Email + Password Auth ────────────────────────────────────────────────────

// ── Email helpers ─────────────────────────────────────────────────────────────
function createMailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = parseInt(SMTP_PORT || '587', 10);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendAuthEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = createMailTransporter();
  if (!transporter) {
    console.log('[EMAIL] SMTP no configurado — email no enviado a:', to);
    return;
  }
  await transporter.sendMail({ from: `"FilamentOS" <${process.env.SMTP_USER}>`, to, subject, html });
}

function emailVerifyHtml(name: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:16px">
    <h2 style="color:#8b5cf6;margin-top:0">¡Bienvenido a FilamentOS, ${name}!</h2>
    <p style="color:#444;font-size:15px">Haz clic en el botón para verificar tu cuenta y empezar a usar FilamentOS.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${link}" style="background:#8b5cf6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:16px;display:inline-block">
        Verificar mi cuenta
      </a>
    </div>
    <p style="color:#999;font-size:12px">Si no creaste esta cuenta, ignora este correo. El enlace caduca en 24 horas.</p>
  </div>`;
}

function emailResetHtml(link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:16px">
    <h2 style="color:#8b5cf6;margin-top:0">Restablecer contraseña</h2>
    <p style="color:#444;font-size:15px">Recibimos una solicitud para restablecer la contraseña de tu cuenta de FilamentOS.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${link}" style="background:#8b5cf6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:16px;display:inline-block">
        Restablecer contraseña
      </a>
    </div>
    <p style="color:#999;font-size:12px">Si no solicitaste esto, ignora este correo. El enlace caduca en 1 hora.</p>
  </div>`;
}

// POST /api/auth/register — crear cuenta con email y password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

    if (!email || !email.trim()) {
      res.status(400).json({ error: 'El email es obligatorio' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Ya existe una cuenta con este email' });
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(
      'INSERT INTO users (id, google_id, email, name, password_hash, email_verified) VALUES (?, NULL, ?, ?, ?, 0)'
    ).run(id, normalizedEmail, name.trim(), passwordHash);

    // Crear token de verificación (caduca en 24h)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    db.prepare(
      'INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), id, verifyToken, 'verify', Date.now() + 24 * 60 * 60 * 1000);

    // Enviar email de verificación (best-effort)
    const verifyLink = `${CLIENT_ORIGIN}/api/auth/verify-email?token=${verifyToken}`;
    try {
      await sendAuthEmail(normalizedEmail, 'Verifica tu cuenta en FilamentOS', emailVerifyHtml(name.trim(), verifyLink));
    } catch (mailErr) {
      console.error('[REGISTER] Error enviando email de verificación:', mailErr);
    }

    res.status(201).json({ pending: true, email: normalizedEmail });
  } catch (error) {
    console.error('[REGISTER]', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// POST /api/auth/login — iniciar sesión con email y password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      console.log('[LOGIN] Error: campos vacíos');
      res.status(400).json({ error: 'Email y contraseña son obligatorios' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as (DbUser & { password_hash: string | null }) | undefined;

    if (!user) {
      console.log('[LOGIN] Error: usuario no encontrado -', normalizedEmail);
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
      return;
    }

    if (!user.password_hash) {
      console.log('[LOGIN] Error: cuenta de Google -', normalizedEmail);
      res.status(401).json({ error: 'Esta cuenta usa Google. Inicia sesión con Google.' });
      return;
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      console.log('[LOGIN] Error: contraseña incorrecta -', normalizedEmail);
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({ error: 'Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.', email: normalizedEmail });
      return;
    }

    req.login(user, (err) => {
      if (err) {
        res.status(500).json({ error: 'Error al iniciar sesión' });
        return;
      }
      res.json({
        user: { id: user.id, email: user.email, name: user.name, photo: user.photo },
      });
    });
  } catch (error) {
    console.error('[LOGIN]', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ── Dev-only: login inmediato como usuario de seed ────────────────────────────
// Solo activo fuera de producción. Permite saltar Google OAuth en desarrollo local.
if (process.env.NODE_ENV !== 'production') {
  // Ping — el frontend lo usa para saber si el botón Dev Login debe mostrarse
  app.get('/api/dev/ping', (_req, res) => res.json({ dev: true }));

  app.post('/api/dev/login-seed', (req, res) => {
    const SEED_GOOGLE_ID = 'dev_seed_user_luprintech_001';
    const seedUser = db.prepare('SELECT * FROM users WHERE google_id = ?')
      .get(SEED_GOOGLE_ID) as DbUser | undefined;

    if (!seedUser) {
      res.status(404).json({
        error: 'Usuario de seed no encontrado. Ejecuta primero: cd backend && npm run seed',
      });
      return;
    }

    req.login(seedUser, (err) => {
      if (err) { res.status(500).json({ error: 'Error al iniciar sesión' }); return; }
      res.json({ success: true, user: { id: seedUser.id, name: seedUser.name, email: seedUser.email } });
    });
  });
}

app.get('/api/auth/user', (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.json({ user: null });
      return;
    }
    const user = req.user as DbUser;
    const authMethod = user.google_id ? 'google' : 'email';
    res.json({ user: { ...user, password_hash: undefined, authMethod } });
  } catch (error) {
    console.error('[Auth] /api/auth/user error:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// POST /api/auth/guest/start - Iniciar sesión como invitado
app.post('/api/auth/guest/start', (req, res) => {
  const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
  
  res.json({
    guest: {
      id: guestId,
      expiresAt,
    },
  });
});

// POST /api/auth/guest/logout - Cerrar sesión de invitado
app.post('/api/auth/guest/logout', (_req, res) => {
  res.json({ success: true });
});

// ── Middleware guard ──────────────────────────────────────────────────────────
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  next();
}

// ── Perfil de usuario ─────────────────────────────────────────────────────────

/** GET /api/user/me — datos del perfil del usuario */
app.get('/api/user/me', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  // deserializeUser no incluye password_hash, consultamos la BD
  const freshUser = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as { password_hash: string | null } | undefined;
  const hasPassword = !!(freshUser?.password_hash);
  const isGoogleAccount = !!user.google_id;

  // Estadísticas rápidas
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tracker_projects WHERE user_id=?) AS projects,
      (SELECT COUNT(*) FROM tracker_pieces   WHERE user_id=?) AS pieces,
      (SELECT COUNT(*) FROM filament_inventory WHERE user_id=? AND status='active') AS spools
  `).get(user.id, user.id, user.id) as { projects: number; pieces: number; spools: number };

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    photo: user.photo,
    hasPassword,
    isGoogleAccount,
    stats,
  });
});

/** PUT /api/user/name — cambiar nombre visible */
app.put('/api/user/name', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) { res.status(400).json({ error: 'El nombre no puede estar vacío.' }); return; }
  db.prepare(`UPDATE users SET name=? WHERE id=?`).run(name.trim(), user.id);
  res.json({ success: true, name: name.trim() });
});

/** PUT /api/user/password — cambiar contraseña (solo cuentas locales) */
app.put('/api/user/password', requireAuth, (req, res) => {
  const user = req.user as DbUser & { password_hash: string | null };
  if (!user.password_hash) { res.status(400).json({ error: 'Esta cuenta usa inicio de sesión con Google.' }); return; }
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Faltan campos.' }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' }); return; }
  const fresh = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as { password_hash: string } | undefined;
  if (!fresh || !bcrypt.compareSync(currentPassword, fresh.password_hash)) {
    res.status(400).json({ error: 'La contraseña actual no es correcta.' }); return;
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(newHash, user.id);
  res.json({ success: true });
});

/** DELETE /api/user — eliminar cuenta y todos los datos */
app.delete('/api/user', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { confirmation } = req.body as { confirmation?: string };
  if (confirmation !== 'ELIMINAR') { res.status(400).json({ error: 'Escribe ELIMINAR para confirmar.' }); return; }
  // Cascade elimina proyectos, piezas, inventario, etc. gracias a ON DELETE CASCADE
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  req.logout((err) => {
    if (err) { res.status(500).json({ error: 'Error cerrando sesión.' }); return; }
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
});

/** GET /api/user/preferences — obtener preferencias del usuario */
app.get('/api/user/preferences', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const prefs = db.prepare(`
    SELECT 
      pref_date_format as dateFormat,
      pref_length_unit as lengthUnit,
      pref_weight_unit as weightUnit
    FROM users WHERE id=?
  `).get(user.id) as {
    dateFormat: string;
    lengthUnit: string;
    weightUnit: string;
  } | undefined;

  if (!prefs) { res.status(404).json({ error: 'Usuario no encontrado.' }); return; }

  res.json({
    dateFormat: prefs.dateFormat,
    lengthUnit: prefs.lengthUnit,
    weightUnit: prefs.weightUnit,
  });
});

/** PUT /api/user/preferences — actualizar preferencias del usuario */
app.put('/api/user/preferences', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { dateFormat, lengthUnit, weightUnit } = req.body as {
    dateFormat?: string;
    lengthUnit?: string;
    weightUnit?: string;
  };

  // Validaciones básicas
  const validDateFormats = ['dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd'];
  const validLengthUnits = ['mm', 'cm', 'in'];
  const validWeightUnits = ['g', 'kg', 'oz', 'lb'];

  if (dateFormat && !validDateFormats.includes(dateFormat)) {
    res.status(400).json({ error: 'Formato de fecha inválido.' }); return;
  }
  if (lengthUnit && !validLengthUnits.includes(lengthUnit)) {
    res.status(400).json({ error: 'Unidad de longitud inválida.' }); return;
  }
  if (weightUnit && !validWeightUnits.includes(weightUnit)) {
    res.status(400).json({ error: 'Unidad de peso inválida.' }); return;
  }

  // Construir UPDATE dinámico solo con los campos enviados
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (dateFormat !== undefined) { updates.push('pref_date_format=?'); values.push(dateFormat); }
  if (lengthUnit !== undefined) { updates.push('pref_length_unit=?'); values.push(lengthUnit); }
  if (weightUnit !== undefined) { updates.push('pref_weight_unit=?'); values.push(weightUnit); }

  if (updates.length === 0) { res.status(400).json({ error: 'No hay preferencias para actualizar.' }); return; }

  values.push(user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id=?`).run(...values);

  res.json({ success: true });
});

/** POST /api/user/photo — subir foto de perfil */
app.post('/api/user/photo', requireAuth, uploadProfilePhoto.single('photo'), (req, res) => {
  const user = req.user as DbUser;
  
  if (!req.file) {
    res.status(400).json({ error: 'No se envió ninguna imagen.' });
    return;
  }

  // Eliminar foto anterior si existe y no es de Google
  const currentUser = db.prepare('SELECT photo, google_id FROM users WHERE id=?').get(user.id) as { photo: string | null; google_id: string | null } | undefined;
  if (currentUser?.photo && !currentUser.google_id) {
    const oldPhotoPath = path.resolve(__dirname, '..', currentUser.photo);
    if (fs.existsSync(oldPhotoPath)) {
      try {
        fs.unlinkSync(oldPhotoPath);
      } catch {
        // Ignorar errores al eliminar foto anterior
      }
    }
  }

  // Guardar ruta relativa de la nueva foto
  const photoPath = `/uploads/profile-photos/${req.file.filename}`;
  db.prepare('UPDATE users SET photo=? WHERE id=?').run(photoPath, user.id);

  res.json({ success: true, photo: photoPath });
});

// ── Proyectos ─────────────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare(
      'SELECT id, data, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(user.id) as { id: string; data: string; created_at: string }[];

  const projects = rows.map((row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    createdAt: row.created_at,
  }));

  res.json(projects);
});

app.post('/api/projects', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const data = req.body;
  const id = crypto.randomUUID();

  // calculator-stats: extract computed cost fields from request body
  const { printedAt = null, totalCost = 0, totalGrams = 0, totalSecs = 0, status = 'delivered' } = req.body as {
    printedAt?: string | null;
    totalCost?: number;
    totalGrams?: number;
    totalSecs?: number;
    status?: string;
  };

  // spoolDeductions: Array<{ spoolId: string; grams: number }>
  const deductions: Array<{ spoolId: string; grams: number }> = Array.isArray(data.spoolDeductions) ? data.spoolDeductions : [];
  const warnings: string[] = [];

  // Validate deductions before inserting
  for (const d of deductions) {
    if (!d.spoolId || typeof d.grams !== 'number' || d.grams <= 0) continue;
    const spool = db.prepare('SELECT id, remaining_g, brand, color FROM filament_inventory WHERE id = ? AND user_id = ?')
      .get(d.spoolId, user.id) as { id: string; remaining_g: number; brand: string; color: string } | undefined;
    if (!spool) continue;
    if (d.grams > spool.remaining_g) {
      warnings.push(`La bobina "${spool.brand} ${spool.color}" tiene ${spool.remaining_g.toFixed(1)} g restantes pero se intenta descontar ${d.grams.toFixed(1)} g.`);
    }
  }

  const saveProject = db.transaction(() => {
    db.prepare(
      'INSERT INTO projects (id, user_id, job_name, data, printed_at, total_cost, total_grams, total_secs, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      user.id,
      data.jobName || 'Sin nombre',
      JSON.stringify(data),
      printedAt || null,
      parseFloat(String(totalCost)) || 0,
      parseFloat(String(totalGrams)) || 0,
      parseInt(String(totalSecs), 10) || 0,
      status || 'delivered',
    );

    for (const d of deductions) {
      if (!d.spoolId || typeof d.grams !== 'number' || d.grams <= 0) continue;
      const spool = db.prepare('SELECT id, remaining_g FROM filament_inventory WHERE id = ? AND user_id = ?')
        .get(d.spoolId, user.id) as { id: string; remaining_g: number } | undefined;
      if (!spool) continue;

      const newRemaining = Math.max(0, spool.remaining_g - d.grams);
      db.prepare('UPDATE filament_inventory SET remaining_g = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(newRemaining, d.spoolId);

      db.prepare('INSERT INTO consumos (bobina_id, proyecto_id, gramos) VALUES (?, ?, ?)')
        .run(d.spoolId, id, d.grams);
    }
  });

  saveProject();

  res.json({ id, warnings: warnings.length > 0 ? warnings : undefined });
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const data = req.body;

  // calculator-stats: also update the new columns on edit
  const { printedAt = null, totalCost = 0, totalGrams = 0, totalSecs = 0, status = 'delivered' } = req.body as {
    printedAt?: string | null;
    totalCost?: number;
    totalGrams?: number;
    totalSecs?: number;
    status?: string;
  };

  const result = db.prepare(
    'UPDATE projects SET job_name = ?, data = ?, printed_at = ?, total_cost = ?, total_grams = ?, total_secs = ?, status = ? WHERE id = ? AND user_id = ?'
  ).run(
    data.jobName || 'Sin nombre',
    JSON.stringify(data),
    printedAt || null,
    parseFloat(String(totalCost)) || 0,
    parseFloat(String(totalGrams)) || 0,
    parseInt(String(totalSecs), 10) || 0,
    status || 'delivered',
    req.params.id,
    user.id,
  );

  if (result.changes === 0) {
    res.status(404).json({ error: 'Proyecto no encontrado o sin permiso' });
    return;
  }
  res.json({ id: req.params.id });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const result = db
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, user.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Proyecto no encontrado o sin permiso' });
    return;
  }
  res.json({ success: true });
});

// ── Tracker: proyectos ────────────────────────────────────────────────────────

app.get('/api/tracker/projects', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare(`
      SELECT
        tp.*,
        COUNT(tpi.id) AS total_pieces,
        COALESCE(SUM(tpi.total_secs), 0) AS total_secs,
        COALESCE(SUM(tpi.total_grams), 0) AS total_grams,
        COALESCE(SUM(tpi.total_cost), 0) AS total_cost
      FROM tracker_projects tp
      LEFT JOIN tracker_pieces tpi ON tpi.project_id = tp.id AND tpi.user_id = tp.user_id
      WHERE tp.user_id = ?
      GROUP BY tp.id
      ORDER BY tp.created_at ASC
    `)
    .all(user.id) as {
      id: string; title: string; description: string; cover_image: string | null; goal: number;
      price_per_kg: number; currency: string; created_at: string; updated_at: string;
      total_pieces: number; total_secs: number; total_grams: number; total_cost: number;
    }[];
  res.json(rows.map((r) => ({
    id: r.id, title: r.title, description: r.description, coverImage: r.cover_image,
    goal: r.goal, pricePerKg: r.price_per_kg, currency: r.currency,
    totalPieces: r.total_pieces,
    totalSecs: r.total_secs,
    totalGrams: r.total_grams,
    totalCost: r.total_cost,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })));
});

app.post('/api/tracker/projects', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { title, description = '', coverImage = null, goal = 30, pricePerKg = 0, currency = 'EUR' } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'El título es obligatorio.' }); return; }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO tracker_projects (id, user_id, title, description, cover_image, goal, price_per_kg, currency, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(id, user.id, title.trim(), description.trim(), coverImage, goal, pricePerKg, currency, now, now);
  res.json({ id });
});

app.put('/api/tracker/projects/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { title, description = '', coverImage = null, goal = 30, pricePerKg = 0, currency = 'EUR' } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'El título es obligatorio.' }); return; }
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE tracker_projects SET title=?, description=?, cover_image=?, goal=?, price_per_kg=?, currency=?, updated_at=? WHERE id=? AND user_id=?'
  ).run(title.trim(), description.trim(), coverImage, goal, pricePerKg, currency, now, req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Proyecto no encontrado.' }); return; }
  // Recalculate piece costs for this project
  const pieces = db
    .prepare('SELECT id, total_grams FROM tracker_pieces WHERE project_id = ? AND user_id = ?')
    .all(req.params.id, user.id) as { id: string; total_grams: number }[];
  const stmt = db.prepare('UPDATE tracker_pieces SET total_cost=? WHERE id=?');
  for (const p of pieces) stmt.run(parseFloat((p.total_grams * (pricePerKg / 1000)).toFixed(4)), p.id);
  res.json({ success: true });
});

app.delete('/api/tracker/projects/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const result = db
    .prepare('DELETE FROM tracker_projects WHERE id=? AND user_id=?')
    .run(req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Proyecto no encontrado.' }); return; }
  res.json({ success: true });
});

// ── Tracker: piezas ───────────────────────────────────────────────────────────

interface DbPieceFilament {
  id: string; piece_id: string; spool_id: string | null;
  color_hex: string; color_name: string; brand: string; material: string;
  grams: number; created_at: string;
}

interface DbPieceMaterial {
  id: string;
  piece_id: string;
  name: string;
  quantity: number;
  cost: number;
  created_at: string;
}

interface FilamentInput {
  spoolId?: string | null;
  colorHex: string; colorName: string; brand: string; material: string;
  grams: number;
  spoolPrice?: number;
}

interface MaterialInput {
  name: string;
  quantity: number;
  cost: number;
}

app.get('/api/tracker/projects/:projectId/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const projectRow = db
    .prepare('SELECT price_per_kg FROM tracker_projects WHERE id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { price_per_kg: number } | undefined;
  const fallbackPricePerKg = projectRow?.price_per_kg ?? 0;

  const rows = db
    .prepare('SELECT * FROM tracker_pieces WHERE project_id=? AND user_id=? ORDER BY order_index ASC, created_at ASC')
    .all(req.params.projectId, user.id) as {
      id: string; project_id: string; order_index: number; label: string; name: string;
      time_text: string; gram_text: string; total_secs: number;
      total_grams: number; total_cost: number; time_lines: number;
      gram_lines: number; image_url: string | null; notes: string; status: string; printed_at: string | null; incident: string; spool_id: string | null; created_at: string; plate_count: number; file_link: string | null; is_disabled: number;
    }[];

  const pieces = rows.map((r) => ({
    id: r.id, projectId: r.project_id, orderIndex: r.order_index, label: r.label, name: r.name,
    timeText: r.time_text, gramText: r.gram_text,
    totalSecs: r.total_secs,
    totalGrams: r.total_grams,
    totalCost: r.total_cost > 0
      ? r.total_cost
      : r.total_grams > 0 && fallbackPricePerKg > 0
        ? parseFloat(((r.total_grams * fallbackPricePerKg) / 1000).toFixed(4))
        : r.total_cost,
    timeLines: r.time_lines, gramLines: r.gram_lines,
    imageUrl: r.image_url ?? null,
    notes: r.notes,
    status: r.status,
    printedAt: r.printed_at ?? null,
    incident: r.incident,
    spoolId: r.spool_id ?? null,
    plateCount: r.plate_count ?? 1,
    fileLink: r.file_link ?? null,
    disabled: r.is_disabled === 1,
    filaments: [] as { id: string; pieceId: string; spoolId: string | null; colorHex: string; colorName: string; brand: string; material: string; grams: number }[],
    materials: [] as { id: string; pieceId: string; name: string; quantity: number; cost: number }[],
  }));

  if (pieces.length > 0) {
    const ids = pieces.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const filamentRows = db
      .prepare(`SELECT * FROM tracker_piece_filaments WHERE piece_id IN (${placeholders}) ORDER BY created_at ASC`)
      .all(...ids) as DbPieceFilament[];

    const byPiece = new Map<string, typeof pieces[0]['filaments']>();
    filamentRows.forEach((f) => {
      if (!byPiece.has(f.piece_id)) byPiece.set(f.piece_id, []);
      byPiece.get(f.piece_id)!.push({
        id: f.id, pieceId: f.piece_id, spoolId: f.spool_id ?? null,
        colorHex: f.color_hex, colorName: f.color_name,
        brand: f.brand, material: f.material, grams: f.grams,
      });
    });
    pieces.forEach((p) => { p.filaments = byPiece.get(p.id) ?? []; });

    const materialRows = db
      .prepare(`SELECT * FROM tracker_piece_materials WHERE piece_id IN (${placeholders}) ORDER BY created_at ASC`)
      .all(...ids) as DbPieceMaterial[];

    const materialsByPiece = new Map<string, typeof pieces[0]['materials']>();
    materialRows.forEach((m) => {
      if (!materialsByPiece.has(m.piece_id)) materialsByPiece.set(m.piece_id, []);
      materialsByPiece.get(m.piece_id)!.push({
        id: m.id,
        pieceId: m.piece_id,
        name: m.name,
        quantity: m.quantity,
        cost: m.cost,
      });
    });
    pieces.forEach((p) => { p.materials = materialsByPiece.get(p.id) ?? []; });
  }

  res.json(pieces);
});

app.post('/api/tracker/projects/:projectId/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const project = db
    .prepare('SELECT price_per_kg FROM tracker_projects WHERE id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { price_per_kg: number } | undefined;
  if (!project) { res.status(404).json({ error: 'Proyecto no encontrado.' }); return; }

  const nextOrder = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM tracker_pieces WHERE project_id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { next_order: number };

  const { label, name, timeText = '', gramText = '', totalSecs = 0, timeLines = 0, gramLines = 0, imageUrl = null, notes = '', status = 'printed', printedAt = null, incident = '', plateCount = 1, fileLink = null } = req.body;
  const rawFilaments: FilamentInput[] = Array.isArray(req.body.filaments) ? req.body.filaments : [];
  const rawMaterials: MaterialInput[] = Array.isArray(req.body.materials) ? req.body.materials : [];
  const legacyTotalGrams = parseFloat(req.body.totalGrams) || 0;
  const legacySpoolId: string | null = req.body.spoolId ?? null;

  // Validate plateCount ≥ 1
  const parsedPlateCount = parseInt(String(plateCount), 10);
  if (isNaN(parsedPlateCount) || parsedPlateCount < 1) {
    res.status(400).json({ error: 'plate_count debe ser al menos 1' });
    return;
  }

  // Validate fileLink (must be valid URL or null/empty)
  let validatedFileLink: string | null = null;
  if (fileLink && String(fileLink).trim() !== '') {
    const urlStr = String(fileLink).trim();
    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        res.status(400).json({ error: 'file_link debe usar http o https' });
        return;
      }
      validatedFileLink = urlStr;
    } catch {
      res.status(400).json({ error: 'file_link debe ser una URL válida' });
      return;
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let totalGrams = 0;
  let totalCost = 0;
  let spoolRemainingG: number | undefined;
  const materialCost = rawMaterials.reduce((sum, item) => sum + (parseFloat(String(item.cost)) || 0), 0);

  if (rawFilaments.length > 0) {
    // ── Multi-filament mode ────────────────────────────────────────────────────
    totalGrams = rawFilaments.reduce((s, f) => s + (parseFloat(String(f.grams)) || 0), 0);

    try {
      const txn = db.transaction(() => {
        let cost = 0;

        // Insert piece first (cost = 0, updated at end)
        db.prepare(
          'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id, notes, status, printed_at, incident, plate_count, file_link) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText,
          gramText || String(totalGrams), totalSecs, totalGrams, 0, timeLines, gramLines, imageUrl, null, String(notes), String(status), printedAt || null, String(incident), parsedPlateCount, validatedFileLink);

        const insertF = db.prepare(
          'INSERT INTO tracker_piece_filaments (id, piece_id, spool_id, color_hex, color_name, brand, material, grams, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        );
        const insertM = db.prepare(
          'INSERT INTO tracker_piece_materials (id, piece_id, name, quantity, cost, created_at) VALUES (?,?,?,?,?,?)'
        );

        for (const f of rawFilaments) {
          const fg = parseFloat(String(f.grams)) || 0;
          if (f.spoolId) {
            const spool = db.prepare(
              "SELECT remaining_g, price, total_grams FROM filament_inventory WHERE id=? AND user_id=? AND status='active'"
            ).get(f.spoolId, user.id) as { remaining_g: number; price: number; total_grams: number } | undefined;

            if (spool) {
              const overridePrice = f.spoolPrice != null ? parseFloat(String(f.spoolPrice)) : NaN;
              const pricePerGram = !isNaN(overridePrice) && overridePrice > 0
                ? overridePrice / 1000
                : spool.total_grams > 0 ? spool.price / spool.total_grams : project.price_per_kg / 1000;
              cost += fg * pricePerGram;
              db.prepare(
                `UPDATE filament_inventory
                 SET remaining_g = MAX(0, remaining_g - ?),
                     status = CASE WHEN MAX(0, remaining_g - ?) <= 0 THEN 'finished' ELSE status END,
                     updated_at = ?
                 WHERE id = ? AND user_id = ?`
              ).run(fg, fg, now, f.spoolId, user.id);
              const upd = db.prepare('SELECT remaining_g FROM filament_inventory WHERE id=?').get(f.spoolId) as { remaining_g: number } | undefined;
              if (upd) spoolRemainingG = upd.remaining_g;
            } else {
              const manualSpoolPrice = parseFloat(String(f.spoolPrice)) || 20;
              cost += fg * (manualSpoolPrice / 1000);
            }
          } else {
            const manualSpoolPrice = parseFloat(String(f.spoolPrice)) || 20;
            cost += fg * (manualSpoolPrice / 1000);
          }
          insertF.run(crypto.randomUUID(), id, f.spoolId ?? null, f.colorHex || '#888888', f.colorName || '', f.brand || '', f.material || '', fg, now);
        }

        for (const item of rawMaterials) {
          const materialName = String(item.name ?? '').trim();
          if (!materialName) continue;
          insertM.run(
            crypto.randomUUID(),
            id,
            materialName,
            parseFloat(String(item.quantity)) || 0,
            parseFloat(String(item.cost)) || 0,
            now,
          );
        }

        totalCost = parseFloat((cost + materialCost).toFixed(4));
        db.prepare('UPDATE tracker_pieces SET total_cost=? WHERE id=?').run(totalCost, id);
        return totalCost;
      });

      totalCost = txn() as number;
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Transaction failed' });
      return;
    }
  } else {
    // ── Legacy single-spool mode (backward compat) ────────────────────────────
    totalGrams = legacyTotalGrams;
    totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000) + materialCost).toFixed(4));

    if (legacySpoolId) {
      try {
        const txn = db.transaction(() => {
          db.prepare(
            'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id, notes, status, printed_at, incident, plate_count, file_link) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, legacySpoolId, String(notes), String(status), printedAt || null, String(incident), parsedPlateCount, validatedFileLink);

          const insertM = db.prepare(
            'INSERT INTO tracker_piece_materials (id, piece_id, name, quantity, cost, created_at) VALUES (?,?,?,?,?,?)'
          );
          for (const item of rawMaterials) {
            const materialName = String(item.name ?? '').trim();
            if (!materialName) continue;
            insertM.run(crypto.randomUUID(), id, materialName, parseFloat(String(item.quantity)) || 0, parseFloat(String(item.cost)) || 0, now);
          }

          const dr = db.prepare(
            `UPDATE filament_inventory
             SET remaining_g = MAX(0, remaining_g - ?),
                 status = CASE WHEN MAX(0, remaining_g - ?) = 0 THEN 'finished' ELSE status END,
                 updated_at = ?
             WHERE id = ? AND user_id = ? AND status = 'active'`
          ).run(totalGrams, totalGrams, now, legacySpoolId, user.id);
          if (dr.changes === 0) throw new Error('Spool not found or already finished');

          const upd = db.prepare('SELECT remaining_g FROM filament_inventory WHERE id=?').get(legacySpoolId) as { remaining_g: number };
          return upd.remaining_g;
        });
        spoolRemainingG = txn() as number;
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Transaction failed' });
        return;
      }
    } else {
      db.prepare(
        'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id, notes, status, printed_at, incident, plate_count, file_link) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, null, String(notes), String(status), printedAt || null, String(incident), parsedPlateCount, validatedFileLink);

      const insertM = db.prepare(
        'INSERT INTO tracker_piece_materials (id, piece_id, name, quantity, cost, created_at) VALUES (?,?,?,?,?,?)'
      );
      for (const item of rawMaterials) {
        const materialName = String(item.name ?? '').trim();
        if (!materialName) continue;
        insertM.run(crypto.randomUUID(), id, materialName, parseFloat(String(item.quantity)) || 0, parseFloat(String(item.cost)) || 0, now);
      }
    }
  }

  res.json({ id, totalCost, ...(spoolRemainingG !== undefined ? { spoolRemainingG } : {}) });
});

app.post('/api/tracker/projects/:projectId/pieces/reorder', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds es obligatorio.' });
    return;
  }

  const updateStmt = db.prepare('UPDATE tracker_pieces SET order_index=? WHERE id=? AND project_id=? AND user_id=?');
  const transaction = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => {
      updateStmt.run(index, id, req.params.projectId, user.id);
    });
  });

  transaction(orderedIds);
  res.json({ success: true });
});

app.put('/api/tracker/projects/:projectId/pieces/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const project = db
    .prepare('SELECT price_per_kg FROM tracker_projects WHERE id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { price_per_kg: number } | undefined;
  if (!project) { res.status(404).json({ error: 'Proyecto no encontrado.' }); return; }

  const { label, name, timeText = '', gramText = '', totalSecs = 0, timeLines = 0, gramLines = 0, imageUrl = null, notes = '', status = 'printed', printedAt = null, incident = '', plateCount = 1, fileLink = null } = req.body;
  const rawFilaments: FilamentInput[] = Array.isArray(req.body.filaments) ? req.body.filaments : [];
  const rawMaterials: MaterialInput[] = Array.isArray(req.body.materials) ? req.body.materials : [];
  const legacyTotalGrams = parseFloat(req.body.totalGrams) || 0;

  // Validate plateCount ≥ 1
  const parsedPlateCountPut = parseInt(String(plateCount), 10);
  if (isNaN(parsedPlateCountPut) || parsedPlateCountPut < 1) {
    res.status(400).json({ error: 'plate_count debe ser al menos 1' });
    return;
  }

  // Validate fileLink (must be valid URL or null/empty)
  let validatedFileLinkPut: string | null = null;
  if (fileLink && String(fileLink).trim() !== '') {
    const urlStr = String(fileLink).trim();
    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        res.status(400).json({ error: 'file_link debe usar http o https' });
        return;
      }
      validatedFileLinkPut = urlStr;
    } catch {
      res.status(400).json({ error: 'file_link debe ser una URL válida' });
      return;
    }
  }
  const now = new Date().toISOString();
  let totalGrams = 0;
  let totalCost = 0;
  const materialCost = rawMaterials.reduce((sum, item) => sum + (parseFloat(String(item.cost)) || 0), 0);

  if (rawFilaments.length > 0) {
    totalGrams = rawFilaments.reduce((s, f) => s + (parseFloat(String(f.grams)) || 0), 0);

    // Compute cost (no deduction on edit — only on create)
    let cost = 0;
    for (const f of rawFilaments) {
      const fg = parseFloat(String(f.grams)) || 0;
      if (f.spoolId) {
        const spool = db.prepare('SELECT price, total_grams FROM filament_inventory WHERE id=?')
          .get(f.spoolId) as { price: number; total_grams: number } | undefined;
        const overridePricePut = f.spoolPrice != null ? parseFloat(String(f.spoolPrice)) : NaN;
        cost += !isNaN(overridePricePut) && overridePricePut > 0
          ? fg * (overridePricePut / 1000)
          : spool && spool.total_grams > 0
            ? fg * (spool.price / spool.total_grams)
            : fg * (20 / 1000);
      } else {
        cost += fg * ((parseFloat(String(f.spoolPrice)) || 20) / 1000);
      }
    }
    totalCost = parseFloat((cost + materialCost).toFixed(4));

    try {
      db.transaction(() => {
        const r = db.prepare(
          'UPDATE tracker_pieces SET label=?, name=?, time_text=?, gram_text=?, total_secs=?, total_grams=?, total_cost=?, time_lines=?, gram_lines=?, image_url=?, spool_id=?, notes=?, status=?, printed_at=?, incident=?, plate_count=?, file_link=? WHERE id=? AND user_id=?'
        ).run(label, name, timeText, gramText || String(totalGrams), totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, null, String(notes), String(status), printedAt || null, String(incident), parsedPlateCountPut, validatedFileLinkPut, req.params.id, user.id);
        if (r.changes === 0) throw new Error('PIECE_NOT_FOUND');

        db.prepare('DELETE FROM tracker_piece_filaments WHERE piece_id=?').run(req.params.id);
        db.prepare('DELETE FROM tracker_piece_materials WHERE piece_id=?').run(req.params.id);

        const insertF = db.prepare(
          'INSERT INTO tracker_piece_filaments (id, piece_id, spool_id, color_hex, color_name, brand, material, grams, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        );
        const insertM = db.prepare(
          'INSERT INTO tracker_piece_materials (id, piece_id, name, quantity, cost, created_at) VALUES (?,?,?,?,?,?)'
        );
        for (const f of rawFilaments) {
          insertF.run(crypto.randomUUID(), req.params.id, f.spoolId ?? null, f.colorHex || '#888888', f.colorName || '', f.brand || '', f.material || '', parseFloat(String(f.grams)) || 0, now);
        }
        for (const item of rawMaterials) {
          const materialName = String(item.name ?? '').trim();
          if (!materialName) continue;
          insertM.run(crypto.randomUUID(), req.params.id, materialName, parseFloat(String(item.quantity)) || 0, parseFloat(String(item.cost)) || 0, now);
        }
      })();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      res.status(msg === 'PIECE_NOT_FOUND' ? 404 : 400).json({ error: msg === 'PIECE_NOT_FOUND' ? 'Pieza no encontrada.' : msg });
      return;
    }
  } else {
    // Legacy mode
    totalGrams = legacyTotalGrams;
    const spoolId = req.body.spoolId;
    totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000) + materialCost).toFixed(4));
    const result = db.prepare(
      'UPDATE tracker_pieces SET label=?, name=?, time_text=?, gram_text=?, total_secs=?, total_grams=?, total_cost=?, time_lines=?, gram_lines=?, image_url=?, spool_id=?, notes=?, status=?, printed_at=?, incident=?, plate_count=?, file_link=? WHERE id=? AND user_id=?'
    ).run(label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, spoolId ?? null, String(notes), String(status), printedAt || null, String(incident), parsedPlateCountPut, validatedFileLinkPut, req.params.id, user.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Pieza no encontrada.' }); return; }

    db.prepare('DELETE FROM tracker_piece_materials WHERE piece_id=?').run(req.params.id);
    const insertM = db.prepare(
      'INSERT INTO tracker_piece_materials (id, piece_id, name, quantity, cost, created_at) VALUES (?,?,?,?,?,?)'
    );
    for (const item of rawMaterials) {
      const materialName = String(item.name ?? '').trim();
      if (!materialName) continue;
      insertM.run(crypto.randomUUID(), req.params.id, materialName, parseFloat(String(item.quantity)) || 0, parseFloat(String(item.cost)) || 0, now);
    }
  }

  res.json({ success: true, totalCost });
});

app.delete('/api/tracker/projects/:projectId/pieces/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const result = db
    .prepare('DELETE FROM tracker_pieces WHERE id=? AND user_id=?')
    .run(req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Pieza no encontrada.' }); return; }
  res.json({ success: true });
});

// ── Toggle disabled state ──────────────────────────────────────────────────────
app.patch('/api/tracker/projects/:projectId/pieces/:id/disabled', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { disabled } = req.body as { disabled: boolean };
  const result = db
    .prepare(`UPDATE tracker_pieces SET is_disabled=? WHERE id=? AND project_id=? AND user_id=?`)
    .run(disabled ? 1 : 0, req.params.id, req.params.projectId, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Pieza no encontrada.' }); return; }
  res.json({ success: true, disabled });
});

// ── Inventory: filament spools ────────────────────────────────────────────────

interface DbSpool {
  id: string;
  user_id: string;
  brand: string;
  material: string;
  color: string;
  color_hex: string;
  total_grams: number;
  remaining_g: number;
  price: number;
  notes: string;
  shop_url: string | null;
  inventory_source: string;
  linked_at: string | null;
  last_synced_at: string | null;
  catalog_filament_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface InventorySpoolResponse {
  id: string;
  brand: string;
  material: string;
  color: string;
  colorHex: string;
  totalGrams: number;
  remainingG: number;
  price: number;
  notes: string;
  shopUrl: string | null;
  inventorySource: 'local' | 'catalog_import' | 'catalog_link';
  linkedAt: string | null;
  lastSyncedAt: string | null;
  catalogFilamentId: string | null;
  status: 'active' | 'finished';
  createdAt: string;
  updatedAt: string;
}

interface FilamentCatalogRow {
  id: string;
  source: string;
  external_id: string;
  slug: string;
  brand: string;
  material: string;
  color: string;
  color_hex: string | null;
  finish: string | null;
  image_url: string | null;
  custom_image: string | null;
  purchase_url: string | null;
  attribution: string;
  metadata_json: string;
  last_seen_at: string;
  last_synced_at: string;
}

function mapSpool(r: DbSpool) {
  return {
    id: r.id,
    brand: r.brand,
    material: r.material,
    color: r.color,
    colorHex: r.color_hex,
    totalGrams: r.total_grams,
    remainingG: r.remaining_g,
    price: r.price,
    notes: r.notes,
    shopUrl: r.shop_url ?? null,
    inventorySource: (r.inventory_source || 'local') as 'local' | 'catalog_import' | 'catalog_link',
    linkedAt: r.linked_at ?? null,
    lastSyncedAt: r.last_synced_at ?? null,
    catalogFilamentId: r.catalog_filament_id ?? null,
    status: r.status as 'active' | 'finished',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } satisfies InventorySpoolResponse;
}

function mapCatalogItem(row: FilamentCatalogRow) {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    slug: row.slug,
    brand: row.brand,
    material: row.material,
    color: row.color,
    colorHex: row.color_hex,
    finish: row.finish,
    imageUrl: row.image_url,
    customImage: row.custom_image,
    purchaseUrl: row.purchase_url,
    attribution: row.attribution,
    metadata: JSON.parse(row.metadata_json || '{}'),
    lastSeenAt: row.last_seen_at,
    lastSyncedAt: row.last_synced_at,
  };
}

async function syncFilamentCatalogFromFilamentColors() {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG || !FEATURE_FILAMENTCOLORS_SYNC) {
    throw new Error('Filament catalog sync is disabled');
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO filament_catalog_sync_state (provider, last_checked_at)
     VALUES ('filamentcolors', ?)
     ON CONFLICT(provider) DO UPDATE SET last_checked_at = excluded.last_checked_at`
  ).run(now);

  const versionInfo = await fetchFilamentColorsVersionInfo();

  const insert = db.prepare(
    `INSERT INTO filament_catalog
      (id, source, external_id, slug, brand, material, color, color_hex, finish, image_url, purchase_url, metadata_json, last_seen_at, last_synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug,
       brand = excluded.brand,
       material = excluded.material,
       color = excluded.color,
       color_hex = excluded.color_hex,
       finish = excluded.finish,
       image_url = excluded.image_url,
       purchase_url = excluded.purchase_url,
       metadata_json = excluded.metadata_json,
       last_seen_at = excluded.last_seen_at,
       last_synced_at = excluded.last_synced_at,
       updated_at = excluded.updated_at`
  );

  let totalImported = 0;
  let currentPage = 1;
  let expectedTotal = 0;

  // Iterar todas las páginas hasta alcanzar el total reportado por la API
  while (true) {
    const pageData = await fetchFilamentColorsSwatchesPage(currentPage, 100);
    
    // En la primera página, capturar el total esperado
    if (currentPage === 1) {
      expectedTotal = pageData.count;
      console.log(`[FilamentCatalog] Total esperado según API: ${expectedTotal}`);
    }

    const records = pageData.results.map(mapFilamentColorsSwatchToCatalogRecord);

    // Si no hay resultados, terminar
    if (records.length === 0) {
      break;
    }

    for (const record of records) {
      insert.run(
        record.id,
        record.source,
        record.externalId,
        record.slug,
        record.brand,
        record.material,
        record.color,
        record.colorHex,
        record.finish,
        record.imageUrl,
        record.purchaseUrl,
        record.metadataJson,
        now,
        now,
        now
      );
    }

    totalImported += records.length;
    const progress = expectedTotal > 0 ? ((totalImported / expectedTotal) * 100).toFixed(1) : '?';
    console.log(`[FilamentCatalog] Synced page ${currentPage}: ${records.length} records (total: ${totalImported} / ${expectedTotal} = ${progress}%)`);

    // Terminar si ya importamos todo o si no hay más páginas
    if (totalImported >= expectedTotal || !pageData.next) {
      break;
    }

    currentPage++;
  }

  db.prepare(
    `INSERT INTO filament_catalog_sync_state (provider, db_version, db_last_modified, last_checked_at, last_success_at, last_error)
     VALUES ('filamentcolors', ?, ?, ?, ?, NULL)
     ON CONFLICT(provider) DO UPDATE SET
       db_version = excluded.db_version,
       db_last_modified = excluded.db_last_modified,
       last_checked_at = excluded.last_checked_at,
       last_success_at = excluded.last_success_at,
       last_error = NULL`
  ).run(versionInfo.dbVersion, versionInfo.dbLastModified, now, now);

  console.log(`[FilamentCatalog] Sync complete: ${totalImported} filaments imported`);
  return totalImported;
}

async function ensureInitialFilamentCatalogSeed() {
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM filament_catalog').get() as { c: number }).c;
  if (existingCount > 0 || !FEATURE_GLOBAL_FILAMENT_CATALOG || !FEATURE_FILAMENTCOLORS_SYNC) {
    return;
  }

  try {
    await syncFilamentCatalogFromFilamentColors();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Initial filament catalog seed failed';
    db.prepare(
      `INSERT INTO filament_catalog_sync_state (provider, last_error)
       VALUES ('filamentcolors', ?)
       ON CONFLICT(provider) DO UPDATE SET last_error = excluded.last_error`
    ).run(message);
  }
}

function assertPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function validateSpoolBody(body: Record<string, unknown>): string | null {
  const { brand, material, color, totalGrams, remainingG, price } = body as {
    brand?: unknown; material?: unknown; color?: unknown;
    totalGrams?: unknown; remainingG?: unknown; price?: unknown;
  };
  if (!brand || typeof brand !== 'string' || !brand.trim()) return 'brand is required';
  if (!material || typeof material !== 'string' || !material.trim()) return 'material is required';
  if (!color || typeof color !== 'string' || !color.trim()) return 'color is required';
  const tg = Number(totalGrams);
  const rg = Number(remainingG);
  const pr = Number(price);
  if (isNaN(tg) || tg < 0) return 'totalGrams must be >= 0';
  if (isNaN(rg) || rg < 0) return 'remainingG must be >= 0';
  if (rg > tg) return 'remainingG cannot exceed totalGrams';
  if (isNaN(pr) || pr < 0) return 'price must be >= 0';
  return null;
}

// Guarda marca y material como opciones custom del usuario (INSERT OR IGNORE evita duplicados)
function saveCustomSpoolOptions(userId: string, brand: string, material: string) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO user_custom_spool_options (user_id, type, value) VALUES (?, ?, ?)`
  );
  stmt.run(userId, 'brand', brand.trim());
  stmt.run(userId, 'material', material.trim());
}

// GET /api/inventory/spools — list user spools (active first)
app.get('/api/inventory/spools', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare(`SELECT * FROM filament_inventory WHERE user_id = ?
              ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC, created_at DESC`)
    .all(user.id) as DbSpool[];
  res.json(rows.map(mapSpool));
});

app.get('/api/filament-catalog', requireAuth, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const { brand, material, color, page = '1', limit = '50' } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(10000, Math.max(1, parseInt(limit || '50', 10)));
  const offset = (pageNum - 1) * limitNum;

  // Construir query con filtros opcionales
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (brand) {
    whereClauses.push('brand = ?');
    params.push(brand);
  }
  if (material) {
    whereClauses.push('material = ?');
    params.push(material);
  }
  if (color) {
    whereClauses.push('color LIKE ?');
    params.push(`%${color}%`);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Contar total con filtros
  const countQuery = `SELECT COUNT(*) as total FROM filament_catalog ${whereClause}`;
  const totalRow = db.prepare(countQuery).get(...params) as { total: number };
  const total = totalRow.total;

  // Obtener items paginados
  const query = `SELECT * FROM filament_catalog ${whereClause} ORDER BY brand ASC, material ASC, color ASC LIMIT ? OFFSET ?`;
  const rows = db.prepare(query).all(...params, limitNum, offset) as FilamentCatalogRow[];

  res.json({
    items: rows.map(mapCatalogItem),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
    attribution: 'Data from FilamentColors.xyz (CC BY 4.0)',
  });
});

app.get('/api/filament-catalog/metadata/filters', requireAuth, (_req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const brands = db.prepare('SELECT DISTINCT brand FROM filament_catalog ORDER BY brand ASC').all() as Array<{ brand: string }>;
  const materials = db.prepare('SELECT DISTINCT material FROM filament_catalog ORDER BY material ASC').all() as Array<{ material: string }>;

  res.json({
    brands: brands.map((row) => row.brand),
    materials: materials.map((row) => row.material),
  });
});

app.put('/api/filament-catalog/:id', requireAdmin, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const { id } = req.params;
  const { purchaseUrl, customImage } = req.body as { purchaseUrl?: string | null; customImage?: string | null };

  const existing = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(id) as FilamentCatalogRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Catalog filament not found' });
    return;
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (purchaseUrl !== undefined) {
    updates.push('purchase_url = ?');
    values.push(purchaseUrl || null);
  }
  if (customImage !== undefined) {
    updates.push('custom_image = ?');
    values.push(customImage || null);
  }
  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  if (updates.length > 1) { // más de solo updated_at
    db.prepare(`UPDATE filament_catalog SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(id) as FilamentCatalogRow;
  res.json(mapCatalogItem(updated));
});

app.get('/api/filament-catalog/:id', requireAuth, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const row = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(req.params.id) as FilamentCatalogRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Catalog filament not found.' });
    return;
  }

  res.json(mapCatalogItem(row));
});

app.post('/api/filament-catalog/bulk-import', requireAdmin, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const { filaments } = req.body as { filaments?: Array<{
    brand: string;
    material: string;
    color: string;
    colorHex?: string;
    finish?: string;
    purchaseUrl?: string;
    imageUrl?: string;
    metadata?: Record<string, unknown>;
  }> };

  if (!Array.isArray(filaments) || filaments.length === 0) {
    res.status(400).json({ error: 'filaments array is required and cannot be empty' });
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO filament_catalog
      (id, source, external_id, slug, brand, material, color, color_hex, finish, image_url, purchase_url, metadata_json, last_seen_at, last_synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       purchase_url = excluded.purchase_url,
       image_url = excluded.image_url,
       updated_at = excluded.updated_at`
  );

  let imported = 0;
  const transaction = db.transaction(() => {
    for (const fil of filaments) {
      if (!fil.brand || !fil.material || !fil.color) continue;

      const slug = `${fil.brand.toLowerCase()}-${fil.material.toLowerCase()}-${fil.color.toLowerCase()}`
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const id = `manual:${externalId}`;

      insert.run(
        id,
        'manual',
        externalId,
        slug,
        fil.brand.trim(),
        fil.material.trim(),
        fil.color.trim(),
        fil.colorHex?.trim() || '#cccccc',
        fil.finish?.trim() || null,
        fil.imageUrl?.trim() || null,
        fil.purchaseUrl?.trim() || null,
        JSON.stringify(fil.metadata || { manualEntry: true }),
        now,
        now,
        now
      );
      imported++;
    }
  });

  transaction();

  res.json({ success: true, imported });
});

app.post('/api/filament-catalog', requireAdmin, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const { brand, material, color, colorHex, finish, imageUrl, purchaseUrl } = req.body as {
    brand?: string;
    material?: string;
    color?: string;
    colorHex?: string;
    finish?: string | null;
    imageUrl?: string | null;
    purchaseUrl?: string | null;
  };

  if (!brand || !brand.trim()) {
    res.status(400).json({ error: 'brand is required' });
    return;
  }
  if (!material || !material.trim()) {
    res.status(400).json({ error: 'material is required' });
    return;
  }
  if (!color || !color.trim()) {
    res.status(400).json({ error: 'color is required' });
    return;
  }

  const now = new Date().toISOString();
  const slug = `${brand.toLowerCase()}-${material.toLowerCase()}-${color.toLowerCase()}`
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const id = `manual:${externalId}`;

  db.prepare(
    `INSERT INTO filament_catalog
      (id, source, external_id, slug, brand, material, color, color_hex, finish, image_url, purchase_url, metadata_json, last_seen_at, last_synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    'manual',
    externalId,
    slug,
    brand.trim(),
    material.trim(),
    color.trim(),
    colorHex?.trim() || '#cccccc',
    finish?.trim() || null,
    imageUrl?.trim() || null,
    purchaseUrl?.trim() || null,
    JSON.stringify({ manualEntry: true }),
    now,
    now,
    now
  );

  const created = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(id) as FilamentCatalogRow;
  res.status(201).json(mapCatalogItem(created));
});

app.delete('/api/filament-catalog/:id', requireAdmin, (req, res) => {
  if (!FEATURE_GLOBAL_FILAMENT_CATALOG) {
    res.status(404).json({ error: 'Feature disabled' });
    return;
  }

  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(id) as FilamentCatalogRow | undefined;
  
  if (!existing) {
    res.status(404).json({ error: 'Catalog filament not found' });
    return;
  }

  // Solo permitir eliminar filamentos añadidos manualmente
  if (!id.startsWith('manual:')) {
    res.status(400).json({ error: 'Solo se pueden eliminar filamentos añadidos manualmente' });
    return;
  }

  db.prepare('DELETE FROM filament_catalog WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/filament-catalog/sync', requireAdmin, async (_req, res) => {
  try {
    const imported = await syncFilamentCatalogFromFilamentColors();
    res.json({ success: true, imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    db.prepare(
      `INSERT INTO filament_catalog_sync_state (provider, last_error)
       VALUES ('filamentcolors', ?)
       ON CONFLICT(provider) DO UPDATE SET last_error = excluded.last_error`
    ).run(message);
    res.status(500).json({ error: message });
  }
});



// POST /api/inventory/spools — create spool
app.post('/api/inventory/spools', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const err = validateSpoolBody(req.body);
  if (err) { res.status(400).json({ error: err }); return; }

  const { brand, material, color, colorHex = '#cccccc', totalGrams, remainingG, price, notes = '', shopUrl = null } = req.body;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO filament_inventory
       (id, user_id, brand, material, color, color_hex, total_grams, remaining_g, price, notes, shop_url, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`
  ).run(id, user.id, brand.trim(), material.trim(), color.trim(), colorHex, Number(totalGrams), Number(remainingG), Number(price), notes, shopUrl || null, now, now);
  saveCustomSpoolOptions(user.id, brand, material);
  const spool = db.prepare('SELECT * FROM filament_inventory WHERE id=?').get(id) as DbSpool;
  res.json(mapSpool(spool));
});

app.post('/api/inventory/spools/import-from-catalog', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { catalogFilamentId, totalGrams, remainingG, price = 0, notes = '', shopUrl = null } = req.body as {
    catalogFilamentId?: string;
    totalGrams?: number;
    remainingG?: number;
    price?: number;
    notes?: string;
    shopUrl?: string | null;
  };

  if (!catalogFilamentId) {
    res.status(400).json({ error: 'catalogFilamentId is required' });
    return;
  }

  const catalogItem = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(catalogFilamentId) as FilamentCatalogRow | undefined;
  if (!catalogItem) {
    res.status(404).json({ error: 'Catalog filament not found.' });
    return;
  }

  const payload = {
    brand: catalogItem.brand,
    material: catalogItem.material,
    color: catalogItem.color,
    totalGrams,
    remainingG,
    price,
  } satisfies Record<string, unknown>;
  const err = validateSpoolBody(payload);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO filament_inventory
      (id, user_id, brand, material, color, color_hex, total_grams, remaining_g, price, notes, shop_url, inventory_source, linked_at, catalog_filament_id, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?)`
  ).run(
    id,
    user.id,
    catalogItem.brand,
    catalogItem.material,
    catalogItem.color,
    catalogItem.color_hex ?? '#cccccc',
    Number(totalGrams),
    Number(remainingG),
    Number(price),
    notes,
    shopUrl || catalogItem.purchase_url || null,
    'catalog_import',
    now,
    catalogItem.id,
    now,
    now
  );
  saveCustomSpoolOptions(user.id, catalogItem.brand, catalogItem.material);
  const spool = db.prepare('SELECT * FROM filament_inventory WHERE id=?').get(id) as DbSpool;
  res.json(mapSpool(spool));
});

app.post('/api/inventory/spools/:id/link-catalog', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { catalogFilamentId } = req.body as { catalogFilamentId?: string };
  if (!catalogFilamentId) {
    res.status(400).json({ error: 'catalogFilamentId is required' });
    return;
  }

  const spool = db.prepare('SELECT * FROM filament_inventory WHERE id=? AND user_id=?').get(req.params.id, user.id) as DbSpool | undefined;
  if (!spool) {
    res.status(404).json({ error: 'Spool not found.' });
    return;
  }

  const catalogItem = db.prepare('SELECT * FROM filament_catalog WHERE id = ?').get(catalogFilamentId) as FilamentCatalogRow | undefined;
  if (!catalogItem) {
    res.status(404).json({ error: 'Catalog filament not found.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE filament_inventory
     SET catalog_filament_id=?, inventory_source='catalog_link', linked_at=?, last_synced_at=?, updated_at=?
     WHERE id=? AND user_id=?`
  ).run(catalogItem.id, now, now, now, req.params.id, user.id);

  const updated = db.prepare('SELECT * FROM filament_inventory WHERE id=?').get(req.params.id) as DbSpool;
  res.json(mapSpool(updated));
});

// PUT /api/inventory/spools/:id — update spool
app.put('/api/inventory/spools/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const err = validateSpoolBody(req.body);
  if (err) { res.status(400).json({ error: err }); return; }

  const { brand, material, color, colorHex = '#cccccc', totalGrams, remainingG, price, notes = '', shopUrl = null } = req.body;
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE filament_inventory
     SET brand=?, material=?, color=?, color_hex=?, total_grams=?, remaining_g=?, price=?, notes=?, shop_url=?, updated_at=?
     WHERE id=? AND user_id=?`
  ).run(brand.trim(), material.trim(), color.trim(), colorHex, Number(totalGrams), Number(remainingG), Number(price), notes, shopUrl || null, now, req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Spool not found.' }); return; }
  saveCustomSpoolOptions(user.id, brand, material);
  const spool = db.prepare('SELECT * FROM filament_inventory WHERE id=?').get(req.params.id) as DbSpool;
  res.json(mapSpool(spool));
});



// DELETE /api/inventory/spools/:id — delete spool
app.delete('/api/inventory/spools/:id', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const result = db.prepare('DELETE FROM filament_inventory WHERE id=? AND user_id=?').run(req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Spool not found.' }); return; }
  res.json({ success: true });
});

// PATCH /api/inventory/spools/:id/deduct — manual deduction
app.patch('/api/inventory/spools/:id/deduct', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const grams = Number(req.body?.grams);
  if (isNaN(grams) || grams <= 0) { res.status(400).json({ error: 'grams must be > 0' }); return; }

  const spool = db.prepare('SELECT * FROM filament_inventory WHERE id=? AND user_id=?').get(req.params.id, user.id) as DbSpool | undefined;
  if (!spool) { res.status(404).json({ error: 'Spool not found.' }); return; }
  if (spool.status === 'finished') { res.status(400).json({ error: 'Cannot deduct from a finished spool.' }); return; }

  const newRemaining = Math.max(0, spool.remaining_g - grams);
  const newStatus = newRemaining === 0 ? 'finished' : 'active';
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE filament_inventory SET remaining_g=?, status=?, updated_at=? WHERE id=?`
  ).run(newRemaining, newStatus, now, req.params.id);
  res.json({ remainingG: newRemaining, status: newStatus });
});

// PATCH /api/inventory/spools/:id/finish — mark as finished
app.patch('/api/inventory/spools/:id/finish', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE filament_inventory SET status='finished', remaining_g=0, updated_at=? WHERE id=? AND user_id=?`
  ).run(now, req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Spool not found.' }); return; }
  res.json({ success: true });
});

// GET /api/inventory/custom-options — get user's saved custom brands & materials
app.get('/api/inventory/custom-options', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare('SELECT type, value FROM user_custom_spool_options WHERE user_id = ? ORDER BY value ASC')
    .all(user.id) as { type: string; value: string }[];
  const brands = rows.filter((r) => r.type === 'brand').map((r) => r.value);
  const materials = rows.filter((r) => r.type === 'material').map((r) => r.value);
  res.json({ brands, materials });
});

// ── Parser regex G-code (sin IA) ──────────────────────────────────────────────
function parseTimeString(raw: string): number {
  const h = parseInt(raw.match(/(\d+)\s*h/i)?.[1] ?? '0');
  const m = parseInt(raw.match(/(\d+)\s*m/i)?.[1] ?? '0');
  const s = parseInt(raw.match(/(\d+)\s*s/i)?.[1] ?? '0');
  return h * 3600 + m * 60 + s;
}

function parseGcodeComments(text: string): { printingTimeSeconds: number | null; filamentWeightGrams: number | null } {
  let printingTimeSeconds: number | null = null;
  let filamentWeightGrams: number | null = null;

  // ── TIEMPO ────────────────────────────────────────────────────────────────
  const timePatterns = [
    // PrusaSlicer / SuperSlicer / OrcaSlicer (cualquier modo)
    /;\s*estimated printing time(?:\s*\([^)]*\))?\s*=\s*((?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i,
    // Bambu Studio / OrcaSlicer variante
    /;\s*total estimated time[:\s=]+\s*((?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i,
    // Bambu Studio variante 2: ; model printing time: 1h 2m 30s
    /;\s*model printing time[:\s=]+\s*((?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i,
    // Simplify3D: ; Build time: 1 hours 2 minutes 30 seconds
    /;\s*Build time:\s*([\w\s]+)/i,
    // Slic3r: ; estimated printing time = 1h 2m 30s
    /;\s*estimated printing time\s*=\s*((?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      const t = parseTimeString(match[1]);
      if (t > 0) { printingTimeSeconds = t; break; }
    }
  }

  // Cura: ;TIME:3750 (segundos directamente)
  if (!printingTimeSeconds) {
    const m = text.match(/^;TIME:(\d+)/im);
    if (m) printingTimeSeconds = parseInt(m[1]);
  }

  // ── PESO FILAMENTO ────────────────────────────────────────────────────────
  // Función auxiliar: suma valores separados por " + " (filamento multi-color)
  const sumWeights = (raw: string): number =>
    raw.split('+').reduce((acc, v) => acc + parseFloat(v.trim() || '0'), 0);

  const weightPatterns: [RegExp, boolean][] = [
    // PrusaSlicer / OrcaSlicer / BambuSlicer: ; filament used [g] = 15.23
    // También multi-color: ; filament used [g] = 5.23 + 10.00
    [/;\s*filament used\s*\[g\]\s*=\s*([\d.\s+]+)/i, true],
    // Bambu Studio: ; total filament weight: 15.23 g
    [/;\s*total filament weight\s*[:\s=]+\s*([\d.]+)/i, false],
    // Bambu Studio variante: ; model weight: 15.23g
    [/;\s*model weight\s*[:\s=]+\s*([\d.]+)/i, false],
    // Simplify3D / genérico: ; Filament weight = 15.23 g
    [/;\s*filament weight\s*[:\s=]+\s*([\d.]+)/i, false],
    // ideaMaker / genérico: ; Total Filament Weight = 15.23 g
    [/;\s*total\s+filament\s+weight\s*[:\s=]+\s*([\d.]+)/i, false],
    // FlashPrint / genérico: ; filamentWeight: 15.23
    [/;\s*filamentWeight\s*[:\s=]+\s*([\d.]+)/i, false],
    // Permisivo: cualquier comentario con "filament" + número + "g"
    [/;[^\r\n]*filament[^\r\n]*?[=:\s]([\d.]+)\s*g\b/i, false],
  ];

  for (const [pattern, isMulti] of weightPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const val = isMulti ? sumWeights(match[1]) : parseFloat(match[1]);
      if (val > 0) { filamentWeightGrams = parseFloat(val.toFixed(2)); break; }
    }
  }

  // Cura: ;Filament used: 2.34567m → convertir a gramos (PLA 1.75mm, densidad 1.24 g/cm³)
  if (!filamentWeightGrams) {
    const m = text.match(/^;Filament used:\s*([\d.]+)m/im);
    if (m) {
      const lengthM = parseFloat(m[1]);
      const r = 0.0875; // radio 1.75mm en cm
      const vol = Math.PI * r * r * lengthM * 100;
      filamentWeightGrams = parseFloat((vol * 1.24).toFixed(2));
    }
  }

  // Cura: ;FILAMENT_USED_VOLUME_MM3:5678.9 → convertir mm³ a gramos (densidad PLA 1.24 g/cm³)
  if (!filamentWeightGrams) {
    const m = text.match(/^;FILAMENT_USED_VOLUME(?:_MM3)?:([\d.]+)/im);
    if (m) {
      const volumeMm3 = parseFloat(m[1]);
      filamentWeightGrams = parseFloat((volumeMm3 / 1000 * 1.24).toFixed(2));
    }
  }

  return { printingTimeSeconds, filamentWeightGrams };
}

// ── Analizador G-code / 3MF ───────────────────────────────────────────────────
app.post('/api/analyze-gcode', upload.single('gcodeFile'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.json({ error: 'No se ha subido ningún archivo.' });
    return;
  }

  try {
    let gcodeBuffer: Buffer;
    let gcodeFilename: string;

    const is3mf = file.originalname.toLowerCase().endsWith('.3mf');

    if (is3mf) {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();
      const gcodeEntry = entries.find(e =>
        e.entryName.toLowerCase().endsWith('.gcode') && !e.isDirectory
      );
      if (!gcodeEntry) {
        res.json({
          error: 'El archivo 3MF no contiene G-code. Exporta el proyecto desde PrusaSlicer, Bambu Studio u OrcaSlicer con el G-code incluido (no el modelo sin slicear).',
        });
        return;
      }
      gcodeBuffer = gcodeEntry.getData();
      gcodeFilename = gcodeEntry.entryName.split('/').pop() ?? gcodeEntry.entryName;
    } else {
      gcodeBuffer = file.buffer;
      gcodeFilename = file.originalname;
    }

    // Parsear comentarios del G-code con regex
    const gcodeText = gcodeBuffer.toString('utf-8');
    const parsed = parseGcodeComments(gcodeText);

    // Log de diagnóstico: primeras 40 líneas con comentarios para depuración
    const commentLines = gcodeText.split(/\r?\n/).filter(l => l.trim().startsWith(';')).slice(0, 40);
    console.log(`[G-code] ${gcodeFilename} — tiempo: ${parsed.printingTimeSeconds}s, peso: ${parsed.filamentWeightGrams}g`);
    console.log('[G-code] Comentarios detectados:\n' + commentLines.join('\n'));

    if (parsed.printingTimeSeconds !== null || parsed.filamentWeightGrams !== null) {
      // Devolver exactamente lo que se encontró (null = no encontrado)
      res.json({
        data: {
          printingTimeSeconds: parsed.printingTimeSeconds,
          filamentWeightGrams: parsed.filamentWeightGrams,
        },
      });
      return;
    }

    // Nada encontrado: devolver error descriptivo
    res.json({
      error: 'No se encontraron datos de tiempo ni filamento en el G-code. Asegúrate de exportar el G-code desde el slicer (PrusaSlicer, Bambu Studio, OrcaSlicer, Cura) e introduce los valores manualmente si es necesario.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error desconocido';
    res.json({ error: `Error al analizar el archivo: ${message}` });
  }
});

// ── PDF Customization ─────────────────────────────────────────────────────────
import { generatePdf, generatePdfHtml, generateTrackerPdf, generateTrackerPdfHtml, PdfCustomization, ProjectData, TrackerPdfData } from './pdf-generator';

// Servir logos estáticos
app.use('/uploads/logos', express.static(path.resolve(__dirname, '../uploads/logos')));
app.use('/uploads/profile-photos', express.static(path.resolve(__dirname, '../uploads/profile-photos')));

// GET /api/pdf/config - Obtener configuración del usuario
app.get('/api/pdf/config', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const config = db
    .prepare('SELECT * FROM pdf_customization WHERE user_id = ?')
    .get(user.id) as any | undefined;

  if (!config) {
    // Devolver configuración por defecto
    res.json({
      logoPath: null,
      primaryColor: '#29aae1',
      secondaryColor: '#333333',
      accentColor: '#f0f4f8',
      companyName: null,
      footerText: null,
      showMachineCosts: true,
      showBreakdown: true,
      showOtherCosts: true,
      showLaborCosts: true,
      showElectricity: true,
      templateName: 'default',
    });
    return;
  }

  res.json({
    logoPath: config.logo_path,
    primaryColor: config.primary_color,
    secondaryColor: config.secondary_color,
    accentColor: config.accent_color,
    companyName: config.company_name,
    footerText: config.footer_text,
    socialLinks: config.social_links ? JSON.parse(config.social_links) : [],
    showMachineCosts: Boolean(config.show_machine_costs),
    showBreakdown: Boolean(config.show_breakdown),
    showOtherCosts: Boolean(config.show_other_costs),
    showLaborCosts: Boolean(config.show_labor_costs),
    showElectricity: Boolean(config.show_electricity),
    templateName: config.template_name,
  });
});

// POST /api/pdf/config - Guardar configuración
app.post('/api/pdf/config', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const {
    logoPath,
    primaryColor,
    secondaryColor,
    accentColor,
    companyName,
    footerText,
    socialLinks,
    showMachineCosts,
    showBreakdown,
    showOtherCosts,
    showLaborCosts,
    showElectricity,
    templateName,
  } = req.body;

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO pdf_customization (
      user_id, logo_path, primary_color, secondary_color, accent_color,
      company_name, footer_text, social_links, show_machine_costs, show_breakdown,
      show_other_costs, show_labor_costs, show_electricity,
      template_name, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      logo_path = excluded.logo_path,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color,
      accent_color = excluded.accent_color,
      company_name = excluded.company_name,
      footer_text = excluded.footer_text,
      social_links = excluded.social_links,
      show_machine_costs = excluded.show_machine_costs,
      show_breakdown = excluded.show_breakdown,
      show_other_costs = excluded.show_other_costs,
      show_labor_costs = excluded.show_labor_costs,
      show_electricity = excluded.show_electricity,
      template_name = excluded.template_name,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    logoPath ?? null,
    primaryColor ?? '#29aae1',
    secondaryColor ?? '#333333',
    accentColor ?? '#f0f4f8',
    companyName ?? null,
    footerText ?? null,
    socialLinks ? JSON.stringify(socialLinks) : null,
    showMachineCosts ? 1 : 0,
    showBreakdown ? 1 : 0,
    showOtherCosts ? 1 : 0,
    showLaborCosts ? 1 : 0,
    showElectricity ? 1 : 0,
    templateName ?? 'default',
    now
  );

  res.json({ success: true });
});

// POST /api/pdf/upload-logo - Subir logo
app.post('/api/pdf/upload-logo', requireAuth, (req, res) => {
  uploadLogo.single('logo')(req, res, (err: any) => {
    if (err) {
      // Error de multer (tamaño, tipo, etc.)
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'El archivo es demasiado grande. Máximo 2 MB' });
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Campo de archivo inesperado' });
        return;
      }
      // Error personalizado del fileFilter o cualquier otro error
      res.status(400).json({ error: err.message || 'Error al subir el archivo' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No se ha subido ningún archivo' });
      return;
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;
    res.json({ logoPath });
  });
});

// POST /api/pdf/preview - Preview HTML del PDF
app.post('/api/pdf/preview', requireAuth, async (req, res) => {
  const { projectData, customization } = req.body as {
    projectData: ProjectData;
    customization: PdfCustomization;
  };

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const html = generatePdfHtml(projectData, customization, baseUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// POST /api/pdf/generate - Generar PDF
app.post('/api/pdf/generate', requireAuth, async (req, res) => {
  try {
    const { projectData, customization } = req.body as {
      projectData: ProjectData;
      customization: PdfCustomization;
    };

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pdf = await generatePdf(projectData, customization, baseUrl);

    const filename = `presupuesto-${projectData.jobName?.replace(/[^a-zA-Z0-9]/g, '-') || 'sin-nombre'}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    console.error('[PDF] Error generando PDF:', error);
    res.status(500).json({ error: 'Error al generar el PDF' });
  }
});

// ── Tracker PDF ───────────────────────────────────────────────────────────────

// POST /api/tracker/pdf/preview - Preview HTML del PDF del tracker
app.post('/api/tracker/pdf/preview', requireAuth, async (req, res) => {
  const { trackerData, customization } = req.body as {
    trackerData: TrackerPdfData;
    customization: PdfCustomization;
  };

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const html = generateTrackerPdfHtml(trackerData, customization, baseUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// POST /api/tracker/pdf/generate - Generar PDF del tracker
app.post('/api/tracker/pdf/generate', requireAuth, async (req, res) => {
  try {
    const { trackerData, customization } = req.body as {
      trackerData: TrackerPdfData;
      customization: PdfCustomization;
    };

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pdf = await generateTrackerPdf(trackerData, customization, baseUrl);

    const filename = `tracker-${trackerData.projectTitle.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    console.error('[PDF] Error generando PDF del tracker:', error);
    res.status(500).json({ error: 'Error al generar el PDF del tracker' });
  }
});

// ── Contact / Reportar bugs ───────────────────────────────────────────────────

const resolveMx = promisify(dns.resolveMx);

// POST /api/contact/verify-email - Verificar que un email existe
app.post('/api/contact/verify-email', async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ valid: false, message: 'Email no proporcionado' });
    return;
  }

  // Validación básica de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ valid: false, message: 'Formato de email inválido' });
    return;
  }

  try {
    // Extraer el dominio del email
    const domain = email.split('@')[1];

    // Verificar que el dominio tiene registros MX (servidores de correo)
    const mxRecords = await resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      res.json({ valid: false, message: 'El dominio no tiene servidores de correo' });
      return;
    }

    res.json({ valid: true, message: 'Email válido' });
  } catch (error) {
    // Error DNS significa que el dominio no existe
    res.json({ valid: false, message: 'El dominio del email no existe' });
  }
});

// POST /api/contact/send - Enviar mensaje de contacto
app.post('/api/contact/send', async (req, res) => {
  const { name, email, message } = req.body;

  // Validación básica
  if (!name || !email || !message) {
    res.status(400).json({ error: 'Todos los campos son obligatorios' });
    return;
  }

  // Validar email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email inválido' });
    return;
  }

  try {
    // Guardar en base de datos para historial
    db.prepare(`
      INSERT INTO contact_messages (name, email, message, created_at)
      VALUES (?, ?, ?, ?)
    `).run(name, email, message, new Date().toISOString());

    // Enviar email si las credenciales SMTP están configuradas
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BUG_REPORT_EMAIL } = process.env;

    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && BUG_REPORT_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT, 10),
        secure: false, // true para 465, false para otros puertos
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"FilamentOS Bot" <${SMTP_USER}>`,
        to: BUG_REPORT_EMAIL,
        subject: `🐛 Nuevo reporte de bug/sugerencia de ${name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8b5cf6;">📬 Nuevo mensaje desde FilamentOS</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>👤 Nombre:</strong> ${name}</p>
              <p><strong>📧 Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>📅 Fecha:</strong> ${new Date().toLocaleString('es-ES')}</p>
            </div>
            <div style="background: #fff; padding: 20px; border-left: 4px solid #8b5cf6; margin: 20px 0;">
              <h3 style="margin-top: 0;">💬 Mensaje:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              Este mensaje fue enviado desde el chatbot BOBINA en 
              <a href="https://filamentos.luprintech.com" style="color: #8b5cf6;">FilamentOS</a>
            </p>
          </div>
        `,
      });

      console.log(`✅ Email enviado a ${BUG_REPORT_EMAIL} desde ${email}`);
    } else {
      console.log('\n=== NUEVO MENSAJE DE CONTACTO (SMTP no configurado) ===');
      console.log('De:', name);
      console.log('Email:', email);
      console.log('Mensaje:', message);
      console.log('Fecha:', new Date().toISOString());
      console.log('================================\n');
    }

    res.json({ success: true, message: 'Mensaje recibido correctamente' });
  } catch (error) {
    console.error('[CONTACT] Error procesando mensaje:', error);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

interface StatsQuery {
  from?: string;
  to?: string;
  projectId?: string;
  status?: string;
  granularity?: string;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(value);
}

// ── Panel /lupe — Admin de recursos ──────────────────────────────────────────

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  next();
}

app.post('/api/lupe/login', (req, res) => {
  try {
    const { user, pass } = req.body as { user?: string; pass?: string };
    const adminUser = process.env.LUPE_ADMIN_USER || 'lupe';
    const envPass = process.env.LUPE_ADMIN_PASS || '';
    // Check for overridden password in settings, fall back to .env
    const settingRow = db.prepare('SELECT value FROM lupe_settings WHERE key = ?').get('admin_pass') as { value: string } | undefined;
    const adminPass = settingRow?.value || envPass;
    if (!adminPass) { res.status(503).json({ error: 'Admin no configurado' }); return; }
    if (user === adminUser && pass === adminPass) {
      req.session.isAdmin = true;
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: 'Credenciales incorrectas' });
    }
  } catch (error) {
    console.error('[Lupe] /api/lupe/login error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión admin' });
  }
});

app.post('/api/lupe/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

app.get('/api/lupe/me', (req, res) => {
  try {
    res.json({ isAdmin: !!req.session.isAdmin });
  } catch (error) {
    console.error('[Lupe] /api/lupe/me error:', error);
    res.status(500).json({ error: 'Error al verificar sesión admin' });
  }
});

app.put('/api/lupe/password', requireAdmin, (req, res) => {
  const { currentPass, newPass } = req.body as { currentPass?: string; newPass?: string };
  if (!newPass || (newPass as string).length < 6) {
    res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }); return;
  }
  const envPass = process.env.LUPE_ADMIN_PASS || '';
  const settingRow = db.prepare('SELECT value FROM lupe_settings WHERE key = ?').get('admin_pass') as { value: string } | undefined;
  const currentActualPass = settingRow?.value || envPass;
  if (currentPass !== currentActualPass) {
    res.status(401).json({ error: 'Contraseña actual incorrecta' }); return;
  }
  db.prepare(`INSERT INTO lupe_settings (key, value) VALUES ('admin_pass', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(newPass);
  res.json({ ok: true });
});

app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM resource_categories ORDER BY sort_order ASC').all();
  res.json(rows);
});

app.get('/api/lupe/categories', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM resource_categories ORDER BY sort_order ASC').all();
  res.json(rows);
});

app.post('/api/lupe/categories', requireAdmin, (req, res) => {
  const { label_es, label_en, color, badge_cls, sort_order } = req.body as Record<string, unknown>;
  if (!label_es) { res.status(400).json({ error: 'El nombre es obligatorio' }); return; }
  const base = (label_es as string).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24);
  const id = base + '_' + Date.now().toString(36);
  db.prepare(`INSERT INTO resource_categories (id, label_es, label_en, color, badge_cls, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, label_es, label_en || label_es, color || 'text-muted-foreground', badge_cls || '', sort_order ?? 99);
  res.status(201).json(db.prepare('SELECT * FROM resource_categories WHERE id = ?').get(id));
});

app.put('/api/lupe/categories/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { label_es, label_en, color, badge_cls, sort_order } = req.body as Record<string, unknown>;
  db.prepare(`UPDATE resource_categories SET label_es=?, label_en=?, color=?, badge_cls=?, sort_order=? WHERE id=?`)
    .run(label_es, label_en || label_es, color, badge_cls, sort_order ?? 99, id);
  const updated = db.prepare('SELECT * FROM resource_categories WHERE id = ?').get(id);
  if (!updated) { res.status(404).json({ error: 'No encontrada' }); return; }
  res.json(updated);
});

app.delete('/api/lupe/categories/:id', requireAdmin, (req, res) => {
  if (!db.prepare('SELECT id FROM resource_categories WHERE id = ?').get(req.params.id)) {
    res.status(404).json({ error: 'No encontrada' }); return;
  }
  db.prepare('DELETE FROM resource_categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Tags endpoints ─────────────────────────────────────────────────────────────

app.get('/api/tags', (_req, res) => {
  res.json(db.prepare('SELECT * FROM resource_tags ORDER BY sort_order ASC').all());
});

app.get('/api/lupe/tags', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM resource_tags ORDER BY sort_order ASC').all());
});

app.post('/api/lupe/tags', requireAdmin, (req, res) => {
  const { label, badge_cls, sort_order } = req.body as Record<string, unknown>;
  if (!label) { res.status(400).json({ error: 'El nombre es obligatorio' }); return; }
  const base = (label as string).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24);
  const id = base + '_' + Date.now().toString(36);
  db.prepare(`INSERT INTO resource_tags (id, label, badge_cls, sort_order) VALUES (?, ?, ?, ?)`)
    .run(id, label, badge_cls || 'border-border/50 bg-muted/20 text-muted-foreground', sort_order ?? 99);
  res.status(201).json(db.prepare('SELECT * FROM resource_tags WHERE id = ?').get(id));
});

app.put('/api/lupe/tags/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { label, badge_cls, sort_order } = req.body as Record<string, unknown>;
  db.prepare(`UPDATE resource_tags SET label=?, badge_cls=?, sort_order=? WHERE id=?`)
    .run(label, badge_cls, sort_order ?? 99, id);
  const updated = db.prepare('SELECT * FROM resource_tags WHERE id = ?').get(id);
  if (!updated) { res.status(404).json({ error: 'No encontrada' }); return; }
  res.json(updated);
});

app.delete('/api/lupe/tags/:id', requireAdmin, (req, res) => {
  if (!db.prepare('SELECT id FROM resource_tags WHERE id = ?').get(req.params.id)) {
    res.status(404).json({ error: 'No encontrada' }); return;
  }
  db.prepare('DELETE FROM resource_tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/resources', (_req, res) => {
  const rows = db.prepare('SELECT * FROM resources ORDER BY sort_order ASC, created_at ASC').all();
  res.json(rows);
});

app.get('/api/lupe/resources', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM resources ORDER BY sort_order ASC, created_at ASC').all();
  res.json(rows);
});

app.post('/api/lupe/resources', requireAdmin, (req, res) => {
  const { name, description, url, category, is_ai, is_free, is_new, sort_order, extra_tags } = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  const tagsJson = Array.isArray(extra_tags) ? JSON.stringify(extra_tags) : (extra_tags as string ?? '[]');
  db.prepare(`INSERT INTO resources (id, name, description, url, category, is_ai, is_free, is_new, sort_order, extra_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, description, url, category, is_ai ? 1 : 0, is_free ? 1 : 0, is_new ? 1 : 0, sort_order ?? 99, tagsJson);
  res.status(201).json(db.prepare('SELECT * FROM resources WHERE id = ?').get(id));
});

app.put('/api/lupe/resources/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, url, category, is_ai, is_free, is_new, sort_order, extra_tags } = req.body as Record<string, unknown>;
  const tagsJson = Array.isArray(extra_tags) ? JSON.stringify(extra_tags) : (extra_tags as string ?? '[]');
  db.prepare(`UPDATE resources SET name=?, description=?, url=?, category=?, is_ai=?, is_free=?, is_new=?, sort_order=?, extra_tags=?, updated_at=datetime('now') WHERE id=?`
  ).run(name, description, url, category, is_ai ? 1 : 0, is_free ? 1 : 0, is_new ? 1 : 0, sort_order ?? 99, tagsJson, id);
  const updated = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
  if (!updated) { res.status(404).json({ error: 'No encontrado' }); return; }
  res.json(updated);
});

app.delete('/api/lupe/resources/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'No encontrado' }); return; }
  if (row.custom_image) {
    const imgPath = path.resolve(__dirname, '../uploads/resources', path.basename(row.custom_image));
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/lupe/resources/:id/image', requireAdmin, (req, res) => {
  uploadResourceImage.single('image')(req, res, (err: any) => {
    if (err) { res.status(400).json({ error: err.message || 'Error al subir imagen' }); return; }
    if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
    const { id } = req.params;
    const old = db.prepare('SELECT custom_image FROM resources WHERE id = ?').get(id) as any;
    if (old?.custom_image) {
      const oldPath = path.resolve(__dirname, '../uploads/resources', path.basename(old.custom_image));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const imageUrl = `/uploads/resources/${req.file.filename}`;
    db.prepare("UPDATE resources SET custom_image=?, updated_at=datetime('now') WHERE id=?").run(imageUrl, id);
    res.json({ imageUrl });
  });
});

app.delete('/api/lupe/resources/:id/image', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT custom_image FROM resources WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'No encontrado' }); return; }
  if (row.custom_image) {
    const imgPath = path.resolve(__dirname, '../uploads/resources', path.basename(row.custom_image));
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    db.prepare("UPDATE resources SET custom_image=NULL, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  }
  res.json({ ok: true });
});

app.use('/uploads/resources', express.static(path.resolve(__dirname, '../uploads/resources')));

// GET /api/stats
app.get('/api/stats', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { from, to, projectId = 'all', status = 'all', granularity = 'month', source = 'all' } = req.query as StatsQuery & { source?: string };

  // Validation
  if (from && !isValidIsoDate(from)) {
    res.status(400).json({ error: 'Invalid from date. Use ISO format YYYY-MM-DD.' });
    return;
  }
  if (to && !isValidIsoDate(to)) {
    res.status(400).json({ error: 'Invalid to date. Use ISO format YYYY-MM-DD.' });
    return;
  }
  if (!['day', 'week', 'month'].includes(granularity)) {
    res.status(400).json({ error: "Invalid granularity. Use 'day', 'week', or 'month'." });
    return;
  }
  if (!['all', 'pending', 'printed', 'post_processed', 'delivered', 'failed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status filter.' });
    return;
  }
  if (!['all', 'tracker', 'calculator'].includes(source)) {
    res.status(400).json({ error: 'Invalid source filter.' });
    return;
  }

  const fromDate = from ?? '1970-01-01';
  const toDate = to ?? new Date().toISOString().slice(0, 10);
  const toDateEnd = toDate + 'T23:59:59';

  const unifiedPiecesCte = `
    WITH unified_pieces AS (
      SELECT
        id,
        project_id,
        status,
        total_grams,
        total_cost,
        total_secs,
        COALESCE(printed_at, created_at) AS eff_date,
        'tracker' AS source,
        name,
        label
      FROM tracker_pieces
      WHERE user_id = ?
      
      UNION ALL
      
      SELECT
        id,
        'calc_projects' AS project_id,
        status,
        total_grams,
        total_cost,
        total_secs,
        COALESCE(printed_at, created_at) AS eff_date,
        'calculator' AS source,
        job_name AS name,
        '' AS label
      FROM projects
      WHERE user_id = ?
    )
  `;

  const summaryRow = db.prepare(`
    ${unifiedPiecesCte}
    SELECT
      COUNT(*) AS totalPieces,
      COALESCE(SUM(total_grams), 0) AS totalGrams,
      COALESCE(SUM(total_cost), 0) AS totalCost,
      COALESCE(SUM(total_secs), 0) AS totalSecs
    FROM unified_pieces
    WHERE eff_date >= ?
      AND eff_date <= ?
      AND (? = 'all' OR project_id = ?)
      AND (? = 'all' OR status = ?)
      AND (? = 'all' OR source = ?)
  `).get(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as {
    totalPieces: number;
    totalGrams: number;
    totalCost: number;
    totalSecs: number;
  };

  const projectCountRow = db.prepare(`
    ${unifiedPiecesCte}
    SELECT COUNT(DISTINCT project_id) AS projectCount
    FROM unified_pieces
    WHERE eff_date >= ?
      AND eff_date <= ?
      AND (? = 'all' OR project_id = ?)
      AND (? = 'all' OR status = ?)
      AND (? = 'all' OR source = ?)
      AND project_id != 'calc_projects'
  `).get(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as { projectCount: number };

  const avgCostPerPiece = summaryRow.totalPieces > 0
    ? parseFloat((summaryRow.totalCost / summaryRow.totalPieces).toFixed(4))
    : 0;

  const statusRows = db.prepare(`
    ${unifiedPiecesCte}
    SELECT
      status,
      COUNT(*) AS count
    FROM unified_pieces
    WHERE eff_date >= ?
      AND eff_date <= ?
      AND (? = 'all' OR project_id = ?)
      AND (? = 'all' OR status = ?)
      AND (? = 'all' OR source = ?)
    GROUP BY status
  `).all(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as Array<{
    status: string;
    count: number;
  }>;

  const byStatus = {
    pending: 0,
    printed: 0,
    postProcessed: 0,
    delivered: 0,
    failed: 0,
  };

  for (const row of statusRows) {
    if (row.status === 'pending') byStatus.pending = row.count;
    if (row.status === 'printed') byStatus.printed = row.count;
    if (row.status === 'post_processed') byStatus.postProcessed = row.count;
    if (row.status === 'delivered') byStatus.delivered = row.count;
    if (row.status === 'failed') byStatus.failed = row.count;
  }

  const strftimeFormat = granularity === 'day'
    ? '%Y-%m-%d'
    : granularity === 'week'
      ? '%Y-W%W'
      : '%Y-%m';

  const timeSeries = db.prepare(`
    ${unifiedPiecesCte}
    SELECT
      strftime('${strftimeFormat}', eff_date) AS period,
      COUNT(*) AS pieces,
      COALESCE(SUM(total_grams), 0) AS grams,
      COALESCE(SUM(total_cost), 0) AS cost,
      COALESCE(SUM(total_secs), 0) AS secs
    FROM unified_pieces
    WHERE eff_date >= ?
      AND eff_date <= ?
      AND (? = 'all' OR project_id = ?)
      AND (? = 'all' OR status = ?)
      AND (? = 'all' OR source = ?)
    GROUP BY period
    ORDER BY period ASC
  `).all(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as Array<{
    period: string;
    pieces: number;
    grams: number;
    cost: number;
    secs: number;
  }>;

  const byProject = db.prepare(`
    ${unifiedPiecesCte}
    SELECT
      up.project_id AS projectId,
      tpr.title AS title,
      COUNT(*) AS pieces,
      COALESCE(SUM(up.total_grams), 0) AS grams,
      COALESCE(SUM(up.total_cost), 0) AS cost,
      COALESCE(SUM(up.total_secs), 0) AS secs
    FROM unified_pieces up
    LEFT JOIN tracker_projects tpr ON tpr.id = up.project_id
    WHERE up.eff_date >= ?
      AND up.eff_date <= ?
      AND (? = 'all' OR up.project_id = ?)
      AND (? = 'all' OR up.status = ?)
      AND (? = 'all' OR up.source = ?)
    GROUP BY up.project_id
    ORDER BY cost DESC
  `).all(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as Array<{
    projectId: string;
    title: string | null;
    pieces: number;
    grams: number;
    cost: number;
    secs: number;
  }>;

  res.json({
    summary: {
      totalPieces: summaryRow.totalPieces,
      totalGrams: summaryRow.totalGrams,
      totalCost: summaryRow.totalCost,
      totalSecs: summaryRow.totalSecs,
      avgCostPerPiece,
      projectCount: projectCountRow.projectCount,
      byStatus,
    },
    timeSeries,
    byProject: byProject.map((r) => ({
      projectId: r.projectId,
      title: r.projectId === 'calc_projects' ? 'Calculadora (Varios)' : (r.title ?? 'Unknown'),
      pieces: r.pieces,
      grams: r.grams,
      cost: r.cost,
      secs: r.secs,
    })),
  });
});

// GET /api/stats/pieces — detail list for drill-down panel
app.get('/api/stats/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { from, to, projectId = 'all', status = 'all', source = 'all' } = req.query as StatsQuery & { source?: string };

  if (from && !isValidIsoDate(from)) {
    res.status(400).json({ error: 'Invalid from date.' });
    return;
  }
  if (to && !isValidIsoDate(to)) {
    res.status(400).json({ error: 'Invalid to date.' });
    return;
  }
  if (!['all', 'tracker', 'calculator'].includes(source)) {
    res.status(400).json({ error: 'Invalid source filter.' });
    return;
  }

  const fromDate  = from ?? '1970-01-01';
  const toDate    = to ?? new Date().toISOString().slice(0, 10);
  const toDateEnd = toDate + 'T23:59:59';

  const unifiedPiecesCte = `
    WITH unified_pieces AS (
      SELECT
        id,
        project_id,
        status,
        total_grams,
        total_cost,
        total_secs,
        COALESCE(printed_at, created_at) AS eff_date,
        'tracker' AS source,
        name,
        label
      FROM tracker_pieces
      WHERE user_id = ?
      
      UNION ALL
      
      SELECT
        id,
        'calc_projects' AS project_id,
        status,
        total_grams,
        total_cost,
        total_secs,
        COALESCE(printed_at, created_at) AS eff_date,
        'calculator' AS source,
        job_name AS name,
        '' AS label
      FROM projects
      WHERE user_id = ?
    )
  `;

  const pieces = db.prepare(`
    ${unifiedPiecesCte}
    SELECT
      up.id,
      up.name,
      up.label,
      tpr.title AS projectTitle,
      up.project_id AS projectId,
      up.status,
      up.total_grams AS totalGrams,
      up.total_cost AS totalCost,
      up.total_secs AS totalSecs,
      up.eff_date AS date,
      up.source
    FROM unified_pieces up
    LEFT JOIN tracker_projects tpr ON tpr.id = up.project_id
    WHERE up.eff_date >= ?
      AND up.eff_date <= ?
      AND (? = 'all' OR up.project_id = ?)
      AND (? = 'all' OR up.status = ?)
      AND (? = 'all' OR up.source = ?)
    ORDER BY up.eff_date DESC
    LIMIT 500
  `).all(user.id, user.id, fromDate, toDateEnd, projectId, projectId, status, status, source, source) as Array<{
    id: string;
    name: string;
    label: string;
    projectTitle: string | null;
    projectId: string;
    status: string;
    totalGrams: number;
    totalCost: number;
    totalSecs: number;
    date: string;
    source: string;
  }>;

  res.json({
    pieces: pieces.map(p => ({
      ...p,
      projectTitle: p.projectId === 'calc_projects' ? 'Calculadora (Varios)' : (p.projectTitle ?? 'Unknown'),
    }))
  });
});


app.post('/api/analyze-3mf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se ha proporcionado ningún archivo.' });
    return;
  }

  try {
    const zip = await JSZip.loadAsync(req.file.buffer);

    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: false,   // keep all attribute values as strings
      trimValues: true,
    });

    let projectName = req.file.originalname.replace(/\.3mf$/i, '') || 'Proyecto 3MF';

    interface PlateResult {
      plateNumber: number;
      name: string;
      filamentColor: string;
      filamentType: string;
      weightGrams: number | null;
      printTimeMinutes: number | null;
    }

    let plates: PlateResult[] = [];

    // ── 1. Try Bambu slice_info.config ─────────────────────────────────────────
    const sliceInfoFile = zip.file('Metadata/slice_info.config') ?? zip.file('metadata/slice_info.config');

    console.log(`[analyze-3mf] ZIP files: ${Object.keys(zip.files).join(', ')}`);
    console.log(`[analyze-3mf] slice_info.config found: ${!!sliceInfoFile}`);

    if (sliceInfoFile) {
      try {
        const sliceInfoText = await sliceInfoFile.async('text');
        const parsed = xmlParser.parse(sliceInfoText) as Record<string, unknown>;
        const config = parsed?.config as Record<string, unknown> | undefined;

        if (!config) {
          console.warn(`[analyze-3mf] slice_info.config parsed but no root <config> element. Root keys: [${Object.keys(parsed || {}).join(', ')}]`);
        }

        if (config) {
          const rawPlates = config.plate;
          const plateDefs: Record<string, unknown>[] = Array.isArray(rawPlates)
            ? rawPlates
            : rawPlates ? [rawPlates as Record<string, unknown>] : [];

          for (let i = 0; i < plateDefs.length; i++) {
            const plate = plateDefs[i] as Record<string, unknown>;

            const metaMap: Record<string, string> = {};
            const rawMetas = plate.metadata;
            const metas: Record<string, unknown>[] = Array.isArray(rawMetas)
              ? rawMetas
              : rawMetas ? [rawMetas as Record<string, unknown>] : [];
            for (const m of metas) {
              const mr = m as Record<string, string>;
              if (mr['@_key']) metaMap[mr['@_key']] = String(mr['@_value'] ?? '');
            }

            const rawFilaments = plate.filament;
            const filaments: Record<string, unknown>[] = Array.isArray(rawFilaments)
              ? rawFilaments
              : rawFilaments ? [rawFilaments as Record<string, unknown>] : [];

            let filamentColor = '';
            let filamentType = '';

            if (filaments.length > 0) {
              const fil = filaments[0] as Record<string, unknown>;

              // ── Priority 1: direct XML attributes (Bambu/OrcaSlicer format)
              // <filament type="PLA" color="FFFFFF" used_g="5.67" tray_color="FFFFFFFF" .../>
              const attrColor = String(fil['@_color'] ?? '').replace(/^#/, '');
              const attrTrayColor = String(fil['@_tray_color'] ?? '').replace(/^#/, '');
              const attrType = String(fil['@_type'] ?? '');
              if (attrColor) filamentColor = attrColor;
              else if (attrTrayColor) filamentColor = attrTrayColor;
              if (attrType) filamentType = attrType;

              // ── Priority 2: nested <metadata key="..."> elements (other slicers)
              if (!filamentColor || !filamentType) {
                const rawFM = fil.metadata;
                const filMetaArr: Record<string, unknown>[] = Array.isArray(rawFM)
                  ? rawFM
                  : rawFM ? [rawFM as Record<string, unknown>] : [];
                const filMeta: Record<string, string> = {};
                for (const m of filMetaArr) {
                  const mr = m as Record<string, string>;
                  if (mr['@_key']) filMeta[mr['@_key']] = String(mr['@_value'] ?? '');
                }
                if (!filamentColor) filamentColor = filMeta['color'] || filMeta['filament_colour'] || '';
                if (!filamentType) filamentType = filMeta['type'] || filMeta['filament_type'] || '';
              }
            }

            // ── Priority 3: plate-level metadata fallbacks (some Bambu/OrcaSlicer versions
            //    store colour/type in plate metadata instead of / in addition to <filament>)
            if (!filamentColor) {
              // filament_colors may be semicolon-separated for multi-material; take first value
              const rawColors =
                metaMap['filament_colors'] ||
                metaMap['filament_colour'] ||
                metaMap['filament_color'] ||
                metaMap['extruder_colour'] ||
                '';
              filamentColor = rawColors.split(/[;,]/)[0].replace(/^#/, '').trim();
            }
            if (!filamentType) {
              const rawType =
                metaMap['filament_type'] ||
                metaMap['filament_material'] ||
                metaMap['type'] ||
                metaMap['material'] ||
                '';
              filamentType = rawType.split(/[;,]/)[0].trim();
            }

            console.log(`[analyze-3mf] Plate ${i + 1}: color="${filamentColor}" type="${filamentType}" weight="${metaMap['filament_weight'] || metaMap['used_g'] || metaMap['weight'] || '?'}" time="${metaMap['print_time'] || metaMap['prediction'] || metaMap['print_seconds'] || '?'}" | metaKeys=[${Object.keys(metaMap).join(',')}]`);

            // ── Weight ────────────────────────────────────────────────────
            // Try plate-level metadata keys first, then sum filament used_g attributes
            const weightStr = metaMap['filament_weight'] || metaMap['used_g'] || metaMap['weight'] || '';
            let weightGrams: number | null = weightStr ? (parseFloat(weightStr) || null) : null;

            if (weightGrams === null && filaments.length > 0) {
              // Fall back: sum @_used_g direct attributes across all filaments
              const sumFromFilaments = filaments.reduce((acc, f) => {
                const v = parseFloat(String((f as Record<string, unknown>)['@_used_g'] ?? ''));
                return acc + (isNaN(v) ? 0 : v);
              }, 0);
              if (sumFromFilaments > 0) weightGrams = sumFromFilaments;
            }

            // ── Time ──────────────────────────────────────────────────────
            // prediction / print_time is stored in seconds
            // Some slicers also store it as "HH:MM:SS" → convert
            const timeStr = metaMap['print_time'] || metaMap['prediction'] || metaMap['print_seconds'] || '';
            let printTimeMinutes: number | null = null;
            if (timeStr) {
              if (/^\d+:\d+:\d+$/.test(timeStr)) {
                // HH:MM:SS format
                const [hh, mm, ss] = timeStr.split(':').map(Number);
                const totalSec = (hh * 3600) + (mm * 60) + (ss || 0);
                if (totalSec > 0) printTimeMinutes = Math.round(totalSec / 60);
              } else {
                const rawTime = parseInt(timeStr, 10);
                if (!isNaN(rawTime) && rawTime > 0) printTimeMinutes = Math.round(rawTime / 60);
              }
            }

            const plateNum = parseInt(metaMap['index'] || metaMap['plater_id'] || String(i + 1), 10) || i + 1;

            plates.push({
              plateNumber: plateNum,
              name: metaMap['plate_name'] || `Placa ${plateNum}`,
              filamentColor,
              filamentType,
              weightGrams,
              printTimeMinutes,
            });
          }
        }
      } catch (parseErr) {
        console.warn('[analyze-3mf] Error parsing slice_info.config:', parseErr);
      }
    }

    // ── 2. Fallback: parse 3D/3dmodel.model ───────────────────────────────────
    if (plates.length === 0) {
      const modelFile = zip.file('3D/3dmodel.model') ?? zip.file('3d/3dmodel.model');
      if (modelFile) {
        try {
          const modelText = await modelFile.async('text');
          const parsed = xmlParser.parse(modelText) as Record<string, unknown>;
          const model = parsed?.model as Record<string, unknown> | undefined;

          if (model) {
            const rawMetas = model.metadata;
            const metaArr: Record<string, unknown>[] = Array.isArray(rawMetas)
              ? rawMetas
              : rawMetas ? [rawMetas as Record<string, unknown>] : [];

            for (const m of metaArr) {
              const mr = m as Record<string, string>;
              const key = mr['@_name'] || '';
              if (['Title', 'title', 'Description', 'Creator'].includes(key)) {
                const val = mr['@_content'] || mr['#text'] || '';
                if (val) { projectName = val; break; }
              }
            }

            const resources = model.resources as Record<string, unknown> | undefined;
            const rawObjects = resources?.object;
            const objects: Record<string, unknown>[] = Array.isArray(rawObjects)
              ? rawObjects
              : rawObjects ? [rawObjects as Record<string, unknown>] : [];

            plates = objects.slice(0, 10).map((obj, idx) => {
              const o = obj as Record<string, string>;
              return {
                plateNumber: idx + 1,
                name: o['@_name'] || `Objeto ${o['@_id'] || idx + 1}`,
                filamentColor: '',
                filamentType: '',
                weightGrams: null,
                printTimeMinutes: null,
              };
            });
          }
        } catch (parseErr) {
          console.warn('[analyze-3mf] Error parsing 3dmodel.model:', parseErr);
        }
      }

      if (plates.length === 0) {
        plates = [{ plateNumber: 1, name: 'Placa 1', filamentColor: '', filamentType: '', weightGrams: null, printTimeMinutes: null }];
      }
    }

    const totalWeightGrams = plates.some((p) => p.weightGrams !== null)
      ? plates.reduce((s, p) => s + (p.weightGrams ?? 0), 0)
      : null;

    const totalTimeMinutes = plates.some((p) => p.printTimeMinutes !== null)
      ? plates.reduce((s, p) => s + (p.printTimeMinutes ?? 0), 0)
      : null;

    res.json({ projectName, plates, totalWeightGrams, totalTimeMinutes });
  } catch (err) {
    console.error('[analyze-3mf]', err);
    res.status(500).json({ error: 'Error al procesar el archivo 3MF.' });
  }
});

// ── Helper: parse Bambu QR code ───────────────────────────────────────────────
interface FilamentData {
  brand: string | null;
  name: string | null;
  color: string | null;
  colorHex: string | null;
  material: string | null;
  diameter: number | null;
  weightGrams: number | null;
  printTempMin: number | null;
  printTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
  price: number | null;
}

function parseBambuQr(code: string): Partial<FilamentData> | null {
  try {
    let obj: Record<string, unknown> | null = null;

    if (code.startsWith('{')) {
      obj = JSON.parse(code) as Record<string, unknown>;
    } else if (code.includes('bambulab.com') || code.includes('bambulabs.com')) {
      const url = new URL(code);
      const params = Object.fromEntries(url.searchParams.entries());
      if (params.content) {
        obj = JSON.parse(decodeURIComponent(params.content)) as Record<string, unknown>;
      } else {
        obj = params as Record<string, unknown>;
      }
    }

    if (!obj) return null;

    const type = String(obj.type || obj.tpe || obj.filamentType || '');
    const colorRaw = String(obj.color || obj.clr || obj.filamentColor || '');
    let colorHex: string | null = null;
    if (/^[0-9A-Fa-f]{6,8}$/.test(colorRaw)) {
      colorHex = '#' + colorRaw.substring(0, 6).toUpperCase();
    }

    const toNum = (v: unknown) => {
      const n = parseFloat(String(v || ''));
      return isNaN(n) ? null : n;
    };
    const toInt = (v: unknown) => {
      const n = parseInt(String(v || ''), 10);
      return isNaN(n) ? null : n;
    };

    return {
      brand: String(obj.subBrand || obj.brand || 'Bambu Lab') || null,
      name: String(obj.trayIdName || obj.name || (type ? `Bambu ${type}` : '')) || null,
      color: null,
      colorHex,
      material: type || null,
      diameter: toNum(obj.diameter || obj.dia) ?? 1.75,
      weightGrams: toNum(obj.weight || obj.wgt),
      printTempMin: toInt(obj.nozzleTemp || obj.minNozzleTemp),
      printTempMax: toInt(obj.maxNozzleTemp || obj.nozzleTemp),
      bedTempMin: toInt(obj.bedTemp || obj.minBedTemp),
      bedTempMax: toInt(obj.maxBedTemp || obj.bedTemp),
      price: null,
    };
  } catch {
    return null;
  }
}

// ── Lookup Filament (barcode / QR) ────────────────────────────────────────────
app.post('/api/lookup-filament', async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: 'Se requiere un código.' });
    return;
  }

  const trimmedCode = code.trim();
  const emptyData: FilamentData = {
    brand: null, name: null, color: null, colorHex: null,
    material: null, diameter: null, weightGrams: null,
    printTempMin: null, printTempMax: null,
    bedTempMin: null, bedTempMax: null, price: null,
  };

  // 1. Check local community DB first
  const localRow = db
    .prepare('SELECT * FROM filamentos_comunidad WHERE codigo = ? ORDER BY id DESC LIMIT 1')
    .get(trimmedCode) as Record<string, unknown> | undefined;

  if (localRow) {
    res.json({
      found: true,
      source: 'opendb' as const,
      data: {
        brand: localRow.marca as string | null,
        name: localRow.nombre as string | null,
        color: localRow.color as string | null,
        colorHex: localRow.color_hex as string | null,
        material: localRow.material as string | null,
        diameter: localRow.diametro as number | null,
        weightGrams: localRow.peso as number | null,
        printTempMin: localRow.temp_min as number | null,
        printTempMax: localRow.temp_max as number | null,
        bedTempMin: null,
        bedTempMax: null,
        price: null,
      } satisfies FilamentData,
    });
    return;
  }

  // 2. Try Bambu QR parsing
  const bambuData = parseBambuQr(trimmedCode);
  if (bambuData) {
    res.json({ found: true, source: 'bambu' as const, linked: false, data: { ...emptyData, ...bambuData } });
    return;
  }

  // 3. Not found — users can contribute manually
  res.json({ found: false, source: 'manual' as const, linked: false, data: emptyData });
});

// ── Community filament DB contribution ───────────────────────────────────────
app.post('/api/filaments-community', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { codigo, marca, nombre, color, colorHex, material, diametro, peso, tempMin, tempMax } =
    req.body as Record<string, unknown>;

  if (!String(codigo || '').trim()) {
    res.status(400).json({ error: 'El código es obligatorio.' });
    return;
  }

  db.prepare(`
    INSERT INTO filamentos_comunidad (codigo, marca, nombre, color, color_hex, material, diametro, peso, temp_min, temp_max, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(codigo).trim(),
    String(marca || '').trim() || null,
    String(nombre || '').trim() || null,
    String(color || '').trim() || null,
    String(colorHex || '').trim() || null,
    String(material || '').trim() || null,
    parseFloat(String(diametro)) || 1.75,
    parseFloat(String(peso)) || null,
    parseFloat(String(tempMin)) || null,
    parseFloat(String(tempMax)) || null,
    user.id,
  );
  res.json({ success: true });
});

// ── Test helpers (solo en NODE_ENV=test) ─────────────────────────────────────
if (process.env.NODE_ENV === 'test') {
  app.post('/api/test/login', (req, res) => {
    const { userId } = req.body as { userId: string };
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    req.login(user, (err) => {
      if (err) { res.status(500).json({ error: 'Session error' }); return; }
      res.json({ ok: true, user });
    });
  });
}

// ── GET /api/auth/verify-email?token=xxx — verificar cuenta ──────────────────
app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) { res.status(400).json({ error: 'Token requerido' }); return; }

  const row = db.prepare(
    "SELECT * FROM email_tokens WHERE token=? AND type='verify' AND used=0"
  ).get(token) as { id: string; user_id: string; expires_at: number } | undefined;

  if (!row) {
    res.redirect(`${resolveClientOrigin(req)}/login?error=token_invalid`);
    return;
  }
  if (row.expires_at < Date.now()) {
    res.redirect(`${resolveClientOrigin(req)}/login?error=token_expired`);
    return;
  }

  db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
  db.prepare('UPDATE email_tokens SET used=1 WHERE id=?').run(row.id);

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id) as DbUser;
  req.login(user, (err) => {
    if (err) { res.redirect(`${resolveClientOrigin(req)}/login?error=login_failed`); return; }
    res.redirect(`${resolveClientOrigin(req)}/login?verified=1`);
  });
});

// ── POST /api/auth/resend-verification — reenviar email de verificación ───────
app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'Email requerido' }); return; }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(normalizedEmail) as (DbUser & { email_verified: number }) | undefined;
  // Siempre 200 por seguridad
  if (!user || user.email_verified) { res.json({ ok: true }); return; }

  // Invalidar tokens anteriores
  db.prepare("UPDATE email_tokens SET used=1 WHERE user_id=? AND type='verify'").run(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), user.id, token, 'verify', Date.now() + 24 * 60 * 60 * 1000);

  const link = `${CLIENT_ORIGIN}/login?token=${token}&mode=verify`;
  try {
    await sendAuthEmail(normalizedEmail, '✅ Verifica tu cuenta en FilamentOS', emailVerifyHtml(user.name ?? '', link));
  } catch (e) {
    console.error('[RESEND-VERIFY]', e);
  }
  res.json({ ok: true });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body as { email?: string };
  // Siempre 200 por seguridad (no revelar si existe)
  if (!email) { res.json({ ok: true }); return; }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(normalizedEmail) as (DbUser & { password_hash: string | null }) | undefined;

  if (user && user.password_hash) {
    // Invalidar tokens anteriores
    db.prepare("UPDATE email_tokens SET used=1 WHERE user_id=? AND type='reset'").run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(
      'INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), user.id, token, 'reset', Date.now() + 60 * 60 * 1000); // 1 hora

    const link = `${CLIENT_ORIGIN}/login?token=${token}&mode=reset`;
    try {
      await sendAuthEmail(normalizedEmail, '🔑 Restablecer contraseña — FilamentOS', emailResetHtml(link));
    } catch (e) {
      console.error('[FORGOT-PASSWORD]', e);
    }
  }
  res.json({ ok: true });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) { res.status(400).json({ error: 'Token y contraseña requeridos' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' }); return; }

  const row = db.prepare(
    "SELECT * FROM email_tokens WHERE token=? AND type='reset' AND used=0"
  ).get(token) as { id: string; user_id: string; expires_at: number } | undefined;

  if (!row) { res.status(400).json({ error: 'El enlace no es válido o ya fue usado.' }); return; }
  if (row.expires_at < Date.now()) { res.status(400).json({ error: 'El enlace ha caducado. Solicita uno nuevo.' }); return; }

  const newHash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash=?, email_verified=1 WHERE id=?').run(newHash, row.user_id);
  db.prepare('UPDATE email_tokens SET used=1 WHERE id=?').run(row.id);

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id) as DbUser;
  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: 'Contraseña actualizada pero error al iniciar sesión.' }); return; }
    res.json({ ok: true });
  });
});


if (process.env.NODE_ENV !== 'test') {
  // ── Frontend estático (producción) ───────────────────────────────────────────
  // En producción, Express sirve los archivos compilados del frontend (React/Vite).
  // Nginx proxy_pass envía todo a Express, así que necesitamos:
  //   1. Servir archivos estáticos del /frontend/dist
  //   2. Un catch-all SPA para que las rutas del frontend (calculadora, inventario, etc.) funcionen al recargar
  const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));

    app.get('*', (req, res) => {
      // No interceptar rutas de API ni uploads
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });

    console.log(`✓ Sirviendo frontend estático desde ${FRONTEND_DIST}`);
  } else {
    console.log(`ℹ Frontend dist no encontrado en ${FRONTEND_DIST} — solo modo API`);
  }

  void ensureInitialFilamentCatalogSeed().finally(() => {
    app.listen(PORT, () => {
      console.log(`✓ Servidor Express en http://localhost:${PORT}`);
    });
  });
}

export { app, db };

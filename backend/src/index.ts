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
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:9002';
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
    id        TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email     TEXT,
    name      TEXT,
    photo     TEXT
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
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
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

// filament_inventory: add spool_id to tracker_pieces for deduction tracking
if (!trackerPieceColumns.some((column) => column.name === 'spool_id')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN spool_id TEXT");
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

migrateLegacyDatabases();

interface DbUser {
  id: string;
  google_id: string;
  email: string | null;
  name: string | null;
  photo: string | null;
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
      callbackURL: `${CLIENT_ORIGIN}/api/auth/google/callback`,
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
  const user = db
    .prepare('SELECT id, email, name, photo FROM users WHERE id = ?')
    .get(id as string) as DbUser | undefined;
  done(null, user ?? false);
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
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_ORIGIN}?error=auth_failed`,
  }),
  (_req, res) => res.redirect(CLIENT_ORIGIN)
);

app.get('/api/auth/logout', (req, res) => {
  req.logout(() => res.redirect(CLIENT_ORIGIN));
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
  if (!req.isAuthenticated()) {
    // Endpoint de estado de sesión para el frontend:
    // devolvemos 200 con user null para evitar ruido de 401 esperado
    // cuando el usuario simplemente no inició sesión aún.
    res.json({ user: null });
    return;
  }
  res.json({ user: req.user });
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
      'INSERT INTO projects (id, user_id, job_name, data) VALUES (?, ?, ?, ?)'
    ).run(id, user.id, data.jobName || 'Sin nombre', JSON.stringify(data));

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

  const result = db.prepare(
    'UPDATE projects SET job_name = ?, data = ? WHERE id = ? AND user_id = ?'
  ).run(data.jobName || 'Sin nombre', JSON.stringify(data), req.params.id, user.id);

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

interface FilamentInput {
  spoolId?: string | null;
  colorHex: string; colorName: string; brand: string; material: string;
  grams: number;
}

app.get('/api/tracker/projects/:projectId/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare('SELECT * FROM tracker_pieces WHERE project_id=? AND user_id=? ORDER BY order_index ASC, created_at ASC')
    .all(req.params.projectId, user.id) as {
      id: string; project_id: string; order_index: number; label: string; name: string;
      time_text: string; gram_text: string; total_secs: number;
      total_grams: number; total_cost: number; time_lines: number;
      gram_lines: number; image_url: string | null; spool_id: string | null; created_at: string;
    }[];

  const pieces = rows.map((r) => ({
    id: r.id, projectId: r.project_id, orderIndex: r.order_index, label: r.label, name: r.name,
    timeText: r.time_text, gramText: r.gram_text,
    totalSecs: r.total_secs, totalGrams: r.total_grams, totalCost: r.total_cost,
    timeLines: r.time_lines, gramLines: r.gram_lines,
    imageUrl: r.image_url ?? null,
    spoolId: r.spool_id ?? null,
    filaments: [] as { id: string; pieceId: string; spoolId: string | null; colorHex: string; colorName: string; brand: string; material: string; grams: number }[],
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

  const { label, name, timeText = '', gramText = '', totalSecs = 0, timeLines = 0, gramLines = 0, imageUrl = null } = req.body;
  const rawFilaments: FilamentInput[] = Array.isArray(req.body.filaments) ? req.body.filaments : [];
  const legacyTotalGrams = parseFloat(req.body.totalGrams) || 0;
  const legacySpoolId: string | null = req.body.spoolId ?? null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let totalGrams = 0;
  let totalCost = 0;
  let spoolRemainingG: number | undefined;

  if (rawFilaments.length > 0) {
    // ── Multi-filament mode ────────────────────────────────────────────────────
    totalGrams = rawFilaments.reduce((s, f) => s + (parseFloat(String(f.grams)) || 0), 0);

    try {
      const txn = db.transaction(() => {
        let cost = 0;

        // Insert piece first (cost = 0, updated at end)
        db.prepare(
          'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText,
          gramText || String(totalGrams), totalSecs, totalGrams, 0, timeLines, gramLines, imageUrl, null);

        const insertF = db.prepare(
          'INSERT INTO tracker_piece_filaments (id, piece_id, spool_id, color_hex, color_name, brand, material, grams, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        );

        for (const f of rawFilaments) {
          const fg = parseFloat(String(f.grams)) || 0;
          if (f.spoolId) {
            const spool = db.prepare(
              "SELECT remaining_g, price, total_grams FROM filament_inventory WHERE id=? AND user_id=? AND status='active'"
            ).get(f.spoolId, user.id) as { remaining_g: number; price: number; total_grams: number } | undefined;

            if (spool) {
              const pricePerGram = spool.total_grams > 0 ? spool.price / spool.total_grams : project.price_per_kg / 1000;
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
              cost += fg * (project.price_per_kg / 1000);
            }
          } else {
            cost += fg * (project.price_per_kg / 1000);
          }
          insertF.run(crypto.randomUUID(), id, f.spoolId ?? null, f.colorHex || '#888888', f.colorName || '', f.brand || '', f.material || '', fg, now);
        }

        totalCost = parseFloat(cost.toFixed(4));
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
    totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000)).toFixed(4));

    if (legacySpoolId) {
      try {
        const txn = db.transaction(() => {
          db.prepare(
            'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, legacySpoolId);

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
        'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines, image_url, spool_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, null);
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

  const { label, name, timeText = '', gramText = '', totalSecs = 0, timeLines = 0, gramLines = 0, imageUrl = null } = req.body;
  const rawFilaments: FilamentInput[] = Array.isArray(req.body.filaments) ? req.body.filaments : [];
  const legacyTotalGrams = parseFloat(req.body.totalGrams) || 0;
  const now = new Date().toISOString();
  let totalGrams = 0;
  let totalCost = 0;

  if (rawFilaments.length > 0) {
    totalGrams = rawFilaments.reduce((s, f) => s + (parseFloat(String(f.grams)) || 0), 0);

    // Compute cost (no deduction on edit — only on create)
    let cost = 0;
    for (const f of rawFilaments) {
      const fg = parseFloat(String(f.grams)) || 0;
      if (f.spoolId) {
        const spool = db.prepare('SELECT price, total_grams FROM filament_inventory WHERE id=?')
          .get(f.spoolId) as { price: number; total_grams: number } | undefined;
        cost += spool && spool.total_grams > 0
          ? fg * (spool.price / spool.total_grams)
          : fg * (project.price_per_kg / 1000);
      } else {
        cost += fg * (project.price_per_kg / 1000);
      }
    }
    totalCost = parseFloat(cost.toFixed(4));

    try {
      db.transaction(() => {
        const r = db.prepare(
          'UPDATE tracker_pieces SET label=?, name=?, time_text=?, gram_text=?, total_secs=?, total_grams=?, total_cost=?, time_lines=?, gram_lines=?, image_url=?, spool_id=? WHERE id=? AND user_id=?'
        ).run(label, name, timeText, gramText || String(totalGrams), totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, null, req.params.id, user.id);
        if (r.changes === 0) throw new Error('PIECE_NOT_FOUND');

        db.prepare('DELETE FROM tracker_piece_filaments WHERE piece_id=?').run(req.params.id);

        const insertF = db.prepare(
          'INSERT INTO tracker_piece_filaments (id, piece_id, spool_id, color_hex, color_name, brand, material, grams, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        );
        for (const f of rawFilaments) {
          insertF.run(crypto.randomUUID(), req.params.id, f.spoolId ?? null, f.colorHex || '#888888', f.colorName || '', f.brand || '', f.material || '', parseFloat(String(f.grams)) || 0, now);
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
    totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000)).toFixed(4));
    const result = db.prepare(
      'UPDATE tracker_pieces SET label=?, name=?, time_text=?, gram_text=?, total_secs=?, total_grams=?, total_cost=?, time_lines=?, gram_lines=?, image_url=?, spool_id=? WHERE id=? AND user_id=?'
    ).run(label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, imageUrl, spoolId ?? null, req.params.id, user.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Pieza no encontrada.' }); return; }
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
  status: string;
  created_at: string;
  updated_at: string;
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
    status: r.status as 'active' | 'finished',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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
              <a href="https://calculadora3d.luprintech.com" style="color: #8b5cf6;">FilamentOS</a>
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
  granularity?: string;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(value);
}

// GET /api/stats
app.get('/api/stats', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const { from, to, projectId = 'all', granularity = 'month' } = req.query as StatsQuery;

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

  const fromDate = from ?? '1970-01-01';
  const toDate = to ?? new Date().toISOString().slice(0, 10);
  const toDateEnd = toDate + 'T23:59:59';

  // Summary query
  const summaryRow = db.prepare(`
    SELECT
      COUNT(*) AS totalPieces,
      COALESCE(SUM(total_grams), 0) AS totalGrams,
      COALESCE(SUM(total_cost), 0) AS totalCost,
      COALESCE(SUM(total_secs), 0) AS totalSecs
    FROM tracker_pieces
    WHERE user_id = ?
      AND created_at >= ?
      AND created_at <= ?
      AND (? = 'all' OR project_id = ?)
  `).get(user.id, fromDate, toDateEnd, projectId, projectId) as {
    totalPieces: number;
    totalGrams: number;
    totalCost: number;
    totalSecs: number;
  };

  // Project count (distinct projects in range)
  const projectCountRow = db.prepare(`
    SELECT COUNT(DISTINCT project_id) AS projectCount
    FROM tracker_pieces
    WHERE user_id = ?
      AND created_at >= ?
      AND created_at <= ?
      AND (? = 'all' OR project_id = ?)
  `).get(user.id, fromDate, toDateEnd, projectId, projectId) as { projectCount: number };

  const avgCostPerPiece = summaryRow.totalPieces > 0
    ? parseFloat((summaryRow.totalCost / summaryRow.totalPieces).toFixed(4))
    : 0;

  // Granularity format for strftime
  const strftimeFormat = granularity === 'day'
    ? '%Y-%m-%d'
    : granularity === 'week'
      ? '%Y-W%W'
      : '%Y-%m';

  // Time series query
  const timeSeries = db.prepare(`
    SELECT
      strftime('${strftimeFormat}', created_at) AS period,
      COUNT(*) AS pieces,
      COALESCE(SUM(total_grams), 0) AS grams,
      COALESCE(SUM(total_cost), 0) AS cost,
      COALESCE(SUM(total_secs), 0) AS secs
    FROM tracker_pieces
    WHERE user_id = ?
      AND created_at >= ?
      AND created_at <= ?
      AND (? = 'all' OR project_id = ?)
    GROUP BY period
    ORDER BY period ASC
  `).all(user.id, fromDate, toDateEnd, projectId, projectId) as Array<{
    period: string;
    pieces: number;
    grams: number;
    cost: number;
    secs: number;
  }>;

  // By-project query
  const byProject = db.prepare(`
    SELECT
      tp.project_id AS projectId,
      tpr.title AS title,
      COUNT(*) AS pieces,
      COALESCE(SUM(tp.total_grams), 0) AS grams,
      COALESCE(SUM(tp.total_cost), 0) AS cost,
      COALESCE(SUM(tp.total_secs), 0) AS secs
    FROM tracker_pieces tp
    LEFT JOIN tracker_projects tpr ON tpr.id = tp.project_id
    WHERE tp.user_id = ?
      AND tp.created_at >= ?
      AND tp.created_at <= ?
      AND (? = 'all' OR tp.project_id = ?)
    GROUP BY tp.project_id
    ORDER BY cost DESC
  `).all(user.id, fromDate, toDateEnd, projectId, projectId) as Array<{
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
    },
    timeSeries,
    byProject: byProject.map((r) => ({
      projectId: r.projectId,
      title: r.title ?? 'Unknown',
      pieces: r.pieces,
      grams: r.grams,
      cost: r.cost,
      secs: r.secs,
    })),
  });
});

// ── Analyze 3MF ──────────────────────────────────────────────────────────────
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
    res.json({ found: true, source: 'bambu' as const, data: { ...emptyData, ...bambuData } });
    return;
  }

  // 3. Not found (Spoolman DB doesn't index by EAN/QR code, users can contribute manually)
  res.json({ found: false, source: 'manual' as const, data: emptyData });
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
    marca || null, nombre || null, color || null, colorHex || null,
    material || null, diametro || null, peso || null,
    tempMin || null, tempMax || null, user.id,
  );

  res.json({ success: true });
});

// ── GET consumos por bobina ────────────────────────────────────────────────────
app.get('/api/inventory/:spoolId/consumos', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const spool = db
    .prepare('SELECT id FROM filament_inventory WHERE id = ? AND user_id = ?')
    .get(req.params.spoolId, user.id);
  if (!spool) { res.status(404).json({ error: 'Bobina no encontrada.' }); return; }

  const rows = db.prepare(`
    SELECT c.id, c.bobina_id, c.proyecto_id, c.gramos, c.fecha,
           p.job_name
    FROM consumos c
    LEFT JOIN projects p ON p.id = c.proyecto_id
    WHERE c.bobina_id = ?
    ORDER BY c.fecha DESC
    LIMIT 50
  `).all(req.params.spoolId) as Array<{ id: number; bobina_id: string; proyecto_id: string; gramos: number; fecha: string; job_name: string | null }>;

  res.json(rows);
});

// ── Producción ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../frontend/dist');

  // Assets con hash (Vite los genera inmutables): cacheables 1 año.
  // index.html y manifest.json: nunca cacheados para que el navegador
  // siempre reciba la versión actualizada tras un nuevo deploy.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (
          filePath.endsWith('index.html') ||
          filePath.endsWith('manifest.json')
        ) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // Fallback SPA — también sin caché para evitar servir HTML con hashes viejos.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`✓ Servidor Express en http://localhost:${PORT}`);
  });
}

export { app, db };

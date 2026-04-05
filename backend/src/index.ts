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

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:9002';
const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, '../../data.db');

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
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    sess       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

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
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
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

app.get('/api/auth/user', (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ user: null });
    return;
  }
  res.json({ user: req.user });
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
    created_at: row.created_at,
  }));

  res.json(projects);
});

app.post('/api/projects', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const data = req.body;
  const id = crypto.randomUUID();

  db.prepare(
    'INSERT INTO projects (id, user_id, job_name, data) VALUES (?, ?, ?, ?)'
  ).run(id, user.id, data.jobName || 'Sin nombre', JSON.stringify(data));

  res.json({ id });
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

app.get('/api/tracker/projects/:projectId/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  const rows = db
    .prepare('SELECT * FROM tracker_pieces WHERE project_id=? AND user_id=? ORDER BY order_index ASC, created_at ASC')
    .all(req.params.projectId, user.id) as {
      id: string; project_id: string; order_index: number; label: string; name: string;
      time_text: string; gram_text: string; total_secs: number;
      total_grams: number; total_cost: number; time_lines: number;
      gram_lines: number; created_at: string;
    }[];
  res.json(rows.map((r) => ({
    id: r.id, projectId: r.project_id, orderIndex: r.order_index, label: r.label, name: r.name,
    timeText: r.time_text, gramText: r.gram_text,
    totalSecs: r.total_secs, totalGrams: r.total_grams, totalCost: r.total_cost,
    timeLines: r.time_lines, gramLines: r.gram_lines,
  })));
});

app.post('/api/tracker/projects/:projectId/pieces', requireAuth, (req, res) => {
  const user = req.user as DbUser;
  // Verify project belongs to user
  const project = db
    .prepare('SELECT price_per_kg FROM tracker_projects WHERE id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { price_per_kg: number } | undefined;
  if (!project) { res.status(404).json({ error: 'Proyecto no encontrado.' }); return; }

  const nextOrder = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM tracker_pieces WHERE project_id=? AND user_id=?')
    .get(req.params.projectId, user.id) as { next_order: number };

  const { label, name, timeText='', gramText='', totalSecs=0, totalGrams=0, timeLines=0, gramLines=0 } = req.body;
  const totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000)).toFixed(4));
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO tracker_pieces (id, project_id, user_id, order_index, label, name, time_text, gram_text, total_secs, total_grams, total_cost, time_lines, gram_lines) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.params.projectId, user.id, nextOrder.next_order, label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines);
  res.json({ id, totalCost });
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

  const { label, name, timeText='', gramText='', totalSecs=0, totalGrams=0, timeLines=0, gramLines=0 } = req.body;
  const totalCost = parseFloat((totalGrams * (project.price_per_kg / 1000)).toFixed(4));
  const result = db.prepare(
    'UPDATE tracker_pieces SET label=?, name=?, time_text=?, gram_text=?, total_secs=?, total_grams=?, total_cost=?, time_lines=?, gram_lines=? WHERE id=? AND user_id=?'
  ).run(label, name, timeText, gramText, totalSecs, totalGrams, totalCost, timeLines, gramLines, req.params.id, user.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Pieza no encontrada.' }); return; }
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

// ── Producción ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`✓ Servidor Express en http://localhost:${PORT}`);
});

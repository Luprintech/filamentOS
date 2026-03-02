import express from 'express';
import cors from 'cors';
import multer from 'multer';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:9002';

// ── Base de datos SQLite ───────────────────────────────────────────────────────
const db = new Database(process.env.DB_PATH ?? path.join(process.cwd(), 'data.db'));

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
`);

interface DbUser {
  id: string;
  google_id: string;
  email: string | null;
  name: string | null;
  photo: string | null;
}

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
app.use(express.json({ limit: '10mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-cambia-en-produccion',
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

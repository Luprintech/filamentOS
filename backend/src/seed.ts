/**
 * ── Dev Seed Script ────────────────────────────────────────────────────────────
 * Popula la base de datos con datos de prueba realistas para desarrollo.
 *
 * Uso:
 *   cd backend && npm run seed
 *
 * Idempotente: se puede ejecutar varias veces sin duplicar datos.
 * El usuario de prueba se identifica por su google_id ficticio.
 *
 * IMPORTANTE: el servidor backend debe haberse iniciado al menos una vez antes
 * de ejecutar el seed, para que las migraciones de columnas se apliquen.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data.db');
console.log(`\n📦  Base de datos: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ── Ensure all tables exist (mirrors index.ts, all IF NOT EXISTS) ─────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, google_id TEXT UNIQUE NOT NULL,
    email TEXT, name TEXT, photo TEXT
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_name TEXT NOT NULL, data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    cover_image TEXT, goal INTEGER NOT NULL DEFAULT 30,
    price_per_kg REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracker_pieces (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES tracker_projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL, name TEXT NOT NULL,
    time_text TEXT NOT NULL DEFAULT '', gram_text TEXT NOT NULL DEFAULT '',
    total_secs INTEGER NOT NULL DEFAULT 0, total_grams REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0, time_lines INTEGER NOT NULL DEFAULT 0,
    gram_lines INTEGER NOT NULL DEFAULT 0, image_url TEXT, spool_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS filament_inventory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand TEXT NOT NULL, material TEXT NOT NULL, color TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#cccccc', total_grams REAL NOT NULL DEFAULT 0,
    remaining_g REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_custom_spool_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('brand', 'material')),
    value TEXT NOT NULL, UNIQUE(user_id, type, value)
  );
`);

// Ensure spool_id column exists in tracker_pieces (added via migration in index.ts)
const pieceColumns = db.prepare("PRAGMA table_info(tracker_pieces)").all() as { name: string }[];
if (!pieceColumns.some((c) => c.name === 'spool_id')) {
  db.exec("ALTER TABLE tracker_pieces ADD COLUMN spool_id TEXT");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
function isoNow(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}
function parseTime(str: string): number {
  const h = parseInt(str.match(/(\d+)\s*h/i)?.[1] ?? '0');
  const m = parseInt(str.match(/(\d+)\s*m/i)?.[1] ?? '0');
  return h * 3600 + m * 60;
}

// ── Test user ─────────────────────────────────────────────────────────────────
const SEED_GOOGLE_ID = 'dev_seed_user_luprintech_001';

interface DbUser { id: string; google_id: string; email: string | null; name: string | null; photo: string | null; }

let seedUser = db.prepare('SELECT * FROM users WHERE google_id = ?')
  .get(SEED_GOOGLE_ID) as DbUser | undefined;

if (!seedUser) {
  const newId = uid();
  db.prepare('INSERT INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)')
    .run(newId, SEED_GOOGLE_ID, 'dev@luprintech.com', 'Dev Luprintech', null);
  seedUser = db.prepare('SELECT * FROM users WHERE google_id = ?').get(SEED_GOOGLE_ID) as DbUser;
  console.log(`✅  Usuario de prueba creado: ${seedUser.id}`);
} else {
  console.log(`ℹ️   Usuario de prueba existente: ${seedUser.id}`);
}

const userId = seedUser.id;

// ── 1. CALCULADORA — 12 proyectos guardados ───────────────────────────────────
console.log('\n🧮  Insertando proyectos de calculadora...');

interface CalcProject {
  jobName: string;
  filamentType: string;
  filamentWeight: number;
  printingTimeHours: number;
  printingTimeMinutes: number;
  spoolPrice: number;
  spoolWeight: number;
  powerConsumptionWatts: number;
  energyCostKwh: number;
  prepTime: number;
  prepCostPerHour: number;
  postProcessingTimeInMinutes: number;
  postProcessingCostPerHour: number;
  includeMachineCosts: boolean;
  printerCost: number;
  investmentReturnYears: number;
  repairCost: number;
  otherCosts: { name: string; price: number }[];
  profitPercentage: number;
  vatPercentage: number;
  currency: string;
}

const calcProjects: CalcProject[] = [
  {
    jobName: 'Caballito de mar PLA',
    filamentType: 'PLA', filamentWeight: 45, printingTimeHours: 2, printingTimeMinutes: 30,
    spoolPrice: 22, spoolWeight: 1000, powerConsumptionWatts: 200, energyCostKwh: 0.18,
    prepTime: 10, prepCostPerHour: 15, postProcessingTimeInMinutes: 20, postProcessingCostPerHour: 12,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 30, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Funda iPhone 15 PETG',
    filamentType: 'PETG', filamentWeight: 38, printingTimeHours: 1, printingTimeMinutes: 45,
    spoolPrice: 26, spoolWeight: 1000, powerConsumptionWatts: 220, energyCostKwh: 0.18,
    prepTime: 5, prepCostPerHour: 15, postProcessingTimeInMinutes: 15, postProcessingCostPerHour: 12,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 35, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Engranaje industrial ASA',
    filamentType: 'ASA', filamentWeight: 120, printingTimeHours: 5, printingTimeMinutes: 20,
    spoolPrice: 28, spoolWeight: 1000, powerConsumptionWatts: 250, energyCostKwh: 0.18,
    prepTime: 15, prepCostPerHour: 18, postProcessingTimeInMinutes: 30, postProcessingCostPerHour: 15,
    includeMachineCosts: true, printerCost: 800, investmentReturnYears: 3, repairCost: 50,
    otherCosts: [{ name: 'Tornillos M3', price: 1.5 }], profitPercentage: 40, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Cubo anti-estrés ABS',
    filamentType: 'ABS', filamentWeight: 85, printingTimeHours: 3, printingTimeMinutes: 15,
    spoolPrice: 24, spoolWeight: 1000, powerConsumptionWatts: 230, energyCostKwh: 0.18,
    prepTime: 10, prepCostPerHour: 15, postProcessingTimeInMinutes: 45, postProcessingCostPerHour: 12,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 30, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Figura decorativa dragón PLA',
    filamentType: 'PLA', filamentWeight: 95, printingTimeHours: 4, printingTimeMinutes: 0,
    spoolPrice: 22, spoolWeight: 1000, powerConsumptionWatts: 200, energyCostKwh: 0.19,
    prepTime: 15, prepCostPerHour: 16, postProcessingTimeInMinutes: 60, postProcessingCostPerHour: 14,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [{ name: 'Pintura acrílica', price: 3 }], profitPercentage: 45, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Soporte doble monitor PETG',
    filamentType: 'PETG', filamentWeight: 200, printingTimeHours: 8, printingTimeMinutes: 30,
    spoolPrice: 26, spoolWeight: 1000, powerConsumptionWatts: 220, energyCostKwh: 0.19,
    prepTime: 20, prepCostPerHour: 18, postProcessingTimeInMinutes: 30, postProcessingCostPerHour: 15,
    includeMachineCosts: true, printerCost: 1200, investmentReturnYears: 4, repairCost: 80,
    otherCosts: [{ name: 'Insertos M4', price: 2.5 }, { name: 'Tornillos', price: 1 }],
    profitPercentage: 30, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Placa nombre escritorio PLA',
    filamentType: 'PLA', filamentWeight: 25, printingTimeHours: 1, printingTimeMinutes: 0,
    spoolPrice: 22, spoolWeight: 1000, powerConsumptionWatts: 200, energyCostKwh: 0.18,
    prepTime: 5, prepCostPerHour: 15, postProcessingTimeInMinutes: 10, postProcessingCostPerHour: 12,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 50, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Piñón repuesto impresora ASA',
    filamentType: 'ASA', filamentWeight: 30, printingTimeHours: 1, printingTimeMinutes: 30,
    spoolPrice: 28, spoolWeight: 1000, powerConsumptionWatts: 250, energyCostKwh: 0.18,
    prepTime: 8, prepCostPerHour: 20, postProcessingTimeInMinutes: 20, postProcessingCostPerHour: 18,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 55, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Porta herramientas taller PETG',
    filamentType: 'PETG', filamentWeight: 180, printingTimeHours: 7, printingTimeMinutes: 0,
    spoolPrice: 26, spoolWeight: 1000, powerConsumptionWatts: 220, energyCostKwh: 0.19,
    prepTime: 25, prepCostPerHour: 18, postProcessingTimeInMinutes: 40, postProcessingCostPerHour: 15,
    includeMachineCosts: true, printerCost: 900, investmentReturnYears: 3, repairCost: 60,
    otherCosts: [{ name: 'Magnetes N35', price: 4 }], profitPercentage: 35, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Carcasa controlador Arduino ABS',
    filamentType: 'ABS', filamentWeight: 110, printingTimeHours: 4, printingTimeMinutes: 30,
    spoolPrice: 24, spoolWeight: 1000, powerConsumptionWatts: 230, energyCostKwh: 0.18,
    prepTime: 12, prepCostPerHour: 20, postProcessingTimeInMinutes: 35, postProcessingCostPerHour: 18,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [{ name: 'Tornillos M2', price: 0.8 }], profitPercentage: 40, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Clip organizador cables PLA',
    filamentType: 'PLA', filamentWeight: 8, printingTimeHours: 0, printingTimeMinutes: 25,
    spoolPrice: 22, spoolWeight: 1000, powerConsumptionWatts: 200, energyCostKwh: 0.18,
    prepTime: 2, prepCostPerHour: 12, postProcessingTimeInMinutes: 5, postProcessingCostPerHour: 10,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [], profitPercentage: 60, vatPercentage: 21, currency: 'EUR',
  },
  {
    jobName: 'Miniatura D&D goblin PLA',
    filamentType: 'PLA', filamentWeight: 12, printingTimeHours: 1, printingTimeMinutes: 15,
    spoolPrice: 30, spoolWeight: 500, powerConsumptionWatts: 200, energyCostKwh: 0.19,
    prepTime: 10, prepCostPerHour: 15, postProcessingTimeInMinutes: 90, postProcessingCostPerHour: 12,
    includeMachineCosts: false, printerCost: 0, investmentReturnYears: 0, repairCost: 0,
    otherCosts: [{ name: 'Resina lijado', price: 0.5 }, { name: 'Pintura', price: 2 }],
    profitPercentage: 50, vatPercentage: 21, currency: 'EUR',
  },
];

const insertProject = db.prepare(
  'INSERT OR IGNORE INTO projects (id, user_id, job_name, data, created_at) VALUES (?, ?, ?, ?, ?)'
);

// Use a fixed UUID namespace for idempotency (deterministic IDs)
const existingProjects = db.prepare('SELECT job_name FROM projects WHERE user_id = ?')
  .all(userId) as { job_name: string }[];
const existingProjectNames = new Set(existingProjects.map((p) => p.job_name));

let insertedCalc = 0;
for (let i = 0; i < calcProjects.length; i++) {
  const p = calcProjects[i];
  if (existingProjectNames.has(p.jobName)) continue;
  insertProject.run(uid(), userId, p.jobName, JSON.stringify(p), isoNow(calcProjects.length - i));
  insertedCalc++;
}
console.log(`   → ${insertedCalc} proyectos nuevos (${calcProjects.length - insertedCalc} ya existían)`);

// ── 2. TRACKER — 5 series con 12 piezas cada una ─────────────────────────────
console.log('\n🎯  Insertando series del tracker...');

interface TrackerSeries {
  title: string;
  description: string;
  goal: number;
  pricePerKg: number;
  currency: string;
  pieces: { label: string; name: string; timeText: string; gramText: string }[];
}

const trackerSeries: TrackerSeries[] = [
  {
    title: 'Llaveros PLA Variados',
    description: 'Serie de llaveros personalizados en PLA de colores. Para venta en mercadillos.',
    goal: 30, pricePerKg: 22, currency: 'EUR',
    pieces: [
      { label: 'Día 1', name: 'Llavero corazón rojo',      timeText: '0h 35m', gramText: '8.2'  },
      { label: 'Día 2', name: 'Llavero estrella amarilla',  timeText: '0h 30m', gramText: '7.5'  },
      { label: 'Día 3', name: 'Llavero inicial "A"',        timeText: '0h 40m', gramText: '9.1'  },
      { label: 'Día 4', name: 'Llavero calavera',           timeText: '0h 45m', gramText: '10.3' },
      { label: 'Día 5', name: 'Llavero gato',               timeText: '0h 50m', gramText: '11.0' },
      { label: 'Día 6', name: 'Llavero escudo Zelda',       timeText: '0h 55m', gramText: '11.8' },
      { label: 'Día 7', name: 'Llavero inicial "M"',        timeText: '0h 38m', gramText: '8.9'  },
      { label: 'Día 8', name: 'Llavero pez koi',            timeText: '0h 42m', gramText: '9.5'  },
      { label: 'Día 9', name: 'Llavero mandala pequeño',    timeText: '0h 48m', gramText: '10.7' },
      { label: 'Día 10', name: 'Llavero dinosaurio',        timeText: '0h 44m', gramText: '9.8'  },
      { label: 'Día 11', name: 'Llavero cohete espacial',   timeText: '0h 36m', gramText: '8.4'  },
      { label: 'Día 12', name: 'Llavero hoja de otoño',     timeText: '0h 33m', gramText: '7.8'  },
    ],
  },
  {
    title: 'Miniaturas Dragones D&D',
    description: 'Figuras para juegos de rol. Alta resolución, PLA 0.1mm. Pintadas a mano.',
    goal: 20, pricePerKg: 30, currency: 'EUR',
    pieces: [
      { label: '#1',  name: 'Dragón adulto rojo',         timeText: '6h 20m', gramText: '42.5' },
      { label: '#2',  name: 'Dragón joven azul',          timeText: '3h 45m', gramText: '24.0' },
      { label: '#3',  name: 'Dragón bebé verde',          timeText: '1h 30m', gramText: '9.5'  },
      { label: '#4',  name: 'Wyvern oscuro',              timeText: '4h 10m', gramText: '28.0' },
      { label: '#5',  name: 'Dragón de agua (serpiente)', timeText: '5h 00m', gramText: '33.0' },
      { label: '#6',  name: 'Gólem de piedra',            timeText: '2h 50m', gramText: '18.5' },
      { label: '#7',  name: 'Lich rey',                   timeText: '3h 20m', gramText: '21.0' },
      { label: '#8',  name: 'Beholder',                   timeText: '3h 00m', gramText: '19.5' },
      { label: '#9',  name: 'Gnoll guerrero',             timeText: '1h 45m', gramText: '11.0' },
      { label: '#10', name: 'Orco chamán',                timeText: '2h 00m', gramText: '13.0' },
      { label: '#11', name: 'Elfo arquero',               timeText: '1h 50m', gramText: '11.5' },
      { label: '#12', name: 'Halfling pícaro',            timeText: '1h 35m', gramText: '10.0' },
    ],
  },
  {
    title: 'Cubos Anti-Estrés',
    description: 'Cubos impresos en PETG con piezas ensamblables. Varios colores.',
    goal: 50, pricePerKg: 26, currency: 'EUR',
    pieces: [
      { label: 'Lote A-1',  name: 'Cubo 6 caras lisonja blanco',   timeText: '3h 10m', gramText: '82.0' },
      { label: 'Lote A-2',  name: 'Cubo con botones azul',          timeText: '3h 30m', gramText: '86.0' },
      { label: 'Lote A-3',  name: 'Cubo con joystick negro',        timeText: '3h 45m', gramText: '90.0' },
      { label: 'Lote A-4',  name: 'Cubo con interruptor rojo',      timeText: '3h 20m', gramText: '83.5' },
      { label: 'Lote A-5',  name: 'Cubo giradedos amarillo',        timeText: '3h 15m', gramText: '84.0' },
      { label: 'Lote B-1',  name: 'Cubo premium bicolor',           timeText: '4h 00m', gramText: '95.0' },
      { label: 'Lote B-2',  name: 'Cubo miniatura llavero',         timeText: '1h 20m', gramText: '28.5' },
      { label: 'Lote B-3',  name: 'Cubo XL extragrande',            timeText: '5h 30m', gramText: '130.0'},
      { label: 'Lote B-4',  name: 'Cubo forma octogonal',           timeText: '3h 50m', gramText: '92.0' },
      { label: 'Lote B-5',  name: 'Cubo con rueda dentada',         timeText: '3h 40m', gramText: '89.5' },
      { label: 'Lote C-1',  name: 'Cubo clic-clac sonoro',          timeText: '3h 25m', gramText: '85.0' },
      { label: 'Lote C-2',  name: 'Cubo con laberinto interno',     timeText: '4h 15m', gramText: '100.0'},
    ],
  },
  {
    title: 'Repuestos Impresora Prusa',
    description: 'Piezas de repuesto funcionales en ASA/PETG para Prusa MK4 y XL.',
    goal: 25, pricePerKg: 28, currency: 'EUR',
    pieces: [
      { label: '001', name: 'Extrusor Bondtech izq.',     timeText: '2h 10m', gramText: '22.0' },
      { label: '002', name: 'Extrusor Bondtech der.',     timeText: '2h 10m', gramText: '22.0' },
      { label: '003', name: 'Soporte bobina superior',   timeText: '1h 45m', gramText: '32.0' },
      { label: '004', name: 'Cubierta electrónica',      timeText: '1h 20m', gramText: '18.5' },
      { label: '005', name: 'Fan duct hotend',           timeText: '0h 55m', gramText: '12.0' },
      { label: '006', name: 'Tensor correa Y',           timeText: '0h 40m', gramText: '8.5'  },
      { label: '007', name: 'Tensor correa X',           timeText: '0h 40m', gramText: '8.5'  },
      { label: '008', name: 'Soporte pantalla LCD',      timeText: '1h 05m', gramText: '15.0' },
      { label: '009', name: 'Cable chain 200mm',         timeText: '1h 30m', gramText: '26.0' },
      { label: '010', name: 'Pata niveladora x4',        timeText: '0h 50m', gramText: '20.0' },
      { label: '011', name: 'Guía filamento entrada',    timeText: '0h 25m', gramText: '5.5'  },
      { label: '012', name: 'Clip cama caliente x8',     timeText: '0h 45m', gramText: '10.0' },
    ],
  },
  {
    title: 'Organizadores Escritorio PLA',
    description: 'Set completo de organizadores modulares para escritorio gaming. Material PLA+.',
    goal: 15, pricePerKg: 24, currency: 'EUR',
    pieces: [
      { label: 'Base',    name: 'Base modular 200x200',        timeText: '4h 30m', gramText: '148.0' },
      { label: 'Módulo 1', name: 'Porta bolígrafos redondo',   timeText: '1h 20m', gramText: '38.5'  },
      { label: 'Módulo 2', name: 'Bandeja entrada correo',     timeText: '2h 15m', gramText: '68.0'  },
      { label: 'Módulo 3', name: 'Soporte tablet vertical',    timeText: '1h 50m', gramText: '55.0'  },
      { label: 'Módulo 4', name: 'Hueco tarjetas visita',      timeText: '0h 55m', gramText: '22.0'  },
      { label: 'Módulo 5', name: 'Porta clips y gomas',        timeText: '0h 50m', gramText: '20.0'  },
      { label: 'Módulo 6', name: 'Canaleta cables USB-C',      timeText: '1h 10m', gramText: '28.0'  },
      { label: 'Módulo 7', name: 'Soporte auriculares lateral', timeText: '1h 40m', gramText: '48.0' },
      { label: 'Módulo 8', name: 'Bandeja teclado elevada',    timeText: '3h 20m', gramText: '102.0' },
      { label: 'Extra 1', name: 'Cajón pequeño secreto',       timeText: '2h 00m', gramText: '62.0'  },
      { label: 'Extra 2', name: 'Panel lateral perforado',     timeText: '2h 45m', gramText: '84.0'  },
      { label: 'Extra 3', name: 'Etiqueta rotulada nombre',    timeText: '0h 30m', gramText: '7.5'   },
    ],
  },
];

const insertSeries = db.prepare(
  `INSERT OR IGNORE INTO tracker_projects (id, user_id, title, description, goal, price_per_kg, currency, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertPiece = db.prepare(
  `INSERT OR IGNORE INTO tracker_pieces
   (id, project_id, user_id, order_index, label, name, time_text, gram_text,
    total_secs, total_grams, total_cost, time_lines, gram_lines, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const existingSeries = db.prepare('SELECT title FROM tracker_projects WHERE user_id = ?')
  .all(userId) as { title: string }[];
const existingSeriesTitles = new Set(existingSeries.map((s) => s.title));

let insertedSeries = 0;
let insertedPieces = 0;

for (let si = 0; si < trackerSeries.length; si++) {
  const series = trackerSeries[si];
  if (existingSeriesTitles.has(series.title)) {
    console.log(`   → Serie ya existe: "${series.title}"`);
    continue;
  }

  const seriesId = uid();
  const seriesCreatedAt = isoNow(trackerSeries.length - si + 5);
  insertSeries.run(
    seriesId, userId, series.title, series.description,
    series.goal, series.pricePerKg, series.currency,
    seriesCreatedAt, seriesCreatedAt,
  );
  insertedSeries++;

  for (let pi = 0; pi < series.pieces.length; pi++) {
    const piece = series.pieces[pi];
    const totalSecs = parseTime(piece.timeText);
    const totalGrams = parseFloat(piece.gramText);
    const totalCost = parseFloat((totalGrams * (series.pricePerKg / 1000)).toFixed(4));
    insertPiece.run(
      uid(), seriesId, userId, pi,
      piece.label, piece.name, piece.timeText, piece.gramText,
      totalSecs, totalGrams, totalCost, 1, 1,
      isoNow(trackerSeries.length - si + 4 - Math.floor(pi / 2)),
    );
    insertedPieces++;
  }

  console.log(`   ✅  "${series.title}" — ${series.pieces.length} piezas`);
}
console.log(`   → ${insertedSeries} series nuevas, ${insertedPieces} piezas nuevas`);

// ── 3. INVENTARIO — 12 bobinas de todos los tipos ─────────────────────────────
console.log('\n🎣  Insertando bobinas de filamento...');

interface SpoolSeed {
  brand: string;
  material: string;
  color: string;
  colorHex: string;
  totalGrams: number;
  remainingG: number;
  price: number;
  notes: string;
  status: 'active' | 'finished';
}

const spools: SpoolSeed[] = [
  // PLA — 3 bobinas
  {
    brand: 'Bambu Lab', material: 'PLA', color: 'Blanco Nube', colorHex: '#F5F5F5',
    totalGrams: 1000, remainingG: 875, price: 22, notes: 'PLA Basic, ideal para miniaturas',
    status: 'active',
  },
  {
    brand: 'Bambu Lab', material: 'PLA', color: 'Negro Azabache', colorHex: '#1A1A1A',
    totalGrams: 1000, remainingG: 420, price: 22, notes: 'Casi la mitad usada',
    status: 'active',
  },
  {
    brand: 'Polymaker', material: 'PLA', color: 'Rojo Carmesí', colorHex: '#DC143C',
    totalGrams: 1000, remainingG: 1000, price: 24, notes: 'Sin abrir, stock nuevo',
    status: 'active',
  },
  // PETG — 2 bobinas
  {
    brand: 'Hatchbox', material: 'PETG', color: 'Transparente', colorHex: '#E8F4F8',
    totalGrams: 1000, remainingG: 650, price: 25, notes: 'Muy buena transparencia',
    status: 'active',
  },
  {
    brand: 'Polymaker', material: 'PETG', color: 'Azul Eléctrico', colorHex: '#0066CC',
    totalGrams: 1000, remainingG: 200, price: 26, notes: 'Stock bajo, pedir pronto',
    status: 'active',
  },
  // ASA — 2 bobinas
  {
    brand: 'eSUN', material: 'ASA', color: 'Gris Pizarra', colorHex: '#708090',
    totalGrams: 1000, remainingG: 780, price: 28, notes: 'Para piezas de exterior',
    status: 'active',
  },
  {
    brand: 'eSUN', material: 'ASA', color: 'Blanco RAL9003', colorHex: '#F4F4F4',
    totalGrams: 1000, remainingG: 560, price: 28, notes: 'Resistente a UV',
    status: 'active',
  },
  // ABS — 2 bobinas
  {
    brand: 'Fillamentum', material: 'ABS', color: 'Negro Neutro', colorHex: '#222222',
    totalGrams: 750, remainingG: 390, price: 22, notes: 'Para carcasas electrónicas',
    status: 'active',
  },
  {
    brand: 'Prusament', material: 'ABS', color: 'Amarillo Galaxia', colorHex: '#FFD700',
    totalGrams: 1000, remainingG: 1000, price: 29, notes: 'Nuevo, pendiente de probar',
    status: 'active',
  },
  // TPU — 1 bobina
  {
    brand: 'Polymaker', material: 'TPU', color: 'Naranja Vibrante', colorHex: '#FF6600',
    totalGrams: 500, remainingG: 320, price: 28, notes: 'Shore 95A, fundas y juntas',
    status: 'active',
  },
  // Nylon — 1 bobina
  {
    brand: 'Taulman', material: 'Nylon', color: 'Natural Traslúcido', colorHex: '#F0EAD6',
    totalGrams: 450, remainingG: 450, price: 38, notes: 'PA12, alta resistencia mecánica',
    status: 'active',
  },
  // Bobina terminada (para probar el estado "finished")
  {
    brand: 'Generic', material: 'PLA', color: 'Verde Lima', colorHex: '#7CFC00',
    totalGrams: 1000, remainingG: 0, price: 15, notes: 'Agotada, reemplazar',
    status: 'finished',
  },
];

const insertSpool = db.prepare(
  `INSERT OR IGNORE INTO filament_inventory
   (id, user_id, brand, material, color, color_hex, total_grams, remaining_g, price, notes, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// Idempotency: check existing spools by brand+material+color
const existingSpools = db.prepare('SELECT brand, material, color FROM filament_inventory WHERE user_id = ?')
  .all(userId) as { brand: string; material: string; color: string }[];
const existingSpoolKeys = new Set(existingSpools.map((s) => `${s.brand}|${s.material}|${s.color}`));

let insertedSpools = 0;
for (let i = 0; i < spools.length; i++) {
  const s = spools[i];
  const key = `${s.brand}|${s.material}|${s.color}`;
  if (existingSpoolKeys.has(key)) continue;
  const ts = isoNow(spools.length - i);
  insertSpool.run(
    uid(), userId, s.brand, s.material, s.color, s.colorHex,
    s.totalGrams, s.remainingG, s.price, s.notes, s.status, ts, ts,
  );
  insertedSpools++;
}
console.log(`   → ${insertedSpools} bobinas nuevas (${spools.length - insertedSpools} ya existían)`);

// ── Resumen ───────────────────────────────────────────────────────────────────
const totals = {
  projects: (db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').get(userId) as { c: number }).c,
  series:   (db.prepare('SELECT COUNT(*) as c FROM tracker_projects WHERE user_id = ?').get(userId) as { c: number }).c,
  pieces:   (db.prepare('SELECT COUNT(*) as c FROM tracker_pieces WHERE user_id = ?').get(userId) as { c: number }).c,
  spools:   (db.prepare('SELECT COUNT(*) as c FROM filament_inventory WHERE user_id = ?').get(userId) as { c: number }).c,
};

console.log('\n─────────────────────────────────────────────');
console.log('✅  Seed completado. Estado de la base de datos:');
console.log(`   🧮  Proyectos calculadora : ${totals.projects}`);
console.log(`   🎯  Series tracker        : ${totals.series}  (con ${totals.pieces} piezas)`);
console.log(`   🎣  Bobinas inventario    : ${totals.spools}`);
console.log('─────────────────────────────────────────────');
console.log('\n🔑  Para iniciar sesión con el usuario de prueba, abre la app y');
console.log('    usa el endpoint de desarrollo:');
console.log(`    POST http://localhost:3001/api/dev/login-seed\n`);

db.close();

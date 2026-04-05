import type { FilamentProject, FilamentPiece, ProjectStats } from './filament-types';

export const STORAGE_PROJECTS_KEY = 'luprintech-tracker-projects';
export const STORAGE_PIECES_KEY   = 'luprintech-tracker-pieces';
export const STORAGE_ACTIVE_KEY   = 'luprintech-tracker-active';

// ── Parsing ────────────────────────────────────────────────────────────────────

export function parseTimeToSeconds(line: string): number | null {
  const clean = line.trim();
  if (!clean) return null;
  if (!/(\d+\s*[hms])/i.test(clean)) return null;

  const h = clean.match(/(\d+)\s*h/i);
  const m = clean.match(/(\d+)\s*m/i);
  const s = clean.match(/(\d+)\s*s/i);

  const total =
    (h ? parseInt(h[1], 10) : 0) * 3600 +
    (m ? parseInt(m[1], 10) : 0) * 60 +
    (s ? parseInt(s[1], 10) : 0);

  return total > 0 ? total : null;
}

export function secsToString(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h}h ${m}m ${s}s`;
}

export interface ParsedTime  { totalSecs: number;  validLines: number }
export interface ParsedGrams { totalGrams: number; validLines: number }

export function parseTimeBlock(text: string): ParsedTime {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let totalSecs = 0, validLines = 0;
  for (const line of lines) {
    const secs = parseTimeToSeconds(line);
    if (secs !== null) { totalSecs += secs; validLines++; }
  }
  return { totalSecs, validLines };
}

export function parseGramBlock(text: string): ParsedGrams {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let totalGrams = 0, validLines = 0;
  for (const line of lines) {
    const num = parseFloat(line.replace(',', '.'));
    if (!Number.isNaN(num) && num >= 0) { totalGrams += num; validLines++; }
  }
  return { totalGrams, validLines };
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function computeProjectStats(
  pieces: FilamentPiece[],
  project: FilamentProject
): ProjectStats {
  const totalPieces = pieces.length;
  const totalSecs   = pieces.reduce((a, p) => a + p.totalSecs, 0);
  const totalGrams  = pieces.reduce((a, p) => a + p.totalGrams, 0);
  const totalCost   = pieces.reduce((a, p) => a + p.totalCost, 0);
  const progressPct = project.goal > 0
    ? Math.min(Math.round((totalPieces / project.goal) * 100), 100)
    : 0;
  return { totalPieces, totalSecs, totalGrams, totalCost, progressPct };
}

// ── Persistence ────────────────────────────────────────────────────────────────

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadProjects(): FilamentProject[] {
  return safeParse<FilamentProject[]>(STORAGE_PROJECTS_KEY, []);
}

export function saveProjects(projects: FilamentProject[]): void {
  localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects));
}

export function loadAllPieces(): FilamentPiece[] {
  return safeParse<FilamentPiece[]>(STORAGE_PIECES_KEY, []);
}

export function saveAllPieces(pieces: FilamentPiece[]): void {
  localStorage.setItem(STORAGE_PIECES_KEY, JSON.stringify(pieces));
}

export function loadActiveProjectId(): string | null {
  return localStorage.getItem(STORAGE_ACTIVE_KEY);
}

export function saveActiveProjectId(id: string | null): void {
  if (id === null) localStorage.removeItem(STORAGE_ACTIVE_KEY);
  else localStorage.setItem(STORAGE_ACTIVE_KEY, id);
}

// ── Currency formatting ────────────────────────────────────────────────────────

export function formatCost(amount: number, currency: string): string {
  // Try native Intl formatting, fall back to manual
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

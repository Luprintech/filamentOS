// ── Proyecto ────────────────────────────────────────────────────────────────────
export interface FilamentProject {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  /** Total pieces goal (e.g. 30, 100, or any number) */
  goal: number;
  /** Price per kilogram in the chosen currency */
  pricePerKg: number;
  currency: string;
  totalPieces: number;
  totalSecs: number;
  totalGrams: number;
  totalCost: number;
  createdAt: string;
  /** ISO timestamp of last modification */
  updatedAt: string;
}

// ── Pieza ───────────────────────────────────────────────────────────────────────
export interface FilamentPiece {
  id: string;
  projectId: string;
  orderIndex: number;
  /** Free label — can be a day number, a name, anything */
  label: string;
  name: string;
  /** Raw textarea content — one time-string per line */
  timeText: string;
  /** Raw textarea content — one gram-number per line */
  gramText: string;
  totalSecs: number;
  totalGrams: number;
  /** Computed: totalGrams * (project.pricePerKg / 1000) — stored for fast reads */
  totalCost: number;
  timeLines: number;
  gramLines: number;
}

// ── Stats ────────────────────────────────────────────────────────────────────────
export interface ProjectStats {
  totalPieces: number;
  totalSecs: number;
  totalGrams: number;
  totalCost: number;
  progressPct: number;
}

// ── UI state ─────────────────────────────────────────────────────────────────────
export type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; id: string };

export type TrackerView =
  | 'manager'      // lista de proyectos
  | 'project';     // dentro de un proyecto concreto

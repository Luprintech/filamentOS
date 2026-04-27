// ── Proyecto ────────────────────────────────────────────────────────────────────
export interface FilamentProject {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  /** Total pieces goal (e.g. 30, 100, or any number) */
  goal: number;
  /** Price per kilogram in the chosen currency (fallback when no spool price available) */
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

// ── Filamento por pieza ──────────────────────────────────────────────────────────
export interface PieceFilament {
  id: string;
  pieceId: string;
  /** ID de la bobina del inventario (null si es entrada manual) */
  spoolId: string | null;
  colorHex: string;
  colorName: string;
  brand: string;
  material: string;
  grams: number;
}

export interface PieceFilamentInput {
  spoolId?: string | null;
  colorHex: string;
  colorName: string;
  brand: string;
  material: string;
  grams: number;
  spoolPrice?: number;
}

export interface PieceMaterial {
  id: string;
  pieceId: string;
  name: string;
  quantity: number;
  cost: number;
}

export interface PieceMaterialInput {
  name: string;
  quantity: number;
  cost: number;
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
  /** Raw textarea content — kept for legacy display */
  gramText: string;
  totalSecs: number;
  totalGrams: number;
  /** Computed: sum of per-filament costs — stored for fast reads */
  totalCost: number;
  timeLines: number;
  gramLines: number;
  /** Data URL (base64) de la imagen de la pieza, o null si no tiene */
  imageUrl: string | null;
  notes: string;
  status: 'pending' | 'printed' | 'post_processed' | 'delivered' | 'failed';
  printedAt: string | null;
  incident: string;
  /** ID de la bobina de inventario usada (legacy — usar filaments en su lugar) */
  spoolId?: string | null;
  /** Filamentos multicolor — vacío en piezas legacy */
  filaments: PieceFilament[];
  materials: PieceMaterial[];
  /** Number of plates used for this piece (default: 1) */
  plate_count: number;
  /** Link to the 3MF or STL file (optional) */
  file_link: string | null;
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

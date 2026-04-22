// ── Stats Types ───────────────────────────────────────────────────────────────

export type Granularity = 'day' | 'week' | 'month';

export type DatePreset = 'today' | 'last7' | 'last30' | 'thisYear' | 'all';

export interface StatsFilters {
  from: string;       // ISO date string YYYY-MM-DD
  to: string;         // ISO date string YYYY-MM-DD
  projectId: string;  // 'all' or a project UUID
  granularity: Granularity;
  preset: DatePreset | 'custom';
}

export interface StatsSummary {
  totalPieces: number;
  totalGrams: number;
  totalCost: number;
  totalSecs: number;
  avgCostPerPiece: number;
  projectCount: number;
}

export interface StatsTimePoint {
  period: string;  // 'YYYY-MM-DD' | 'YYYY-WNN' | 'YYYY-MM'
  pieces: number;
  grams: number;
  cost: number;
  secs: number;
}

export interface StatsProjectRow {
  projectId: string;
  title: string;
  pieces: number;
  grams: number;
  cost: number;
  secs: number;
}

export interface StatsResponse {
  summary: StatsSummary;
  timeSeries: StatsTimePoint[];
  byProject: StatsProjectRow[];
}

/** Row shape used when building a CSV export */
export interface StatsExportRow {
  period: string;
  pieces: number;
  grams: number;
  kg: number;
  cost: number;
  hours: number;
}

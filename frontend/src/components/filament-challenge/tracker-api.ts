import type { FilamentProject, FilamentPiece } from './filament-types';
import type { ProjectInput, PieceInput } from './use-filament-storage';
import { parseTimeBlock, parseGramBlock } from './filament-storage';

// ── helpers ───────────────────────────────────────────────────────────────────

export type TrackerApiErrorKind = 'auth' | 'runtime-mismatch' | 'not-found' | 'unknown';

export class TrackerApiError extends Error {
  status: number;
  kind: TrackerApiErrorKind;

  constructor(message: string, status: number, kind: TrackerApiErrorKind) {
    super(message);
    this.name = 'TrackerApiError';
    this.status = status;
    this.kind = kind;
  }
}

function classifyError(status: number, url: string): TrackerApiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404 && url === '/api/tracker/projects') return 'runtime-mismatch';
  if (status === 404) return 'not-found';
  return 'unknown';
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new TrackerApiError(
      body.error ?? `HTTP ${res.status}`,
      res.status,
      classifyError(res.status, url),
    );
  }
  return res.json() as Promise<T>;
}

function json(init: Omit<RequestInit, 'body'>, body: unknown): RequestInit {
  return { ...init, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function apiGetProjects(): Promise<FilamentProject[]> {
  return apiFetch<FilamentProject[]>('/api/tracker/projects');
}

export async function apiCreateProject(input: ProjectInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    '/api/tracker/projects',
    json({ method: 'POST' }, input),
  );
}

export async function apiUpdateProject(id: string, input: ProjectInput): Promise<void> {
  await apiFetch<unknown>(`/api/tracker/projects/${id}`, json({ method: 'PUT' }, input));
}

export async function apiDeleteProject(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/tracker/projects/${id}`, { method: 'DELETE' });
}

// ── Pieces ────────────────────────────────────────────────────────────────────

export async function apiGetPieces(projectId: string): Promise<FilamentPiece[]> {
  return apiFetch<FilamentPiece[]>(`/api/tracker/projects/${projectId}/pieces`);
}

export async function apiCreatePiece(
  projectId: string,
  input: PieceInput,
): Promise<{ id: string; totalCost: number }> {
  const time  = parseTimeBlock(input.timeText);
  const grams = parseGramBlock(input.gramText);
  return apiFetch<{ id: string; totalCost: number }>(
    `/api/tracker/projects/${projectId}/pieces`,
    json({ method: 'POST' }, {
      ...input,
      totalSecs:  time.totalSecs,
      totalGrams: grams.totalGrams,
      timeLines:  time.validLines,
      gramLines:  grams.validLines,
    }),
  );
}

export async function apiUpdatePiece(
  projectId: string,
  pieceId: string,
  input: PieceInput,
): Promise<{ totalCost: number }> {
  const time  = parseTimeBlock(input.timeText);
  const grams = parseGramBlock(input.gramText);
  return apiFetch<{ totalCost: number }>(
    `/api/tracker/projects/${projectId}/pieces/${pieceId}`,
    json({ method: 'PUT' }, {
      ...input,
      totalSecs:  time.totalSecs,
      totalGrams: grams.totalGrams,
      timeLines:  time.validLines,
      gramLines:  grams.validLines,
    }),
  );
}

export async function apiDeletePiece(projectId: string, pieceId: string): Promise<void> {
  await apiFetch<unknown>(`/api/tracker/projects/${projectId}/pieces/${pieceId}`, { method: 'DELETE' });
}

export async function apiReorderPieces(projectId: string, orderedIds: string[]): Promise<void> {
  await apiFetch<unknown>(
    `/api/tracker/projects/${projectId}/pieces/reorder`,
    json({ method: 'POST' }, { orderedIds }),
  );
}

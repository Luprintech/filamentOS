import type { FilamentProject, FilamentPiece } from './filament-types';
import type { ProjectInput, PieceInput } from './use-filament-storage';
import { parseTimeBlock, parseGramBlock } from './filament-storage';
import { HttpClientError, httpRequest, jsonRequest } from '@/shared/api/http-client';

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
  try {
    return await httpRequest<T>({ url, init });
  } catch (error) {
    if (error instanceof HttpClientError) {
      throw new TrackerApiError(
        error.message,
        error.status,
        classifyError(error.status, url),
      );
    }
    throw error;
  }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function apiGetProjects(): Promise<FilamentProject[]> {
  return apiFetch<FilamentProject[]>('/api/tracker/projects');
}

export async function apiCreateProject(input: ProjectInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    '/api/tracker/projects',
    jsonRequest('POST', input),
  );
}

export async function apiUpdateProject(id: string, input: ProjectInput): Promise<void> {
  await apiFetch<unknown>(`/api/tracker/projects/${id}`, jsonRequest('PUT', input));
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
): Promise<{ id: string; totalCost: number; spoolRemainingG?: number }> {
  const time  = parseTimeBlock(input.timeText);
  const grams = parseGramBlock(input.gramText);

  const payload: Record<string, unknown> = {
    ...input,
    totalSecs:  time.totalSecs,
    totalGrams: grams.totalGrams,
    timeLines:  time.validLines,
    gramLines:  grams.validLines,
    imageUrl:   input.imageUrl ?? null,
  };

  // If multi-filament, omit legacy spoolId
  if (input.filaments && input.filaments.length > 0) {
    delete payload.spoolId;
    payload.filaments = input.filaments;
  } else {
    payload.spoolId = input.spoolId ?? null;
    delete payload.filaments;
  }

  return apiFetch<{ id: string; totalCost: number; spoolRemainingG?: number }>(
    `/api/tracker/projects/${projectId}/pieces`,
    jsonRequest('POST', payload),
  );
}

export async function apiUpdatePiece(
  projectId: string,
  pieceId: string,
  input: PieceInput,
): Promise<{ totalCost: number }> {
  const time  = parseTimeBlock(input.timeText);
  const grams = parseGramBlock(input.gramText);

  const payload: Record<string, unknown> = {
    ...input,
    totalSecs:  time.totalSecs,
    totalGrams: grams.totalGrams,
    timeLines:  time.validLines,
    gramLines:  grams.validLines,
    imageUrl:   input.imageUrl ?? null,
  };

  if (input.filaments && input.filaments.length > 0) {
    delete payload.spoolId;
    payload.filaments = input.filaments;
  } else {
    payload.spoolId = input.spoolId ?? null;
    delete payload.filaments;
  }

  return apiFetch<{ totalCost: number }>(
    `/api/tracker/projects/${projectId}/pieces/${pieceId}`,
    jsonRequest('PUT', payload),
  );
}

export async function apiDeletePiece(projectId: string, pieceId: string): Promise<void> {
  await apiFetch<unknown>(`/api/tracker/projects/${projectId}/pieces/${pieceId}`, { method: 'DELETE' });
}

export async function apiReorderPieces(projectId: string, orderedIds: string[]): Promise<void> {
  await apiFetch<unknown>(
    `/api/tracker/projects/${projectId}/pieces/reorder`,
    jsonRequest('POST', { orderedIds }),
  );
}

import { httpRequest, jsonRequest, HttpClientError } from '@/shared/api/http-client';
import type { Spool, SpoolInput } from '../types';

// ── Error ──────────────────────────────────────────────────────────────────────

export class InventoryApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'InventoryApiError';
    this.status = status;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await httpRequest<T>({ url, init });
  } catch (error) {
    if (error instanceof HttpClientError) {
      throw new InventoryApiError(error.message, error.status);
    }
    throw error;
  }
}

// ── Spools ─────────────────────────────────────────────────────────────────────

export async function apiGetSpools(): Promise<Spool[]> {
  return apiFetch<Spool[]>('/api/inventory/spools');
}

export async function apiCreateSpool(input: SpoolInput): Promise<Spool> {
  return apiFetch<Spool>('/api/inventory/spools', jsonRequest('POST', input));
}

export async function apiUpdateSpool(id: string, input: SpoolInput): Promise<Spool> {
  return apiFetch<Spool>(`/api/inventory/spools/${id}`, jsonRequest('PUT', input));
}

export async function apiDeleteSpool(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/inventory/spools/${id}`, { method: 'DELETE' });
}

export async function apiDeductSpool(
  id: string,
  grams: number,
): Promise<{ remainingG: number; status: string }> {
  return apiFetch<{ remainingG: number; status: string }>(
    `/api/inventory/spools/${id}/deduct`,
    jsonRequest('PATCH', { grams }),
  );
}

export async function apiFinishSpool(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/inventory/spools/${id}/finish`, { method: 'PATCH' });
}

// ── Custom options ─────────────────────────────────────────────────────────────

export async function apiGetCustomOptions(): Promise<{ brands: string[]; materials: string[] }> {
  return apiFetch<{ brands: string[]; materials: string[] }>('/api/inventory/custom-options');
}

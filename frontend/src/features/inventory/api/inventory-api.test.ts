import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClientError } from '@/shared/api/http-client';

// Mock http-client BEFORE imports that use it
vi.mock('@/shared/api/http-client', () => ({
  httpRequest: vi.fn(),
  jsonRequest: vi.fn((method: string, body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })),
  HttpClientError: class HttpClientError extends Error {
    status: number;
    url: string;
    body: unknown;
    constructor(message: string, status: number, url: string, body: unknown) {
      super(message);
      this.name = 'HttpClientError';
      this.status = status;
      this.url = url;
      this.body = body;
    }
  },
}));

import { httpRequest, jsonRequest } from '@/shared/api/http-client';
import {
  apiGetSpools,
  apiCreateSpool,
  apiUpdateSpool,
  apiDeleteSpool,
  apiDeductSpool,
  apiFinishSpool,
  apiGetCustomOptions,
  InventoryApiError,
} from './inventory-api';
import type { Spool, SpoolInput } from '../types';

const mockedHttpRequest = vi.mocked(httpRequest);
const mockedJsonRequest = vi.mocked(jsonRequest);

const mockSpool: Spool = {
  id: 'spool-1',
  brand: 'Bambu',
  material: 'PLA',
  color: 'Blanco',
  colorHex: '#FFFFFF',
  totalGrams: 1000,
  remainingG: 800,
  price: 20,
  notes: '',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockInput: SpoolInput = {
  brand: 'Bambu',
  material: 'PLA',
  color: 'Blanco',
  colorHex: '#FFFFFF',
  totalGrams: 1000,
  remainingG: 1000,
  price: 20,
  notes: '',
};

describe('inventory-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── apiGetSpools ──────────────────────────────────────────────────────────

  it('apiGetSpools llama GET /api/inventory/spools', async () => {
    mockedHttpRequest.mockResolvedValue([mockSpool] as never);

    const result = await apiGetSpools();

    expect(mockedHttpRequest).toHaveBeenCalledWith({ url: '/api/inventory/spools' });
    expect(result).toEqual([mockSpool]);
  });

  it('apiGetSpools lanza InventoryApiError cuando httpRequest lanza HttpClientError', async () => {
    const httpError = new HttpClientError('Unauthorized', 401, '/api/inventory/spools', null);
    mockedHttpRequest.mockRejectedValue(httpError);

    await expect(apiGetSpools()).rejects.toBeInstanceOf(InventoryApiError);
  });

  // ── apiCreateSpool ────────────────────────────────────────────────────────

  it('apiCreateSpool llama POST /api/inventory/spools con los datos correctos', async () => {
    mockedHttpRequest.mockResolvedValue(mockSpool as never);

    const result = await apiCreateSpool(mockInput);

    expect(mockedJsonRequest).toHaveBeenCalledWith('POST', mockInput);
    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/inventory/spools',
      init: expect.objectContaining({ method: 'POST' }),
    });
    expect(result).toEqual(mockSpool);
  });

  // ── apiUpdateSpool ────────────────────────────────────────────────────────

  it('apiUpdateSpool llama PUT /api/inventory/spools/:id', async () => {
    const updated = { ...mockSpool, color: 'Negro' };
    mockedHttpRequest.mockResolvedValue(updated as never);

    const result = await apiUpdateSpool('spool-1', { ...mockInput, color: 'Negro' });

    expect(mockedJsonRequest).toHaveBeenCalledWith('PUT', expect.objectContaining({ color: 'Negro' }));
    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/inventory/spools/spool-1',
      init: expect.objectContaining({ method: 'PUT' }),
    });
    expect(result).toEqual(updated);
  });

  // ── apiDeleteSpool ────────────────────────────────────────────────────────

  it('apiDeleteSpool llama DELETE /api/inventory/spools/:id', async () => {
    mockedHttpRequest.mockResolvedValue(undefined as never);

    await apiDeleteSpool('spool-1');

    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/inventory/spools/spool-1',
      init: { method: 'DELETE' },
    });
  });

  // ── apiDeductSpool ────────────────────────────────────────────────────────

  it('apiDeductSpool llama PATCH /api/inventory/spools/:id/deduct con grams', async () => {
    mockedHttpRequest.mockResolvedValue({ remainingG: 750, status: 'active' } as never);

    const result = await apiDeductSpool('spool-1', 50);

    expect(mockedJsonRequest).toHaveBeenCalledWith('PATCH', { grams: 50 });
    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/inventory/spools/spool-1/deduct',
      init: expect.objectContaining({ method: 'PATCH' }),
    });
    expect(result).toEqual({ remainingG: 750, status: 'active' });
  });

  // ── apiFinishSpool ────────────────────────────────────────────────────────

  it('apiFinishSpool llama PATCH /api/inventory/spools/:id/finish', async () => {
    mockedHttpRequest.mockResolvedValue(undefined as never);

    await apiFinishSpool('spool-1');

    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/inventory/spools/spool-1/finish',
      init: { method: 'PATCH' },
    });
  });

  // ── apiGetCustomOptions ───────────────────────────────────────────────────

  it('apiGetCustomOptions devuelve marcas y materiales custom', async () => {
    const options = { brands: ['Bambu', 'Prusament'], materials: ['PLA', 'PETG'] };
    mockedHttpRequest.mockResolvedValue(options as never);

    const result = await apiGetCustomOptions();

    expect(mockedHttpRequest).toHaveBeenCalledWith({ url: '/api/inventory/custom-options' });
    expect(result).toEqual(options);
  });

  // ── InventoryApiError wrapping ────────────────────────────────────────────

  it('lanza InventoryApiError con el status code correcto', async () => {
    const httpError = new HttpClientError('Not Found', 404, '/api/inventory/spools/x', null);
    mockedHttpRequest.mockRejectedValue(httpError);

    try {
      await apiGetSpools();
      expect.fail('Debería haber lanzado');
    } catch (e) {
      expect(e).toBeInstanceOf(InventoryApiError);
      expect((e as InventoryApiError).status).toBe(404);
      expect((e as InventoryApiError).message).toBe('Not Found');
    }
  });
});

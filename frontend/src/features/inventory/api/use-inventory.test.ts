import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Spool } from '../types';

// Mock inventory-api
vi.mock('./inventory-api', () => ({
  apiGetSpools: vi.fn(),
  apiCreateSpool: vi.fn(),
  apiUpdateSpool: vi.fn(),
  apiDeleteSpool: vi.fn(),
  apiDeductSpool: vi.fn(),
  apiFinishSpool: vi.fn(),
  apiGetCustomOptions: vi.fn(),
  InventoryApiError: class InventoryApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'InventoryApiError';
      this.status = status;
    }
  },
}));

import {
  apiGetSpools,
  apiCreateSpool,
  apiDeleteSpool,
  apiDeductSpool,
  apiFinishSpool,
  apiGetCustomOptions,
} from './inventory-api';
import { useInventory } from './use-inventory';

const mockGetSpools = vi.mocked(apiGetSpools);
const mockCreateSpool = vi.mocked(apiCreateSpool);
const mockDeleteSpool = vi.mocked(apiDeleteSpool);
const mockDeductSpool = vi.mocked(apiDeductSpool);
const mockFinishSpool = vi.mocked(apiFinishSpool);
const mockGetCustomOptions = vi.mocked(apiGetCustomOptions);

const spool1: Spool = {
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

describe('useInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCustomOptions.mockResolvedValue({ brands: [], materials: [] });
  });

  // ── Auth states ───────────────────────────────────────────────────────────

  it('mientras authLoading=true, loading=true y no hace fetch', async () => {
    const { result } = renderHook(() =>
      useInventory({ authLoading: true, userId: null }),
    );
    expect(result.current.loading).toBe(true);
    expect(mockGetSpools).not.toHaveBeenCalled();
  });

  it('cuando userId=null, loading=false y spools=[]', async () => {
    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: null }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.spools).toEqual([]);
    expect(mockGetSpools).not.toHaveBeenCalled();
  });

  it('cuando hay userId, carga spools y custom options', async () => {
    mockGetSpools.mockResolvedValue([spool1]);
    mockGetCustomOptions.mockResolvedValue({ brands: ['Bambu'], materials: ['PLA'] });

    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: 'user-1' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.spools).toEqual([spool1]);
    expect(result.current.customBrands).toEqual(['Bambu']);
    expect(result.current.customMaterials).toEqual(['PLA']);
  });

  // ── createSpool ───────────────────────────────────────────────────────────

  it('createSpool añade la bobina al estado', async () => {
    mockGetSpools.mockResolvedValue([]);
    mockGetCustomOptions.mockResolvedValue({ brands: [], materials: [] });
    mockCreateSpool.mockResolvedValue(spool1);

    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: 'user-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createSpool({
        brand: 'Bambu',
        material: 'PLA',
        color: 'Blanco',
        colorHex: '#FFFFFF',
        totalGrams: 1000,
        remainingG: 1000,
        price: 20,
        notes: '',
      });
    });

    expect(result.current.spools).toContainEqual(spool1);
  });

  it('createSpool lanza error si no hay usuario autenticado', async () => {
    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: null }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.createSpool({
        brand: 'Bambu', material: 'PLA', color: 'Blanco',
        colorHex: '#FFFFFF', totalGrams: 1000, remainingG: 1000, price: 20, notes: '',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  // ── deleteSpool ───────────────────────────────────────────────────────────

  it('deleteSpool elimina la bobina del estado', async () => {
    mockGetSpools.mockResolvedValue([spool1]);
    mockDeleteSpool.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: 'user-1' }),
    );
    await waitFor(() => expect(result.current.spools).toHaveLength(1));

    await act(async () => {
      await result.current.deleteSpool('spool-1');
    });

    expect(result.current.spools).toHaveLength(0);
  });

  // ── deductSpool ───────────────────────────────────────────────────────────

  it('deductSpool actualiza remainingG en el estado', async () => {
    mockGetSpools.mockResolvedValue([spool1]);
    mockDeductSpool.mockResolvedValue({ remainingG: 750, status: 'active' });

    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: 'user-1' }),
    );
    await waitFor(() => expect(result.current.spools).toHaveLength(1));

    await act(async () => {
      await result.current.deductSpool('spool-1', 50);
    });

    expect(result.current.spools[0].remainingG).toBe(750);
  });

  // ── finishSpool ───────────────────────────────────────────────────────────

  it('finishSpool marca la bobina como terminada con remainingG=0', async () => {
    mockGetSpools.mockResolvedValue([spool1]);
    mockFinishSpool.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useInventory({ authLoading: false, userId: 'user-1' }),
    );
    await waitFor(() => expect(result.current.spools).toHaveLength(1));

    await act(async () => {
      await result.current.finishSpool('spool-1');
    });

    const finished = result.current.spools.find((s) => s.id === 'spool-1');
    expect(finished?.status).toBe('finished');
    expect(finished?.remainingG).toBe(0);
  });
});

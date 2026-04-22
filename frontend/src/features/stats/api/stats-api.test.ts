import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiGetStats } from './stats-api';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('apiGetStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls /api/stats with correct query params', async () => {
    const mockResponse: Response = {
      ok: true,
      json: async () => ({
        summary: { totalPieces: 10, totalGrams: 500, totalCost: 25.0, totalSecs: 7200, avgCostPerPiece: 2.5, projectCount: 2 },
        timeSeries: [],
        byProject: [],
      }),
    } as unknown as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const result = await apiGetStats({
      from: '2026-01-01',
      to: '2026-04-22',
      projectId: 'all',
      granularity: 'month',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/stats?'),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-04-22');
    expect(url).toContain('projectId=all');
    expect(url).toContain('granularity=month');

    expect(result.summary.totalPieces).toBe(10);
  });

  it('throws when response is not ok', async () => {
    const mockResponse: Response = {
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    } as unknown as Response;
    mockFetch.mockResolvedValue(mockResponse);

    await expect(
      apiGetStats({ from: '2026-01-01', to: '2026-04-22', projectId: 'all', granularity: 'month' })
    ).rejects.toThrow('Unauthorized');
  });

  it('passes projectId filter when specified', async () => {
    const mockResponse: Response = {
      ok: true,
      json: async () => ({ summary: {}, timeSeries: [], byProject: [] }),
    } as unknown as Response;
    mockFetch.mockResolvedValue(mockResponse);

    await apiGetStats({
      from: '2026-01-01',
      to: '2026-04-22',
      projectId: 'project-uuid-123',
      granularity: 'day',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('projectId=project-uuid-123');
    expect(url).toContain('granularity=day');
  });
});

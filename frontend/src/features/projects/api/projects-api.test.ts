import { defaultFormValues } from '@/lib/defaults';

vi.mock('@/shared/api/http-client', () => ({
  httpRequest: vi.fn(),
  jsonRequest: vi.fn((method: string, body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })),
}));

import { httpRequest, jsonRequest } from '@/shared/api/http-client';
import { projectsApi } from './projects-api';

const mockedHttpRequest = vi.mocked(httpRequest);
const mockedJsonRequest = vi.mocked(jsonRequest);

describe('projectsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getAll ────────────────────────────────────────────────────────────────

  it('getAll resuelve con el array devuelto por httpRequest', async () => {
    mockedHttpRequest.mockResolvedValue([{ id: '1' }] as never);

    const result = await projectsApi.getAll();

    expect(result).toEqual([{ id: '1' }]);
    expect(mockedHttpRequest).toHaveBeenCalledWith({ url: '/api/projects' });
  });

  it('getAll relanza el error cuando httpRequest falla', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('network error'));

    await expect(projectsApi.getAll()).rejects.toThrow('network error');
  });

  // ── save ──────────────────────────────────────────────────────────────────

  it('save llama POST y devuelve el proyecto creado', async () => {
    const savedProject = { id: 'p1', jobName: 'Test', createdAt: '2026-01-01' };
    mockedHttpRequest.mockResolvedValue(savedProject as never);
    const { id: _id, ...payload } = defaultFormValues;

    const result = await projectsApi.save(payload as never);

    expect(result).toEqual(savedProject);
    expect(mockedJsonRequest).toHaveBeenCalledWith('POST', payload);
    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/projects',
      init: expect.objectContaining({ method: 'POST' }),
    });
  });

  it('save relanza el error cuando httpRequest falla', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('server error'));
    const { id: _id, ...payload } = defaultFormValues;

    await expect(projectsApi.save(payload as never)).rejects.toThrow('server error');
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('delete llama DELETE con el id correcto', async () => {
    mockedHttpRequest.mockResolvedValue(undefined as never);

    await projectsApi.delete('p1');

    expect(mockedHttpRequest).toHaveBeenCalledWith({
      url: '/api/projects/p1',
      init: { method: 'DELETE' },
    });
  });

  it('delete relanza el error cuando httpRequest falla', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('not found'));

    await expect(projectsApi.delete('p1')).rejects.toThrow('not found');
  });
});

import type { FormData } from '@/lib/schema';
import { httpRequest, jsonRequest } from '@/shared/api/http-client';

export interface Project extends FormData {
  id: string;
  createdAt: string;
}

// Legacy alias — kept for backward compatibility
export type SavedProject = Project;

export const projectsApi = {
  async getAll(): Promise<Project[]> {
    return httpRequest<Project[]>({ url: '/api/projects' });
  },

  async getById(id: string): Promise<Project> {
    return httpRequest<Project>({ url: `/api/projects/${id}` });
  },

  async save(data: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    return httpRequest<Project>({
      url: '/api/projects',
      init: jsonRequest('POST', data),
    });
  },

  async update(id: string, data: Omit<Project, 'id' | 'createdAt'>): Promise<{ id: string }> {
    return httpRequest<{ id: string }>({
      url: `/api/projects/${id}`,
      init: jsonRequest('PUT', data),
    });
  },

  async delete(id: string): Promise<void> {
    await httpRequest<{ success: true }>({
      url: `/api/projects/${id}`,
      init: { method: 'DELETE' },
    });
  },
};

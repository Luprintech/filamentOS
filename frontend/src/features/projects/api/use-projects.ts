import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Project } from './projects-api';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook para obtener todos los proyectos guardados del usuario
 * Cache: 5 minutos, re-fetch al reconectar
 */
export function useProjects() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      try {
        return await projectsApi.getAll();
      } catch (error) {
        console.error('Error fetching projects:', error);
        // Solo mostrar toast si el error no es 401 (no autenticado)
        const httpError = error as { status?: number };
        if (httpError.status !== 401) {
          toast({
            title: 'Error al cargar proyectos',
            description: 'No se pudieron cargar tus proyectos guardados',
            variant: 'destructive',
          });
        }
        return [];
      }
    },
    // Solo fetch si no hay datos en caché o si son muy viejos
    staleTime: 5 * 60 * 1000,
    // Retry solo una vez en caso de error
    retry: 1,
  });
}

/**
 * Hook para guardar un nuevo proyecto
 * Invalida automáticamente la lista de proyectos después de guardar
 */
export function useSaveProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<Project, 'id' | 'createdAt'>) => {
      return await projectsApi.save(data);
    },
    onSuccess: (savedProject) => {
      // Invalidar y re-fetchear la lista de proyectos
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast({
        title: 'Proyecto guardado',
        description: `"${savedProject.name}" se ha guardado exitosamente`,
      });
    },
    onError: (error) => {
      console.error('Error saving project:', error);
      toast({
        title: 'Error al guardar',
        description: 'No se pudo guardar el proyecto. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para eliminar un proyecto
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (projectId: string) => {
      await projectsApi.delete(projectId);
      return projectId;
    },
    onSuccess: (projectId) => {
      // Actualizar caché optimistamente - remover el proyecto de la lista
      queryClient.setQueryData<Project[]>(['projects'], (old) =>
        old ? old.filter((p) => p.id !== projectId) : []
      );

      toast({
        title: 'Proyecto eliminado',
        description: 'El proyecto ha sido eliminado correctamente',
      });
    },
    onError: (error) => {
      console.error('Error deleting project:', error);
      toast({
        title: 'Error al eliminar',
        description: 'No se pudo eliminar el proyecto',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para actualizar un proyecto existente (imagen, nombre, datos)
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Omit<Project, 'id' | 'createdAt'> }) => {
      return await projectsApi.update(id, data);
    },
    onSuccess: (_result, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: 'Proyecto actualizado',
        description: `"${data.jobName}" se ha actualizado correctamente`,
      });
    },
    onError: (error) => {
      console.error('Error updating project:', error);
      toast({
        title: 'Error al actualizar',
        description: 'No se pudo actualizar el proyecto. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para obtener un proyecto específico por ID
 */
export function useProject(projectId: string | null) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await projectsApi.getById(projectId);
    },
    enabled: !!projectId, // Solo fetch si hay ID
    staleTime: 5 * 60 * 1000,
  });
}

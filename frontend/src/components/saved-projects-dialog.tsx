import React, { useState, useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, FolderUp, ImageIcon, Loader2 } from 'lucide-react';
import type { FormData } from '@/lib/schema';
import { projectsApi, type Project as SavedProject } from '@/features/projects/api/projects-api';
import { useAuth } from '@/context/auth-context';
import { useTranslation } from 'react-i18next';

interface SavedProjectsDialogProps {
  form: UseFormReturn<FormData>;
  children: React.ReactNode;
}

export function SavedProjectsDialog({ form, children }: SavedProjectsDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Si no hay usuario autenticado, no intentamos cargar proyectos desde el servidor
    if (!user) {
      setProjects([]);
      return;
    }
    setIsLoading(true);
    projectsApi.getAll().then((data) => {
      setProjects(data);
    }).catch(() => {
      toast({ variant: 'destructive', title: t('saved_projects_error'), description: 'Error al cargar los proyectos.' });
    }).finally(() => {
      setIsLoading(false);
    });
  }, [isOpen, toast, user]);

    const handleLoadProject = (project: SavedProject) => {
      form.reset(project);
      toast({ title: t('loaded_project'), description: t('loaded_project_msg', { name: project.jobName }) });
      setIsOpen(false);
    };

  const handleDeleteProject = async (projectToDelete: SavedProject) => {
    if (!window.confirm(t('delete_confirm', { name: projectToDelete.jobName }))) return;
    try {
      await projectsApi.delete(projectToDelete.id);
      setProjects(projects.filter((p) => p.id !== projectToDelete.id));
      toast({ title: t('deleted_project'), description: t('deleted_project_msg', { name: projectToDelete.jobName }) });
    } catch {
      toast({ variant: 'destructive', title: t('delete_error'), description: 'Error al eliminar el proyecto.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('saved_projects')}</DialogTitle>
          <DialogDescription>
            {t('saved_projects_subtitle')}
          </DialogDescription>
        </DialogHeader>
        <div className="h-72 w-full overflow-y-auto rounded-md border">
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !user ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-center text-muted-foreground py-10">
                  {t('saved_projects_login')}
                </p>
              </div>
            ) : projects.length > 0 ? (
              <ul className="space-y-2">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {project.projectImage ? (
                        <img
                          src={project.projectImage}
                          alt={project.jobName}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground flex-shrink-0">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                      <span className="font-medium truncate">{project.jobName}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleLoadProject(project)} title={t('load')}>
                        <FolderUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title={t('delete')}
                        onClick={() => handleDeleteProject(project)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-center text-muted-foreground py-10">{t('saved_projects_empty')}</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Loader2, ImageIcon, Trash2, FolderUp, Clock3, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import type { FormData } from '@/lib/schema';
import { useTranslation } from 'react-i18next';
import { useProjects, useDeleteProject } from '@/features/projects/api/use-projects';
import type { SavedProject } from '@/features/projects/api/projects-api';

interface CostProjectsPanelProps {
  form: UseFormReturn<FormData>;
  refreshKey: number;
}

function formatTime(hours: number, minutes: number): string {
  return `${hours}h ${minutes}m`;
}

export function CostProjectsPanel({ form, refreshKey }: CostProjectsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const iconClass = 'h-4 w-4';

  // Usar React Query para obtener proyectos
  const { data: projects = [], isLoading, refetch } = useProjects();
  const deleteProjectMutation = useDeleteProject();

  // Refrescar cuando cambia refreshKey
  React.useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const currentFormId = form.watch('id');

  const sortedProjects = useMemo(
    () => projects.filter((project) => project.jobName.toLowerCase().includes(query.toLowerCase().trim())),
    [projects, query],
  );

  function handleLoadProject(project: SavedProject) {
    form.reset(project);
    toast({ title: t('loaded_project'), description: t('loaded_project_msg', { name: project.jobName }) });
  }

  function handleDeleteProject(project: SavedProject) {
    if (!window.confirm(t('delete_confirm', { name: project.jobName }))) return;
    deleteProjectMutation.mutate(project.id, {
      onSuccess: () => {
        if (currentFormId === project.id) {
          form.reset();
        }
      },
    });
  }

  return (
    <aside className="challenge-panel flex flex-col rounded-[26px] border border-border/70 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.10)] dark:border-white/[0.12] dark:shadow-[0_18px_60px_rgba(0,0,0,0.22)] xl:sticky xl:top-4 xl:max-h-[820px] xl:overflow-hidden">
      <div className="mb-5 shrink-0 border-b border-border/70 pb-4 dark:border-white/10">
        <h3 className="text-xl font-black tracking-tight text-foreground">{t('saved_projects')}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('saved_projects_subtitle')}
        </p>
      </div>

      {user && (
        <div className="relative mb-5 shrink-0">
          <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${iconClass}`} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('saved_projects_search')}
            className="challenge-input pl-9"
          />
        </div>
      )}

      {!user ? (
        <div className="rounded-[18px] border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/[0.12] dark:bg-white/[0.02]">
          {t('saved_projects_login')}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : sortedProjects.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/[0.12] dark:bg-white/[0.02]">
          {t('saved_projects_empty')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
          <div className="flex flex-col gap-4">
            {sortedProjects.map((project) => {
              const isActive = currentFormId === project.id;
              return (
                <div
                  key={project.id}
                  className={`rounded-[20px] border p-4 transition ${
                    isActive
                      ? 'border-[hsl(var(--challenge-pink))]/40 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--challenge-pink)/0.18)] dark:bg-white/[0.06]'
                      : 'border-border/70 bg-card/70 hover:bg-muted/50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                   }`}
                >
                  <div className="flex items-start gap-4">
                    {project.projectImage ? (
                      <img src={project.projectImage} alt={`Imagen de ${project.jobName}`} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground dark:bg-white/[0.05]">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-foreground">{project.jobName}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[0.74rem] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock3 className={iconClass} /> {formatTime(project.printingTimeHours, project.printingTimeMinutes)}</span>
                        <span className="inline-flex items-center gap-1"><Package className={iconClass} /> {project.filamentWeight}g</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" variant="outline" className="rounded-full text-xs font-bold sm:flex-1" onClick={() => handleLoadProject(project)}>
                      <FolderUp className={`mr-1.5 ${iconClass}`} /> {t('load')}
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive/20 sm:flex-1" onClick={() => handleDeleteProject(project)}>
                      <Trash2 className={`mr-1.5 ${iconClass}`} /> {t('delete')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

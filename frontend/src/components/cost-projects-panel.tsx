import React, { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Loader2, ImageIcon, Trash2, FolderUp, Clock3, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { deleteProject, getProjects, type SavedProject } from '@/lib/projects';
import type { FormData } from '@/lib/schema';

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
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    setLoading(true);
    getProjects()
      .then(({ data, error }) => {
        if (error) {
          toast({ variant: 'destructive', title: 'Error al cargar proyectos', description: error });
        } else {
          setProjects(data ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [user, toast, refreshKey]);

  const currentFormId = form.watch('id');

  const sortedProjects = useMemo(
    () => projects.filter((project) => project.jobName.toLowerCase().includes(query.toLowerCase().trim())),
    [projects, query],
  );

  function handleLoadProject(project: SavedProject) {
    form.reset(project);
    toast({ title: 'Proyecto cargado', description: `Se ha cargado “${project.jobName}”.` });
  }

  async function handleDeleteProject(project: SavedProject) {
    if (!window.confirm(`¿Eliminar “${project.jobName}”? Esta acción no se puede deshacer.`)) return;
    const { error } = await deleteProject(project.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error });
      return;
    }
    setProjects((prev) => prev.filter((item) => item.id !== project.id));
    if (currentFormId === project.id) {
      form.reset();
    }
    toast({ title: 'Proyecto eliminado', description: `“${project.jobName}” ha sido eliminado.` });
  }

  return (
    <aside className="challenge-panel rounded-[24px] border border-white/[0.10] p-6 xl:sticky xl:top-4 xl:max-h-[860px] xl:min-h-[860px]">
      <div className="mb-5">
        <h3 className="text-lg font-extrabold text-foreground">Proyectos guardados</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecciona un proyecto guardado para cargarlo en la calculadora.
        </p>
      </div>

      {user && (
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar proyecto..."
            className="challenge-input pl-9"
          />
        </div>
      )}

      {!user ? (
        <div className="rounded-[18px] border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
          Iniciá sesión con Google para ver y guardar proyectos.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : sortedProjects.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
          Aún no tienes proyectos guardados.
        </div>
      ) : (
        <div className="flex min-h-[420px] flex-col gap-4 xl:h-full">
          <div className="flex flex-col gap-4 xl:flex-1 xl:overflow-y-auto xl:pr-1.5">
            {sortedProjects.map((project) => {
              const isActive = currentFormId === project.id;
              return (
                <div
                  key={project.id}
                  className={`rounded-[20px] border p-4 transition ${
                    isActive
                      ? 'border-[hsl(var(--challenge-pink))]/40 bg-white/[0.06] shadow-[0_0_0_1px_hsl(var(--challenge-pink)/0.18)]'
                      : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {project.projectImage ? (
                      <img src={project.projectImage} alt={`Imagen de ${project.jobName}`} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-muted-foreground">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-foreground">{project.jobName}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[0.74rem] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatTime(project.printingTimeHours, project.printingTimeMinutes)}</span>
                        <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {project.filamentWeight}g</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" variant="outline" className="rounded-full text-xs font-bold sm:flex-1" onClick={() => handleLoadProject(project)}>
                      <FolderUp className="mr-1.5 h-3.5 w-3.5" /> Cargar
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive/20 sm:flex-1" onClick={() => handleDeleteProject(project)}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
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

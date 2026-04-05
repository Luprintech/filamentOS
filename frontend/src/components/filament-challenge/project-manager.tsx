import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { formatCost, secsToString } from './filament-storage';
import type { FilamentProject } from './filament-types';
import type { ProjectInput } from './use-filament-storage';

// ── Constants ──────────────────────────────────────────────────────────────────

const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP', 'CLP'];

// ── Project form (inside dialog) ───────────────────────────────────────────────

interface ProjectFormValues {
  title: string;
  description: string;
  coverImage: string;
  goal: string;
  pricePerKg: string;
  currency: string;
}

interface ProjectFormProps {
  defaultValues?: ProjectFormValues;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
  submitLabel: string;
}

export function ProjectForm({ defaultValues, onSubmit, onCancel, submitLabel }: ProjectFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProjectFormValues>({
    defaultValues: defaultValues ?? {
      title: '', description: '', coverImage: '', goal: '30', pricePerKg: '20.00', currency: 'EUR',
    },
  });

  const coverImage = watch('coverImage');

  async function resizeImageToDataUrl(file: File): Promise<string> {
    const imageBitmap = await createImageBitmap(file);
    const maxWidth = 1200;
    const scale = Math.min(1, maxWidth / imageBitmap.width);
    const width = Math.round(imageBitmap.width * scale);
    const height = Math.round(imageBitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen');

    ctx.drawImage(imageBitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function handleCoverUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const optimized = await resizeImageToDataUrl(file);
    setValue('coverImage', optimized);
  }

  function handleValid(values: ProjectFormValues) {
    onSubmit({
      title:       values.title.trim(),
      description: values.description.trim(),
      coverImage:  values.coverImage.trim() || null,
      goal:        Math.max(1, parseInt(values.goal, 10) || 1),
      pricePerKg:  parseFloat(values.pricePerKg.replace(',', '.')) || 0,
      currency:    values.currency,
    });
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pm-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Nombre del proyecto *
        </Label>
        <Input
          id="pm-title"
          placeholder="Ej: Serie Navidad, Reto agosto, Control mensual..."
          {...register('title', { required: 'El nombre es obligatorio.' })}
        />
        {errors.title && <p className="text-xs font-semibold text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pm-desc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Descripción (opcional)
        </Label>
        <Input
          id="pm-desc"
          placeholder="Ej: Figuras de anime para el mercadillo"
          {...register('description')}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pm-cover" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Imagen de portada (opcional)
        </Label>
        <Input
          id="pm-cover-file"
          type="file"
          accept="image/*"
          onChange={handleCoverUpload}
        />
        <Input
          id="pm-cover"
          type="url"
          placeholder="https://... o pegá una URL de imagen"
          {...register('coverImage')}
        />
        <p className="text-[0.78rem] text-muted-foreground">
          Podés subir una imagen desde tu equipo o pegar una URL.
        </p>
        {coverImage && (
          <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-black/20">
            <img src={coverImage} alt="Vista previa de portada" className="h-36 w-full object-cover" />
          </div>
        )}
        {coverImage && (
          <Button type="button" variant="outline" className="rounded-full text-xs font-bold" onClick={() => setValue('coverImage', '')}>
            Quitar portada
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pm-goal" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Meta de piezas
          </Label>
          <Input id="pm-goal" type="number" min={1} placeholder="30" {...register('goal')} />
          <p className="text-[0.78rem] text-muted-foreground">¿Cuántas piezas quieres hacer?</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pm-currency" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Moneda
          </Label>
          <select
            id="pm-currency"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            {...register('currency')}
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pm-price" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Precio por kg de filamento
        </Label>
        <Input
          id="pm-price"
          type="number"
          step="0.01"
          min={0}
          placeholder="20.00"
          {...register('pricePerKg')}
        />
        <p className="text-[0.78rem] text-muted-foreground">
          Precio del carrete por kg. Lo usamos para calcular el coste de cada pieza automáticamente.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="challenge-btn-primary rounded-full font-extrabold">
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full font-bold">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-[24px] border border-dashed border-white/[0.12] bg-white/[0.02] px-8 py-16 text-center">
      <div className="challenge-gradient-text text-5xl font-black leading-none">TRACKER</div>
      <div className="space-y-1">
        <p className="font-bold text-foreground">Aún no tienes proyectos</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Crea tu primer proyecto para empezar a trackear piezas, tiempo, gramos y coste.
        </p>
      </div>
      <Button className="challenge-btn-primary rounded-full px-6 font-extrabold" onClick={onCreate}>
        + Crear primer proyecto
      </Button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

interface ProjectManagerProps {
  projects: FilamentProject[];
  activeProjectId: string | null;
  onCreate: (input: ProjectInput) => Promise<void> | void;
  onUpdate: (id: string, input: ProjectInput) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onSelect: (id: string) => void;
  onOpenProject: (id: string) => void;
}

export function ProjectManager({
  projects, activeProjectId, onCreate, onUpdate, onDelete, onSelect, onOpenProject,
}: ProjectManagerProps) {
  const [createOpen, setCreateOpen]   = useState(false);
  const [editing, setEditing]         = useState<FilamentProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FilamentProject | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [query, setQuery] = useState('');

  const pageSize = 6;
  const filteredProjects = useMemo(
    () => projects.filter((project) => (`${project.title} ${project.description}`).toLowerCase().includes(query.toLowerCase().trim())),
    [projects, query],
  );
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));

  const selectedProject =
    filteredProjects.find((project) => project.id === activeProjectId)
    ?? projects.find((project) => project.id === activeProjectId)
    ?? filteredProjects[0]
    ?? projects[0]
    ?? null;

  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function handleCreate(input: ProjectInput) {
    onCreate(input);
    setCreateOpen(false);
  }

  function handleUpdate(input: ProjectInput) {
    if (!editing) return;
    onUpdate(editing.id, input);
    setEditing(null);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="w-full animate-fade-in space-y-5">

      {/* ── Page header ── */}
      <div className="challenge-hero relative overflow-hidden rounded-[28px] border border-white/[0.10] p-6 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, hsl(var(--challenge-pink)) 0%, transparent 65%)' }}
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-[hsl(var(--challenge-blue))]">
              📊 Tracker de series
            </div>
            <h2 className="challenge-gradient-text text-3xl font-black leading-none sm:text-4xl">
              Mis proyectos
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Cada proyecto es una serie, un reto o un control de producción. Crea los que necesites.
            </p>
          </div>
          {projects.length > 0 && (
            <Button
              className="challenge-btn-primary shrink-0 rounded-full px-5 font-extrabold"
              onClick={() => setCreateOpen(true)}
            >
              + Nuevo proyecto
            </Button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {projects.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {selectedProject && (
            <>
              <div className="challenge-panel rounded-[24px] border border-white/[0.10] p-6">
                {selectedProject.coverImage && (
                  <div className="mb-5 overflow-hidden rounded-[20px] border border-white/[0.08] bg-black/20">
                    <img
                      src={selectedProject.coverImage}
                      alt={`Portada de ${selectedProject.title}`}
                      className="h-52 w-full object-cover"
                    />
                  </div>
                )}

                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-foreground">{selectedProject.title}</h3>
                    {selectedProject.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{selectedProject.description}</p>
                    )}
                  </div>
                  <div className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-extrabold text-[hsl(var(--challenge-blue))]">
                    {selectedProject.totalPieces}/{selectedProject.goal}
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Piezas', value: `${selectedProject.totalPieces} / ${selectedProject.goal}`, color: 'text-[hsl(var(--challenge-pink))]' },
                    { label: 'Tiempo', value: secsToString(selectedProject.totalSecs), color: 'text-[hsl(var(--challenge-blue))]' },
                    { label: 'Filamento', value: `${selectedProject.totalGrams.toFixed(1)}g`, color: 'text-[hsl(var(--challenge-green))]' },
                    { label: 'Coste', value: formatCost(selectedProject.totalCost, selectedProject.currency), color: 'text-yellow-400' },
                  ].map((s) => (
                    <div key={s.label} className="challenge-stat-card rounded-[18px] border border-white/[0.08] p-4">
                      <p className="text-[0.74rem] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                      <p className={`mt-1.5 text-lg font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${selectedProject.goal > 0 ? Math.min(Math.round((selectedProject.totalPieces / selectedProject.goal) * 100), 100) : 0}%`,
                      background: 'linear-gradient(90deg, hsl(var(--challenge-pink)), hsl(var(--challenge-blue)))',
                    }}
                  />
                </div>

                <Button
                  className="challenge-btn-primary w-full rounded-full font-extrabold"
                  onClick={() => onOpenProject(selectedProject.id)}
                >
                  Abrir proyecto →
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="challenge-panel rounded-[24px] border border-white/[0.10] p-5 pb-10 lg:max-h-[720px] xl:sticky xl:top-4 xl:h-[760px] xl:max-h-[760px]">
          <h3 className="mb-4 text-lg font-extrabold text-foreground">Series guardadas</h3>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar serie..."
              className="challenge-input pl-9"
            />
          </div>
          <div className="flex min-h-[420px] flex-col gap-4 lg:h-[620px] xl:h-full xl:min-h-0">
          <div className="flex flex-col gap-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 xl:gap-3">
            {paginatedProjects.map((project) => {
              const progressPct = project.goal > 0 ? Math.min(Math.round((project.totalPieces / project.goal) * 100), 100) : 0;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelect(project.id)}
                  className={`rounded-[16px] border p-2.5 text-left transition hover:bg-white/[0.06] sm:p-3 ${
                    selectedProject?.id === project.id
                      ? 'border-[hsl(var(--challenge-pink))]/40 bg-white/[0.06] shadow-[0_0_0_1px_hsl(var(--challenge-pink)/0.18)]'
                      : 'border-white/[0.08] bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    {project.coverImage ? (
                      <img src={project.coverImage} alt={`Portada de ${project.title}`} className="h-12 w-12 shrink-0 rounded-xl object-cover sm:h-14 sm:w-14" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-base sm:h-14 sm:w-14 sm:text-xl">🎯</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.82rem] font-extrabold text-foreground sm:text-sm">{project.title}</p>
                      <p className="text-[0.7rem] text-muted-foreground sm:text-[0.75rem]">
                        {project.totalPieces}/{project.goal} · {formatCost(project.totalCost, project.currency)}
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progressPct}%`,
                            background: 'linear-gradient(90deg, hsl(var(--challenge-pink)), hsl(var(--challenge-blue)))',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {filteredProjects.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
              No hay series que coincidan con tu búsqueda.
            </div>
          ) : totalPages > 1 && (
            <div className="mb-3 mt-1 border-t border-white/[0.08] bg-[hsl(var(--card))/0.96] pt-3 pb-1 backdrop-blur-sm xl:sticky xl:bottom-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-3 text-xs font-bold"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                ← Anterior
              </Button>
              <span className="text-center text-xs font-bold text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-3 text-xs font-bold"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Siguiente →
              </Button>
            </div>
            </div>
          )}
          </div>
        </aside>
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>
              Configura tu proyecto. Podrás editar todo esto después desde las opciones.
            </DialogDescription>
          </DialogHeader>
          <ProjectForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Crear proyecto"
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}

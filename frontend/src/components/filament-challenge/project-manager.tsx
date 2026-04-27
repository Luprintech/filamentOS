import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Search, Target, BarChart3 } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/context/currency-context';
import { ImageUpload } from '@/components/ui/image-upload';
import { compressImage } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

// (CURRENCIES list removed — now managed globally via CurrencyContext)

// ── Project form (inside dialog) ───────────────────────────────────────────────

interface ProjectFormValues {
  title: string;
  description: string;
  coverImage: string;
  goal: string;
  currency: string;
}

interface ProjectFormProps {
  defaultValues?: ProjectFormValues;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
  submitLabel: string;
}

export function ProjectForm({ defaultValues, onSubmit, onCancel, submitLabel }: ProjectFormProps) {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProjectFormValues>({
    defaultValues: defaultValues ?? {
      title: '', description: '', coverImage: '', goal: '30', currency,
    },
  });

  // Keep hidden currency field in sync with global setting (for new projects)
  React.useEffect(() => {
    if (!defaultValues) {
      setValue('currency', currency);
    }
  }, [currency, defaultValues, setValue]);

  const coverImage = watch('coverImage');
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageError, setImageError] = useState('');

  async function handleCoverUpload(file: File) {
    try {
      setIsProcessing(true);
      setImageError('');
      const optimized = await compressImage(file, 1200, 0.82);
      setValue('coverImage', optimized);
    } catch {
      setImageError(t('pm_image_error'));
    } finally {
      setIsProcessing(false);
    }
  }

  function handleValid(values: ProjectFormValues) {
    onSubmit({
      title:       values.title.trim(),
      description: values.description.trim(),
      coverImage:  values.coverImage.trim() || null,
      goal:        Math.max(1, parseInt(values.goal, 10) || 1),
      pricePerKg:  0,
      currency:    values.currency,
    });
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pm-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('pm_name')} *
        </Label>
        <Input
          id="pm-title"
          placeholder={t('pm_name_placeholder')}
          {...register('title', { required: t('pm_name_required') })}
        />
        {errors.title && <p className="text-xs font-semibold text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pm-desc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('pm_desc')}
        </Label>
        <Input
          id="pm-desc"
          placeholder={t('pm_desc_placeholder')}
          {...register('description')}
        />
      </div>

      <ImageUpload
        imagePreview={coverImage || null}
        isProcessing={isProcessing}
        error={imageError}
        onFileSelect={handleCoverUpload}
        onClear={() => setValue('coverImage', '')}
        label={t('pm_cover')}
        dragPrompt={t('tracker.upload.dragPrompt')}
        dropPrompt={t('tracker.upload.dropPrompt')}
        changeBtn={t('pm_cover_change')}
        uploadBtn={t('pm_cover_upload')}
        hint={t('pm_cover_hint')}
        processingLabel={t('tracker.upload.processing')}
      />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-white/[0.18] bg-white/[0.03] text-muted-foreground">
              <span className="text-2xl">🖼️</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-bold"
              onClick={() => document.getElementById('pm-cover-file')?.click()}
            >
                {coverImage ? t('pm_cover_change') : t('pm_cover_upload')}
              </Button>
            {coverImage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-xs font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setValue('coverImage', '')}
              >
                {t('pm_cover_remove')}
              </Button>
            )}
            <p className="text-[0.75rem] text-muted-foreground">{t('pm_cover_hint')}</p>
          </div>
        </div>
        <input
          id="pm-cover-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pm-goal" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('pm_goal')}
        </Label>
        <Input id="pm-goal" type="number" min={1} placeholder="30" {...register('goal')} />
        <p className="text-[0.78rem] text-muted-foreground">{t('pm_goal_hint')}</p>
      </div>

      {/* Hidden currency field — value comes from global CurrencySelector */}
      <input type="hidden" {...register('currency')} />

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="challenge-btn-primary rounded-full font-extrabold">
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full font-bold">
          {t('pm_cancel')}
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-6 rounded-[24px] border border-dashed border-white/[0.12] bg-white/[0.02] px-8 py-16 text-center">
      <div className="challenge-gradient-text text-3xl font-black leading-none sm:text-5xl">TRACKER</div>
      <div className="space-y-1">
        <p className="font-bold text-foreground">{t('pm_empty_title')}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t('pm_empty_subtitle')}
        </p>
      </div>
      <Button className="challenge-btn-primary rounded-full px-6 font-extrabold" onClick={onCreate}>
        {t('pm_empty_btn')}
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
  /** Cuando true, los botones mutantes llaman a onGuestAction en lugar de abrir diálogos */
  guestMode?: boolean;
  onGuestAction?: () => void;
}

export function ProjectManager({
  projects, activeProjectId, onCreate, onUpdate, onDelete, onSelect, onOpenProject,
  guestMode = false, onGuestAction,
}: ProjectManagerProps) {
  const { t } = useTranslation();
  const iconClass = 'h-4 w-4';
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
              <BarChart3 className={iconClass} />
              {t('pm_badge')}
            </div>
            <h2 className="challenge-gradient-text text-3xl font-black leading-none sm:text-4xl">
              {t('pm_title')}
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              {t('pm_subtitle')}
            </p>
          </div>
          {projects.length > 0 && (
            <Button
              className="challenge-btn-primary shrink-0 rounded-full px-5 font-extrabold"
              onClick={() => guestMode ? onGuestAction?.() : setCreateOpen(true)}
            >
              {t('pm_new')}
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
                      { label: t('pm_stat_pieces'), value: `${selectedProject.totalPieces} / ${selectedProject.goal}`, color: 'text-[hsl(var(--challenge-pink))]' },
                      { label: t('pm_stat_time'), value: secsToString(selectedProject.totalSecs), color: 'text-[hsl(var(--challenge-blue))]' },
                      { label: t('pm_stat_filament'), value: `${selectedProject.totalGrams.toFixed(1)}g`, color: 'text-[hsl(var(--challenge-green))]' },
                      { label: t('pm_stat_cost'), value: formatCost(selectedProject.totalCost, selectedProject.currency), color: 'text-yellow-400' },
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
                  {t('pm_open')}
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="challenge-panel rounded-[24px] border border-white/[0.10] p-5 pb-10 lg:max-h-[720px] xl:sticky xl:top-4 xl:h-[760px] xl:max-h-[760px]">
          <h3 className="mb-4 text-lg font-extrabold text-foreground">{t('pm_saved_series')}</h3>
          <div className="relative mb-4">
            <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${iconClass}`} />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder={t('pm_search')}
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
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[hsl(var(--challenge-blue))] sm:h-14 sm:w-14">
                        <Target className="h-5 w-5 text-[hsl(var(--challenge-blue))]" />
                      </div>
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
              {t('pm_no_results')}
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
                {t('pm_prev')}
              </Button>
              <span className="text-center text-xs font-bold text-muted-foreground">
                {t('pm_page', { current: currentPage, total: totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-3 text-xs font-bold"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                {t('pm_next')}
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
            <DialogTitle>{t('pm_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('pm_dialog_subtitle')}
            </DialogDescription>
          </DialogHeader>
          <ProjectForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            submitLabel={t('pm_create_btn')}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}

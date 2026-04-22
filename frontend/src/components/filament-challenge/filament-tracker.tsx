import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { GoogleIcon } from '@/components/icons';
import { useFilamentStorage } from './use-filament-storage';
import { TrackerApiError } from './tracker-api';
import { ProjectForm, ProjectManager } from './project-manager';
import { ChallengeHero } from './challenge-hero';
import { ChallengeForm } from './challenge-form';
import { ChallengePieceList } from './challenge-piece-list';
import { TrackerPrintSummary } from './tracker-print-summary';
import { TrackerGalaxyBackground } from './tracker-galaxy-background';
import { TrackerPdfCustomizer } from '@/components/tracker-pdf-customizer';
import { computeProjectStats } from './filament-storage';
import type { TrackerPdfData } from '@/features/tracker/api/use-tracker-pdf';
import type { EditingState, FilamentProject, TrackerView } from './filament-types';
import type { PieceInput, ProjectInput } from './use-filament-storage';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/features/inventory/api/use-inventory';

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginPrompt() {
  const { loginWithGoogle } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="challenge-panel flex flex-col items-center justify-center gap-6 rounded-[24px] border border-white/[0.10] p-6 sm:p-10 text-center">
      <div className="challenge-gradient-text text-2xl font-black leading-none sm:text-4xl">{t('tracker_login_title')}</div>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t('tracker_login_text')}
      </p>
      <Button
        onClick={loginWithGoogle}
        className="challenge-btn-primary rounded-full px-6 font-extrabold"
        size="lg"
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        {t('tracker_login_btn')}
      </Button>
    </div>
  );
}

// ── Main tracker ──────────────────────────────────────────────────────────────

export function FilamentTracker() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  const {
    loading, error,
    projects,
    activeProject, createProject, updateProject, deleteProject, selectProject,
    pieces, addPiece, updatePiece, deletePiece, reorderPieces,
  } = useFilamentStorage({ authLoading, userId: user?.id ?? null });

  const { spools: allSpools } = useInventory({ authLoading, userId: user?.id ?? null });
  const activeSpools = allSpools.filter((s) => s.status === 'active');

  const [view, setView]                 = useState<TrackerView>('manager');
  const [editingState, setEditingState] = useState<EditingState>({ mode: 'create' });
  const [editingProject, setEditingProject] = useState<FilamentProject | null>(null);
  const [deleteTargetProject, setDeleteTargetProject] = useState<FilamentProject | null>(null);
  const [pdfCustomizerOpen, setPdfCustomizerOpen] = useState(false);

  function openPdfCustomizer() {
    setPdfCustomizerOpen(true);
  }

  // Preparar datos para el PDF
  const trackerPdfData: TrackerPdfData | null = activeProject ? {
    projectTitle: activeProject.title,
    projectDescription: activeProject.description,
    projectGoal: activeProject.goal,
    projectCurrency: activeProject.currency,
    projectPricePerKg: activeProject.pricePerKg,
    coverImage: activeProject.coverImage,
    totalPieces: activeProject.totalPieces,
    totalSecs: activeProject.totalSecs,
    totalGrams: activeProject.totalGrams,
    totalCost: activeProject.totalCost,
    pieces: pieces.map(piece => ({
      label: piece.label,
      name: piece.name,
      totalSecs: piece.totalSecs,
      totalGrams: piece.totalGrams,
      totalCost: piece.totalCost,
      imageUrl: piece.imageUrl,
    })),
  } : null;

  if (authLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--challenge-blue))]" />
      </div>
    );
  }

  if (!user) return <LoginPrompt />;

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--challenge-blue))]" />
      </div>
    );
  }

  if (error) {
    const trackerError = error instanceof TrackerApiError ? error : null;
    const message =
      trackerError?.kind === 'runtime-mismatch'
        ? t('tracker_error_runtime')
        : trackerError?.kind === 'auth'
          ? t('tracker_error_auth')
          : t('tracker_error_generic', { message: error.message });

    return (
      <div className="rounded-[24px] border border-destructive/30 bg-destructive/10 p-6 text-center text-sm font-bold text-destructive">
        {message}
      </div>
    );
  }

  // ── Handlers (async, fire-and-forget with optimistic UI) ─────────────────────

  async function handleCreateProject(input: ProjectInput) {
    await createProject(input);
    setView('project');
    setEditingState({ mode: 'create' });
  }

  function handlePreviewProject(id: string) {
    selectProject(id);
  }

  function handleOpenProject(id: string) {
    selectProject(id);
    setView('project');
    setEditingState({ mode: 'create' });
  }

  function handleBack() {
    selectProject(null);
    setView('manager');
    setEditingState({ mode: 'create' });
  }

  async function handleSavePiece(input: PieceInput) {
    await addPiece(input);
  }

  async function handleUpdatePiece(id: string, input: PieceInput) {
    await updatePiece(id, input);
    setEditingState({ mode: 'create' });
  }

  async function handleDeletePiece(id: string) {
    await deletePiece(id);
    if (editingState.mode === 'edit' && editingState.id === id) {
      setEditingState({ mode: 'create' });
    }
  }

  async function handleUpdateProject(id: string, input: ProjectInput) {
    await updateProject(id, input);
    setEditingProject(null);
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id);
    setDeleteTargetProject(null);
    handleBack();
  }

  // ── Manager view ──────────────────────────────────────────────────────────────

  if (view === 'manager' || !activeProject) {
    return (
      <>
        <div className="relative overflow-hidden rounded-[32px] print:hidden">
          <TrackerGalaxyBackground />
          <div className="relative z-10 p-1">
          <ProjectManager
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onCreate={handleCreateProject}
            onUpdate={updateProject}
            onDelete={deleteProject}
            onSelect={handlePreviewProject}
            onOpenProject={handleOpenProject}
          />
          </div>
        </div>
        {activeProject && (
          <div className="hidden print:block">
            <TrackerPrintSummary project={activeProject} pieces={pieces} />
          </div>
        )}
      </>
    );
  }

  // ── Project view ──────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full animate-fade-in overflow-hidden rounded-[32px]">
      <TrackerGalaxyBackground />
      <div className="relative z-10 print:hidden">
        <ChallengeHero
          project={activeProject}
          pieces={pieces}
          onBack={handleBack}
          onPrint={openPdfCustomizer}
          onEditProject={() => setEditingProject(activeProject)}
          onDeleteProject={() => setDeleteTargetProject(activeProject)}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <ChallengeForm
            project={activeProject}
            editingState={editingState}
            pieces={pieces}
            onSave={handleSavePiece}
            onUpdate={handleUpdatePiece}
            onCancelEdit={() => setEditingState({ mode: 'create' })}
            activeSpools={activeSpools}
          />
          <ChallengePieceList
            project={activeProject}
            pieces={pieces}
            editingState={editingState}
            onEdit={(id) => {
              setEditingState({ mode: 'edit', id });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDelete={handleDeletePiece}
            onReorder={reorderPieces}
          />
        </div>
      </div>

      <div className="hidden print:block">
        <TrackerPrintSummary project={activeProject} pieces={pieces} />
      </div>

      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('tracker_edit_project')}</DialogTitle>
            <DialogDescription>
              {t('tracker_edit_project_hint')}
            </DialogDescription>
          </DialogHeader>
          {editingProject && (
            <ProjectForm
              defaultValues={{
                title: editingProject.title,
                description: editingProject.description,
                coverImage: editingProject.coverImage ?? '',
                goal: String(editingProject.goal),
                pricePerKg: String(editingProject.pricePerKg),
                currency: editingProject.currency,
              }}
              onSubmit={(input) => handleUpdateProject(editingProject.id, input)}
              onCancel={() => setEditingProject(null)}
              submitLabel={t('save_changes')}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTargetProject} onOpenChange={(open) => !open && setDeleteTargetProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tracker_delete_project')}</DialogTitle>
            <DialogDescription>
              {t('tracker_delete_project_confirm', { title: deleteTargetProject?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full">{t('cancel')}</Button>
            </DialogClose>
            {deleteTargetProject && (
              <Button variant="destructive" className="rounded-full" onClick={() => handleDeleteProject(deleteTargetProject.id)}>
                {t('delete')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Customizer Modal */}
      {trackerPdfData && (
        <TrackerPdfCustomizer
          open={pdfCustomizerOpen}
          onOpenChange={setPdfCustomizerOpen}
          trackerData={trackerPdfData}
        />
      )}
    </div>
  );
}

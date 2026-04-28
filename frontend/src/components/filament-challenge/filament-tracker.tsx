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
import type { PieceSortMode, PieceViewMode } from './challenge-piece-list';
import { TrackerPrintSummary } from './tracker-print-summary';
import { TrackerPdfCustomizer } from '@/components/tracker-pdf-customizer';
import { computeProjectStats } from './filament-storage';
import type { TrackerPdfData } from '@/features/tracker/api/use-tracker-pdf';
import type { EditingState, FilamentProject, TrackerView } from './filament-types';
import type { PieceInput, ProjectInput } from './use-filament-storage';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/features/inventory/api/use-inventory';
import { GuestBanner } from '@/components/guest-banner';
import { LoginRequiredModal } from '@/components/login-required-modal';
import { mockTrackerProjects, mockTrackerPieces, toFilamentProject } from '@/data/mockData';

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
  const { user, loading: authLoading, isGuest } = useAuth();
  const { t } = useTranslation();

  // Always call hooks (rules of hooks) — pass null userId in guest mode so they're no-ops
  const {
    loading, error,
    projects: realProjects,
    activeProject: realActiveProject, createProject, updateProject, deleteProject, selectProject: realSelectProject,
    pieces: realPieces, addPiece, updatePiece, deletePiece, reorderPieces,
  } = useFilamentStorage({ authLoading, userId: isGuest ? null : (user?.id ?? null) });

  const { spools: allSpools } = useInventory({ authLoading, userId: isGuest ? null : (user?.id ?? null) });
  const activeSpools = allSpools.filter((s) => s.status === 'active');

  // Guest mode: local state for selected sample project
  const [guestActiveProjectId, setGuestActiveProjectId] = useState<string | null>(null);

  // In guest mode, use sample projects and pieces; real mode uses API data
  const projects: FilamentProject[] = isGuest
    ? mockTrackerProjects.map(toFilamentProject)
    : realProjects;

  const activeProject = isGuest
    ? projects.find(p => p.id === guestActiveProjectId) ?? null
    : realActiveProject;

  const selectProject = isGuest
    ? setGuestActiveProjectId
    : realSelectProject;

  const pieces = isGuest && activeProject
    ? mockTrackerPieces.filter(p => p.projectId === activeProject.id)
    : realPieces;

  const [view, setView]                 = useState<TrackerView>('manager');
  const [editingState, setEditingState] = useState<EditingState>({ mode: 'create' });
  const [editingProject, setEditingProject] = useState<FilamentProject | null>(null);
  const [deleteTargetProject, setDeleteTargetProject] = useState<FilamentProject | null>(null);
  const [pdfCustomizerOpen, setPdfCustomizerOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'printed' | 'post_processed' | 'delivered' | 'failed'>('all');
  const [sortMode, setSortMode] = useState<PieceSortMode>('date-desc');
  const [viewMode, setViewMode] = useState<PieceViewMode>('grid');

  function openPdfCustomizer() {
    setPdfCustomizerOpen(true);
  }

  const visiblePieces = statusFilter === 'all'
    ? pieces
    : pieces.filter((piece) => piece.status === statusFilter);

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
      pieces: visiblePieces.map(piece => ({
        label: piece.label,
        name: piece.name,
        totalSecs: piece.totalSecs,
        totalGrams: piece.totalGrams,
        totalCost: piece.totalCost,
        imageUrl: piece.imageUrl,
        notes: piece.notes ?? '',
        status: piece.status ?? 'printed',
        printedAt: piece.printedAt ?? null,
        incident: piece.incident ?? '',
        materials: (piece.materials ?? []).map((material) => ({
          name: material.name,
          quantity: material.quantity,
          cost: material.cost,
        })),
      })),
  } : null;

  if (authLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--challenge-blue))]" />
      </div>
    );
  }

  if (!user && !isGuest) return <LoginPrompt />;

  // ── Guest mode: show sample projects but allow viewing them ─────────────────
  if (isGuest && view === 'manager') {
    return (
      <>
        <GuestBanner message="👀 Proyectos de ejemplo. Inicia sesión para crear y gestionar tus series reales." />
        <div className="relative print:hidden">
          <div className="relative z-10 p-1">
            <ProjectManager
              projects={projects}
              activeProjectId={activeProject?.id ?? projects[0]?.id ?? null}
              onCreate={() => setLoginModalOpen(true)}
              onUpdate={() => setLoginModalOpen(true)}
              onDelete={() => setLoginModalOpen(true)}
              onSelect={selectProject}
              onOpenProject={(id) => {
                selectProject(id);
                setView('project');
              }}
              guestMode
              onGuestAction={() => setLoginModalOpen(true)}
            />
          </div>
        </div>
        <LoginRequiredModal
          open={loginModalOpen}
          onOpenChange={setLoginModalOpen}
          message="Inicia sesión para crear y gestionar tus proyectos de seguimiento."
        />
      </>
    );
  }

  // ── Guest mode: inside a sample project (read-only) ─────────────────────────
  if (isGuest && view !== 'manager' && activeProject) {
    return (
      <>
        <GuestBanner message="👀 Proyecto de ejemplo. Inicia sesión para crear tus propias series y gestionar piezas." />
        <div className="relative w-full">
          <div className="relative z-10 print:hidden">
            <ChallengeHero
              project={activeProject}
              pieces={pieces}
              onBack={() => setView('manager')}
              onPrint={() => setLoginModalOpen(true)}
              onEditProject={() => setLoginModalOpen(true)}
              onDeleteProject={() => setLoginModalOpen(true)}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              {/* Form placeholder in guest mode */}
              <div className="lg:sticky lg:top-6">
                <div className="challenge-panel rounded-[24px] border border-white/[0.10] p-6 text-center">
                  <p className="text-muted-foreground text-sm">{t('tracker_guest_form_placeholder')}</p>
                  <Button
                    className="challenge-btn-primary mt-4 rounded-full px-6 font-extrabold"
                    onClick={() => setLoginModalOpen(true)}
                  >
                    {t('tracker_login_to_add')}
                  </Button>
                </div>
              </div>
              <ChallengePieceList
                project={activeProject}
                pieces={pieces}
                editingState={editingState}
                onEdit={() => setLoginModalOpen(true)}
                onDelete={() => setLoginModalOpen(true)}
                onReorder={() => {}}
                sortMode={sortMode}
                onSortChange={setSortMode}
                viewMode={viewMode}
                onViewChange={setViewMode}
              />
            </div>
          </div>
        </div>
        <LoginRequiredModal
          open={loginModalOpen}
          onOpenChange={setLoginModalOpen}
          message={t('tracker_login_to_manage')}
        />
      </>
    );
  }

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

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleCreateProject(input: ProjectInput) {
    await createProject(input);
    setView('project');
    setEditingState({ mode: 'create' });
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

  function handleBackToProject() {
    setView('project');
    setEditingState({ mode: 'create' });
  }

  function handleGoToPieces() {
    setView('pieces');
    setEditingState({ mode: 'create' });
  }

  function handleAddPiece() {
    setView('pieces');
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

  // ── Shared dialogs (used by both 'project' and 'pieces' views) ───────────────

  const sharedDialogs = (
    <>
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('tracker_edit_project')}</DialogTitle>
            <DialogDescription>{t('tracker_edit_project_hint')}</DialogDescription>
          </DialogHeader>
          {editingProject && (
            <ProjectForm
              defaultValues={{
                title: editingProject.title,
                description: editingProject.description,
                coverImage: editingProject.coverImage ?? '',
                goal: String(editingProject.goal),
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

      {trackerPdfData && (
        <TrackerPdfCustomizer
          open={pdfCustomizerOpen}
          onOpenChange={setPdfCustomizerOpen}
          trackerData={trackerPdfData}
        />
      )}
    </>
  );

  // ── Manager view ──────────────────────────────────────────────────────────────

  if (view === 'manager' || !activeProject) {
    return (
      <>
        <div className="print:hidden">
          <ProjectManager
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onCreate={handleCreateProject}
            onUpdate={updateProject}
            onDelete={deleteProject}
            onSelect={selectProject}
            onOpenProject={handleOpenProject}
          />
        </div>
        {activeProject && (
          <div className="hidden print:block">
            <TrackerPrintSummary project={activeProject} pieces={pieces} />
          </div>
        )}
      </>
    );
  }

  // ── Project detail view (full-width) ─────────────────────────────────────────

  if (view === 'project') {
    return (
      <div className="w-full animate-fade-in">
        <div className="print:hidden">
          <ChallengeHero
            project={activeProject}
            pieces={pieces}
            onBack={handleBack}
            onPrint={openPdfCustomizer}
            onEditProject={() => setEditingProject(activeProject)}
            onDeleteProject={() => setDeleteTargetProject(activeProject)}
            onViewPieces={handleGoToPieces}
            onAddPiece={handleAddPiece}
          />
        </div>

        <div className="hidden print:block">
          <TrackerPrintSummary project={activeProject} pieces={pieces} />
        </div>

        {sharedDialogs}
      </div>
    );
  }

  // ── Pieces view (two-column desktop / stacked mobile) ────────────────────────

  return (
    <div className="w-full animate-fade-in">
      <div className="print:hidden space-y-6">

        {/* Breadcrumb nav */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={handleBack}
            className="hover:text-foreground transition-colors font-bold"
          >
            {t('pm_title')}
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={handleBackToProject}
            className="hover:text-foreground transition-colors"
          >
            {activeProject.title}
          </button>
          <span>/</span>
          <span className="text-foreground font-semibold">{t('hero_view_pieces')}</span>
        </div>

        {/* Status filter bar */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'printed', 'post_processed', 'delivered', 'failed'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={statusFilter === value ? 'default' : 'outline'}
              size="sm"
              className="rounded-full text-xs font-bold"
              onClick={() => setStatusFilter(value)}
            >
              {value === 'all'
                ? t('tracker.filter.all')
                : t(`tracker.status.${value === 'post_processed' ? 'postProcessed' : value}` as const)}
            </Button>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
          {/* Form — sticky on desktop */}
          <div className="lg:sticky lg:top-6">
            <ChallengeForm
              project={activeProject}
              editingState={editingState}
              pieces={visiblePieces}
              onSave={handleSavePiece}
              onUpdate={handleUpdatePiece}
              onCancelEdit={() => setEditingState({ mode: 'create' })}
              activeSpools={activeSpools}
            />
          </div>

          {/* Piece list — paginated, no internal scroll */}
          <ChallengePieceList
            project={activeProject}
            pieces={visiblePieces}
            editingState={editingState}
            onEdit={(id) => {
              setEditingState({ mode: 'edit', id });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDelete={handleDeletePiece}
            onReorder={reorderPieces}
            sortMode={sortMode}
            onSortChange={setSortMode}
            viewMode={viewMode}
            onViewChange={setViewMode}
          />
        </div>
      </div>

      <div className="hidden print:block">
        <TrackerPrintSummary project={activeProject} pieces={pieces} />
      </div>

      {sharedDialogs}
    </div>
  );
}

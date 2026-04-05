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
import type { EditingState, FilamentProject, TrackerView } from './filament-types';
import type { PieceInput, ProjectInput } from './use-filament-storage';

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginPrompt() {
  const { loginWithGoogle } = useAuth();
  return (
    <div className="challenge-panel flex flex-col items-center justify-center gap-6 rounded-[24px] border border-white/[0.10] p-10 text-center">
      <div className="challenge-gradient-text text-4xl font-black leading-none">LUPRINTECH</div>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Inicia sesión con Google para acceder al{' '}
        <strong className="text-foreground">tracker de series y proyectos</strong>{' '}
        y guardar tu progreso en la nube.
      </p>
      <Button
        onClick={loginWithGoogle}
        className="challenge-btn-primary rounded-full px-6 font-extrabold"
        size="lg"
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        Iniciar sesión con Google
      </Button>
    </div>
  );
}

// ── Main tracker ──────────────────────────────────────────────────────────────

export function FilamentTracker() {
  const { user, loading: authLoading } = useAuth();

  const {
    loading, error,
    projects,
    activeProject, createProject, updateProject, deleteProject, selectProject,
    pieces, addPiece, updatePiece, deletePiece, reorderPieces,
  } = useFilamentStorage({ authLoading, userId: user?.id ?? null });

  const [view, setView]                 = useState<TrackerView>('manager');
  const [editingState, setEditingState] = useState<EditingState>({ mode: 'create' });
  const [editingProject, setEditingProject] = useState<FilamentProject | null>(null);
  const [deleteTargetProject, setDeleteTargetProject] = useState<FilamentProject | null>(null);

  function printProjectSummary() {
    setTimeout(() => {
      window.print();
    }, 100);
  }

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
        ? 'El backend activo no tiene cargadas las rutas del tracker. Reiniciá el backend en modo desarrollo o arrancalo con una build fresca.'
        : trackerError?.kind === 'auth'
          ? 'Tu sesión no está disponible para el tracker. Volvé a iniciar sesión con Google.'
          : `Error al cargar los proyectos: ${error.message}`;

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
          onPrint={printProjectSummary}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
            <DialogDescription>
              Los costes del tracker se recalcularán automáticamente si cambias el precio/kg.
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
              submitLabel="Guardar cambios"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTargetProject} onOpenChange={(open) => !open && setDeleteTargetProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proyecto</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTargetProject?.title}</strong> y todas sus piezas? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full">Cancelar</Button>
            </DialogClose>
            {deleteTargetProject && (
              <Button variant="destructive" className="rounded-full" onClick={() => handleDeleteProject(deleteTargetProject.id)}>
                Eliminar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

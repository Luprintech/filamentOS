import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { secsToString, formatCost } from './filament-storage';
import type { FilamentPiece, FilamentProject, EditingState } from './filament-types';

interface ChallengePieceListProps {
  project: FilamentProject;
  pieces: FilamentPiece[];
  editingState: EditingState;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
  onReorder: (orderedIds: string[]) => Promise<void> | void;
}

export function ChallengePieceList({
  project, pieces, editingState, onEdit, onDelete, onReorder,
}: ChallengePieceListProps) {
  const [deleteTarget, setDeleteTarget] = useState<FilamentPiece | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sorted = [...pieces].sort((a, b) => a.orderIndex - b.orderIndex);

  function movePiece(id: string, direction: 'up' | 'down') {
    const currentIndex = sorted.findIndex((piece) => piece.id === id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const next = [...sorted];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next.map((piece) => piece.id));
  }

  function reorderByIds(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const currentIndex = sorted.findIndex((piece) => piece.id === sourceId);
    const targetIndex = sorted.findIndex((piece) => piece.id === targetId);
    if (currentIndex === -1 || targetIndex === -1) return;
    const next = [...sorted];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next.map((piece) => piece.id));
  }

  function handleDragStart(id: string) {
    setDraggedId(id);
    setDragOverId(id);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleTouchStart(id: string) {
    setDraggedId(id);
    setDragOverId(id);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = element?.closest<HTMLElement>('[data-piece-id]');
    const targetId = card?.dataset.pieceId;
    if (targetId) {
      setDragOverId(targetId);
    }
  }

  function handleTouchEnd() {
    if (draggedId && dragOverId) {
      reorderByIds(draggedId, dragOverId);
    }
    handleDragEnd();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <section className="challenge-panel rounded-[24px] border border-white/[0.10] p-6">
      <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div>
          <h3 className="text-lg font-extrabold text-foreground">Listado de piezas</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pieces.length > 0 ? `${pieces.length} pieza(s) registrada(s)` : 'Aún sin piezas.'}
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-extrabold text-[hsl(var(--challenge-blue))] whitespace-nowrap">
          {pieces.length} / {project.goal}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-10 text-center text-sm leading-relaxed text-muted-foreground">
          Aún no hay piezas en este proyecto.<br />
          Añade la primera usando el formulario de la izquierda.
        </div>
      ) : (
        <div className="flex max-h-[680px] flex-col gap-3 overflow-y-auto pr-1">
          {sorted.map((piece) => {
            const isBeingEdited = editingState.mode === 'edit' && editingState.id === piece.id;
            return (
              <article
                key={piece.id}
                data-piece-id={piece.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverId(piece.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedId) reorderByIds(draggedId, piece.id);
                  handleDragEnd();
                }}
                className={`rounded-[22px] border p-4 transition-all ${
                  isBeingEdited
                    ? 'border-yellow-400/30 bg-yellow-400/5'
                    : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]'
                } ${dragOverId === piece.id && draggedId && draggedId !== piece.id ? 'ring-2 ring-[hsl(var(--challenge-blue))]/50' : ''}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-extrabold text-foreground">{piece.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {piece.timeLines} placa(s) de tiempo · {piece.gramLines} placa(s) de gramos
                    </p>
                  </div>
                  <button
                    type="button"
                    draggable
                    onDragStart={() => handleDragStart(piece.id)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={() => handleTouchStart(piece.id)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="inline-flex shrink-0 cursor-grab touch-none items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] p-2 text-muted-foreground active:cursor-grabbing"
                    aria-label={`Reordenar ${piece.name}`}
                    title="Arrastra para reordenar"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span className="shrink-0 rounded-[14px] bg-[hsl(var(--challenge-pink))]/15 px-3 py-1.5 text-xs font-extrabold text-[hsl(var(--challenge-pink))] whitespace-nowrap">
                    {piece.label}
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-[16px] border border-white/[0.05] bg-black/15 p-3">
                    <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Tiempo</p>
                    <p className="text-sm font-extrabold text-foreground">{secsToString(piece.totalSecs)}</p>
                  </div>
                  <div className="rounded-[16px] border border-white/[0.05] bg-black/15 p-3">
                    <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Gramos</p>
                    <p className="text-sm font-extrabold text-foreground">{piece.totalGrams.toFixed(1)}g</p>
                  </div>
                  <div className="rounded-[16px] border border-yellow-400/10 bg-yellow-400/5 p-3">
                    <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Coste</p>
                    <p className="text-sm font-extrabold text-yellow-400">
                      {formatCost(piece.totalCost, project.currency)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    size="sm" variant="outline"
                    className="rounded-full text-xs font-bold"
                    onClick={() => movePiece(piece.id, 'up')}
                    disabled={sorted[0]?.id === piece.id}
                  >
                    <ArrowUp className="mr-1 h-3.5 w-3.5" /> Subir
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="rounded-full text-xs font-bold"
                    onClick={() => movePiece(piece.id, 'down')}
                    disabled={sorted[sorted.length - 1]?.id === piece.id}
                  >
                    <ArrowDown className="mr-1 h-3.5 w-3.5" /> Bajar
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="rounded-full text-xs font-bold"
                    onClick={() => onEdit(piece.id)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="rounded-full border-destructive/30 bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => setDeleteTarget(piece)}
                  >
                    Eliminar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar pieza</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.label}: {deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" className="rounded-full" onClick={handleDeleteConfirm}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

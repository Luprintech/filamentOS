import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseTimeBlock, parseGramBlock, secsToString, formatCost } from './filament-storage';
import { getTrackerSuccessMessage } from './tracker-messages';
import type { EditingState, FilamentPiece, FilamentProject } from './filament-types';
import type { PieceInput } from './use-filament-storage';

interface FormValues {
  label: string;
  name: string;
  timeText: string;
  gramText: string;
}

interface ChallengeFormProps {
  project: FilamentProject;
  editingState: EditingState;
  pieces: FilamentPiece[];
  onSave: (input: PieceInput) => Promise<void> | void;
  onUpdate: (id: string, input: PieceInput) => Promise<void> | void;
  onCancelEdit: () => void;
}

export function ChallengeForm({
  project,
  editingState,
  pieces,
  onSave,
  onUpdate,
  onCancelEdit,
}: ChallengeFormProps) {
  const isEditing = editingState.mode === 'edit';

  const { register, handleSubmit, watch, reset, setValue, setError, formState: { errors } } =
    useForm<FormValues>({ defaultValues: { label: '', name: '', timeText: '', gramText: '' } });

  const [successMsg, setSuccessMsg] = useState('');
  const [milestoneUnlocked, setMilestoneUnlocked] = useState<number | null>(null);

  const timeText = watch('timeText') ?? '';
  const gramText = watch('gramText') ?? '';

  const previewTime  = parseTimeBlock(timeText);
  const previewGrams = parseGramBlock(gramText);
  const previewCost  = previewGrams.totalGrams * (project.pricePerKg / 1000);

  // Populate form when entering edit mode
  useEffect(() => {
    if (editingState.mode === 'edit') {
      const piece = pieces.find((p) => p.id === editingState.id);
      if (piece) {
        setValue('label',    piece.label);
        setValue('name',     piece.name);
        setValue('timeText', piece.timeText);
        setValue('gramText', piece.gramText);
        setSuccessMsg('');
        setMilestoneUnlocked(null);
      }
    }
  }, [editingState, pieces, setValue]);

  function handleCancel() {
    reset({ label: '', name: '', timeText: '', gramText: '' });
    setSuccessMsg('');
    setMilestoneUnlocked(null);
    onCancelEdit();
  }

  function onSubmit(values: FormValues) {
    setSuccessMsg('');

    if (!values.label.trim()) {
      setError('label', { message: 'Añade una etiqueta (día, número, nombre...).' });
      return;
    }
    if (!values.name.trim()) {
      setError('name', { message: 'Ponle nombre a la pieza.' });
      return;
    }

    const time  = parseTimeBlock(values.timeText);
    if (time.validLines === 0) {
      setError('timeText', { message: 'No hay tiempos válidos. Usa algo como 2h 22m o 34m 14s.' });
      return;
    }

    const grams = parseGramBlock(values.gramText);
    if (grams.validLines === 0) {
      setError('gramText', { message: 'No hay gramos válidos. Escribe un número por línea.' });
      return;
    }

    const editingId = isEditing ? (editingState as { mode: 'edit'; id: string }).id : null;

    const input: PieceInput = {
      label: values.label.trim(),
      name:  values.name.trim(),
      timeText: values.timeText,
      gramText: values.gramText,
    };

    if (isEditing && editingId) {
      onUpdate(editingId, input);
      const feedback = getTrackerSuccessMessage(project, 'update', pieces.length);
      setSuccessMsg(feedback.message);
      setMilestoneUnlocked(feedback.milestone);
    } else {
      onSave(input);
      const feedback = getTrackerSuccessMessage(project, 'create', pieces.length + 1);
      setSuccessMsg(feedback.message);
      setMilestoneUnlocked(feedback.milestone);
    }

    reset({ label: '', name: '', timeText: '', gramText: '' });
    onCancelEdit();
  }

  return (
    <section className="challenge-panel rounded-[24px] border border-white/[0.10] p-6">
      <h3 className="mb-1 text-lg font-extrabold text-foreground">Registrar pieza</h3>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Añade la etiqueta, el nombre, los tiempos por placa y los gramos por placa.
      </p>

      {isEditing && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1.5 text-xs font-bold text-yellow-300">
          ✏️ Editando una pieza guardada
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Etiqueta
            </Label>
            <Input
              id="ch-label"
              placeholder="Ej: Día 1, Pieza 5, Versión A..."
              className="challenge-input"
              {...register('label')}
            />
            {errors.label && (
              <p className="text-xs font-semibold text-destructive">{errors.label.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Nombre de la pieza
            </Label>
            <Input
              id="ch-name"
              placeholder="Ej: Goku, Totoro, Soporte..."
              className="challenge-input"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs font-semibold text-destructive">{errors.name.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-time" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tiempos por placa
          </Label>
          <textarea
            id="ch-time"
            rows={4}
            placeholder={'Un tiempo por línea\n2h 22m\n34m 14s\n1h 2m'}
            className={cn(
              'challenge-textarea w-full resize-y rounded-[18px] border border-white/[0.09] bg-white/[0.05] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-[hsl(var(--challenge-blue))]/70 focus:shadow-[0_0_0_3px_hsl(var(--challenge-blue)/0.12)] focus:-translate-y-px',
            )}
            {...register('timeText')}
          />
          <p className="text-[0.8rem] text-muted-foreground">Formatos válidos: 2h 22m · 34m 14s · 59s · 1h.</p>
          {errors.timeText && (
            <p className="text-xs font-semibold text-destructive">{errors.timeText.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-grams" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Gramos por placa
          </Label>
          <textarea
            id="ch-grams"
            rows={4}
            placeholder={'Un número por línea\n12.5\n8,3\n15.7'}
            className={cn(
              'challenge-textarea w-full resize-y rounded-[18px] border border-white/[0.09] bg-white/[0.05] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-[hsl(var(--challenge-blue))]/70 focus:shadow-[0_0_0_3px_hsl(var(--challenge-blue)/0.12)] focus:-translate-y-px',
            )}
            {...register('gramText')}
          />
          <p className="text-[0.8rem] text-muted-foreground">Acepta decimales con punto o coma. Un número por línea.</p>
          {errors.gramText && (
            <p className="text-xs font-semibold text-destructive">{errors.gramText.message}</p>
          )}
        </div>

        {/* Live preview — 3 cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[18px] border border-white/[0.08] bg-gradient-to-b from-[hsl(var(--challenge-pink))]/10 to-[hsl(var(--challenge-blue))]/8 p-4">
            <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground">Tiempo</p>
            <p className="text-lg font-black text-[hsl(var(--challenge-pink))]">
              {secsToString(previewTime.totalSecs)}
            </p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              {previewTime.validLines > 0 ? `${previewTime.validLines} placa(s)` : '—'}
            </p>
          </div>
          <div className="rounded-[18px] border border-white/[0.08] bg-gradient-to-b from-[hsl(var(--challenge-green))]/10 to-[hsl(var(--challenge-blue))]/8 p-4">
            <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground">Gramos</p>
            <p className="text-lg font-black text-[hsl(var(--challenge-green))]">
              {previewGrams.totalGrams.toFixed(1)}g
            </p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              {previewGrams.validLines > 0 ? `${previewGrams.validLines} placa(s)` : '—'}
            </p>
          </div>
          <div className="rounded-[18px] border border-yellow-400/20 bg-yellow-400/8 p-4">
            <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground">Coste</p>
            <p className="text-lg font-black text-yellow-400">
              {formatCost(previewCost, project.currency)}
            </p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              {project.pricePerKg > 0 ? `${formatCost(project.pricePerKg, project.currency)}/kg` : 'Sin precio config.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="challenge-btn-primary rounded-full font-extrabold">
            {isEditing ? 'Guardar cambios' : 'Guardar pieza'}
          </Button>
          {isEditing && (
            <Button type="button" variant="outline" onClick={handleCancel} className="rounded-full font-bold">
              Cancelar
            </Button>
          )}
        </div>

        {successMsg && (
          <div className={cn(
            'rounded-2xl px-4 py-4 text-sm text-foreground transition-all',
            milestoneUnlocked
              ? 'tracker-milestone-banner border border-[hsl(var(--challenge-pink))]/25'
              : 'border border-[hsl(var(--challenge-blue))]/25 bg-[hsl(var(--challenge-blue))]/10'
          )}>
            {milestoneUnlocked && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.18em] text-white">
                  ✨ Hito desbloqueado
                </span>
                <span className="inline-flex items-center rounded-full bg-[hsl(var(--challenge-pink))]/20 px-3 py-1 text-xs font-extrabold text-white">
                  {milestoneUnlocked} piezas
                </span>
              </div>
            )}
            <p className={cn('font-bold', milestoneUnlocked && 'text-white text-base')}>
              {successMsg}
            </p>
            {milestoneUnlocked && (
              <p className="mt-2 text-xs font-medium text-white/85">
                Seguís sumando piezas y el tracker te acompaña como corresponde. Vamos por la siguiente.
              </p>
            )}
          </div>
        )}
      </form>

      <p className="mt-4 text-[0.82rem] leading-relaxed text-muted-foreground">
        Los datos se guardan en tu cuenta y están disponibles desde cualquier dispositivo.
      </p>
    </section>
  );
}

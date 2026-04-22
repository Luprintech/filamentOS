import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseTimeBlock, formatCost } from './filament-storage';
import { getTrackerSuccessMessage } from './tracker-messages';
import type { EditingState, FilamentPiece, FilamentProject, PieceFilamentInput } from './filament-types';
import type { PieceInput } from './use-filament-storage';
import { useTranslation } from 'react-i18next';
import type { Spool } from '@/features/inventory/types';
import { Plus, Trash2, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FormValues {
  label: string;
  name: string;
  timeText: string;
}

interface FilamentRow {
  key: string;            // stable client-side key
  mode: 'spool' | 'manual';
  spoolId: string;        // '' if manual
  colorHex: string;
  colorName: string;
  brand: string;
  material: string;
  grams: string;          // string for input control
}

function emptyRow(): FilamentRow {
  return {
    key: crypto.randomUUID(),
    mode: 'manual',
    spoolId: '',
    colorHex: '#888888',
    colorName: '',
    brand: '',
    material: '',
    grams: '',
  };
}

function rowFromSpool(spool: Spool): Partial<FilamentRow> {
  return {
    mode: 'spool',
    spoolId: spool.id,
    colorHex: spool.colorHex,
    colorName: spool.color,
    brand: spool.brand,
    material: spool.material,
  };
}

// ── Compress image ─────────────────────────────────────────────────────────────

async function compressImage(file: File, maxPx = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Filament row component ─────────────────────────────────────────────────────

interface FilamentRowProps {
  row: FilamentRow;
  index: number;
  canDelete: boolean;
  activeSpools: Spool[];
  pricePerKg: number;
  currency: string;
  onChange: (key: string, patch: Partial<FilamentRow>) => void;
  onDelete: (key: string) => void;
}

function FilamentRowInput({ row, index, canDelete, activeSpools, pricePerKg, currency, onChange, onDelete }: FilamentRowProps) {
  const { t } = useTranslation();

  const grams = parseFloat(row.grams) || 0;

  // Compute per-row cost preview
  let rowCost = 0;
  if (grams > 0) {
    if (row.mode === 'spool' && row.spoolId) {
      const spool = activeSpools.find((s) => s.id === row.spoolId);
      if (spool && spool.totalGrams > 0) {
        rowCost = grams * (spool.price / spool.totalGrams);
      } else {
        rowCost = grams * (pricePerKg / 1000);
      }
    } else {
      rowCost = grams * (pricePerKg / 1000);
    }
  }

  function handleSpoolChange(spoolId: string) {
    if (!spoolId) {
      onChange(row.key, { spoolId: '', mode: 'spool' });
      return;
    }
    const spool = activeSpools.find((s) => s.id === spoolId);
    if (spool) {
      onChange(row.key, rowFromSpool(spool));
    }
  }

  return (
    <div className="relative rounded-[16px] border border-white/[0.10] bg-white/[0.03] p-3 space-y-3">
      {/* Row number + delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/20 shadow"
            style={{ backgroundColor: row.colorHex }}
          />
          <span className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
            {t('tracker.filaments.color')} {index + 1}
          </span>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(row.key)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      {activeSpools.length > 0 && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange(row.key, { mode: 'spool', spoolId: row.spoolId || '' })}
            className={cn(
              'rounded-full px-3 py-1 text-[0.72rem] font-bold transition-colors border',
              row.mode === 'spool'
                ? 'border-[hsl(var(--challenge-pink))]/40 bg-[hsl(var(--challenge-pink))]/10 text-[hsl(var(--challenge-pink))]'
                : 'border-border/50 bg-transparent text-muted-foreground hover:border-border',
            )}
          >
            {t('tracker.filaments.fromInventory')}
          </button>
          <button
            type="button"
            onClick={() => onChange(row.key, { mode: 'manual', spoolId: '' })}
            className={cn(
              'rounded-full px-3 py-1 text-[0.72rem] font-bold transition-colors border',
              row.mode === 'manual'
                ? 'border-[hsl(var(--challenge-blue))]/40 bg-[hsl(var(--challenge-blue))]/10 text-[hsl(var(--challenge-blue))]'
                : 'border-border/50 bg-transparent text-muted-foreground hover:border-border',
            )}
          >
            {t('tracker.filaments.manual')}
          </button>
        </div>
      )}

      {/* Spool selector */}
      {row.mode === 'spool' && activeSpools.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
            {t('tracker.filaments.spool')}
          </Label>
          <select
            value={row.spoolId}
            onChange={(e) => handleSpoolChange(e.target.value)}
            className="challenge-input w-full rounded-[10px] border border-white/[0.10] bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('tracker.complete.noSpool')}</option>
            {activeSpools.map((spool) => (
              <option key={spool.id} value={spool.id}>
                {spool.brand} · {spool.material} · {spool.color} ({spool.remainingG.toFixed(0)} g restantes)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Manual fields */}
      {row.mode === 'manual' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.filaments.colorName')}
            </Label>
            <Input
              placeholder={t('tracker.filaments.colorNamePlaceholder')}
              value={row.colorName}
              onChange={(e) => onChange(row.key, { colorName: e.target.value })}
              className="challenge-input h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.filaments.colorHex')}
            </Label>
            <div className="flex gap-1.5">
              <input
                type="color"
                value={row.colorHex}
                onChange={(e) => onChange(row.key, { colorHex: e.target.value })}
                className="h-8 w-10 shrink-0 cursor-pointer rounded-[8px] border border-white/[0.12] bg-transparent p-0.5"
                title={t('tracker.filaments.pickColor')}
              />
              <Input
                value={row.colorHex}
                onChange={(e) => onChange(row.key, { colorHex: e.target.value })}
                className="challenge-input h-8 text-sm font-mono"
                maxLength={7}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.brand')} <span className="normal-case font-normal opacity-60">(opt.)</span>
            </Label>
            <Input
              placeholder="Bambu Lab"
              value={row.brand}
              onChange={(e) => onChange(row.key, { brand: e.target.value })}
              className="challenge-input h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.material')} <span className="normal-case font-normal opacity-60">(opt.)</span>
            </Label>
            <Input
              placeholder="PLA"
              value={row.material}
              onChange={(e) => onChange(row.key, { material: e.target.value })}
              className="challenge-input h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Grams + cost */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
            {t('tracker.filaments.grams')}
          </Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="25.3"
              value={row.grams}
              onChange={(e) => onChange(row.key, { grams: e.target.value })}
              className="challenge-input h-8 text-sm pr-7"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.72rem] text-muted-foreground pointer-events-none">g</span>
          </div>
        </div>
        {rowCost > 0 && (
          <div className="text-right pb-0.5">
            <p className="text-[0.72rem] text-muted-foreground">{t('form_cost_preview')}</p>
            <p className="text-sm font-black text-yellow-400">{formatCost(rowCost, currency)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

interface ChallengeFormProps {
  project: FilamentProject;
  editingState: EditingState;
  pieces: FilamentPiece[];
  onSave: (input: PieceInput) => Promise<void> | void;
  onUpdate: (id: string, input: PieceInput) => Promise<void> | void;
  onCancelEdit: () => void;
  activeSpools?: Spool[];
}

export function ChallengeForm({
  project,
  editingState,
  pieces,
  onSave,
  onUpdate,
  onCancelEdit,
  activeSpools = [],
}: ChallengeFormProps) {
  const { t } = useTranslation();
  const isEditing = editingState.mode === 'edit';

  const { register, handleSubmit, watch, reset, setValue, setError, formState: { errors } } =
    useForm<FormValues>({ defaultValues: { label: '', name: '', timeText: '' } });

  const [successMsg, setSuccessMsg]               = useState('');
  const [milestoneUnlocked, setMilestoneUnlocked] = useState<number | null>(null);
  const [imagePreview, setImagePreview]           = useState<string | null>(null);
  const [imageError, setImageError]               = useState('');
  const [filamentRows, setFilamentRows]           = useState<FilamentRow[]>([emptyRow()]);
  const [filamentError, setFilamentError]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timeText = watch('timeText') ?? '';
  const previewTime = parseTimeBlock(timeText);

  // Total grams and cost from filament rows
  const totalGrams = filamentRows.reduce((s, r) => s + (parseFloat(r.grams) || 0), 0);
  const totalCost  = filamentRows.reduce((s, r) => {
    const g = parseFloat(r.grams) || 0;
    if (g === 0) return s;
    if (r.mode === 'spool' && r.spoolId) {
      const spool = activeSpools.find((sp) => sp.id === r.spoolId);
      if (spool && spool.totalGrams > 0) return s + g * (spool.price / spool.totalGrams);
    }
    return s + g * (project.pricePerKg / 1000);
  }, 0);

  // ── Reset helpers ──────────────────────────────────────────────────────────

  function resetForm() {
    reset({ label: '', name: '', timeText: '' });
    setImagePreview(null);
    setImageError('');
    setSuccessMsg('');
    setMilestoneUnlocked(null);
    setFilamentRows([emptyRow()]);
    setFilamentError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Populate when editing ──────────────────────────────────────────────────

  useEffect(() => {
    if (editingState.mode === 'edit') {
      const piece = pieces.find((p) => p.id === editingState.id);
      if (piece) {
        setValue('label',    piece.label);
        setValue('name',     piece.name);
        setValue('timeText', piece.timeText);
        setImagePreview(piece.imageUrl ?? null);
        setImageError('');
        setSuccessMsg('');
        setMilestoneUnlocked(null);
        setFilamentError('');

        if (piece.filaments && piece.filaments.length > 0) {
          setFilamentRows(piece.filaments.map((f) => ({
            key: f.id,
            mode: f.spoolId ? 'spool' : 'manual',
            spoolId: f.spoolId ?? '',
            colorHex: f.colorHex,
            colorName: f.colorName,
            brand: f.brand,
            material: f.material,
            grams: String(f.grams),
          })));
        } else {
          // Legacy piece: create one manual row from totalGrams
          setFilamentRows([{
            ...emptyRow(),
            colorName: piece.spoolId
              ? (activeSpools.find((s) => s.id === piece.spoolId)?.color ?? '')
              : '',
            colorHex: piece.spoolId
              ? (activeSpools.find((s) => s.id === piece.spoolId)?.colorHex ?? '#888888')
              : '#888888',
            brand: piece.spoolId
              ? (activeSpools.find((s) => s.id === piece.spoolId)?.brand ?? '')
              : '',
            material: piece.spoolId
              ? (activeSpools.find((s) => s.id === piece.spoolId)?.material ?? '')
              : '',
            mode: piece.spoolId ? 'spool' : 'manual',
            spoolId: piece.spoolId ?? '',
            grams: String(piece.totalGrams),
          }]);
        }
      }
    }
  }, [editingState, pieces, setValue, activeSpools]);

  // ── Filament row handlers ──────────────────────────────────────────────────

  const handleRowChange = useCallback((key: string, patch: Partial<FilamentRow>) => {
    setFilamentRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
    setFilamentError('');
  }, []);

  const handleRowDelete = useCallback((key: string) => {
    setFilamentRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  function handleAddRow() {
    setFilamentRows((prev) => [...prev, emptyRow()]);
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError(t('form_err_img_type')); return; }
    if (file.size > 10 * 1024 * 1024)   { setImageError(t('form_err_img_size')); return; }
    setImageError('');
    try {
      setImagePreview(await compressImage(file));
    } catch {
      setImageError(t('form_err_img_process'));
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function onSubmit(values: FormValues) {
    setSuccessMsg('');

    if (!values.label.trim()) { setError('label',    { message: t('form_err_label') }); return; }
    if (!values.name.trim())  { setError('name',     { message: t('form_err_name')  }); return; }

    const time = parseTimeBlock(values.timeText);
    if (time.validLines === 0) { setError('timeText', { message: t('form_err_time') }); return; }

    // Validate filament rows
    const validRows = filamentRows.filter((r) => parseFloat(r.grams) > 0);
    if (validRows.length === 0) {
      setFilamentError(t('tracker.filaments.errorRequired'));
      return;
    }

    const filaments: PieceFilamentInput[] = validRows.map((r) => ({
      spoolId:   r.mode === 'spool' && r.spoolId ? r.spoolId : null,
      colorHex:  r.colorHex,
      colorName: r.colorName,
      brand:     r.brand,
      material:  r.material,
      grams:     parseFloat(r.grams),
    }));

    const gramTotal = filaments.reduce((s, f) => s + f.grams, 0);

    const editingId = isEditing ? (editingState as { mode: 'edit'; id: string }).id : null;

    const input: PieceInput = {
      label:     values.label.trim(),
      name:      values.name.trim(),
      timeText:  values.timeText,
      gramText:  String(gramTotal),
      imageUrl:  imagePreview ?? null,
      filaments,
    };

    if (isEditing && editingId) {
      onUpdate(editingId, input);
      const fb = getTrackerSuccessMessage(project, 'update', pieces.length);
      setSuccessMsg(fb.message);
      setMilestoneUnlocked(fb.milestone);
    } else {
      onSave(input);
      const fb = getTrackerSuccessMessage(project, 'create', pieces.length + 1);
      setSuccessMsg(fb.message);
      setMilestoneUnlocked(fb.milestone);
    }

    resetForm();
    onCancelEdit();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="challenge-panel rounded-[24px] border border-white/[0.10] p-6">
      <h3 className="mb-1 text-lg font-extrabold text-foreground">{t('form_title')}</h3>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t('form_subtitle')}</p>

      {isEditing && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1.5 text-xs font-bold text-yellow-300">
          {t('form_editing_badge')}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Label + Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('form_label')}
            </Label>
            <Input id="ch-label" placeholder={t('form_label_placeholder')} className="challenge-input" {...register('label')} />
            {errors.label && <p className="text-xs font-semibold text-destructive">{errors.label.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('form_name')}
            </Label>
            <Input id="ch-name" placeholder={t('form_name_placeholder')} className="challenge-input" {...register('name')} />
            {errors.name && <p className="text-xs font-semibold text-destructive">{errors.name.message}</p>}
          </div>
        </div>

        {/* Time */}
        <div className="space-y-1.5">
          <Label htmlFor="ch-time" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('form_time')}
          </Label>
          <Input id="ch-time" placeholder={t('form_time_placeholder')} className="challenge-input" {...register('timeText')} />
          <p className="text-[0.8rem] text-muted-foreground">{t('form_time_hint')}</p>
          {errors.timeText && <p className="text-xs font-semibold text-destructive">{errors.timeText.message}</p>}
        </div>

        {/* ── Filaments section ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.filaments.title')}
            </Label>
            {totalGrams > 0 && (
              <span className="text-[0.72rem] text-muted-foreground font-semibold">
                {totalGrams.toFixed(1)} g total
              </span>
            )}
          </div>

          <div className="space-y-2">
            {filamentRows.map((row, i) => (
              <FilamentRowInput
                key={row.key}
                row={row}
                index={i}
                canDelete={filamentRows.length > 1}
                activeSpools={activeSpools}
                pricePerKg={project.pricePerKg}
                currency={project.currency}
                onChange={handleRowChange}
                onDelete={handleRowDelete}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-bold"
            onClick={handleAddRow}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('tracker.filaments.addColor')}
          </Button>

          {filamentError && (
            <p className="text-xs font-semibold text-destructive">{filamentError}</p>
          )}
        </div>

        {/* Image upload */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('form_image')} <span className="normal-case font-normal">{t('form_image_optional')}</span>
          </Label>
          <div className="flex items-start gap-3">
            {imagePreview ? (
              <div className="relative shrink-0">
                <img src={imagePreview} alt={t('cf_image_preview')} className="h-20 w-20 rounded-[14px] object-cover border border-white/[0.12]" />
                <button
                  type="button"
                  onClick={() => { setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[0.65rem] font-black text-white shadow-md"
                  aria-label={t('delete')}
                >✕</button>
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-white/[0.18] bg-white/[0.03] text-muted-foreground">
                <span className="text-2xl">📷</span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Button type="button" variant="outline" size="sm" className="rounded-full text-xs font-bold" onClick={() => fileInputRef.current?.click()}>
                {imagePreview ? t('form_image_change') : t('form_image_upload')}
              </Button>
              <p className="text-[0.75rem] text-muted-foreground">{t('form_image_hint')}</p>
              {imageError && <p className="text-xs font-semibold text-destructive">{imageError}</p>}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Live cost preview */}
        <div className="rounded-[18px] border border-yellow-400/20 bg-yellow-400/8 p-4">
          <p className="mb-1 text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground">{t('form_cost_preview')}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-lg font-black text-yellow-400">{formatCost(totalCost, project.currency)}</p>
            {totalGrams > 0 && (
              <p className="text-[0.75rem] text-muted-foreground">{totalGrams.toFixed(1)} g</p>
            )}
          </div>
          <p className="mt-1 text-[0.75rem] text-muted-foreground">
            {project.pricePerKg > 0 ? `${formatCost(project.pricePerKg, project.currency)}/kg (proyecto)` : t('form_no_price')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="challenge-btn-primary rounded-full font-extrabold">
            {isEditing ? t('form_save_changes') : t('form_save')}
          </Button>
          {isEditing && (
            <Button type="button" variant="outline" onClick={() => { resetForm(); onCancelEdit(); }} className="rounded-full font-bold">
              {t('form_cancel')}
            </Button>
          )}
        </div>

        {/* Success message */}
        {successMsg && (
          <div className={cn(
            'rounded-2xl px-4 py-4 text-sm text-foreground transition-all',
            milestoneUnlocked
              ? 'tracker-milestone-banner border border-[hsl(var(--challenge-pink))]/25'
              : 'border border-[hsl(var(--challenge-blue))]/25 bg-[hsl(var(--challenge-blue))]/10',
          )}>
            {milestoneUnlocked && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.18em] text-white">
                  {t('form_milestone_badge')}
                </span>
                <span className="inline-flex items-center rounded-full bg-[hsl(var(--challenge-pink))]/20 px-3 py-1 text-xs font-extrabold text-white">
                  {milestoneUnlocked} {t('hero_pieces')}
                </span>
              </div>
            )}
            <p className={cn('font-bold', milestoneUnlocked && 'text-white text-base')}>{successMsg}</p>
            {milestoneUnlocked && (
              <p className="mt-2 text-xs font-medium text-white/85">{t('form_milestone_sub')}</p>
            )}
          </div>
        )}
      </form>

      <p className="mt-4 text-[0.82rem] leading-relaxed text-muted-foreground">{t('form_cloud_hint')}</p>
    </section>
  );
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, generateId } from '@/lib/utils';
import { parseTimeBlock, secsToString, formatCost } from './filament-storage';
import { getTrackerSuccessMessage } from './tracker-messages';
import type { EditingState, FilamentPiece, FilamentProject, PieceFilamentInput, PieceMaterialInput } from './filament-types';
import type { PieceInput } from './use-filament-storage';
import { useTranslation } from 'react-i18next';
import type { Spool } from '@/features/inventory/types';
import { Plus, Trash2, X, UploadCloud, Loader2, Box, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { analyzeGcodeFile } from '@/features/calculator/api/analyze-gcode';
import { Import3MFModal, type Import3MFResult } from '@/components/import-3mf-modal';
import { ImageUpload } from '@/components/ui/image-upload';

const trackerSelectClassName = 'h-10 w-full rounded-[12px] border border-border/60 bg-card/80 px-3 text-sm font-medium text-foreground shadow-sm ring-offset-background transition focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 dark:border-white/[0.10] dark:bg-white/[0.04]';
const trackerDateButtonClassName = 'challenge-input flex h-10 w-full items-center justify-between rounded-[12px] border border-border/60 bg-card/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/[0.10] dark:bg-white/[0.04]';

function formatDateLabel(value: string | null, locale: string): string {
  if (!value) return 'Seleccionar fecha';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Seleccionar fecha';
  return new Intl.DateTimeFormat(locale || 'es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function getCalendarMatrix(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startDay = (start.getDay() + 6) % 7;
  const daysInMonth = end.getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// ── Types ──────────────────────────────────────────────────────────────────────

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024;
const IMAGE_COMPRESSION_MAX_PX = 600;
const IMAGE_COMPRESSION_QUALITY = 0.6;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSupportedImageType(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number]);
}

const formSchema = z.object({
  label: z.string().trim().min(1, 'form_err_label'),
  name: z.string().trim().min(1, 'form_err_name'),
  timeHours: z.string(),
  timeMinutes: z.string(),
  notes: z.string(),
  status: z.enum(['pending', 'printed', 'post_processed', 'delivered', 'failed']),
  printedAt: z.string(),
  incident: z.string(),
  plateCount: z.coerce.number().int('tracker.plateCount.invalid').min(1, 'tracker.plateCount.invalid'),
  fileLink: z.string().trim().refine((value) => value.length === 0 || isValidUrl(value), 'tracker.fileLink.invalid'),
});

type FormValues = z.input<typeof formSchema>;

interface MaterialRow {
  key: string;
  name: string;
  quantity: string;
  cost: string;
}

function emptyMaterialRow(): MaterialRow {
  return {
    key: generateId(),
    name: '',
    quantity: '',
    cost: '',
  };
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
  spoolPrice: string;
}

function emptyRow(): FilamentRow {
  return {
    key: generateId(),
    mode: 'manual',
    spoolId: '',
    colorHex: '#888888',
    colorName: '',
    brand: '',
    material: '',
    grams: '',
    spoolPrice: '20',
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

export async function compressImage(
  file: File,
  maxPx = IMAGE_COMPRESSION_MAX_PX,
  quality = IMAGE_COMPRESSION_QUALITY,
): Promise<string> {
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
  currency: string;
  onChange: (key: string, patch: Partial<FilamentRow>) => void;
  onDelete: (key: string) => void;
}

function FilamentRowInput({ row, index, canDelete, activeSpools, currency, onChange, onDelete }: FilamentRowProps) {
  const { t } = useTranslation();

  const grams = parseFloat(row.grams) || 0;

  // Compute per-row cost preview
  let rowCost = 0;
  if (grams > 0) {
    if (row.mode === 'spool' && row.spoolId) {
      const spool = activeSpools.find((s) => s.id === row.spoolId);
      if (spool && spool.totalGrams > 0) {
        rowCost = grams * (spool.price / spool.totalGrams);
      }
    } else {
      const manualPrice = parseFloat(row.spoolPrice) || 20;
      rowCost = grams * (manualPrice / 1000);
    }
  }

  function handleSpoolChange(spoolId: string) {
    if (!spoolId || spoolId === '__none__') {
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
          <Select value={row.spoolId} onValueChange={handleSpoolChange}>
            <SelectTrigger className={trackerSelectClassName}>
              <SelectValue placeholder={t('tracker.complete.noSpool')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('tracker.complete.noSpool')}</SelectItem>
              {activeSpools.map((spool) => (
                <SelectItem key={spool.id} value={spool.id}>
                  {spool.brand} · {spool.material} · {spool.color} ({spool.remainingG.toFixed(0)} g restantes)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <div className="space-y-1 col-span-2">
            <Label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.filaments.manualPrice')}
            </Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={row.spoolPrice}
                onChange={(e) => onChange(row.key, { spoolPrice: e.target.value || '20' })}
                className="challenge-input h-8 text-sm pr-8"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.72rem] text-muted-foreground pointer-events-none">{currency}</span>
            </div>
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
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: { label: '', name: '', timeHours: '0', timeMinutes: '0', notes: '', status: 'printed', printedAt: '', incident: '', plateCount: 1, fileLink: '' },
    });

  const [successMsg, setSuccessMsg]               = useState('');
  const [milestoneUnlocked, setMilestoneUnlocked] = useState<number | null>(null);
  const [imagePreview, setImagePreview]           = useState<string | null>(null);
  const [imageError, setImageError]               = useState('');
  const [filamentRows, setFilamentRows]           = useState<FilamentRow[]>([emptyRow()]);
  const [filamentError, setFilamentError]         = useState('');
  const [materialRows, setMaterialRows]           = useState<MaterialRow[]>([]);
  const [calendarOpen, setCalendarOpen]           = useState(false);
  const [calendarMonth, setCalendarMonth]         = useState(() => new Date());
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // ── G-code / 3MF auto-fill ─────────────────────────────────────────────────
  const gcodeFileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [import3mfOpen, setImport3mfOpen] = useState(false);
  type FeedbackKind = 'idle' | 'success' | 'partial' | 'error';
  const [gcodeStatus, setGcodeStatus] = useState<{ kind: FeedbackKind; message?: string }>({ kind: 'idle' });

  const timeHours = watch('timeHours') ?? '0';
  const timeMinutes = watch('timeMinutes') ?? '0';
  const printedAt = watch('printedAt') || '';
  const plateCount = watch('plateCount') ?? 1;
  const derivedTimeText = `${parseInt(timeHours || '0', 10) || 0}h ${parseInt(timeMinutes || '0', 10) || 0}m 0s`;
  const previewTime = parseTimeBlock(derivedTimeText);
  const calendarWeeks = getCalendarMatrix(calendarMonth);
  const todayIso = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  useEffect(() => {
    if (!calendarOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [calendarOpen]);

  // Total grams and cost from filament rows
  const totalGrams = filamentRows.reduce((s, r) => s + (parseFloat(r.grams) || 0), 0);
    const totalCost  = filamentRows.reduce((s, r) => {
      const g = parseFloat(r.grams) || 0;
      if (g === 0) return s;
      if (r.mode === 'spool' && r.spoolId) {
        const spool = activeSpools.find((sp) => sp.id === r.spoolId);
        if (spool && spool.totalGrams > 0) return s + g * (spool.price / spool.totalGrams);
        return s;
      }
      return s + g * ((parseFloat(r.spoolPrice) || 20) / 1000);
    }, 0);
  const totalMaterialCost = materialRows.reduce((sum, row) => sum + (parseFloat(row.cost) || 0), 0);

  // ── Reset helpers ──────────────────────────────────────────────────────────

  function resetForm() {
    reset({ label: '', name: '', timeHours: '0', timeMinutes: '0', notes: '', status: 'printed', printedAt: '', incident: '', plateCount: 1, fileLink: '' });
    setImagePreview(null);
    setImageError('');
    setSuccessMsg('');
    setMilestoneUnlocked(null);
    setFilamentRows([emptyRow()]);
    setFilamentError('');
    setMaterialRows([]);
    setGcodeStatus({ kind: 'idle' });
    setIsProcessingImage(false);
  }

  // ── G-code analysis ────────────────────────────────────────────────────────

  async function handleGcodeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsAnalyzing(true);
    setGcodeStatus({ kind: 'idle' });
    try {
      const res = await analyzeGcodeFile(file);
      if (res.error) throw new Error(res.error);
      const totalSecs   = res.data?.printingTimeSeconds ?? 0;
      const weightGrams = res.data?.filamentWeightGrams  ?? 0;

      if (totalSecs > 0) {
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        setValue('timeHours', String(h));
        setValue('timeMinutes', String(m));
      }
      if (weightGrams > 0) {
        setFilamentRows((prev) =>
          prev.map((r, i) => i === 0 ? { ...r, grams: String(Math.round(weightGrams * 10) / 10) } : r)
        );
      }

      const filledTime  = totalSecs   > 0;
      const filledGrams = weightGrams > 0;
      if (filledTime && filledGrams) {
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        setGcodeStatus({ kind: 'success', message: t('tracker.gcode_ok', { h, m, g: weightGrams.toFixed(1) }) });
      } else if (filledTime || filledGrams) {
        setGcodeStatus({ kind: 'partial', message: t('tracker.gcode_partial') });
      } else {
        setGcodeStatus({ kind: 'partial', message: t('tracker.gcode_empty') });
      }
    } catch (err) {
      setGcodeStatus({ kind: 'error', message: err instanceof Error ? err.message : t('tracker.gcode_error') });
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ── 3MF import ─────────────────────────────────────────────────────────────

  function handle3MFConfirm(result: Import3MFResult) {
    // Fill time
    const totalMin = result.printTimeMinutes;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    setValue('timeHours', String(h));
    setValue('timeMinutes', String(m));
    setValue('plateCount', result.plateCount, { shouldValidate: true });

    // Map filament rows
    if (result.filaments.length > 0) {
      setFilamentRows(result.filaments.map((f) => ({
        key:       generateId(),
        mode:      f.mode as 'spool' | 'manual',
        spoolId:   f.spoolId || '',
        colorHex:  f.colorHex,
        colorName: f.colorName,
        brand:     f.brand,
        material:  f.filamentType,
        grams:     String(f.grams),
        spoolPrice: String(f.spoolPrice ?? 20),
      })));
    }
    setGcodeStatus({ kind: 'idle' });
  }

  // ── Populate when editing ──────────────────────────────────────────────────

  useEffect(() => {
    if (editingState.mode === 'edit') {
      const piece = pieces.find((p) => p.id === editingState.id);
      if (piece) {
        setValue('label',    piece.label);
        setValue('name',     piece.name);
        const parsed = parseTimeBlock(piece.timeText);
        const h = Math.floor(parsed.totalSecs / 3600);
        const m = Math.floor((parsed.totalSecs % 3600) / 60);
        const s = parsed.totalSecs % 60;
        setValue('timeHours', String(h));
        setValue('timeMinutes', String(m));
        setValue('notes', piece.notes ?? '');
        setValue('status', piece.status ?? 'printed');
        setValue('printedAt', piece.printedAt ? piece.printedAt.slice(0, 10) : '');
        setValue('plateCount', piece.plate_count ?? 1);
        setValue('fileLink', piece.file_link ?? '');
        if (piece.printedAt) {
          const date = new Date(`${piece.printedAt.slice(0, 10)}T00:00:00`);
          if (!Number.isNaN(date.getTime())) setCalendarMonth(date);
        }
        setValue('incident', piece.incident ?? '');
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
            spoolPrice: '20',
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
            spoolPrice: '20',
          }]);
        }

        setMaterialRows(
          piece.materials?.length
            ? piece.materials.map((m) => ({
                key: m.id,
                name: m.name,
                quantity: String(m.quantity),
                cost: String(m.cost),
              }))
            : [],
        );
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

  function handleMaterialChange(key: string, patch: Partial<MaterialRow>) {
    setMaterialRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleAddMaterial() {
    setMaterialRows((prev) => [...prev, emptyMaterialRow()]);
  }

  function handleSelectDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    setValue('printedAt', `${year}-${month}-${day}`);
    setCalendarOpen(false);
  }

  function handleDeleteMaterial(key: string) {
    setMaterialRows((prev) => prev.filter((row) => row.key !== key));
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  async function processImageFile(file: File) {
    if (!isSupportedImageType(file)) {
      setImageError(t('tracker.upload.invalidFormat'));
      return;
    }

    if (file.size > MAX_IMAGE_UPLOAD_SIZE) {
      setImageError(t('form_err_img_size'));
      return;
    }

    setImageError('');
    setIsProcessingImage(true);

    try {
      setImagePreview(await compressImage(file));
    } catch {
      setImageError(t('form_err_img_process'));
    } finally {
      setIsProcessingImage(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function onSubmit(values: FormValues) {
    setSuccessMsg('');

    if (!values.label.trim()) { setError('label',    { message: t('form_err_label') }); return; }
    if (!values.name.trim())  { setError('name',     { message: t('form_err_name')  }); return; }

    const timeText = `${parseInt(values.timeHours || '0', 10) || 0}h ${parseInt(values.timeMinutes || '0', 10) || 0}m 0s`;
    const time = parseTimeBlock(timeText);
    if (time.validLines === 0) { setError('timeHours', { message: t('form_err_time') }); return; }

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
      spoolPrice: r.mode === 'manual' ? (parseFloat(r.spoolPrice) || 20) : undefined,
    }));

    const materials: PieceMaterialInput[] = materialRows
      .map((row) => ({
        name: row.name.trim(),
        quantity: parseFloat(row.quantity) || 0,
        cost: parseFloat(row.cost) || 0,
      }))
      .filter((row) => row.name.length > 0);

    const gramTotal = filaments.reduce((s, f) => s + f.grams, 0);

    const editingId = isEditing ? (editingState as { mode: 'edit'; id: string }).id : null;

    const input: PieceInput = {
      label:     values.label.trim(),
      name:      values.name.trim(),
      timeText,
      gramText:  String(gramTotal),
      imageUrl:  imagePreview ?? null,
      notes:     values.notes.trim(),
      status:    values.status,
      printedAt: values.printedAt || null,
      incident:  values.incident.trim(),
      filaments,
      materials,
      plate_count: values.plateCount,
      file_link: values.fileLink.trim() || null,
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
        {/* Name + Label */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('form_name')}
            </Label>
            <Input id="ch-name" placeholder={t('form_name_placeholder')} className="challenge-input" {...register('name')} />
            {errors.name && <p className="text-xs font-semibold text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('form_label')}
            </Label>
            <Input id="ch-label" placeholder={t('form_label_placeholder')} className="challenge-input" {...register('label')} />
            {errors.label && <p className="text-xs font-semibold text-destructive">{errors.label.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-plate-count" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.plateCount.label')}
            </Label>
            <Input
              id="ch-plate-count"
              type="number"
              min="1"
              step="1"
              className="challenge-input"
              {...register('plateCount', { valueAsNumber: true })}
            />
            {errors.plateCount && <p className="text-xs font-semibold text-destructive">{t(String(errors.plateCount.message))}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-file-link" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.fileLink.label')}
            </Label>
            <Input
              id="ch-file-link"
              type="url"
              placeholder={t('tracker.fileLink.placeholder')}
              className="challenge-input"
              {...register('fileLink')}
            />
            {errors.fileLink && <p className="text-xs font-semibold text-destructive">{t(String(errors.fileLink.message))}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.status.title')}
            </Label>
            <Select value={watch('status')} onValueChange={(value) => setValue('status', value as FormValues['status'])}>
              <SelectTrigger className={trackerSelectClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t('tracker.status.pending')}</SelectItem>
                <SelectItem value="printed">{t('tracker.status.printed')}</SelectItem>
                <SelectItem value="post_processed">{t('tracker.status.postProcessed')}</SelectItem>
                <SelectItem value="delivered">{t('tracker.status.delivered')}</SelectItem>
                <SelectItem value="failed">{t('tracker.status.failed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-printed-at" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.printDate.title')}
            </Label>
            <div className="relative" ref={calendarRef}>
              <button
                id="ch-printed-at"
                type="button"
                className={trackerDateButtonClassName}
                onClick={() => setCalendarOpen((open) => !open)}
              >
                <span className={cn(!printedAt && 'text-muted-foreground')}>
                  {formatDateLabel(printedAt || null, 'es-ES')}
                </span>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </button>

              {calendarOpen && (
                <div className="absolute z-50 mt-2 w-full max-w-[280px] rounded-[16px] border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur-md dark:border-white/[0.10] dark:bg-[#121826]/95">
                  <div className="mb-2 flex items-center justify-between">
                    <button type="button" className="rounded-full border border-border/60 p-1.5 hover:bg-accent dark:border-white/[0.10]" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-xs font-bold text-foreground capitalize">
                      {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(calendarMonth)}
                    </p>
                    <button type="button" className="rounded-full border border-border/60 p-1.5 hover:bg-accent dark:border-white/[0.10]" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <div key={day}>{day}</div>)}
                  </div>

                  <div className="space-y-1">
                    {calendarWeeks.map((week, index) => (
                      <div key={index} className="grid grid-cols-7 gap-1">
                        {week.map((date, cellIndex) => {
                          const iso = date
                            ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                            : null;
                          const isSelected = iso === printedAt;
                          const isToday = iso === todayIso;
                          return date ? (
                            <button
                              key={cellIndex}
                              type="button"
                              onClick={() => handleSelectDate(date)}
                              className={cn(
                                'flex h-8 items-center justify-center rounded-[9px] text-xs font-semibold transition-colors',
                                isSelected
                                  ? 'bg-primary text-primary-foreground shadow'
                                  : isToday
                                    ? 'border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15'
                                    : 'hover:bg-accent text-foreground'
                              )}
                            >
                              {date.getDate()}
                            </button>
                          ) : (
                            <div key={cellIndex} className="h-9" />
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex justify-between gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-full px-3 text-[11px]" onClick={() => setValue('printedAt', '')}>
                      Limpiar
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-full px-3 text-[11px]" onClick={() => setCalendarOpen(false)}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Auto-fill from G-code / 3MF ───────────────────────────────────── */}
        <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('cf_gcode_title')}
          </Label>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              ref={gcodeFileInputRef}
              accept=".gcode"
              className="hidden"
              onChange={handleGcodeUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-bold"
              onClick={() => gcodeFileInputRef.current?.click()}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <UploadCloud className="mr-1.5 h-3.5 w-3.5" />}
              {isAnalyzing ? t('cf_gcode_analyzing') : t('cf_gcode_upload')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-bold"
              onClick={() => setImport3mfOpen(true)}
              disabled={isAnalyzing}
            >
              <Box className="mr-1.5 h-3.5 w-3.5" />
              {t('tmf_btn')}
            </Button>
          </div>
          {gcodeStatus.kind !== 'idle' && (
            <p className={`text-xs font-medium rounded-lg border px-2.5 py-2 ${
              gcodeStatus.kind === 'success'
                ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
                : gcodeStatus.kind === 'partial'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}>
              {gcodeStatus.message}
            </p>
          )}
        </div>

        {/* Time */}
        <div className="space-y-1.5">
          <Label htmlFor="ch-time" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('form_time')}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="relative">
                <Input id="ch-time-hours" type="number" min="0" className="challenge-input pr-7 text-center" {...register('timeHours')} />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.72rem] text-muted-foreground pointer-events-none">h</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <Input id="ch-time-minutes" type="number" min="0" className="challenge-input pr-7 text-center" {...register('timeMinutes')} />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.72rem] text-muted-foreground pointer-events-none">m</span>
              </div>
            </div>
          </div>
          {errors.timeHours && <p className="text-xs font-semibold text-destructive">{errors.timeHours.message}</p>}
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

        <div className="space-y-2 rounded-[16px] border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('tracker.materials.title')}
            </Label>
            {totalMaterialCost > 0 && (
              <span className="text-[0.72rem] font-semibold text-muted-foreground">
                {formatCost(totalMaterialCost, project.currency)}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {materialRows.map((row) => (
              <div key={row.key} className="grid grid-cols-1 gap-2 rounded-[14px] border border-white/[0.08] bg-black/10 p-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
                <Input
                  placeholder={t('tracker.materials.namePlaceholder')}
                  value={row.name}
                  onChange={(e) => handleMaterialChange(row.key, { name: e.target.value })}
                  className="challenge-input h-9 text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('tracker.materials.quantityPlaceholder')}
                  value={row.quantity}
                  onChange={(e) => handleMaterialChange(row.key, { quantity: e.target.value })}
                  className="challenge-input h-9 text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('tracker.materials.costPlaceholder')}
                  value={row.cost}
                  onChange={(e) => handleMaterialChange(row.key, { cost: e.target.value })}
                  className="challenge-input h-9 text-sm"
                />
                <Button type="button" variant="outline" size="sm" className="rounded-full text-xs font-bold" onClick={() => handleDeleteMaterial(row.key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" className="rounded-full text-xs font-bold" onClick={handleAddMaterial}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('tracker.materials.add')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('tracker.notes.title')}
          </Label>
          <Textarea
            id="ch-notes"
            placeholder={t('tracker.notes.placeholder')}
            className="challenge-input min-h-[110px]"
            {...register('notes')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ch-incident" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('tracker.incident.title')}
          </Label>
          <Textarea
            id="ch-incident"
            placeholder={t('tracker.incident.placeholder')}
            className="challenge-input min-h-[90px]"
            {...register('incident')}
          />
        </div>

        {/* Image upload */}
        <ImageUpload
          imagePreview={imagePreview}
          isProcessing={isProcessingImage}
          error={imageError}
          onFileSelect={processImageFile}
          onClear={() => setImagePreview(null)}
          label={t('form_image')}
          optionalLabel={t('form_image_optional')}
          dragPrompt={t('tracker.upload.dragPrompt')}
          dropPrompt={t('tracker.upload.dropPrompt')}
          changeBtn={t('form_image_change')}
          uploadBtn={t('form_image_upload')}
          hint={t('form_image_hint')}
          processingLabel={t('tracker.upload.processing')}
        />

        {/* Live cost preview */}
        <div className="rounded-[18px] border border-yellow-400/20 bg-yellow-400/8 p-4">
          <p className="mb-1 text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground">{t('form_cost_preview')}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-lg font-black text-yellow-400">{formatCost(totalCost + totalMaterialCost, project.currency)}</p>
            {totalGrams > 0 && (
              <p className="text-[0.75rem] text-muted-foreground">{totalGrams.toFixed(1)} g</p>
            )}
          </div>
          <p className="mt-1 text-[0.75rem] text-muted-foreground">
            {t('tracker.materials.costHint')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="challenge-btn-primary rounded-full font-extrabold" disabled={isProcessingImage || isAnalyzing}>
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

      <Import3MFModal
        open={import3mfOpen}
        onClose={() => setImport3mfOpen(false)}
        onConfirm={handle3MFConfirm}
        spools={activeSpools}
      />
    </section>
  );
}

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UploadCloud } from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import type { Spool } from '@/features/inventory/types';
import type { FilamentRowData } from '@/lib/schema';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlateResult {
  plateNumber: number;
  name: string;
  filamentColor: string;
  filamentType: string;
  weightGrams: number | null;
  printTimeMinutes: number | null;
}

interface PlateRow {
  id: string;
  included: boolean;
  name: string;
  filamentType: string;
  colorHex: string;
  weightGrams: number;
  printTimeMinutes: number;
  spoolId: string;
}

export interface Import3MFResult {
  projectName: string;
  filaments: FilamentRowData[];
  printTimeMinutes: number;
  plateCount: number;
}

interface Import3MFModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: Import3MFResult) => void;
  spools: Spool[];
}

const KNOWN_TYPES = ['PLA', 'PETG', 'ASA', 'ABS', 'TPU', 'OTROS'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeColorHex(raw: string): string {
  if (!raw) return '#888888';
  const clean = raw.replace(/^#/, '');
  if (/^[0-9A-Fa-f]{6}$/.test(clean)) return '#' + clean.toUpperCase();
  if (/^[0-9A-Fa-f]{8}$/.test(clean)) return '#' + clean.substring(0, 6).toUpperCase();
  return '#888888';
}

function normalizeType(raw: string): string {
  const upper = (raw || '').toUpperCase().trim();
  return KNOWN_TYPES.includes(upper) ? upper : 'OTROS';
}

// ── Component ────────────────────────────────────────────────────────────────

export function Import3MFModal({ open, onClose, onConfirm, spools }: Import3MFModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [projectName, setProjectName] = useState('');
  const [rows, setRows] = useState<PlateRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setStatus('idle');
      setRows([]);
      setErrorMsg('');
      setProjectName('');
      setIsDragging(false);
    }
  }, [open]);

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.3mf')) {
      setErrorMsg(t('tmf_error'));
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/analyze-3mf', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || t('tmf_error'));
      }
      const data = await res.json() as {
        projectName: string;
        plates: PlateResult[];
        totalWeightGrams: number | null;
        totalTimeMinutes: number | null;
      };
      setProjectName(data.projectName || '');
      setRows(
        data.plates.map((p) => ({
          id: generateId(),
          included: true,
          name: p.name || `Plate ${p.plateNumber}`,
          filamentType: normalizeType(p.filamentType),
          colorHex: normalizeColorHex(p.filamentColor),
          weightGrams: p.weightGrams ?? 0,
          printTimeMinutes: p.printTimeMinutes ?? 0,
          spoolId: '',
        }))
      );
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('tmf_error'));
      setStatus('error');
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    void processFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (status === 'loading') return;
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function updateRow(id: string, patch: Partial<PlateRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleConfirm() {
    const included = rows.filter((r) => r.included);
    const totalMin = included.reduce((s, r) => s + (r.printTimeMinutes || 0), 0);
    const filaments: FilamentRowData[] = included.map((r) => {
      const spool = spools.find((s) => s.id === r.spoolId);
      return {
        id: generateId(),
        mode: spool ? 'spool' : 'manual',
        spoolId: r.spoolId,
        filamentType: r.filamentType,
        colorHex: r.colorHex,
        colorName: spool?.color ?? '',
        brand: spool?.brand ?? '',
        grams: r.weightGrams,
        spoolPrice: spool?.price ?? 15,
        spoolWeight: spool?.totalGrams ?? 1000,
      };
    });
    onConfirm({ projectName, filaments, printTimeMinutes: totalMin, plateCount: included.length || 1 });
    onClose();
  }

  const includedRows = rows.filter((r) => r.included);
  const totalWeight = includedRows.reduce((s, r) => s + (r.weightGrams || 0), 0);
  const totalTime = includedRows.reduce((s, r) => s + (r.printTimeMinutes || 0), 0);
  const activeSpools = spools.filter((s) => s.status === 'active');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('tmf_title')}</DialogTitle>
          <DialogDescription>{t('tmf_subtitle')}</DialogDescription>
        </DialogHeader>

        {/* Drop zone + file picker */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => status !== 'loading' && fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/40',
            status === 'loading' && 'pointer-events-none opacity-60',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".3mf"
            className="hidden"
            onChange={handleFile}
          />
          {status === 'loading' ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <UploadCloud className={cn('h-7 w-7', isDragging ? 'text-primary' : 'text-muted-foreground')} />
          )}
          <p className="text-sm font-medium">
            {status === 'loading'
              ? t('tmf_analyzing')
              : isDragging
              ? t('tmf_drop_here')
              : t('tmf_drag_or_click')}
          </p>
          {!status || status === 'idle' || status === 'error' ? (
            <p className="text-xs text-muted-foreground">{t('tmf_accepts')}</p>
          ) : null}
          {projectName && status === 'done' && (
            <p className="text-xs text-primary font-medium truncate max-w-[300px]">{projectName}</p>
          )}
        </div>

        {/* Error */}
        {status === 'error' && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMsg || t('tmf_error')}
          </p>
        )}

        {/* No plates */}
        {status === 'done' && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('tmf_no_plates')}</p>
        )}

        {/* Plates list */}
        {status === 'done' && rows.length > 0 && (
          <>
            <div className="space-y-2 mt-1">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-xl border p-3 space-y-2.5 transition-opacity ${
                    row.included ? 'border-border/60 bg-muted/20' : 'border-border/30 bg-transparent opacity-50'
                  }`}
                >
                  {/* Checkbox + name */}
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={row.included}
                      onCheckedChange={(v: boolean | 'indeterminate') => updateRow(row.id, { included: Boolean(v) })}
                      className="shrink-0"
                    />
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      className="h-8 text-sm font-medium"
                    />
                  </div>

                  {/* Fields grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {/* Type */}
                    <div className="space-y-1">
                      <Label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {t('tmf_col_type')}
                      </Label>
                      <Select
                        value={row.filamentType}
                        onValueChange={(v) => updateRow(row.id, { filamentType: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWN_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Color */}
                    <div className="space-y-1">
                      <Label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {t('tmf_col_color')}
                      </Label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={row.colorHex}
                          onChange={(e) => updateRow(row.id, { colorHex: e.target.value })}
                          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0.5"
                        />
                        <Input
                          value={row.colorHex}
                          onChange={(e) => updateRow(row.id, { colorHex: e.target.value })}
                          className="h-8 text-xs font-mono"
                          maxLength={7}
                        />
                      </div>
                    </div>

                    {/* Weight */}
                    <div className="space-y-1">
                      <Label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {t('tmf_col_weight')}
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={row.weightGrams}
                          onChange={(e) => updateRow(row.id, { weightGrams: Number(e.target.value) })}
                          className="h-8 text-xs pr-5"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[0.65rem] text-muted-foreground pointer-events-none">g</span>
                      </div>
                    </div>

                    {/* Time */}
                    <div className="space-y-1">
                      <Label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {t('tmf_col_time')}
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          value={row.printTimeMinutes}
                          onChange={(e) => updateRow(row.id, { printTimeMinutes: Number(e.target.value) })}
                          className="h-8 text-xs pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[0.65rem] text-muted-foreground pointer-events-none">min</span>
                      </div>
                    </div>
                  </div>

                  {/* Spool selector */}
                  {activeSpools.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {t('tmf_col_spool')}
                      </Label>
                      <Select
                        value={row.spoolId || '__none__'}
                        onValueChange={(v) => updateRow(row.id, { spoolId: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t('tmf_no_spool')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('tmf_no_spool')}</SelectItem>
                          {activeSpools.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border/40"
                                  style={{ backgroundColor: s.colorHex }}
                                />
                                {s.brand} · {s.material} · {s.color} ({s.remainingG.toFixed(0)}g)
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{t('tmf_total_weight')}:</span>
                <span className="font-bold">{totalWeight.toFixed(1)} g</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{t('tmf_total_time')}:</span>
                <span className="font-bold">{Math.floor(totalTime / 60)}h {totalTime % 60}min</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {includedRows.length} / {rows.length} placas
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={includedRows.length === 0}
              >
                {t('tmf_confirm')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

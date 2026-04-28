import React from 'react';
import { motion, AnimatePresence, animate, useMotionValue } from 'framer-motion';
import { ChevronUp, ChevronDown, Box, Clock, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/context/currency-context';
import type { CostCalculations } from '@/features/calculator/domain/cost-calculator';

interface PriceStickyPanelProps {
  calculations: CostCalculations;
}

interface PriceStickyDesktopProps extends PriceStickyPanelProps {
  projectName?: string;
  status?: string;
  printTimeHours?: number;
  printTimeMinutes?: number;
  projectImage?: string;
  detectedMaterials?: string[];
  onOpenPdfCustomizer?: () => void;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrintTime(hours: number, minutes: number): string | null {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  if (!h && !m) return null;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(' ');
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:       { label: 'Pendiente',      className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  printed:       { label: 'Impreso',        className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  post_processed:{ label: 'Post-procesado', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  delivered:     { label: 'Entregado',      className: 'bg-primary/10 text-primary border-primary/20' },
  failed:        { label: 'Fallido',        className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function CostRow({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${sub ? 'pl-3' : ''}`}>
      <span className={`text-xs ${sub ? 'text-muted-foreground/70 before:mr-1.5 before:content-["·"]' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`text-xs tabular-nums font-medium ${sub ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function AnimatedMoney({ value, currency, className }: { value: number; currency: string; className?: string }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = React.useState(() => formatMoney(value, currency));

  React.useEffect(() => {
    const controls = animate(mv, value || 0, { duration: 0.35, ease: 'easeOut' });
    const unsub = mv.on('change', (v) => setDisplay(formatMoney(Number(v), currency)));
    return () => { controls.stop(); unsub(); };
  }, [value, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span className={className}>{display}</span>;
}

// ── Desktop panel ─────────────────────────────────────────────────────────────

export function PriceStickyDesktop({
  calculations,
  projectName,
  status,
  printTimeHours = 0,
  printTimeMinutes = 0,
  projectImage,
  detectedMaterials = [],
  onOpenPdfCustomizer,
}: PriceStickyDesktopProps) {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const fmt = (v: number) => formatMoney(v, currency);
  const hasCalc = calculations.finalPrice > 0;
  const printTime = formatPrintTime(printTimeHours, printTimeMinutes);
  const statusCfg = status ? STATUS_CONFIG[status] : null;
  const displayName = projectName?.trim() || null;

  const breakdown = [
    { label: t('cf_filament_total'),    value: calculations.filamentCost },
    { label: t('cf_electricity_total'), value: calculations.electricityCost },
    { label: t('cf_labor_total'),       value: calculations.laborCost },
    { label: t('cf_machine_total'),     value: calculations.currentMachineCost },
    { label: t('cf_other_section'),     value: calculations.otherCostsTotal },
  ].filter(r => r.value > 0);

  return (
    <aside className="sticky top-6 hidden xl:flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/90 shadow-[0_8px_32px_rgba(2,8,23,0.08)] dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-5 pt-5">
        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('price_panel_title', { defaultValue: 'Resumen' })}
        </p>
      </div>

      {/* ── Project meta ── */}
      <div className="px-5">
        <div className="flex items-center gap-3">
          {/* Image or placeholder */}
          {projectImage ? (
            <img
              src={projectImage}
              alt={displayName ?? 'preview'}
              className="h-14 w-14 shrink-0 rounded-xl object-cover border border-border/40"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-muted/50">
              <Box className="h-6 w-6 text-muted-foreground/40" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName ?? (
                <span className="italic text-muted-foreground/60">
                  {t('price_panel_no_name', { defaultValue: 'Sin nombre' })}
                </span>
              )}
            </p>
            {statusCfg && (
              <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                {t(`tracker.status.${status}`) || statusCfg.label}
              </span>
            )}
          </div>
        </div>

        {/* Print time + materials */}
        {(printTime || detectedMaterials.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {printTime && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/40 px-2.5 py-1.5 text-xs">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium tabular-nums">{printTime}</span>
              </div>
            )}
            {detectedMaterials.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/40 px-2.5 py-1.5 text-xs">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{detectedMaterials.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="mx-5 h-px bg-border/50" />

      {/* ── Cost breakdown ── */}
      <div className="px-5">
        {!hasCalc ? (
          <p className="py-2 text-xs text-muted-foreground text-center">
            {t('price_panel_empty', { defaultValue: 'Completá el formulario para ver el costo' })}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t('price_panel_breakdown', { defaultValue: 'Desglose' })}
            </p>

            {/* Subtotal + sub-rows */}
            <div className="space-y-1.5">
              <CostRow label={t('cf_subtotal')} value={fmt(calculations.subTotal)} />
              {breakdown.map(r => (
                <CostRow key={r.label} label={r.label} value={fmt(r.value)} sub />
              ))}
            </div>

            {/* Margin + VAT */}
            {(calculations.profitAmount > 0 || calculations.vatAmount > 0) && (
              <>
                <div className="my-2 h-px bg-border/40" />
                <div className="space-y-1.5">
                  {calculations.profitAmount > 0 && (
                    <CostRow label={t('cf_profit')} value={fmt(calculations.profitAmount)} />
                  )}
                  {calculations.vatAmount > 0 && (
                    <CostRow label={t('cf_vat_label')} value={fmt(calculations.vatAmount)} />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Final price ── */}
      {hasCalc && (
        <div className="mx-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              {t('cf_final_price')}
            </span>
            <AnimatedMoney
              value={calculations.finalPrice}
              currency={currency}
              className="text-2xl font-black text-primary tabular-nums"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('price_panel_total_hint', { defaultValue: 'Con margen e IVA incluidos' })}
          </p>
        </div>
      )}

      {/* No final price state */}
      {!hasCalc && (
        <div className="mx-5 rounded-xl border border-border/40 bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground/60 text-center">
            {t('price_panel_cta', { defaultValue: 'El precio aparecerá aquí' })}
          </p>
        </div>
      )}

      {/* ── PDF Customizer button ── */}
      {onOpenPdfCustomizer && (
        <div className="mx-5 mb-5">
          <button
            type="button"
            onClick={onOpenPdfCustomizer}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('pdf_customizer_title', { defaultValue: 'Customizar PDF' })}
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Mobile bottom bar ─────────────────────────────────────────────────────────

export function PriceStickyMobile({ calculations }: PriceStickyPanelProps) {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const fmt = (v: number) => formatMoney(v, currency);
  const [expanded, setExpanded] = React.useState(false);
  const hasData = calculations.finalPrice > 0;

  if (!hasData) return null;

  const breakdown = [
    { label: t('cf_filament_total'),    value: calculations.filamentCost },
    { label: t('cf_electricity_total'), value: calculations.electricityCost },
    { label: t('cf_labor_total'),       value: calculations.laborCost },
    { label: t('cf_machine_total'),     value: calculations.currentMachineCost },
    { label: t('cf_other_section'),     value: calculations.otherCostsTotal },
  ].filter(r => r.value > 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 xl:hidden print:hidden">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="border-t border-border/70 bg-card/95 backdrop-blur-md px-4 py-4 space-y-2 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('price_panel_breakdown', { defaultValue: 'Desglose' })}
              </p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t('cf_subtotal')}</span>
                <span className="font-medium tabular-nums">{fmt(calculations.subTotal)}</span>
              </div>
              {breakdown.map(r => (
                <div key={r.label} className="flex justify-between pl-3 text-xs">
                  <span className="text-muted-foreground/70 before:mr-1.5 before:content-['·']">{r.label}</span>
                  <span className="font-medium tabular-nums text-muted-foreground">{fmt(r.value)}</span>
                </div>
              ))}
              {calculations.profitAmount > 0 && (
                <>
                  <div className="my-1.5 h-px bg-border/40" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t('cf_profit')}</span>
                    <span className="font-medium tabular-nums">{fmt(calculations.profitAmount)}</span>
                  </div>
                </>
              )}
              {calculations.vatAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('cf_vat_label')}</span>
                  <span className="font-medium tabular-nums">{fmt(calculations.vatAmount)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.10)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('cf_final_price')}
          </p>
          <AnimatedMoney
            value={calculations.finalPrice}
            currency={currency}
            className="block text-xl font-black text-primary tabular-nums"
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          {expanded ? t('price_panel_hide', { defaultValue: 'Ocultar' }) : t('price_panel_show', { defaultValue: 'Ver desglose' })}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

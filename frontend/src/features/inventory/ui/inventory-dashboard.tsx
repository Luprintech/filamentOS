import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventory } from '../api/use-inventory';
import { SpoolCard } from './spool-card';
import { SpoolForm } from './spool-form';
import { DeductModal } from './deduct-modal';
import type { Spool, SpoolInput } from '../types';
import { getTotalInventoryValue, getAverageCostPerKg, isLowStock } from '../types';

interface InventoryDashboardProps {
  userId: string | null;
  authLoading: boolean;
}

export function InventoryDashboard({ userId, authLoading }: InventoryDashboardProps) {
  const { t } = useTranslation();
  const { spools, loading, error, customBrands, customMaterials, createSpool, updateSpool, deleteSpool, deductSpool, finishSpool } =
    useInventory({ userId, authLoading });

  const [formOpen, setFormOpen] = useState(false);
  const [editingSpool, setEditingSpool] = useState<Spool | null>(null);
  const [deductTarget, setDeductTarget] = useState<Spool | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalValue = getTotalInventoryValue(spools);
  const avgCostPerKg = getAverageCostPerKg(spools);
  const lowStockCount = spools.filter(isLowStock).length;
  const activeCount = spools.filter((s) => s.status === 'active').length;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleOpenAdd() {
    setEditingSpool(null);
    setFormOpen(true);
  }

  function handleOpenEdit(spool: Spool) {
    setEditingSpool(spool);
    setFormOpen(true);
  }

  async function handleFormSubmit(input: SpoolInput) {
    if (editingSpool) {
      await updateSpool(editingSpool.id, input);
    } else {
      await createSpool(input);
    }
  }

  async function handleDelete(id: string) {
    if (deleteConfirm === id) {
      await deleteSpool(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
    }
  }

  async function handleDeduct(id: string, grams: number) {
    await deductSpool(id, grams);
  }

  async function handleFinish(id: string) {
    await finishSpool(id);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!userId && !authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Package className="mb-4 h-12 w-12 opacity-30" />
        <p className="text-sm">{t('tracker_login_text')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground sm:text-2xl">{t('inventory.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('inventory.subtitle')}</p>
        </div>
        <Button onClick={handleOpenAdd} className="rounded-full font-bold">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('inventory.addSpool')}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={t('inventory.totalValue')} value={`€ ${totalValue.toFixed(2)}`} />
        <MetricCard label={t('inventory.avgCostKg')} value={`€ ${avgCostPerKg.toFixed(2)}/kg`} />
        <MetricCard label={t('inventory.activeSpools')} value={String(activeCount)} />
        {lowStockCount > 0 ? (
          <MetricCard
            label={t('inventory.lowStockAlert')}
            value={String(lowStockCount)}
            highlight
          />
        ) : (
          <MetricCard label={t('inventory.lowStockAlert')} value="0" />
        )}
      </div>

      {/* Low stock warning banner */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-400/8 px-4 py-3 text-sm text-orange-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('inventory.lowStockWarning', { count: lowStockCount })}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && spools.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-muted-foreground">{t('inventory.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground/70">{t('inventory.emptySubtitle')}</p>
          <Button onClick={handleOpenAdd} className="mt-4 rounded-full font-bold" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            {t('inventory.addSpool')}
          </Button>
        </div>
      )}

      {/* Spool grid */}
      {!loading && spools.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spools.map((spool) => (
            <div key={spool.id}>
              {deleteConfirm === spool.id && (
                <div className="mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="font-semibold">{t('inventory.deleteConfirm', { name: `${spool.brand} ${spool.color}` })}</p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      onClick={() => handleDelete(spool.id)}
                      className="font-bold underline underline-offset-2"
                    >
                      {t('delete')}
                    </button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-muted-foreground">
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
              <SpoolCard
                spool={spool}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                onDeduct={setDeductTarget}
                onFinish={handleFinish}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form modal */}
      <SpoolForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        editingSpool={editingSpool}
        customBrands={customBrands}
        customMaterials={customMaterials}
      />

      {/* Deduct modal */}
      <DeductModal
        spool={deductTarget}
        onClose={() => setDeductTarget(null)}
        onDeduct={handleDeduct}
      />
    </section>
  );
}

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? 'border-orange-400/30 bg-orange-400/8' : 'border-border/60 bg-card'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-black ${highlight ? 'text-orange-400' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

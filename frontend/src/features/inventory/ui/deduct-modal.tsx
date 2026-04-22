import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Spool } from '../types';

interface DeductModalProps {
  spool: Spool | null;
  onClose: () => void;
  onDeduct: (id: string, grams: number) => Promise<void>;
}

export function DeductModal({ spool, onClose, onDeduct }: DeductModalProps) {
  const { t } = useTranslation();
  const [grams, setGrams] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const open = spool !== null;

  React.useEffect(() => {
    if (open) { setGrams(''); setError(''); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(grams.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setError(t('inventory.deductError'));
      return;
    }
    setSubmitting(true);
    try {
      await onDeduct(spool!.id, val);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast_unexpected'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{t('inventory.deduct')}</DialogTitle>
        </DialogHeader>
        {spool && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {spool.brand} · {spool.material} · {spool.color}
            </p>
            <p className="text-sm">
              {t('inventory.remaining')}: <strong>{spool.remainingG.toFixed(1)} g</strong>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="deduct-grams" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('inventory.deductGrams')} *
              </Label>
              <Input
                id="deduct-grams"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="45.5"
                value={grams}
                onChange={(e) => { setGrams(e.target.value); setError(''); }}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('cf_saving') : t('inventory.deduct')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

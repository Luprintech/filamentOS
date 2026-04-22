import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { Spool, SpoolInput } from '../types';

// ── Listas de marcas y materiales ─────────────────────────────────────────────

const BRANDS = [
  { group: 'Premium', items: ['Bambu Lab', 'Prusament', 'Polymaker', 'Extrudr'] },
  { group: 'Popular', items: ['eSUN', 'SUNLU', 'Creality', 'Elegoo', 'Overture', 'Hatchbox'] },
  { group: 'Otros fabricantes', items: ['3DJake', 'Fiberlogy', 'Sakata3D', 'Spectrum', 'FormFutura', 'Proto-pasta'] },
];

const MATERIALS = [
  {
    group: 'PLA',
    items: ['PLA', 'PLA+', 'PLA-CF (Fibra de carbono)', 'PLA Silk', 'PLA Wood', 'PLA Matte'],
  },
  {
    group: 'Técnicos',
    items: ['PETG', 'PETG-CF', 'ABS', 'ASA', 'PC (Policarbonato)', 'Nylon (PA)', 'PA-CF', 'HIPS'],
  },
  {
    group: 'Flexibles',
    items: ['TPU (95A)', 'TPU (85A)', 'TPE'],
  },
  {
    group: 'Especiales',
    items: ['PVA (soporte soluble)', 'PEEK', 'Metal Fill', 'Wood Fill', 'Marble Fill'],
  },
];

const OTHER_VALUE = '__other__';

// ── Zod schema ─────────────────────────────────────────────────────────────────

const spoolSchema = z
  .object({
    brand: z.string().min(1, 'Brand is required'),
    material: z.string().min(1, 'Material is required'),
    color: z.string().min(1, 'Color is required'),
    colorHex: z.string().default('#cccccc'),
    totalGrams: z.coerce.number().min(0, 'Must be >= 0'),
    remainingG: z.coerce.number().min(0, 'Must be >= 0'),
    price: z.coerce.number().min(0, 'Must be >= 0'),
    notes: z.string().default(''),
  })
  .refine((d) => d.remainingG <= d.totalGrams, {
    message: 'Remaining cannot exceed total',
    path: ['remainingG'],
  });

type SpoolFormValues = z.infer<typeof spoolSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Devuelve '__other__' si el valor no está en la lista predefinida */
function resolveSelectValue(value: string, flatList: string[]): string {
  return flatList.includes(value) ? value : value ? OTHER_VALUE : '';
}

const ALL_BRANDS = BRANDS.flatMap((g) => g.items);
const ALL_MATERIALS = MATERIALS.flatMap((g) => g.items);

// ── Props ──────────────────────────────────────────────────────────────────────

interface SpoolFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SpoolInput) => Promise<void>;
  editingSpool?: Spool | null;
  customBrands?: string[];
  customMaterials?: string[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SpoolForm({ open, onClose, onSubmit, editingSpool, customBrands = [], customMaterials = [] }: SpoolFormProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(editingSpool);

  // Custom options that are NOT already in the predefined lists
  const uniqueCustomBrands = React.useMemo(
    () => customBrands.filter((b) => !ALL_BRANDS.includes(b)),
    [customBrands],
  );
  const uniqueCustomMaterials = React.useMemo(
    () => customMaterials.filter((m) => !ALL_MATERIALS.includes(m)),
    [customMaterials],
  );

  // Combined known values (predefined + custom) — used for resolveSelectValue
  const allKnownBrands = React.useMemo(
    () => [...ALL_BRANDS, ...uniqueCustomBrands],
    [uniqueCustomBrands],
  );
  const allKnownMaterials = React.useMemo(
    () => [...ALL_MATERIALS, ...uniqueCustomMaterials],
    [uniqueCustomMaterials],
  );

  // Estado interno para controlar si el usuario eligió "Otro"
  const [brandSelectVal, setBrandSelectVal] = React.useState('');
  const [materialSelectVal, setMaterialSelectVal] = React.useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SpoolFormValues>({
    resolver: zodResolver(spoolSchema),
    defaultValues: buildDefaults(editingSpool),
  });

  // Sincroniza el estado del select cuando se abre o cambia el spool a editar
  React.useEffect(() => {
    if (open) {
      const defaults = buildDefaults(editingSpool);
      reset(defaults);
      setBrandSelectVal(resolveSelectValue(defaults.brand, allKnownBrands));
      setMaterialSelectVal(resolveSelectValue(defaults.material, allKnownMaterials));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingSpool, reset]);

  function handleBrandSelect(val: string) {
    setBrandSelectVal(val);
    if (val !== OTHER_VALUE) {
      setValue('brand', val, { shouldValidate: true });
    } else {
      setValue('brand', '', { shouldValidate: false });
    }
  }

  function handleMaterialSelect(val: string) {
    setMaterialSelectVal(val);
    if (val !== OTHER_VALUE) {
      setValue('material', val, { shouldValidate: true });
    } else {
      setValue('material', '', { shouldValidate: false });
    }
  }

  async function handleFormSubmit(values: SpoolFormValues) {
    await onSubmit(values as SpoolInput);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('inventory.editSpool') : t('inventory.addSpool')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-2">

          {/* ── Marca ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.brand')} *
            </Label>
            <Select value={brandSelectVal} onValueChange={handleBrandSelect}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.selectBrand')} />
              </SelectTrigger>
              <SelectContent>
                {BRANDS.map((group) => (
                  <SelectGroup key={group.group}>
                    <SelectLabel className="text-xs text-muted-foreground">{group.group}</SelectLabel>
                    {group.items.map((brand) => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {uniqueCustomBrands.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground">{t('inventory.myBrands')}</SelectLabel>
                    {uniqueCustomBrands.map((brand) => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">—</SelectLabel>
                  <SelectItem value={OTHER_VALUE}>✏️ {t('inventory.brandOther')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {/* Input libre si eligió "Otra marca" */}
            {brandSelectVal === OTHER_VALUE && (
              <Input
                placeholder={t('inventory.brandOtherPlaceholder')}
                {...register('brand')}
                className="mt-1.5"
                autoFocus
              />
            )}
            {errors.brand && <p className="text-xs text-destructive">{errors.brand.message}</p>}
          </div>

          {/* ── Material ──────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.material')} *
            </Label>
            <Select value={materialSelectVal} onValueChange={handleMaterialSelect}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.selectMaterial')} />
              </SelectTrigger>
              <SelectContent>
                {MATERIALS.map((group) => (
                  <SelectGroup key={group.group}>
                    <SelectLabel className="text-xs text-muted-foreground">{group.group}</SelectLabel>
                    {group.items.map((mat) => (
                      <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {uniqueCustomMaterials.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground">{t('inventory.myMaterials')}</SelectLabel>
                    {uniqueCustomMaterials.map((mat) => (
                      <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">—</SelectLabel>
                  <SelectItem value={OTHER_VALUE}>✏️ {t('inventory.materialOther')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {/* Input libre si eligió "Otro material" */}
            {materialSelectVal === OTHER_VALUE && (
              <Input
                placeholder={t('inventory.materialOtherPlaceholder')}
                {...register('material')}
                className="mt-1.5"
                autoFocus
              />
            )}
            {errors.material && <p className="text-xs text-destructive">{errors.material.message}</p>}
          </div>

          {/* ── Color + hex ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-color" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('inventory.color')} *
              </Label>
              <Input id="inv-color" placeholder="Galaxy Black, Rojo Volcán..." {...register('color')} />
              {errors.color && <p className="text-xs text-destructive">{errors.color.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-color-hex" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('inventory.colorHex')}
              </Label>
              <Input id="inv-color-hex" type="color" {...register('colorHex')} className="h-9 cursor-pointer p-1" />
            </div>
          </div>

          {/* ── Peso total + restante ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-total" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('inventory.totalGrams')} (g) *
              </Label>
              <Input id="inv-total" type="number" step="0.1" min="0" {...register('totalGrams')} />
              {errors.totalGrams && <p className="text-xs text-destructive">{errors.totalGrams.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-remaining" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('inventory.remaining')} (g) *
              </Label>
              <Input id="inv-remaining" type="number" step="0.1" min="0" {...register('remainingG')} />
              {errors.remainingG && <p className="text-xs text-destructive">{errors.remainingG.message}</p>}
            </div>
          </div>

          {/* ── Precio ───────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="inv-price" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.price')} *
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
              <Input id="inv-price" type="number" step="0.01" min="0" placeholder="24.99" className="pl-7" {...register('price')} />
            </div>
            {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
          </div>

          {/* ── Notas ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="inv-notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('inventory.notes')}
            </Label>
            <Textarea id="inv-notes" placeholder={t('inventory.notesPlaceholder')} rows={2} {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('cf_saving') : isEditing ? t('save_changes') : t('inventory.addSpool')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildDefaults(spool?: Spool | null): SpoolFormValues {
  if (spool) {
    return {
      brand: spool.brand,
      material: spool.material,
      color: spool.color,
      colorHex: spool.colorHex,
      totalGrams: spool.totalGrams,
      remainingG: spool.remainingG,
      price: spool.price,
      notes: spool.notes,
    };
  }
  return {
    brand: '',
    material: '',
    color: '',
    colorHex: '#cccccc',
    totalGrams: 1000,
    remainingG: 1000,
    price: 0,
    notes: '',
  };
}

import * as z from "zod";
import i18n from '@/i18n';

// Single filament row for multi-filament support
export const filamentRowSchema = z.object({
  id: z.string().default(''),
  mode: z.enum(['spool', 'manual']).default('manual'),
  spoolId: z.string().default(''),
  filamentType: z.string().default('PLA'),
  colorHex: z.string().default('#888888'),
  colorName: z.string().default(''),
  brand: z.string().default(''),
  grams: z.coerce.number().min(0).default(0),
  spoolPrice: z.coerce.number().min(0).default(0),
  spoolWeight: z.coerce.number().min(0).default(1000),
});

export type FilamentRowData = z.infer<typeof filamentRowSchema>;

export const formSchema = z.object({
  // This ID is for client-side tracking of a loaded project.
  id: z.string().optional(),

  // == Required Fields ==
  jobName: z.string().min(1, i18n.t('schema_job_name_required')),

  printingTimeHours: z.coerce.number().min(0),
  printingTimeMinutes: z.coerce.number().min(0),

  // == Legacy single-filament fields (kept for backward compat with saved projects) ==
  filamentWeight: z.coerce.number({ invalid_type_error: i18n.t('schema_invalid_number') }).min(0).default(0),
  filamentType: z.string().default(''),
  spoolPrice: z.coerce.number({ invalid_type_error: i18n.t('schema_invalid_number') }).min(0).default(0),
  spoolWeight: z.coerce.number({ invalid_type_error: i18n.t('schema_invalid_number') }).min(0).default(1000),

  // == Multi-filament array (replaces legacy fields in new UI) ==
  filaments: z.array(filamentRowSchema).default([]),

  // == Calculator stats: print date for stats inclusion ==
  printedAt: z.string().optional().default(''),

  // == Optional Fields ==
  projectImage: z.string().optional(),
  currency: z.string().min(1, i18n.t('schema_currency_required')),
  powerConsumptionWatts: z.coerce.number().min(0),
  energyCostKwh: z.coerce.number().min(0),
  prepTime: z.coerce.number().min(0),
  prepCostPerHour: z.coerce.number().min(0),
  postProcessingTimeInMinutes: z.coerce.number().min(0),
  postProcessingCostPerHour: z.coerce.number().min(0),
  includeMachineCosts: z.boolean(),
  printerCost: z.coerce.number().min(0),
  investmentReturnYears: z.coerce.number().min(0),
  repairCost: z.coerce.number().min(0),
  otherCosts: z.array(z.object({
    name: z.string().min(1, i18n.t('schema_item_name_required')),
    price: z.coerce.number().min(0),
  })),
  profitPercentage: z.coerce.number().min(0),
  vatPercentage: z.coerce.number().min(0),
})
.refine(data => data.printingTimeHours > 0 || data.printingTimeMinutes > 0, {
  message: i18n.t('schema_print_time_required'),
  path: ["printingTimeHours"],
})
.refine(
  data => {
    // Multi-filament mode: at least one row with grams > 0
    if (data.filaments.length > 0) {
      return data.filaments.some(f => f.grams > 0);
    }
    // Legacy mode: filamentWeight must be set
    return data.filamentWeight > 0;
  },
  {
    message: i18n.t('schema_filament_weight_required'),
    path: ["filaments"],
  }
);

export type FormData = z.infer<typeof formSchema>;

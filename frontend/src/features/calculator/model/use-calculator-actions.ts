import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { defaultFormValues } from '@/lib/defaults';
import type { FormData } from '@/lib/schema';
import type { LocalUser } from '@/context/auth-context';
import type { CostCalculations } from '@/features/calculator/domain/cost-calculator';
import { buildShareSummary } from '@/features/calculator/lib/share-summary';
import { useSaveProject, useUpdateProject } from '@/features/projects/api/use-projects';
import { saveGuestProject } from '@/features/projects/api/projects-api';
import { useGcodeAnalysis } from '@/features/calculator/api/use-gcode-analysis';

interface ToastInput {
  variant?: 'destructive' | 'default';
  title: string;
  description?: string;
}

type ToastFn = (input: ToastInput) => void;

interface UseCalculatorActionsInput {
  form: UseFormReturn<FormData>;
  user: LocalUser | null;
  loginWithGoogle: () => void;
  isGuest?: boolean;
  onGuestSaveAttempt?: () => void;
  saveGuestProjectDraft?: (project: unknown) => void;
  toast: ToastFn;
  t: TFunction;
  watchedValues: FormData;
  calculations: CostCalculations;
  onProjectSaved?: () => void;
}

type AnalysisKind = 'idle' | 'success' | 'partial' | 'empty' | 'error';

interface AnalysisFeedback {
  kind: AnalysisKind;
  updated?: string[];
  missing?: string[];
  error?: string;
}

export function useCalculatorActions({
  form,
  user,
  loginWithGoogle,
  isGuest = false,
  onGuestSaveAttempt,
  saveGuestProjectDraft,
  toast,
  t,
  watchedValues,
  calculations,
  onProjectSaved,
}: UseCalculatorActionsInput) {
  const [analysisFeedback, setAnalysisFeedback] = useState<AnalysisFeedback>({ kind: 'idle' });

  // Usar hooks de React Query en lugar de llamadas manuales
  const saveProjectMutation = useSaveProject();
  const updateProjectMutation = useUpdateProject();
  const gcodeAnalysisMutation = useGcodeAnalysis();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: watchedValues.currency || 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleNewProject = () => {
    form.reset(defaultFormValues);
    toast({ title: t('toast_new_project'), description: t('toast_new_project_msg') });
  };

  const handleSaveProject = async () => {
    if (!user) {
      if (isGuest) {
        const isValid = await form.trigger();
        if (!isValid) {
          toast({
            variant: 'destructive',
            title: t('toast_missing_fields'),
            description: t('toast_missing_fields_msg'),
          });
          return;
        }

        const localProject = saveGuestProject(form.getValues());
        form.setValue('id', localProject.id, { shouldDirty: false });
        saveGuestProjectDraft?.(localProject);
        toast({
          title: 'Proyecto guardado localmente',
          description: 'Está disponible solo en este navegador. Inicia sesión para guardarlo en tu cuenta.',
        });
        onProjectSaved?.();
        onGuestSaveAttempt?.();
      } else {
        loginWithGoogle();
      }
      return;
    }

    const isValid = await form.trigger();
    if (!isValid) {
      toast({
        variant: 'destructive',
        title: t('toast_missing_fields'),
        description: t('toast_missing_fields_msg'),
      });
      return;
    }

    const formData = form.getValues();
    const existingId = formData.id;
    const dataToSave = JSON.parse(JSON.stringify(formData));
    delete dataToSave.id;

    // calculator-stats: attach computed values so backend can store them in dedicated columns
    dataToSave.printedAt = formData.printedAt || null;
    dataToSave.totalCost = calculations.finalPrice;
    dataToSave.totalGrams = formData.filaments?.length > 0
      ? formData.filaments.reduce((s, f) => s + (f.grams || 0), 0)
      : formData.filamentWeight;
    dataToSave.totalSecs =
      (formData.printingTimeHours * 3600) + (formData.printingTimeMinutes * 60);

    if (existingId) {
      // Proyecto cargado → actualizar en lugar de duplicar
      updateProjectMutation.mutate(
        { id: existingId, data: dataToSave },
        {
          onSuccess: () => {
            // Mantener el proyecto cargado en el form con su id
            form.setValue('id', existingId, { shouldDirty: false });
            onProjectSaved?.();
          },
        }
      );
    } else {
      // Proyecto nuevo → crear
      saveProjectMutation.mutate(dataToSave, {
        onSuccess: () => {
          form.reset(defaultFormValues);
          onProjectSaved?.();
        },
      });
    }
  };

  const handleGcodeAnalyze = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysisFeedback({ kind: 'idle' });

    // Usar mutation de React Query
    gcodeAnalysisMutation.mutate(file, {
      onSuccess: (result) => {
        const updated: string[] = [];
        const missing: string[] = [];

        if (result.printingTimeHours !== undefined && result.printingTimeHours > 0) {
          form.setValue('printingTimeHours', result.printingTimeHours, { shouldValidate: false });
          form.setValue('printingTimeMinutes', result.printingTimeMinutes || 0, { shouldValidate: false });
          form.trigger(['printingTimeHours', 'printingTimeMinutes']);
          updated.push(t('toast_print_time_filled'));
        } else {
          missing.push(t('toast_print_time_filled'));
        }

        if (result.filamentWeight !== undefined && result.filamentWeight > 0) {
          form.setValue('filamentWeight', parseFloat(result.filamentWeight.toFixed(2)), { shouldValidate: true });
          updated.push(t('toast_weight_filled'));
        } else {
          missing.push(t('toast_weight_filled'));
        }

        if (updated.length > 0 && missing.length === 0) {
          toast({ title: t('toast_analysis_ok'), description: t('toast_analysis_ok_msg', { fields: updated.join(' y ') }) });
          setAnalysisFeedback({ kind: 'success', updated, missing });
        } else if (updated.length > 0) {
          toast({
            title: t('toast_analysis_partial'),
            description: t('toast_analysis_partial_msg', { updated: updated.join(', '), missing: missing.join(', ') }),
          });
          setAnalysisFeedback({ kind: 'partial', updated, missing });
        } else {
          toast({ variant: 'destructive', title: t('toast_analysis_none'), description: t('toast_analysis_none_msg') });
          setAnalysisFeedback({ kind: 'empty', updated, missing });
        }
      },
      onError: (error) => {
        setAnalysisFeedback({ kind: 'error', error: error.message });
      },
      onSettled: () => {
        if (event.target) event.target.value = '';
      },
    });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_IMAGE_SIZE_KB = 10 * 1024;
    if (file.size > MAX_IMAGE_SIZE_KB * 1024) {
      toast({
        variant: 'destructive',
        title: t('toast_image_too_big'),
        description: t('toast_image_too_big_msg'),
      });
      if (event.target) event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      form.setValue('projectImage', reader.result as string, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleShare = async () => {
    const summaryText = buildShareSummary({
      t,
      values: watchedValues,
      calculations,
      formatCurrency,
    });

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('toast_share_title'),
          text: summaryText,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        await navigator.clipboard.writeText(summaryText);
        toast({ title: t('toast_share_copied') });
      }
    } else {
      await navigator.clipboard.writeText(summaryText);
      toast({ title: t('toast_share_copied') });
    }
  };

  return {
    isAnalyzing: gcodeAnalysisMutation.isPending,
    isSaving: saveProjectMutation.isPending || updateProjectMutation.isPending,
    analysisFeedback,
    formatCurrency,
    handleNewProject,
    handleSaveProject,
    handleGcodeAnalyze,
    handleImageUpload,
    handlePrint,
    handleShare,
  };
}

import React from 'react';
import { act, renderHook, WrapperComponent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { FormData } from '@/lib/schema';
import { defaultFormValues } from '@/lib/defaults';
import { useCalculatorActions } from './use-calculator-actions';

// Crear QueryClient para tests
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

// Mock de las APIs - variables para controlar comportamiento en tests
let mockSaveProjectMutate = vi.fn();
let mockGcodeMutate = vi.fn();

vi.mock('@/features/projects/api/use-projects', async () => {
  const actual = await vi.importActual('@/features/projects/api/use-projects');
  return {
    ...actual,
    useSaveProject: () => ({
      mutate: mockSaveProjectMutate,
      isPending: false,
    }),
    useDeleteProject: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useProjects: () => ({ data: [], isLoading: false }),
  };
});

vi.mock('@/features/calculator/api/use-gcode-analysis', async () => {
  const actual = await vi.importActual('@/features/calculator/api/use-gcode-analysis');
  return {
    ...actual,
    useGcodeAnalysis: () => ({
      mutate: mockGcodeMutate,
      isPending: false,
    }),
  };
});

vi.mock('@/features/calculator/lib/share-summary', () => ({
  buildShareSummary: vi.fn(() => 'summary'),
}));

function t(key: string, params?: Record<string, unknown>) {
  if (!params) return key;
  return `${key}:${JSON.stringify(params)}`;
}

function createHook(user: { id: string; email: string | null; name: string | null; photo: string | null } | null = null) {
  const toast = vi.fn();
  const loginWithGoogle = vi.fn();
  const queryClient = createTestQueryClient();

  const wrapper: WrapperComponent<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const hook = renderHook(
    () => {
      const form = useForm<FormData>({
        defaultValues: defaultFormValues,
      });

      const watchedValues = form.watch();

      return {
        form,
        actions: useCalculatorActions({
          form,
          user,
          loginWithGoogle,
          toast,
          t: t as never,
          watchedValues,
          calculations: {
            filamentCost: 0,
            electricityCost: 0,
            laborCost: 0,
            currentMachineCost: 0,
            otherCostsTotal: 0,
            subTotal: 0,
            profitAmount: 0,
            priceBeforeVat: 0,
            vatAmount: 0,
            finalPrice: 0,
          },
        }),
      };
    },
    { wrapper }
  );

  return { ...hook, toast, loginWithGoogle };
}

describe('useCalculatorActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Resetear mocks para cada test
    mockSaveProjectMutate = vi.fn();
    mockGcodeMutate = vi.fn();
  });

  it('si no hay usuario, en save dispara loginWithGoogle', async () => {
    const { result, loginWithGoogle } = createHook(null);

    await act(async () => {
      await result.current.actions.handleSaveProject();
    });

    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockSaveProjectMutate).not.toHaveBeenCalled();
  });

  it('guarda proyecto y resetea formulario cuando save es exitoso', async () => {
    let savedOptions: any = null;

    // Configurar el mock para capturar options y llamarlas después
    mockSaveProjectMutate = vi.fn((data, options) => {
      savedOptions = options;
    });

    const { result } = createHook({ id: 'u1', email: null, name: 'User', photo: null });

    // Rellenar el formulario con datos válidos (defaultFormValues no pasa la validación)
    await act(async () => {
      result.current.form.reset({
        ...defaultFormValues,
        jobName: 'Test Job',
        filamentWeight: 50,
        filamentType: 'PLA',
        spoolPrice: 20,
        spoolWeight: 1000,
        printingTimeHours: 2,
        printingTimeMinutes: 0,
      });
    });

    // Llamar save y esperar a que termine (es async por form.trigger())
    await act(async () => {
      await result.current.actions.handleSaveProject();
    });

    // Verificar que se llamó al mutate
    expect(mockSaveProjectMutate).toHaveBeenCalledTimes(1);

    // Simular onSuccess manualmente
    await act(async () => {
      if (savedOptions) {
        savedOptions.onSuccess({ id: 'p1', jobName: 'Test Job' });
      }
    });

    // Tras onSuccess, el formulario debería haberse reseteado a los valores por defecto
    expect(result.current.form.getValues('jobName')).toBe('');
  });

  it('analiza gcode y completa tiempo/peso en el formulario', async () => {
    let savedOptions: any = null;

    // Configurar el mock para capturar options
    mockGcodeMutate = vi.fn((file, options) => {
      savedOptions = options;
    });

    const { result } = createHook({ id: 'u1', email: null, name: 'User', photo: null });

    const file = new File(['G1 X0'], 'pieza.gcode', { type: 'text/plain' });
    const event = {
      target: {
        files: [file],
        value: 'temp',
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    result.current.actions.handleGcodeAnalyze(event);

    // Verificar que se llamó al mutate
    expect(mockGcodeMutate).toHaveBeenCalledTimes(1);

    // Simular onSuccess manualmente
    if (savedOptions) {
      savedOptions.onSuccess({
        printingTimeHours: 1,
        printingTimeMinutes: 30,
        filamentWeight: 12.34,
      });
    }

    // Verificar que el formulario se actualizó
    expect(result.current.form.getValues('printingTimeHours')).toBe(1);
    expect(result.current.form.getValues('printingTimeMinutes')).toBe(30);
    expect(result.current.form.getValues('filamentWeight')).toBe(12.34);
  });
});

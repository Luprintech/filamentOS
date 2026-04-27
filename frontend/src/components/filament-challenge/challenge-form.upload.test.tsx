import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeForm } from './challenge-form';
import type { FilamentProject } from './filament-types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        form_title: 'Register Piece',
        form_subtitle: 'Complete the form',
        form_label: 'Label',
        form_label_placeholder: 'Project label',
        form_name: 'Name',
        form_name_placeholder: 'Piece name',
        'tracker.status.title': 'Status',
        'tracker.status.printed': 'Printed',
        'tracker.printDate.title': 'Print Date',
        'tracker.plateCount.label': 'Plate Count',
        'tracker.fileLink.label': 'File Link',
        'tracker.fileLink.placeholder': 'https://example.com/file.3mf',
        'tracker.upload.processing': 'Processing image…',
        'tracker.upload.dragPrompt': 'Drag an image here or click to select',
        'tracker.upload.dropPrompt': 'Drop image here',
        'tracker.upload.invalidFormat': 'Unsupported format. Use JPG, PNG or WebP.',
        cf_gcode_title: 'Auto-fill from file',
        cf_gcode_upload: 'Upload G-code',
        cf_gcode_analyzing: 'Analyzing...',
        tmf_btn: 'Import 3MF',
        form_time: 'Print time',
        'tracker.filaments.title': 'Filaments',
        'tracker.filaments.color': 'Filament',
        'tracker.filaments.grams': 'Grams',
        'tracker.filaments.errorRequired': 'At least one filament required',
        'tracker.materials.title': 'Materials',
        'tracker.notes.title': 'Notes',
        'tracker.notes.placeholder': 'Notes placeholder',
        'tracker.incident.title': 'Incidents',
        'tracker.incident.placeholder': 'Incidents placeholder',
        form_image: 'Image',
        form_image_optional: '(optional)',
        form_image_upload: 'Upload image',
        form_image_change: 'Change image',
        form_image_hint: 'Max 10MB',
        form_cost_preview: 'Cost preview',
        'tracker.materials.costHint': 'Cost hint',
        form_save: 'Save',
        form_err_label: 'Label is required',
        form_err_name: 'Name is required',
        form_err_time: 'Time is required',
      };

      if (key === 'tracker.plateCount.display') {
        return `${params?.count ?? 0} plates`;
      }

      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/features/calculator/api/analyze-gcode', () => ({
  analyzeGcodeFile: vi.fn(),
}));

vi.mock('@/components/import-3mf-modal', () => ({
  Import3MFModal: ({ open, onConfirm }: { open: boolean; onConfirm: (result: unknown) => void }) =>
    open ? (
      <button
        type="button"
        onClick={() => onConfirm({ projectName: 'Imported', filaments: [], printTimeMinutes: 135, plateCount: 4 })}
      >
        Apply imported 3MF
      </button>
    ) : null,
}));

const mockProject: FilamentProject = {
  id: 'proj-1',
  title: 'Test Project',
  description: '',
  coverImage: null,
  goal: 10,
  pricePerKg: 20,
  currency: 'USD',
  totalPieces: 0,
  totalSecs: 0,
  totalGrams: 0,
  totalCost: 0,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

function renderForm(overrides?: Partial<React.ComponentProps<typeof ChallengeForm>>) {
  return render(
    <ChallengeForm
      project={mockProject}
      editingState={{ mode: 'create' }}
      pieces={[]}
      onSave={vi.fn()}
      onUpdate={vi.fn()}
      onCancelEdit={vi.fn()}
      activeSpools={[]}
      {...overrides}
    />,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Project A' } });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Piece A' } });
  fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '25.5' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '' }), { target: { value: '1' } });
}

describe('ChallengeForm image upload and 3MF integration', () => {
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('shows a loading state and disables submit while processing an image', async () => {
    let resolveReaderLoad: (() => void) | undefined;

    class MockFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        resolveReaderLoad = () => {
          this.onload?.({ target: { result: 'data:image/png;base64,aaa' } } as ProgressEvent<FileReader>);
        };
      }
    }

    class MockImage {
      width = 1200;
      height = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,compressed');
    document.createElement = ((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    renderForm();
    const fileInput = document.querySelector('input[type="file"][accept="image/jpeg,image/png,image/webp"]') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: 'Save' });

    fireEvent.change(fileInput, { target: { files: [new File(['img'], 'piece.png', { type: 'image/png' })] } });

    expect(screen.getByText('Processing image…')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    resolveReaderLoad?.();

    await waitFor(() => {
      expect(screen.queryByText('Processing image…')).not.toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();
    });

    expect(drawImage).toHaveBeenCalled();
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.6);
  });

  it('rejects unsupported drag and drop files with an i18n message', async () => {
    renderForm();

    const uploadZone = screen.getByText('Drag an image here or click to select').closest('div');
    expect(uploadZone).not.toBeNull();

    fireEvent.drop(uploadZone!, {
      dataTransfer: {
        files: [new File(['bad'], 'file.pdf', { type: 'application/pdf' })],
      },
    });

    expect(await screen.findByText('Unsupported format. Use JPG, PNG or WebP.')).toBeInTheDocument();
  });

  it('auto-fills plate count from 3MF import results', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Import 3MF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply imported 3MF' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Plate Count')).toHaveValue(4);
    });
  });

  it('shows drop feedback on drag enter and processes a valid dropped image', async () => {
    class MockFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        this.onload?.({ target: { result: 'data:image/png;base64,preview' } } as ProgressEvent<FileReader>);
      }
    }

    class MockImage {
      width = 1200;
      height = 800;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    document.createElement = ((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => 'data:image/jpeg;base64,compressed',
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    renderForm();

    const uploadZone = screen.getByText('Drag an image here or click to select').closest('div');
    expect(uploadZone).not.toBeNull();

    fireEvent.dragEnter(uploadZone!);
    expect(screen.getByText('Drop image here')).toBeInTheDocument();

    fireEvent.drop(uploadZone!, {
      dataTransfer: {
        files: [new File(['img'], 'piece.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByAltText('cf_image_preview')).toBeInTheDocument();
    });
  });
});

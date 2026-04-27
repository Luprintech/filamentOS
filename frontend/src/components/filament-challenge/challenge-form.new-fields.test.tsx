import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeForm } from './challenge-form';
import type { FilamentProject, EditingState } from './filament-types';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
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
        'tracker.filaments.grams': 'Grams',
        cf_gcode_title: 'Auto-fill from file',
        cf_gcode_upload: 'Upload G-code',
        cf_gcode_analyzing: 'Analyzing...',
        tmf_btn: 'Import 3MF',
        form_time: 'Print time',
        'tracker.filaments.title': 'Filaments',
        'tracker.filaments.errorRequired': 'At least one filament required',
        'tracker.materials.title': 'Materials',
        'tracker.notes.title': 'Notes',
        'tracker.notes.placeholder': 'Notes placeholder',
        'tracker.incident.title': 'Incidents',
        'tracker.incident.placeholder': 'Incidents placeholder',
        form_image: 'Image',
        form_image_optional: '(optional)',
        form_image_upload: 'Upload',
        form_image_hint: 'Max 10MB',
        form_cost_preview: 'Cost preview',
        'tracker.materials.costHint': 'Cost hint',
        form_save: 'Save',
        form_err_label: 'Label is required',
        form_err_name: 'Name is required',
      };
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

describe('ChallengeForm - New Fields', () => {
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

  const mockEditingState: EditingState = { mode: 'create' };

  describe('Plate Count Field', () => {
    it('renders plate count input with default value 1', () => {
      render(
        <ChallengeForm
          project={mockProject}
          editingState={mockEditingState}
          pieces={[]}
          onSave={vi.fn()}
          onUpdate={vi.fn()}
          onCancelEdit={vi.fn()}
          activeSpools={[]}
        />
      );

      const plateCountInput = screen.getByLabelText('Plate Count') as HTMLInputElement;
      expect(plateCountInput).toBeInTheDocument();
      expect(plateCountInput.type).toBe('number');
      expect(plateCountInput.value).toBe('1');
    });

    it('allows user to change plate count value', () => {
      render(
        <ChallengeForm
          project={mockProject}
          editingState={mockEditingState}
          pieces={[]}
          onSave={vi.fn()}
          onUpdate={vi.fn()}
          onCancelEdit={vi.fn()}
          activeSpools={[]}
        />
      );

      const plateCountInput = screen.getByLabelText('Plate Count') as HTMLInputElement;
      
      fireEvent.change(plateCountInput, { target: { value: '3' } });
      
      expect(plateCountInput.value).toBe('3');
    });
  });

  describe('File Link Field', () => {
    it('renders file link input with placeholder', () => {
      render(
        <ChallengeForm
          project={mockProject}
          editingState={mockEditingState}
          pieces={[]}
          onSave={vi.fn()}
          onUpdate={vi.fn()}
          onCancelEdit={vi.fn()}
          activeSpools={[]}
        />
      );

      const fileLinkInput = screen.getByLabelText('File Link') as HTMLInputElement;
      expect(fileLinkInput).toBeInTheDocument();
      expect(fileLinkInput.type).toBe('url');
      expect(fileLinkInput.placeholder).toBe('https://example.com/file.3mf');
    });

    it('allows user to enter a URL', () => {
      render(
        <ChallengeForm
          project={mockProject}
          editingState={mockEditingState}
          pieces={[]}
          onSave={vi.fn()}
          onUpdate={vi.fn()}
          onCancelEdit={vi.fn()}
          activeSpools={[]}
        />
      );

      const fileLinkInput = screen.getByLabelText('File Link') as HTMLInputElement;
      
      fireEvent.change(fileLinkInput, { target: { value: 'https://example.com/part.3mf' } });
      
      expect(fileLinkInput.value).toBe('https://example.com/part.3mf');
    });
  });

  it('submits plate_count and file_link in the save payload', async () => {
    const onSave = vi.fn();

    render(
      <ChallengeForm
        project={mockProject}
        editingState={mockEditingState}
        pieces={[]}
        onSave={onSave}
        onUpdate={vi.fn()}
        onCancelEdit={vi.fn()}
        activeSpools={[]}
      />
    );

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Series A' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Piece A' } });
    fireEvent.change(screen.getByLabelText('Plate Count'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('File Link'), { target: { value: 'https://example.com/part.3mf' } });
    fireEvent.change(document.getElementById('ch-time-hours') as HTMLInputElement, { target: { value: '1' } });
    fireEvent.change(document.querySelector('input[placeholder="25.3"]') as HTMLInputElement, { target: { value: '12.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        plate_count: 3,
        file_link: 'https://example.com/part.3mf',
      }));
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        cf_gcode_title: 'Auto-fill from file',
        cf_gcode_upload: 'Upload G-code',
        cf_gcode_analyzing: 'Analyzing...',
        tmf_btn: 'Import 3MF',
        form_time: 'Print time',
        'tracker.filaments.title': 'Filaments',
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
      };
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

describe('ChallengeForm - Field Order', () => {
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

  it('renders Name field before Label field in the DOM', () => {
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

    // Get both field labels
    const nameLabel = screen.getByText('Name');
    const labelLabel = screen.getByText('Label');

    // Get their DOM positions using compareDocumentPosition
    const position = nameLabel.compareDocumentPosition(labelLabel);
    
    // DOCUMENT_POSITION_FOLLOWING = 4 means labelLabel comes after nameLabel in document order
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

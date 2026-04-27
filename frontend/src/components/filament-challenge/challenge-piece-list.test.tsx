import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChallengePieceList, sortPieces } from './challenge-piece-list';
import type { FilamentPiece, FilamentProject } from './filament-types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        pieces_title: 'Pieces',
        pieces_empty_label: 'No pieces',
        pieces_empty_state: 'Empty',
        pieces_time: 'Time',
        pieces_grams: 'Grams',
        pieces_cost: 'Cost',
        pieces_move_up: 'Move up',
        pieces_move_down: 'Move down',
        pieces_edit: 'Edit',
        pieces_delete: 'Delete',
        pieces_drag_hint: 'Drag to reorder',
        pieces_delete_title: 'Delete piece',
        cancel: 'Cancel',
        delete: 'Delete',
        'tracker.printDate.title': 'Print Date',
        'tracker.notes.title': 'Notes',
        'tracker.incident.title': 'Incidents',
        'tracker.materials.title': 'Materials',
        'tracker.status.printed': 'Printed',
        'tracker.sort.newest': 'Newest',
        'tracker.sort.oldest': 'Oldest',
        'tracker.sort.nameAsc': 'Name A-Z',
        'tracker.sort.nameDesc': 'Name Z-A',
        'tracker.view.list': 'List',
        'tracker.view.grid': 'Grid',
        'tracker.fileLink.open': 'Open file',
      };

      if (key === 'pieces_count') return `${params?.count ?? 0} pieces`;
      if (key === 'tracker.plateCount.display') return `${params?.count ?? 0} plates`;

      return translations[key] || key;
    },
  }),
}));

const mockProject: FilamentProject = {
  id: 'proj-1',
  title: 'Project',
  description: '',
  coverImage: null,
  goal: 10,
  pricePerKg: 20,
  currency: 'USD',
  totalPieces: 3,
  totalSecs: 0,
  totalGrams: 0,
  totalCost: 0,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

function createPiece(overrides: Partial<FilamentPiece>): FilamentPiece {
  return {
    id: overrides.id ?? 'piece-1',
    projectId: 'proj-1',
    orderIndex: overrides.orderIndex ?? 0,
    label: overrides.label ?? 'Label',
    name: overrides.name ?? 'Piece',
    timeText: '1h 0m 0s',
    gramText: '10',
    totalSecs: 3600,
    totalGrams: 10,
    totalCost: 4.2,
    timeLines: 1,
    gramLines: 1,
    imageUrl: Object.prototype.hasOwnProperty.call(overrides, 'imageUrl') ? overrides.imageUrl ?? null : 'data:image/jpeg;base64,aaa',
    notes: overrides.notes ?? 'Some notes',
    status: 'printed',
    printedAt: Object.prototype.hasOwnProperty.call(overrides, 'printedAt') ? overrides.printedAt ?? null : '2026-04-27T14:30:00.000Z',
    incident: overrides.incident ?? '',
    spoolId: null,
    filaments: [],
    materials: [],
    plate_count: overrides.plate_count ?? 2,
    file_link: overrides.file_link ?? 'https://example.com/file.3mf',
  };
}

const defaultListProps = {
  project: mockProject,
  editingState: { mode: 'create' as const },
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onReorder: vi.fn(),
  onSortChange: vi.fn(),
  onViewChange: vi.fn(),
  sortMode: 'date-desc' as const,
};

describe('ChallengePieceList sorting and rendering', () => {
  it('sorts pieces by date and name while pushing null dates to the end', () => {
    const pieces = [
      createPiece({ id: '1', name: 'Zulu', printedAt: null }),
      createPiece({ id: '2', name: 'Bravo', printedAt: '2026-04-25T00:00:00.000Z' }),
      createPiece({ id: '3', name: 'alpha', printedAt: '2026-04-27T00:00:00.000Z' }),
    ];

    expect(sortPieces(pieces, 'date-desc').map((piece) => piece.id)).toEqual(['3', '2', '1']);
    expect(sortPieces(pieces, 'date-asc').map((piece) => piece.id)).toEqual(['2', '3', '1']);
    expect(sortPieces(pieces, 'name-asc').map((piece) => piece.id)).toEqual(['3', '2', '1']);
    expect(sortPieces(pieces, 'name-desc').map((piece) => piece.id)).toEqual(['1', '2', '3']);
  });

  it('renders formatted dates, plate count, and clickable file link in grid view', () => {
    render(
      <ChallengePieceList
        {...defaultListProps}
        pieces={[createPiece({ name: 'Printer Cover' })]}
        viewMode="grid"
      />,
    );

    expect(screen.getByText('27/04/2026')).toBeInTheDocument();
    expect(screen.getByText(/2 plates/)).toBeInTheDocument();

    const fileLink = screen.getByRole('link', { name: 'Open file' });
    expect(fileLink).toHaveAttribute('href', 'https://example.com/file.3mf');
    expect(fileLink).toHaveAttribute('target', '_blank');
    expect(fileLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders date in list view and hides extra detail compared to grid', () => {
    const { rerender } = render(
      <ChallengePieceList
        {...defaultListProps}
        pieces={[createPiece({ name: 'Cover' })]}
        viewMode="list"
      />,
    );

    // Date and name should appear in both modes
    expect(screen.getByText('27/04/2026')).toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();

    rerender(
      <ChallengePieceList
        {...defaultListProps}
        pieces={[createPiece({ name: 'Cover' })]}
        viewMode="grid"
      />,
    );

    expect(screen.getByText('27/04/2026')).toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();
  });

  it('renders sort controls in the header', () => {
    render(
      <ChallengePieceList
        {...defaultListProps}
        pieces={[createPiece({})]}
        viewMode="grid"
      />,
    );

    expect(screen.getByText('Newest')).toBeInTheDocument();
    expect(screen.getByText('Oldest')).toBeInTheDocument();
    expect(screen.getByText('Name A-Z')).toBeInTheDocument();
    expect(screen.getByText('Name Z-A')).toBeInTheDocument();
  });

  it('renders view toggle buttons in the header', () => {
    render(
      <ChallengePieceList
        {...defaultListProps}
        pieces={[createPiece({})]}
        viewMode="grid"
      />,
    );

    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toBeInTheDocument();
  });
});

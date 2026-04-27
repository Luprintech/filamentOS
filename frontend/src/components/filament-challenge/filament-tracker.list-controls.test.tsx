import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilamentTracker } from './filament-tracker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'tracker.filter.all': 'All',
        'tracker.status.pending': 'Pending',
        'tracker.status.printed': 'Printed',
        'tracker.status.postProcessed': 'Post processed',
        'tracker.status.delivered': 'Delivered',
        'tracker.status.failed': 'Failed',
        'tracker.sort.newest': 'Newest',
        'tracker.sort.oldest': 'Oldest',
        'tracker.sort.nameAsc': 'Name A-Z',
        'tracker.sort.nameDesc': 'Name Z-A',
        'tracker.view.list': 'List',
        'tracker.view.grid': 'Grid',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false, isGuest: false }),
}));

vi.mock('@/features/inventory/api/use-inventory', () => ({
  useInventory: () => ({ spools: [] }),
}));

vi.mock('./use-filament-storage', () => ({
  useFilamentStorage: () => ({
    loading: false,
    error: null,
    projects: [{
      id: 'proj-1',
      title: 'Project',
      description: '',
      coverImage: null,
      goal: 10,
      pricePerKg: 20,
      currency: 'USD',
      totalPieces: 1,
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    }],
    activeProject: {
      id: 'proj-1',
      title: 'Project',
      description: '',
      coverImage: null,
      goal: 10,
      pricePerKg: 20,
      currency: 'USD',
      totalPieces: 1,
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    },
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    selectProject: vi.fn(),
    pieces: [{
      id: 'piece-1',
      projectId: 'proj-1',
      orderIndex: 0,
      label: 'Label',
      name: 'Piece',
      timeText: '1h 0m 0s',
      gramText: '10',
      totalSecs: 3600,
      totalGrams: 10,
      totalCost: 4.2,
      timeLines: 1,
      gramLines: 1,
      imageUrl: null,
      notes: 'Note',
      status: 'printed',
      printedAt: '2026-04-27T00:00:00.000Z',
      incident: '',
      filaments: [],
      materials: [],
      plate_count: 1,
      file_link: null,
    }],
    addPiece: vi.fn(),
    updatePiece: vi.fn(),
    deletePiece: vi.fn(),
    reorderPieces: vi.fn(),
  }),
}));

vi.mock('./challenge-hero', () => ({ ChallengeHero: () => <div>Hero</div> }));
vi.mock('./challenge-form', () => ({ ChallengeForm: () => <div>Form</div> }));

// Mock captures props AND exposes controls to simulate callbacks
vi.mock('./challenge-piece-list', () => ({
  ChallengePieceList: ({
    sortMode,
    viewMode,
    onSortChange,
    onViewChange,
  }: {
    sortMode: string;
    viewMode: string;
    onSortChange: (m: string) => void;
    onViewChange: (m: string) => void;
  }) => (
    <div>
      <span data-testid="sort-mode">{sortMode}</span>
      <span data-testid="view-mode">{viewMode}</span>
      <button type="button" onClick={() => onSortChange('name-asc')}>Change sort to name-asc</button>
      <button type="button" onClick={() => onViewChange('list')}>Change view to list</button>
    </div>
  ),
}));

vi.mock('./tracker-print-summary', () => ({ TrackerPrintSummary: () => null }));
vi.mock('@/components/tracker-pdf-customizer', () => ({ TrackerPdfCustomizer: () => null }));
vi.mock('./project-manager', () => ({
  ProjectManager: ({ onOpenProject }: { onOpenProject: (id: string) => void }) => (
    <button type="button" onClick={() => onOpenProject('proj-1')}>Open project</button>
  ),
  ProjectForm: () => null,
}));
vi.mock('@/components/guest-banner', () => ({ GuestBanner: () => null }));
vi.mock('@/components/login-required-modal', () => ({ LoginRequiredModal: () => null }));
vi.mock('@/data/mockData', () => ({ mockTrackerProjects: [], mockTrackerPieces: [], toFilamentProject: vi.fn() }));

describe('FilamentTracker list controls', () => {
  it('passes sort and view mode to piece list, and propagates changes via callbacks', () => {
    render(<FilamentTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));

    // Default state: date-desc + grid
    expect(screen.getByTestId('sort-mode')).toHaveTextContent('date-desc');
    expect(screen.getByTestId('view-mode')).toHaveTextContent('grid');

    // Trigger changes via the mock's callback buttons
    fireEvent.click(screen.getByRole('button', { name: 'Change sort to name-asc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change view to list' }));

    expect(screen.getByTestId('sort-mode')).toHaveTextContent('name-asc');
    expect(screen.getByTestId('view-mode')).toHaveTextContent('list');
  });
});

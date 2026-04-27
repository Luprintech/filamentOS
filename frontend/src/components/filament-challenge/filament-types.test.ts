import { describe, it, expect } from 'vitest';
import type { FilamentPiece } from './filament-types';

describe('FilamentPiece interface', () => {
  it('should accept plate_count as number', () => {
    const piece: FilamentPiece = {
      id: '1',
      projectId: 'proj-1',
      orderIndex: 1,
      label: 'Day 1',
      name: 'Test Piece',
      timeText: '',
      gramText: '',
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      timeLines: 0,
      gramLines: 0,
      imageUrl: null,
      notes: '',
      status: 'pending',
      printedAt: null,
      incident: '',
      filaments: [],
      materials: [],
      plate_count: 3,
      file_link: null,
    };

    expect(piece.plate_count).toBe(3);
    expect(typeof piece.plate_count).toBe('number');
  });

  it('should accept file_link as string or null', () => {
    const pieceWithLink: FilamentPiece = {
      id: '2',
      projectId: 'proj-1',
      orderIndex: 2,
      label: 'Day 2',
      name: 'Linked Piece',
      timeText: '',
      gramText: '',
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      timeLines: 0,
      gramLines: 0,
      imageUrl: null,
      notes: '',
      status: 'pending',
      printedAt: null,
      incident: '',
      filaments: [],
      materials: [],
      plate_count: 1,
      file_link: 'https://example.com/file.3mf',
    };

    const pieceWithoutLink: FilamentPiece = {
      id: '3',
      projectId: 'proj-1',
      orderIndex: 3,
      label: 'Day 3',
      name: 'Unlinked Piece',
      timeText: '',
      gramText: '',
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      timeLines: 0,
      gramLines: 0,
      imageUrl: null,
      notes: '',
      status: 'pending',
      printedAt: null,
      incident: '',
      filaments: [],
      materials: [],
      plate_count: 2,
      file_link: null,
    };

    expect(pieceWithLink.file_link).toBe('https://example.com/file.3mf');
    expect(pieceWithoutLink.file_link).toBeNull();
  });
});

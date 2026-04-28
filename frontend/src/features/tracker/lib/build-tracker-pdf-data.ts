import type { FilamentPiece, FilamentProject } from '@/components/filament-challenge/filament-types';
import type { TrackerPdfData } from '@/features/tracker/api/use-tracker-pdf';

export function buildTrackerPdfData(project: FilamentProject, pieces: FilamentPiece[]): TrackerPdfData {
  return {
    projectTitle: project.title,
    projectDescription: project.description,
    projectGoal: project.goal,
    projectCurrency: project.currency,
    projectPricePerKg: project.pricePerKg,
    coverImage: project.coverImage,
    totalPieces: project.totalPieces,
    totalSecs: project.totalSecs,
    totalGrams: project.totalGrams,
    totalCost: project.totalCost,
    pieces: pieces.map((piece) => ({
      label: piece.label,
      name: piece.name,
      totalSecs: piece.totalSecs,
      totalGrams: piece.totalGrams,
      totalCost: piece.totalCost,
      imageUrl: piece.imageUrl,
      notes: piece.notes ?? '',
      status: piece.status ?? 'printed',
      printedAt: piece.printedAt ?? null,
      incident: piece.incident ?? '',
      materials: (piece.materials ?? []).map((material) => ({
        name: material.name,
        quantity: material.quantity,
        cost: material.cost,
      })),
    })),
  };
}

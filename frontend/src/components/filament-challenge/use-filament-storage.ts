import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  apiGetProjects, apiCreateProject, apiUpdateProject, apiDeleteProject,
  apiGetPieces, apiCreatePiece, apiUpdatePiece, apiDeletePiece, apiReorderPieces,
  TrackerApiError,
} from './tracker-api';
import type { FilamentProject, FilamentPiece } from './filament-types';

// ── Input shapes ───────────────────────────────────────────────────────────────

export interface ProjectInput {
  title: string;
  description: string;
  coverImage: string | null;
  goal: number;
  pricePerKg: number;
  currency: string;
}

export interface PieceInput {
  label: string;
  name: string;
  timeText: string;
  gramText: string;
}

export interface FilamentStorageOptions {
  authLoading: boolean;
  userId: string | null;
}

// ── Active project persistence (localStorage — only the selected ID, not data) ─

const ACTIVE_KEY = 'luprintech-tracker-active';

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string | null): void {
  if (id === null) localStorage.removeItem(ACTIVE_KEY);
  else localStorage.setItem(ACTIVE_KEY, id);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useFilamentStorage({ authLoading, userId }: FilamentStorageOptions) {
  const [projects, setProjects]   = useState<FilamentProject[]>([]);
  const [pieces, setPieces]       = useState<FilamentPiece[]>([]);
  const [activeId, setActiveId]   = useState<string | null>(loadActiveId);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<TrackerApiError | Error | null>(null);

  // ── Load projects on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!userId) {
      setProjects([]);
      setPieces([]);
      setActiveId(null);
      saveActiveId(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    apiGetProjects()
      .then((data) => { if (!cancelled) { setProjects(data); setError(null); } })
      .catch((e: TrackerApiError | Error) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, userId]);

  // ── Load pieces when active project changes ──────────────────────────────────

  useEffect(() => {
    if (authLoading || !userId) {
      setPieces([]);
      return;
    }

    if (!activeId) { setPieces([]); return; }
    let cancelled = false;
    apiGetPieces(activeId)
      .then((data) => { if (!cancelled) setPieces(data); })
      .catch(() => { if (!cancelled) setPieces([]); });
    return () => { cancelled = true; };
  }, [activeId, authLoading, userId]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  // ── Project CRUD ─────────────────────────────────────────────────────────────

  const createProject = useCallback(async (input: ProjectInput): Promise<string> => {
    if (!userId) throw new Error('No autenticado');
    const { id } = await apiCreateProject(input);
    const now = new Date().toISOString();
    const newProject: FilamentProject = {
      id,
      ...input,
      totalPieces: 0,
      totalSecs: 0,
      totalGrams: 0,
      totalCost: 0,
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [...prev, newProject]);
    setActiveId(id);
    saveActiveId(id);
    return id;
  }, [userId]);

  const updateProject = useCallback(async (id: string, input: ProjectInput) => {
    if (!userId) throw new Error('No autenticado');
    await apiUpdateProject(id, input);
    const now = new Date().toISOString();
    setProjects((prev) =>
      prev.map((p) => p.id === id ? { ...p, ...input, updatedAt: now } : p),
    );
    // Recalculate costs locally to avoid an extra GET
    setPieces((prev) =>
      prev.map((piece) =>
        piece.projectId === id
          ? { ...piece, totalCost: parseFloat((piece.totalGrams * (input.pricePerKg / 1000)).toFixed(4)) }
          : piece,
      ),
    );
  }, [userId]);

  const deleteProject = useCallback(async (id: string) => {
    if (!userId) throw new Error('No autenticado');
    await apiDeleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) {
      setActiveId(null);
      saveActiveId(null);
      setPieces([]);
    }
  }, [activeId, userId]);

  const selectProject = useCallback((id: string | null) => {
    setActiveId(id);
    saveActiveId(id);
  }, []);

  // ── Piece CRUD ────────────────────────────────────────────────────────────────

  const addPiece = useCallback(async (input: PieceInput) => {
    if (!activeId || !userId) return;
    const { id, totalCost } = await apiCreatePiece(activeId, input);
    // Optimistic: build the full piece locally from parsed data
    const { parseTimeBlock, parseGramBlock } = await import('./filament-storage');
    const time  = parseTimeBlock(input.timeText);
    const grams = parseGramBlock(input.gramText);
      const piece: FilamentPiece = {
        id,
        projectId:  activeId,
        orderIndex: pieces.length,
        label:      input.label,
        name:       input.name,
      timeText:   input.timeText,
      gramText:   input.gramText,
      totalSecs:  time.totalSecs,
      totalGrams: grams.totalGrams,
      totalCost,
      timeLines:  time.validLines,
      gramLines:  grams.validLines,
    };
    setPieces((prev) => [...prev, piece]);
    setProjects((prev) => prev.map((project) =>
      project.id === activeId
        ? {
            ...project,
            totalPieces: project.totalPieces + 1,
            totalSecs: project.totalSecs + piece.totalSecs,
            totalGrams: project.totalGrams + piece.totalGrams,
            totalCost: parseFloat((project.totalCost + piece.totalCost).toFixed(4)),
          }
        : project,
    ));
  }, [activeId, userId]);

  const updatePiece = useCallback(async (id: string, input: PieceInput) => {
    if (!activeId || !userId) return;
    const { totalCost } = await apiUpdatePiece(activeId, id, input);
    const { parseTimeBlock, parseGramBlock } = await import('./filament-storage');
    const time  = parseTimeBlock(input.timeText);
    const grams = parseGramBlock(input.gramText);
    const currentPiece = pieces.find((p) => p.id === id);
    setPieces((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...input, totalSecs: time.totalSecs, totalGrams: grams.totalGrams, totalCost, timeLines: time.validLines, gramLines: grams.validLines }
          : p,
      ),
    );
    if (currentPiece) {
      setProjects((prev) => prev.map((project) =>
        project.id === activeId
          ? {
              ...project,
              totalSecs: project.totalSecs - currentPiece.totalSecs + time.totalSecs,
              totalGrams: project.totalGrams - currentPiece.totalGrams + grams.totalGrams,
              totalCost: parseFloat((project.totalCost - currentPiece.totalCost + totalCost).toFixed(4)),
            }
          : project,
      ));
    }
  }, [activeId, userId, pieces]);

  const deletePiece = useCallback(async (id: string) => {
    if (!activeId || !userId) return;
    const piece = pieces.find((p) => p.id === id);
    if (!piece) return;
    await apiDeletePiece(activeId, id);
    setPieces((prev) => prev.filter((p) => p.id !== id));
    setProjects((prev) => prev.map((project) =>
      project.id === activeId
        ? {
            ...project,
            totalPieces: Math.max(0, project.totalPieces - 1),
            totalSecs: Math.max(0, project.totalSecs - piece.totalSecs),
            totalGrams: Math.max(0, project.totalGrams - piece.totalGrams),
            totalCost: Math.max(0, parseFloat((project.totalCost - piece.totalCost).toFixed(4))),
          }
        : project,
    ));
  }, [activeId, pieces, userId]);

  const reorderPieces = useCallback(async (orderedIds: string[]) => {
    if (!activeId || !userId) return;
    await apiReorderPieces(activeId, orderedIds);
    setPieces((prev) => {
      const map = new Map(prev.map((piece) => [piece.id, piece]));
      return orderedIds
        .map((id, index) => {
          const piece = map.get(id);
          return piece ? { ...piece, orderIndex: index } : null;
        })
        .filter((piece): piece is FilamentPiece => piece !== null);
    });
  }, [activeId, userId]);

  return {
    // state
    loading,
    error,
    // projects
    projects,
    activeProject,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    // pieces (scoped to active project)
    pieces,
    addPiece,
    updatePiece,
    deletePiece,
    reorderPieces,
  };
}

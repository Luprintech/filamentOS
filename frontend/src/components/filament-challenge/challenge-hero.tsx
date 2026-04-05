import React from 'react';
import { cn } from '@/lib/utils';
import { computeProjectStats, secsToString, formatCost } from './filament-storage';
import type { FilamentPiece, FilamentProject } from './filament-types';

interface StatCardProps {
  label: string;
  value: string;
  color: 'pink' | 'blue' | 'green' | 'yellow' | 'white';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colorMap: Record<StatCardProps['color'], string> = {
    pink:   'text-[hsl(var(--challenge-pink))]',
    blue:   'text-[hsl(var(--challenge-blue))]',
    green:  'text-[hsl(var(--challenge-green))]',
    yellow: 'text-yellow-400',
    white:  'text-foreground',
  };

  return (
    <div className="challenge-stat-card rounded-[22px] border border-white/[0.08] p-4 sm:p-5">
      <p className="text-[0.78rem] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-2 text-xl font-black sm:text-2xl break-all', colorMap[color])}>
        {value}
      </p>
    </div>
  );
}

interface ChallengeHeroProps {
  project: FilamentProject;
  pieces: FilamentPiece[];
  onBack: () => void;
  onPrint: () => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
}

export function ChallengeHero({ project, pieces, onBack, onPrint, onEditProject, onDeleteProject }: ChallengeHeroProps) {
  const stats      = computeProjectStats(pieces, project);
  const isComplete = stats.totalPieces >= project.goal;

  return (
    <section className="challenge-hero relative mb-6 overflow-hidden rounded-[28px] border border-white/[0.10] p-6 sm:p-8">
      {/* decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(var(--challenge-blue)) 0%, transparent 65%)' }}
      />

      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Todos los proyectos
      </button>

      <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold tracking-wide text-[hsl(var(--challenge-blue))]">
        ✨ Tracker de impresión 3D
      </div>

      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center">
        {project.coverImage && (
          <div className="overflow-hidden rounded-[20px] border border-white/[0.10] bg-black/20 md:w-56">
            <img
              src={project.coverImage}
              alt={`Portada de ${project.title}`}
              className="h-40 w-full object-cover"
            />
          </div>
        )}
        <div>
          <h2 className="challenge-gradient-text text-3xl font-black leading-none tracking-tight sm:text-4xl">
            {project.title}
          </h2>
          {project.description && (
            <p className="mt-1 text-base font-bold text-[hsl(var(--challenge-blue))] sm:text-lg">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Piezas"
          value={`${stats.totalPieces} / ${project.goal}`}
          color="pink"
        />
        <StatCard
          label="Tiempo total"
          value={secsToString(stats.totalSecs)}
          color="blue"
        />
        <StatCard
          label="Filamento"
          value={`${stats.totalGrams.toFixed(1)}g`}
          color="green"
        />
        <StatCard
          label="Coste total"
          value={formatCost(stats.totalCost, project.currency)}
          color="yellow"
        />
        <StatCard
          label="Progreso"
          value={`${stats.progressPct}%`}
          color="white"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onPrint}
          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-foreground transition hover:bg-white/[0.08] sm:w-auto"
        >
          🖨️ Guardar en PDF
        </button>
        <button
          type="button"
          onClick={onEditProject}
          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-foreground transition hover:bg-white/[0.08] sm:w-auto"
        >
          ✏️ Editar proyecto
        </button>
        <button
          type="button"
          onClick={onDeleteProject}
          className="rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive transition hover:bg-destructive/20 sm:w-auto"
        >
          🗑️ Eliminar proyecto
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${stats.progressPct}%`,
            background: 'linear-gradient(90deg, hsl(var(--challenge-pink)), hsl(var(--challenge-blue)))',
          }}
        />
      </div>

      {isComplete && (
        <div className="mt-4 rounded-2xl border border-[hsl(var(--challenge-blue))]/25 bg-gradient-to-r from-[hsl(var(--challenge-pink))]/10 via-[hsl(var(--challenge-blue))]/10 to-[hsl(var(--challenge-green))]/10 px-5 py-4 text-sm font-bold text-foreground">
          🎉 ¡Meta alcanzada! Has completado las {project.goal} piezas de <em>{project.title}</em>.
        </div>
      )}
    </section>
  );
}

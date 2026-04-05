import React from 'react';
import { Separator } from '@/components/ui/separator';
import { Youtube, Instagram } from 'lucide-react';
import { TikTokIcon } from '@/components/icons';
import { secsToString, formatCost } from './filament-storage';
import type { FilamentPiece, FilamentProject } from './filament-types';

interface TrackerPrintSummaryProps {
  project: FilamentProject;
  pieces: FilamentPiece[];
}

export function TrackerPrintSummary({ project, pieces }: TrackerPrintSummaryProps) {
  const orderedPieces = [...pieces].sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
  const progressPct = project.goal > 0 ? Math.min(Math.round((project.totalPieces / project.goal) * 100), 100) : 0;

  return (
    <div className="bg-white p-8 font-body text-black" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as 'exact' }}>
      <header className="mb-8 flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="font-headline text-3xl font-bold" style={{ color: '#d966ff' }}>{project.title}</h1>
        </div>
        <img src="/Logo.svg" alt="Logo de Luprintech" width={80} height={80} className="rounded-full" />
      </header>

      {project.coverImage && (
        <div className="mb-6 flex items-center justify-center overflow-hidden rounded-xl border bg-gray-50 p-3">
          <img src={project.coverImage} alt={`Portada de ${project.title}`} className="max-h-64 w-auto max-w-full object-contain" />
        </div>
      )}

      {project.description && <p className="mb-4 text-sm text-gray-700">{project.description}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        {[
          { label: 'Piezas', value: `${project.totalPieces} / ${project.goal}`, border: '#d966ff', bg: 'linear-gradient(135deg, rgba(217,102,255,0.10), rgba(255,255,255,0.92))' },
          { label: 'Tiempo total', value: secsToString(project.totalSecs), border: '#23c7ff', bg: 'linear-gradient(135deg, rgba(35,199,255,0.10), rgba(255,255,255,0.92))' },
          { label: 'Filamento', value: `${project.totalGrams.toFixed(1)}g`, border: '#37e3a5', bg: 'linear-gradient(135deg, rgba(55,227,165,0.10), rgba(255,255,255,0.92))' },
          { label: 'Coste filamento', value: formatCost(project.totalCost, project.currency), border: '#ffd166', bg: 'linear-gradient(135deg, rgba(255,209,102,0.12), rgba(255,255,255,0.92))' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl p-4"
            style={{
              border: `1.5px solid ${item.border}`,
              background: item.bg,
              boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
            }}
          >
            <strong>{item.label}:</strong> {item.value}
          </div>
        ))}
        <div
          className="col-span-2 rounded-xl p-4"
          style={{
            border: '1.5px solid #8b5cf6',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(255,255,255,0.94))',
            boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
          }}
        >
          <strong>Progreso:</strong> {progressPct}%
        </div>
      </div>

      <Separator className="my-4" />

      <section style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>
        <h2 className="mb-1 text-lg font-bold">Listado de piezas</h2>
        <p className="mb-4 text-sm text-gray-600">{project.totalPieces} pieza(s) registradas</p>
        <div className="space-y-3 text-sm">
          {orderedPieces.length === 0 ? (
            <p className="text-gray-600">Este proyecto aún no tiene piezas registradas.</p>
          ) : (
            orderedPieces.map((piece) => (
              <div
                key={piece.id}
                className="rounded-xl p-4"
                style={{
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  border: '1.5px solid #c084fc',
                  background: 'linear-gradient(135deg, rgba(217,102,255,0.08), rgba(35,199,255,0.06), rgba(255,255,255,0.96))',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-[15px] text-black">{piece.name}</strong>
                  <span className="text-gray-600">{piece.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-gray-800">
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: 'rgba(35,199,255,0.10)' }}
                  >
                    <strong>Tiempo:</strong> {secsToString(piece.totalSecs)}
                  </div>
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: 'rgba(55,227,165,0.10)' }}
                  >
                    <strong>Gramos:</strong> {piece.totalGrams.toFixed(1)}g
                  </div>
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: 'rgba(255,209,102,0.14)' }}
                  >
                    <strong>Coste:</strong> {formatCost(piece.totalCost, project.currency)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="mt-12 border-t pt-6 text-center text-xs text-gray-700">
        <p className="mb-3 text-sm font-semibold">@luprintech</p>
        <div className="flex items-center justify-center gap-4 text-gray-700">
          <a
            href="https://www.youtube.com/@Luprintech"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Canal de YouTube de Luprintech"
            className="transition-colors hover:text-primary"
          >
            <Youtube className="h-5 w-5" />
          </a>
          <a
            href="https://www.instagram.com/luprintech/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Perfil de Instagram de Luprintech"
            className="transition-colors hover:text-primary"
          >
            <Instagram className="h-5 w-5" />
          </a>
          <a
            href="https://www.tiktok.com/@luprintech"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Perfil de TikTok de Luprintech"
            className="transition-colors hover:text-primary"
          >
            <TikTokIcon className="h-5 w-5" />
          </a>
        </div>
      </footer>
    </div>
  );
}

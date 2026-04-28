import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * GlobalBackground — Fondo global premium y artesanal con animaciones
 * 
 * Modo oscuro: estrellas flotantes + halos neón animados
 * Modo claro: partículas de luz + blobs pastel suaves
 */
export function GlobalBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 print:hidden">
      {/* Patrón de líneas diagonales sutil */}
      <div 
        className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 40px,
            hsl(var(--foreground) / 0.4) 40px,
            hsl(var(--foreground) / 0.4) 41px
          )`
        }}
      />

      {/* Halos animados con movimiento orgánico */}
      <div className="absolute inset-0">
        {/* Halo 1: Rosa/Violeta — top left — TEST RÁPIDO */}
        <div 
          className="absolute -top-[20%] -left-[10%] w-[900px] h-[900px] rounded-full"
          style={{
            background: isDark 
              ? 'radial-gradient(circle, rgba(217, 102, 255, 0.5) 0%, rgba(217, 102, 255, 0.2) 40%, transparent 60%)'
              : 'radial-gradient(circle, rgba(160, 80, 230, 0.4) 0%, rgba(160, 80, 230, 0.15) 40%, transparent 60%)',
            filter: 'blur(100px)',
            animation: 'float-slow 5s ease-in-out infinite'
          }}
        />

        {/* Halo 2: Azul cian — top right */}
        <div 
          className="absolute -top-[15%] -right-[5%] w-[850px] h-[850px] rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(35, 199, 255, 0.28) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(50, 160, 240, 0.20) 0%, transparent 60%)',
            filter: 'blur(90px)',
            animation: 'float-drift 30s ease-in-out infinite',
            animationDelay: '2s'
          }}
        />

        {/* Halo 3: Verde esmeralda — bottom center */}
        <div 
          className="absolute -bottom-[10%] left-[50%] -translate-x-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(55, 227, 165, 0.25) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(130, 220, 180, 0.18) 0%, transparent 60%)',
            filter: 'blur(95px)',
            animation: 'glow-pulse 20s ease-in-out infinite',
            animationDelay: '4s'
          }}
        />

        {/* Halo 4: Violeta — centro derecha */}
        <div 
          className="absolute top-[40%] -right-[8%] w-[750px] h-[750px] rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(180, 120, 255, 0.22) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(140, 100, 220, 0.15) 0%, transparent 60%)',
            filter: 'blur(85px)',
            animation: 'float-slow 28s ease-in-out infinite',
            animationDelay: '6s'
          }}
        />
      </div>

      {/* Partículas flotantes */}
      <div className="absolute inset-0">
        {isDark ? <DarkParticles /> : <LightParticles />}
      </div>
    </div>
  );
}

// ── Partículas modo oscuro: estrellas ────────────────────────────────────────
function DarkParticles() {
  const stars = Array.from({ length: 30 }, (_, i) => {
    // Mejor distribución con prime numbers para evitar clústeres
    const seed = i * 37;
    const x = (Math.sin(seed) * 50 + 50);
    const y = (Math.cos(seed * 1.3) * 50 + 50);
    const size = 2.5 + (i % 3) * 0.5;
    const delay = (i * 0.3) % 6;
    const duration = 4 + (i % 4); // MÁS RÁPIDO: 4-7s

    return { x, y, size, delay, duration };
  });

  return (
    <>
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animation: `star-twinkle ${star.duration}s ease-in-out infinite`,
            animationDelay: `${star.delay}s`,
            boxShadow: '0 0 10px rgba(255, 255, 255, 1), 0 0 4px rgba(255, 255, 255, 1)'
          }}
        />
      ))}
    </>
  );
}

// ── Partículas modo claro: motas de luz ──────────────────────────────────────
function LightParticles() {
  const motes = Array.from({ length: 25 }, (_, i) => {
    // Mejor distribución
    const seed = i * 43;
    const x = (Math.sin(seed) * 50 + 50);
    const y = (Math.cos(seed * 1.7) * 50 + 50);
    const size = 5 + (i % 3);
    const delay = (i * 0.4) % 8;
    const duration = 12 + (i % 6); // MÁS RÁPIDO: 12-17s
    const colorVariant = i % 3;

    const colors = [
      'rgba(160, 80, 230, 0.45)',
      'rgba(50, 160, 240, 0.40)',
      'rgba(130, 220, 180, 0.35)',
    ];

    return { x, y, size, delay, duration, color: colors[colorVariant] };
  });

  return (
    <>
      {motes.map((mote, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${mote.x}%`,
            top: `${mote.y}%`,
            width: `${mote.size}px`,
            height: `${mote.size}px`,
            background: mote.color,
            animation: `mote-float ${mote.duration}s linear infinite`,
            animationDelay: `${mote.delay}s`,
            filter: 'blur(4px)',
          }}
        />
      ))}
    </>
  );
}

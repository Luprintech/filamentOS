import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * AnimatedBackground — Fondo global premium y artesanal
 * 
 * Modo oscuro: estrellas flotantes + halos neón animados
 * Modo claro: partículas de luz + blobs pastel suaves
 * 
 * Respeta prefers-reduced-motion y mantiene rendimiento óptimo.
 */
export function AnimatedBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Evitar flash durante SSR - pero renderizar estructura base
  const isDark = mounted ? resolvedTheme === 'dark' : true;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
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
        {/* Halo 1: Rosa/Violeta — top left */}
        <div 
          className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] rounded-full animate-float-slow"
          style={{
            background: isDark 
              ? 'radial-gradient(circle, rgba(217, 102, 255, 0.25) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(160, 80, 230, 0.18) 0%, transparent 60%)',
            filter: 'blur(80px)',
            animationDelay: '0s'
          }}
        />

        {/* Halo 2: Azul cian — top right */}
        <div 
          className="absolute -top-[15%] -right-[5%] w-[700px] h-[700px] rounded-full animate-float-drift"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(35, 199, 255, 0.22) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(50, 160, 240, 0.15) 0%, transparent 60%)',
            filter: 'blur(70px)',
            animationDelay: '2s'
          }}
        />

        {/* Halo 3: Verde esmeralda — bottom center */}
        <div 
          className="absolute -bottom-[10%] left-[50%] -translate-x-1/2 w-[750px] h-[750px] rounded-full animate-glow-pulse"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(55, 227, 165, 0.20) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(130, 220, 180, 0.12) 0%, transparent 60%)',
            filter: 'blur(75px)',
            animationDelay: '4s'
          }}
        />

        {/* Halo 4: Violeta — centro derecha */}
        <div 
          className="absolute top-[40%] -right-[8%] w-[650px] h-[650px] rounded-full animate-float-slow"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(180, 120, 255, 0.18) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(140, 100, 220, 0.10) 0%, transparent 60%)',
            filter: 'blur(65px)',
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
  // Generar 60 estrellas con posiciones y delays aleatorios pero consistentes
  const stars = Array.from({ length: 60 }, (_, i) => {
    // Seed basado en índice para consistencia
    const seed = i * 137.508; // Golden angle
    const x = (seed * 17) % 100;
    const y = (seed * 23) % 100;
    const size = 1.5 + (i % 3) * 0.5; // 1.5-2.5px
    const delay = (i * 0.3) % 8;
    const duration = 12 + (i % 8);

    return { x, y, size, delay, duration };
  });

  return (
    <>
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white animate-star-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
            boxShadow: '0 0 6px rgba(255, 255, 255, 0.8), 0 0 2px rgba(255, 255, 255, 1)'
          }}
        />
      ))}
    </>
  );
}

// ── Partículas modo claro: motas de luz ──────────────────────────────────────
function LightParticles() {
  // Generar 40 motas sutiles
  const motes = Array.from({ length: 40 }, (_, i) => {
    const seed = i * 137.508;
    const x = (seed * 19) % 100;
    const y = (seed * 29) % 100;
    const size = 3 + (i % 4); // 3-6px
    const delay = (i * 0.4) % 10;
    const duration = 18 + (i % 8);
    const colorVariant = i % 3; // 0: violeta, 1: azul, 2: cian

    const colors = [
      'rgba(160, 80, 230, 0.35)',  // violeta
      'rgba(50, 160, 240, 0.30)',  // azul
      'rgba(130, 220, 180, 0.28)', // cian
    ];

    return { x, y, size, delay, duration, color: colors[colorVariant] };
  });

  return (
    <>
      {motes.map((mote, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-mote-float"
          style={{
            left: `${mote.x}%`,
            top: `${mote.y}%`,
            width: `${mote.size}px`,
            height: `${mote.size}px`,
            background: mote.color,
            animationDelay: `${mote.delay}s`,
            animationDuration: `${mote.duration}s`,
            filter: 'blur(2px)',
          }}
        />
      ))}
    </>
  );
}

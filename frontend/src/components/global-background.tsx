import React from 'react';
import { useTheme } from 'next-themes';

const stars = Array.from({ length: 22 }, (_, index) => ({
  id: index,
  left: `${(index * 17) % 100}%`,
  top: `${(index * 29) % 100}%`,
  size: 2 + (index % 3),
  opacity: 0.25 + (index % 4) * 0.14,
}));

export function GlobalBackground() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-[-1] print:hidden">
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: isDark
            ? `
              radial-gradient(circle at 12% 18%, rgba(35,199,255,0.22), transparent 18%),
              radial-gradient(circle at 88% 14%, rgba(217,102,255,0.22), transparent 20%),
              radial-gradient(circle at 50% 72%, rgba(120,119,255,0.16), transparent 24%),
              radial-gradient(circle at 22% 86%, rgba(35,199,255,0.12), transparent 18%),
              linear-gradient(145deg, rgba(5,11,31,0.96) 0%, rgba(10,16,46,0.95) 38%, rgba(25,13,54,0.94) 70%, rgba(6,11,28,0.96) 100%)
            `
            : `
              radial-gradient(circle at 12% 18%, rgba(35,199,255,0.12), transparent 18%),
              radial-gradient(circle at 88% 14%, rgba(217,102,255,0.10), transparent 20%),
              radial-gradient(circle at 50% 72%, rgba(120,119,255,0.08), transparent 24%),
              linear-gradient(145deg, rgba(250,253,255,0.97) 0%, rgba(241,247,255,0.97) 45%, rgba(245,241,255,0.96) 100%)
            `,
        }}
      />

      <div
        className={`absolute inset-0 ${isDark ? 'opacity-25' : 'opacity-20'}`}
        style={{
          backgroundImage: `
            repeating-linear-gradient(120deg, ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} 0 2px, transparent 2px 44px),
            repeating-linear-gradient(60deg, rgba(35,199,255,0.03) 0 1px, transparent 1px 60px)
          `,
          maskImage: 'radial-gradient(circle at center, black 45%, transparent 100%)',
        }}
      />

      <div className="absolute inset-0">
        {stars.map((star) => (
          <span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              background: isDark ? 'white' : 'rgba(15, 23, 42, 0.55)',
              boxShadow: `0 0 ${star.size * 4}px ${isDark ? 'rgba(255,255,255,0.45)' : 'rgba(35,199,255,0.20)'}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Genera un UUID v4 compatible con contextos HTTP (no-secure).
 * crypto.randomUUID() solo funciona en HTTPS; este fallback usa
 * crypto.getRandomValues() que SÍ está disponible en HTTP.
 */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024;
export const IMAGE_COMPRESSION_MAX_PX = 600;
export const IMAGE_COMPRESSION_QUALITY = 0.6;

export function isSupportedImageType(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number]);
}

export async function compressImage(
  file: File,
  maxPx = IMAGE_COMPRESSION_MAX_PX,
  quality = IMAGE_COMPRESSION_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC-4122 v4 UUID usando getRandomValues (disponible en HTTP)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const n = parseInt(c, 10);
    return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
  });
}

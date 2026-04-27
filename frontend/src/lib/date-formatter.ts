export function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

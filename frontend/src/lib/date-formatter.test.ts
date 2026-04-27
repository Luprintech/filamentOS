import { describe, it, expect } from 'vitest';
import { formatDisplayDate } from './date-formatter';

describe('formatDisplayDate', () => {
  it('should format valid ISO date to dd/mm/yyyy', () => {
    const result = formatDisplayDate('2026-04-27T14:30:00.000Z');
    expect(result).toBe('27/04/2026');
  });

  it('should return em dash for null input', () => {
    const result = formatDisplayDate(null);
    expect(result).toBe('—');
  });

  it('should return em dash for undefined input', () => {
    const result = formatDisplayDate(undefined);
    expect(result).toBe('—');
  });

  it('should return em dash for invalid date string', () => {
    const result = formatDisplayDate('invalid-date');
    expect(result).toBe('—');
  });

  it('should handle leap year date correctly', () => {
    const result = formatDisplayDate('2024-02-29T12:00:00.000Z');
    expect(result).toBe('29/02/2024');
  });
});

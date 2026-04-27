import { describe, it, expect } from 'vitest';
import { db } from './index';

describe('tracker_pieces schema', () => {
  it('should have plate_count column with INTEGER type and default 1', () => {
    const columns = db
      .prepare("PRAGMA table_info(tracker_pieces)")
      .all() as Array<{ name: string; type: string; dflt_value: string | null; notnull: number }>;
    
    const plateCountColumn = columns.find(col => col.name === 'plate_count');
    
    expect(plateCountColumn).toBeDefined();
    expect(plateCountColumn?.type).toBe('INTEGER');
    expect(plateCountColumn?.dflt_value).toBe('1');
    expect(plateCountColumn?.notnull).toBe(1);
  });

  it('should have file_link column with TEXT type and nullable', () => {
    const columns = db
      .prepare("PRAGMA table_info(tracker_pieces)")
      .all() as Array<{ name: string; type: string; dflt_value: string | null; notnull: number }>;
    
    const fileLinkColumn = columns.find(col => col.name === 'file_link');
    
    expect(fileLinkColumn).toBeDefined();
    expect(fileLinkColumn?.type).toBe('TEXT');
    expect(fileLinkColumn?.notnull).toBe(0); // 0 = nullable
  });

  it('should verify default value is enforced at schema level', () => {
    const columns = db
      .prepare("PRAGMA table_info(tracker_pieces)")
      .all() as Array<{ name: string; type: string; dflt_value: string | null; notnull: number }>;
    
    const plateCountColumn = columns.find(col => col.name === 'plate_count');
    
    // Verify default is set at database level (not just application)
    expect(plateCountColumn?.dflt_value).toBe('1');
    // This ensures backward compatibility - existing rows get plate_count=1
  });
});

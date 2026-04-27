import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app, db } from './index';

// ── Test user y agente con sesión ─────────────────────────────────────────────
let testUserId: string;
let testProjectId: string;
const agent = request.agent(app);

beforeAll(() => {
  testUserId = crypto.randomUUID();
  db.prepare(
    'INSERT INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)'
  ).run(testUserId, `google_stats_${testUserId}`, 'stats@example.com', 'Stats User', null);

  // Crear un tracker_project y algunas pieces para tener datos
  testProjectId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO tracker_projects (id, user_id, title, description, goal, price_per_kg, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(testProjectId, testUserId, 'Proyecto Test Stats', '', 30, 20, 'EUR');

  const pieceId1 = crypto.randomUUID();
  const pieceId2 = crypto.randomUUID();
  db.prepare(
    `INSERT INTO tracker_pieces
       (id, project_id, user_id, order_index, label, name, time_text, gram_text,
        total_secs, total_grams, total_cost, time_lines, gram_lines, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(pieceId1, testProjectId, testUserId, 0, 'A', 'Pieza 1', '1h', '50g', 3600, 50, 1.0, 1, 1, '2024-06-15T10:00:00');
  db.prepare(
    `INSERT INTO tracker_pieces
       (id, project_id, user_id, order_index, label, name, time_text, gram_text,
        total_secs, total_grams, total_cost, time_lines, gram_lines, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(pieceId2, testProjectId, testUserId, 1, 'B', 'Pieza 2', '2h', '100g', 7200, 100, 2.0, 1, 1, '2024-09-20T10:00:00');

  return agent.post('/api/test/login').send({ userId: testUserId }).expect(200);
});

// ── Auth guard ────────────────────────────────────────────────────────────────
describe('GET /api/stats — sin autenticar', () => {
  it('devuelve 401', async () => {
    await request(app).get('/api/stats').expect(401);
  });
});

// ── Respuesta vacía ────────────────────────────────────────────────────────────
describe('GET /api/stats — sin datos en rango futuro', () => {
  it('devuelve estructura válida con valores en cero', async () => {
    const res = await agent
      .get('/api/stats?from=2099-01-01&to=2099-12-31')
      .expect(200);

    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('timeSeries');
    expect(res.body).toHaveProperty('byProject');

    expect(res.body.summary.totalPieces).toBe(0);
    expect(res.body.summary.totalGrams).toBe(0);
    expect(res.body.summary.totalCost).toBe(0);
    expect(res.body.summary.totalSecs).toBe(0);
    expect(res.body.summary.avgCostPerPiece).toBe(0);
    expect(Array.isArray(res.body.timeSeries)).toBe(true);
    expect(Array.isArray(res.body.byProject)).toBe(true);
  });
});

// ── Con datos ─────────────────────────────────────────────────────────────────
describe('GET /api/stats — con datos existentes', () => {
  it('devuelve totales correctos para el rango completo de 2024', async () => {
    const res = await agent
      .get('/api/stats?from=2024-01-01&to=2024-12-31')
      .expect(200);

    expect(res.body.summary.totalPieces).toBe(2);
    expect(res.body.summary.totalGrams).toBe(150);
    expect(res.body.summary.totalCost).toBeCloseTo(3.0);
    expect(res.body.summary.projectCount).toBe(1);
  });

  it('filtra correctamente por rango de fechas parcial', async () => {
    // Solo junio 2024 → 1 pieza
    const res = await agent
      .get('/api/stats?from=2024-06-01&to=2024-06-30')
      .expect(200);

    expect(res.body.summary.totalPieces).toBe(1);
    expect(res.body.summary.totalGrams).toBe(50);
  });

  it('filtra correctamente por projectId', async () => {
    const res = await agent
      .get(`/api/stats?projectId=${testProjectId}`)
      .expect(200);

    expect(res.body.summary.totalPieces).toBe(2);
    expect(res.body.byProject).toHaveLength(1);
    expect(res.body.byProject[0].projectId).toBe(testProjectId);
    expect(res.body.byProject[0].title).toBe('Proyecto Test Stats');
  });

  it('devuelve 400 con fecha inválida', async () => {
    await agent.get('/api/stats?from=not-a-date').expect(400);
  });

  it('devuelve 400 con granularity inválida', async () => {
    await agent.get('/api/stats?granularity=year').expect(400);
  });

  it('timeSeries con granularity=month agrupa por mes', async () => {
    const res = await agent
      .get('/api/stats?from=2024-01-01&to=2024-12-31&granularity=month')
      .expect(200);

    const periods = res.body.timeSeries.map((t: { period: string }) => t.period);
    expect(periods).toContain('2024-06');
    expect(periods).toContain('2024-09');
  });
});

describe('GET /api/stats — uses printed_at for date grouping', () => {
  it('should use printed_at when available, fall back to created_at when null', async () => {
    // Create pieces with different created_at and printed_at
    const printedPieceId = crypto.randomUUID();
    const unprintedPieceId = crypto.randomUUID();

    // Piece with printed_at (should appear in May 2024)
    db.prepare(
      `INSERT INTO tracker_pieces
         (id, project_id, user_id, order_index, label, name, time_text, gram_text,
          total_secs, total_grams, total_cost, time_lines, gram_lines, 
          created_at, printed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      printedPieceId, testProjectId, testUserId, 10, 'C', 'Printed Piece',
      '1h', '25g', 3600, 25, 0.5, 1, 1,
      '2024-01-10T10:00:00', // created in January
      '2024-05-15T10:00:00'  // printed in May
    );

    // Piece without printed_at (should use created_at from March)
    db.prepare(
      `INSERT INTO tracker_pieces
         (id, project_id, user_id, order_index, label, name, time_text, gram_text,
          total_secs, total_grams, total_cost, time_lines, gram_lines,
          created_at, printed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      unprintedPieceId, testProjectId, testUserId, 11, 'D', 'Unprinted Piece',
      '1h', '25g', 3600, 25, 0.5, 1, 1,
      '2024-03-20T10:00:00', // created in March
      null                   // no printed_at
    );

    // Query stats for January-May 2024 with month granularity
    const res = await agent
      .get('/api/stats?from=2024-01-01&to=2024-05-31&granularity=month')
      .expect(200);

    const periods = res.body.timeSeries.map((t: { period: string }) => t.period);
    
    // Should have data in May (printed_at) and March (fallback to created_at)
    expect(periods).toContain('2024-05'); // from printed_at
    expect(periods).toContain('2024-03'); // from created_at fallback
    
    // Should NOT have data in January (even though created_at is in January)
    expect(periods).not.toContain('2024-01');

    // Find the May period and verify it has 1 piece
    const mayData = res.body.timeSeries.find((t: { period: string }) => t.period === '2024-05');
    expect(mayData.pieces).toBe(1);
    expect(mayData.grams).toBe(25);

    // Find the March period and verify it has 1 piece
    const marchData = res.body.timeSeries.find((t: { period: string }) => t.period === '2024-03');
    expect(marchData.pieces).toBe(1);
    expect(marchData.grams).toBe(25);

    // Cleanup
    db.prepare('DELETE FROM tracker_pieces WHERE id = ?').run(printedPieceId);
    db.prepare('DELETE FROM tracker_pieces WHERE id = ?').run(unprintedPieceId);
  });
});

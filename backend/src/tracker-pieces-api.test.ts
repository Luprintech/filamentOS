import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app, db } from './index';

// ── Test user + project ───────────────────────────────────────────────────────
let testUserId: string;
let testProjectId: string;
const agent = request.agent(app);

beforeAll(async () => {
  testUserId = crypto.randomUUID();
  testProjectId = crypto.randomUUID();

  db.prepare(
    'INSERT INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)'
  ).run(testUserId, `google_test_${testUserId}`, 'test@example.com', 'Test User', null);

  db.prepare(
    'INSERT INTO tracker_projects (id, user_id, title, price_per_kg, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(testProjectId, testUserId, 'Test Project', 20, new Date().toISOString());

  // Login via test helper endpoint
  await agent.post('/api/test/login').send({ userId: testUserId }).expect(200);
});

// ── Task 2.2: POST accepts plate_count and file_link ──────────────────────────
describe('POST /api/tracker/projects/:projectId/pieces', () => {
  it('acepta plate_count y file_link en el body', async () => {
    const res = await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: 'Proyecto X',
        name: 'Pieza con platos y enlace',
        timeText: '2h 30m',
        gramText: '45g',
        totalSecs: 9000,
        totalGrams: 45,
        plateCount: 3,
        fileLink: 'https://example.com/file.3mf',
        status: 'printed',
      })
      .expect(200);

    expect(res.body.id).toBeTruthy();

    // Verificar que se guardó en la DB
    const row = db
      .prepare('SELECT plate_count, file_link FROM tracker_pieces WHERE id = ?')
      .get(res.body.id) as { plate_count: number; file_link: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.plate_count).toBe(3);
    expect(row!.file_link).toBe('https://example.com/file.3mf');
  });

  it('usa plate_count = 1 por defecto si no se proporciona', async () => {
    const res = await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Pieza sin plate_count',
        totalGrams: 20,
      })
      .expect(200);

    const row = db
      .prepare('SELECT plate_count FROM tracker_pieces WHERE id = ?')
      .get(res.body.id) as { plate_count: number } | undefined;

    expect(row!.plate_count).toBe(1);
  });

  it('acepta file_link = null', async () => {
    const res = await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Pieza sin file_link',
        totalGrams: 15,
        plateCount: 2,
        fileLink: null,
      })
      .expect(200);

    const row = db
      .prepare('SELECT file_link FROM tracker_pieces WHERE id = ?')
      .get(res.body.id) as { file_link: string | null } | undefined;

    expect(row!.file_link).toBeNull();
  });
});

// ── Task 2.3: GET returns plate_count and file_link ───────────────────────────
describe('GET /api/tracker/projects/:projectId/pieces', () => {
  it('devuelve plate_count y file_link en la respuesta', async () => {
    // Crear una pieza con los nuevos campos
    const createRes = await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: 'Test Label',
        name: 'Pieza para GET',
        totalGrams: 30,
        plateCount: 5,
        fileLink: 'https://test.com/model.3mf',
      })
      .expect(200);

    const pieceId = createRes.body.id;

    // Obtener la lista de piezas
    const getRes = await agent
      .get(`/api/tracker/projects/${testProjectId}/pieces`)
      .expect(200);

    expect(Array.isArray(getRes.body)).toBe(true);

    const piece = getRes.body.find((p: any) => p.id === pieceId);
    expect(piece).toBeDefined();
    expect(piece.plateCount).toBe(5);
    expect(piece.fileLink).toBe('https://test.com/model.3mf');
  });

  it('devuelve plate_count = 1 y file_link = null para piezas sin los nuevos campos', async () => {
    // Insertar directamente en DB sin los nuevos campos (simula piezas antiguas)
    const legacyId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO tracker_pieces 
       (id, project_id, user_id, order_index, label, name, time_text, gram_text, 
        total_secs, total_grams, total_cost, time_lines, gram_lines, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legacyId,
      testProjectId,
      testUserId,
      0,
      '',
      'Legacy Piece',
      '',
      '',
      0,
      0,
      0,
      0,
      0,
      new Date().toISOString()
    );

    const getRes = await agent
      .get(`/api/tracker/projects/${testProjectId}/pieces`)
      .expect(200);

    const piece = getRes.body.find((p: any) => p.id === legacyId);
    expect(piece).toBeDefined();
    expect(piece.plateCount).toBe(1); // DEFAULT value
    expect(piece.fileLink).toBeNull(); // DEFAULT NULL
  });
});

// ── Task 2.4: Validation (plate_count ≥ 1, file_link URL or null) ────────────
describe('POST validation', () => {
  it('rechaza plate_count < 1', async () => {
    await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Invalid plateCount',
        totalGrams: 10,
        plateCount: 0,
      })
      .expect(400);
  });

  it('rechaza plate_count negativo', async () => {
    await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Negative plateCount',
        totalGrams: 10,
        plateCount: -5,
      })
      .expect(400);
  });

  it('rechaza file_link con formato inválido', async () => {
    await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Invalid fileLink',
        totalGrams: 10,
        fileLink: 'not-a-valid-url',
      })
      .expect(400);
  });

  it('acepta file_link con URL válida', async () => {
    await agent
      .post(`/api/tracker/projects/${testProjectId}/pieces`)
      .send({
        label: '',
        name: 'Valid fileLink',
        totalGrams: 10,
        fileLink: 'https://valid-url.com/file.3mf',
      })
      .expect(200);
  });
});

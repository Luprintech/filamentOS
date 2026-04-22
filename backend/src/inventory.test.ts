import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app, db } from './index';

// ── Test user ─────────────────────────────────────────────────────────────────
let testUserId: string;
const agent = request.agent(app);

beforeAll(() => {
  testUserId = crypto.randomUUID();
  db.prepare(
    'INSERT INTO users (id, google_id, email, name, photo) VALUES (?, ?, ?, ?, ?)'
  ).run(testUserId, `google_test_${testUserId}`, 'test@example.com', 'Test User', null);

  // Login via test helper endpoint
  return agent.post('/api/test/login').send({ userId: testUserId }).expect(200);
});

// ── Auth guard ────────────────────────────────────────────────────────────────
describe('GET /api/inventory/spools', () => {
  it('devuelve 401 sin autenticar', async () => {
    await request(app).get('/api/inventory/spools').expect(401);
  });

  it('devuelve array vacío al inicio', async () => {
    const res = await agent.get('/api/inventory/spools').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────
describe('POST /api/inventory/spools', () => {
  it('devuelve 400 si faltan campos requeridos', async () => {
    await agent
      .post('/api/inventory/spools')
      .send({ brand: 'BrandX' }) // faltan material, color, etc.
      .expect(400);
  });

  it('crea una bobina y devuelve el objeto creado', async () => {
    const res = await agent
      .post('/api/inventory/spools')
      .send({
        brand: 'Bambu Lab',
        material: 'PLA',
        color: 'White',
        colorHex: '#ffffff',
        totalGrams: 1000,
        remainingG: 850,
        price: 25,
        notes: 'Test spool',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      brand: 'Bambu Lab',
      material: 'PLA',
      color: 'White',
      totalGrams: 1000,
      remainingG: 850,
      price: 25,
      status: 'active',
    });
    expect(res.body.id).toBeTruthy();
  });
});

describe('PUT /api/inventory/spools/:id', () => {
  let spoolId: string;

  beforeAll(async () => {
    const res = await agent.post('/api/inventory/spools').send({
      brand: 'Prusament',
      material: 'PETG',
      color: 'Black',
      totalGrams: 750,
      remainingG: 750,
      price: 30,
    });
    spoolId = res.body.id;
  });

  it('actualiza una bobina existente', async () => {
    const res = await agent
      .put(`/api/inventory/spools/${spoolId}`)
      .send({
        brand: 'Prusament',
        material: 'PETG',
        color: 'Galaxy Black',
        totalGrams: 750,
        remainingG: 600,
        price: 30,
      })
      .expect(200);

    expect(res.body.color).toBe('Galaxy Black');
    expect(res.body.remainingG).toBe(600);
  });

  it('devuelve 404 si el id no existe', async () => {
    await agent
      .put('/api/inventory/spools/non-existent-id')
      .send({
        brand: 'X',
        material: 'PLA',
        color: 'Red',
        totalGrams: 100,
        remainingG: 100,
        price: 10,
      })
      .expect(404);
  });
});

describe('PATCH /api/inventory/spools/:id/deduct', () => {
  let spoolId: string;

  beforeAll(async () => {
    const res = await agent.post('/api/inventory/spools').send({
      brand: 'Fiberlogy',
      material: 'ASA',
      color: 'Grey',
      totalGrams: 500,
      remainingG: 500,
      price: 20,
    });
    spoolId = res.body.id;
  });

  it('descuenta gramos y devuelve remainingG actualizado', async () => {
    const res = await agent
      .patch(`/api/inventory/spools/${spoolId}/deduct`)
      .send({ grams: 100 })
      .expect(200);

    expect(res.body.remainingG).toBe(400);
    expect(res.body.status).toBe('active');
  });

  it('devuelve 400 si grams <= 0', async () => {
    await agent
      .patch(`/api/inventory/spools/${spoolId}/deduct`)
      .send({ grams: 0 })
      .expect(400);
  });

  it('marca como finished si restante llega a 0', async () => {
    const res = await agent
      .patch(`/api/inventory/spools/${spoolId}/deduct`)
      .send({ grams: 999999 }) // mayor que remaining
      .expect(200);

    expect(res.body.remainingG).toBe(0);
    expect(res.body.status).toBe('finished');
  });
});

describe('PATCH /api/inventory/spools/:id/finish', () => {
  let spoolId: string;

  beforeAll(async () => {
    const res = await agent.post('/api/inventory/spools').send({
      brand: 'eSUN',
      material: 'ABS',
      color: 'Blue',
      totalGrams: 1000,
      remainingG: 300,
      price: 18,
    });
    spoolId = res.body.id;
  });

  it('marca la bobina como finished', async () => {
    await agent
      .patch(`/api/inventory/spools/${spoolId}/finish`)
      .expect(200);

    const listRes = await agent.get('/api/inventory/spools');
    const spool = listRes.body.find((s: { id: string }) => s.id === spoolId);
    expect(spool?.status).toBe('finished');
    expect(spool?.remainingG).toBe(0);
  });
});

describe('DELETE /api/inventory/spools/:id', () => {
  it('elimina una bobina existente', async () => {
    const createRes = await agent.post('/api/inventory/spools').send({
      brand: 'FormFutura',
      material: 'PLA',
      color: 'Red',
      totalGrams: 750,
      remainingG: 750,
      price: 22,
    });
    const id = createRes.body.id;

    await agent.delete(`/api/inventory/spools/${id}`).expect(200);

    const listRes = await agent.get('/api/inventory/spools');
    const deleted = listRes.body.find((s: { id: string }) => s.id === id);
    expect(deleted).toBeUndefined();
  });

  it('devuelve 404 si el id no existe', async () => {
    await agent.delete('/api/inventory/spools/no-existe').expect(404);
  });
});

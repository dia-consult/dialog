import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

async function initDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ringostat_calls (
      id BIGSERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      occurred_at TIMESTAMPTZ,
      phone TEXT,
      direction TEXT,
      recording_url TEXT,
      payload JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS ringostat_calls_project_occurred_idx
      ON ringostat_calls (project_id, occurred_at DESC);
  `);
}

function configured() {
  return Boolean(process.env.RINGOSTAT_AUTH_KEY && process.env.RINGOSTAT_PROJECT_ID && pool);
}

function asCalls(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.calls)) return body.calls;
  return [];
}

function externalId(call) {
  return String(call.id ?? call.call_id ?? call.uuid ?? call.uniqueid ?? crypto.createHash('sha256').update(JSON.stringify(call)).digest('hex'));
}

function toDate(value) {
  if (value == null) return null;
  if (typeof value === 'number' || /^\d{10}$/.test(String(value))) return new Date(Number(value) * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

async function saveCalls(calls) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const projectId = process.env.RINGOSTAT_PROJECT_ID;
  for (const call of calls) {
    const occurredAt = toDate(call.calldate ?? call.started_at ?? call.date ?? call.created_at);
    await pool.query(
      `INSERT INTO ringostat_calls (project_id, external_id, occurred_at, phone, direction, recording_url, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, external_id) DO UPDATE
         SET occurred_at = EXCLUDED.occurred_at, phone = EXCLUDED.phone, direction = EXCLUDED.direction,
             recording_url = EXCLUDED.recording_url, payload = EXCLUDED.payload, received_at = now()`,
      [projectId, externalId(call), occurredAt, call.phone ?? call.client_phone ?? call.from ?? null,
       call.direction ?? call.call_type ?? null, call.recording_url ?? call.record ?? call.audio_url ?? null, call]
    );
  }
}

function unix(value, fallback) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.valueOf())) throw new Error('Invalid date');
  return Math.floor(date.valueOf() / 1000);
}

async function fetchRingostatCalls({ from, to }) {
  const end = unix(to, new Date());
  const start = unix(from, new Date((end - 30 * 86400) * 1000));
  const response = await fetch(`https://api.ringostat.net/calls/list?startDate=${start}&endDate=${end}`, {
    headers: { 'Auth-key': process.env.RINGOSTAT_AUTH_KEY, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Ringostat API returned ${response.status}`);
  return response.json();
}

function webhookAuthorized(request) {
  const expectedUser = process.env.RINGOSTAT_WEBHOOK_USER;
  const expectedPassword = process.env.RINGOSTAT_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;
  const raw = request.headers.authorization || '';
  if (!raw.startsWith('Basic ')) return false;
  const [user, password] = Buffer.from(raw.slice(6), 'base64').toString('utf8').split(':');
  return crypto.timingSafeEqual(Buffer.from(user || ''), Buffer.from(expectedUser)) &&
    crypto.timingSafeEqual(Buffer.from(password || ''), Buffer.from(expectedPassword));
}

app.get('/api/health', async (_req, res) => {
  try {
    if (pool) await pool.query('SELECT 1');
    res.json({ ok: true, database: Boolean(pool), ringostat: configured() });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.get('/api/integrations/ringostat', (_req, res) => {
  res.json({
    provider: 'ringostat',
    configured: configured(),
    projectId: process.env.RINGOSTAT_PROJECT_ID || null,
    webhookUrl: `${process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua'}/api/webhooks/ringostat`
  });
});

app.post('/api/ringostat/sync', async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Ringostat or database is not configured' });
  try {
    const payload = await fetchRingostatCalls({ from: req.body?.from, to: req.body?.to });
    const calls = asCalls(payload);
    await saveCalls(calls);
    res.json({ imported: calls.length });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/webhooks/ringostat', async (req, res) => {
  if (!webhookAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const calls = asCalls(req.body);
    await saveCalls(calls.length ? calls : [req.body]);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.static(root, { extensions: ['html'], index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((_req, res) => res.status(404).sendFile(path.join(root, 'index.html')));

initDatabase()
  .then(() => app.listen(port, () => console.log(`Dialog server listening on ${port}`)))
  .catch((error) => { console.error('Database initialization failed', error); process.exit(1); });

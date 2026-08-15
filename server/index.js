import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(root, 'dist');
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

function readCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

function stytchConfigured() {
  return Boolean(process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET && process.env.STYTCH_PUBLIC_TOKEN);
}

function stytchOrigin() {
  return process.env.STYTCH_ENV === 'live' ? 'https://api.stytch.com' : 'https://test.stytch.com';
}

async function stytchB2B(pathname, body) {
  if (!stytchConfigured()) throw new Error('Stytch B2B is not configured');
  const credentials = Buffer.from(`${process.env.STYTCH_PROJECT_ID}:${process.env.STYTCH_SECRET}`).toString('base64');
  const response = await fetch(`${stytchOrigin()}${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_message || payload.error_type || `Stytch returned ${response.status}`);
  return payload;
}

async function authenticatedMember(request) {
  const token = readCookies(request).dialog_stytch_session;
  if (!token) return null;
  try {
    return await stytchB2B('/v1/b2b/sessions/authenticate', { session_token: token, session_duration_minutes: 60 });
  } catch {
    return null;
  }
}

function cookieOptions() {
  return [
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=3600'
  ].join('; ');
}

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

// Only non-sensitive browser configuration belongs here. Call records and
// recordings will be exposed only after a Stytch session is verified.
app.get('/api/config', (_req, res) => {
  res.json({
    stytch: {
      enabled: stytchConfigured(),
      provider: 'b2b',
      environment: process.env.STYTCH_ENV || 'test'
    }
  });
});

app.post('/api/auth/magic-link', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Введіть коректний email' });
  try {
    const publicUrl = process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua';
    await stytchB2B('/v1/b2b/magic_links/email/discovery/send', {
      email_address: email,
      // Discovery is the correct B2B flow when the person has not yet
      // selected an organisation. Stytch deliberately does not accept
      // login_redirect_url / signup_redirect_url on this endpoint.
      discovery_redirect_url: `${publicUrl}/authenticate`
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post('/api/auth/discovery/complete', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!token) return res.status(400).json({ error: 'Не знайдено токен для входу' });

  try {
    const discovery = await stytchB2B('/v1/b2b/magic_links/discovery/authenticate', {
      discovery_magic_links_token: token
    });
    const intermediateSessionToken = discovery.intermediate_session_token;
    if (!intermediateSessionToken) {
      return res.status(502).json({ error: 'Stytch не повернув сесію для вибору робочого простору' });
    }

    const organizations = await stytchB2B('/v1/b2b/discovery/organizations', {
      intermediate_session_token: intermediateSessionToken
    });
    const available = organizations.discovered_organizations || [];

    // A B2B user may belong to several organisations. The first release
    // automatically continues only if there is exactly one unambiguous choice.
    if (available.length !== 1) {
      return res.status(409).json({
        error: available.length
          ? 'Оберіть робочий простір для входу'
          : 'Для цього email ще немає робочого простору Dialog',
        requiresOrganization: true
      });
    }

    const organization = available[0];
    const organizationId = organization.organization_id || organization.organization?.organization_id;
    if (!organizationId) return res.status(502).json({ error: 'Не вдалося визначити робочий простір' });

    const session = await stytchB2B('/v1/b2b/discovery/intermediate_sessions/exchange', {
      intermediate_session_token: intermediateSessionToken,
      organization_id: organizationId,
      session_duration_minutes: 60
    });
    const sessionToken = session.session_token || session.member_session?.session_token;
    if (!sessionToken) return res.status(502).json({ error: 'Stytch не повернув сесію входу' });

    res.setHeader('Set-Cookie', `dialog_stytch_session=${encodeURIComponent(sessionToken)}; ${cookieOptions()}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/authenticate', async (req, res) => {
  res.sendFile(path.join(root, 'authenticate', 'index.html'));
});

app.get('/api/auth/session', async (req, res) => {
  const session = await authenticatedMember(req);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({
    authenticated: true,
    member: { id: session.member?.member_id, email: session.member?.email_address, name: session.member?.name },
    organization: { id: session.organization?.organization_id, name: session.organization?.organization_name },
    roles: session.member?.roles || []
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'dialog_stytch_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.status(204).end();
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

app.use(express.static(clientRoot, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((_req, res) => res.sendFile(path.join(clientRoot, 'index.html')));

initDatabase()
  .then(() => app.listen(port, () => console.log(`Dialog server listening on ${port}`)))
  .catch((error) => { console.error('Database initialization failed', error); process.exit(1); });

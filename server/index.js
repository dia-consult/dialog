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
const MAX_IMPORT_CALLS = Math.min(Math.max(Number(process.env.RINGOSTAT_IMPORT_LIMIT || 10), 1), 25);
const MAX_AUDIO_BYTES = Math.min(Math.max(Number(process.env.DIALOG_MAX_AUDIO_BYTES || 20 * 1024 * 1024), 1_000_000), 30 * 1024 * 1024);
const runningAnalyses = new Set();

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

    CREATE TABLE IF NOT EXISTS dialog_analyses (
      id BIGSERIAL PRIMARY KEY,
      call_id BIGINT NOT NULL REFERENCES ringostat_calls(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      transcript TEXT,
      evaluation JSONB,
      model TEXT,
      transcription_cost NUMERIC NOT NULL DEFAULT 0,
      evaluation_cost NUMERIC NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(call_id)
    );
    -- Safe migration for databases created during the earlier prototype.
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS transcription_cost NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS evaluation_cost NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE dialog_analyses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE dialog_analyses ALTER COLUMN transcript DROP NOT NULL;
    ALTER TABLE dialog_analyses ALTER COLUMN evaluation DROP NOT NULL;
    ALTER TABLE dialog_analyses ALTER COLUMN model DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS dialog_analyses_status_idx ON dialog_analyses (status);
  `);
}

function configured() {
  return Boolean(process.env.RINGOSTAT_AUTH_KEY && process.env.RINGOSTAT_PROJECT_ID && pool);
}

function asCalls(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.calls)) return body.calls;
  if (Array.isArray(body?.result)) return body.result;
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
  const ids = [];
  for (const call of calls) {
    const occurredAt = toDate(call.calldate ?? call.started_at ?? call.date ?? call.created_at);
    const saved = await pool.query(
      `INSERT INTO ringostat_calls (project_id, external_id, occurred_at, phone, direction, recording_url, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, external_id) DO UPDATE
         SET occurred_at = EXCLUDED.occurred_at, phone = EXCLUDED.phone, direction = EXCLUDED.direction,
             recording_url = EXCLUDED.recording_url, payload = EXCLUDED.payload, received_at = now()
       RETURNING id`,
       [projectId, externalId(call), occurredAt, call.caller_number ?? call.phone ?? call.client_phone ?? call.caller ?? call.from ?? null,
       call.direction ?? call.call_type ?? null, recordingUrl(call), call]
    );
    ids.push(saved.rows[0].id);
  }
  return ids;
}

function recordingUrl(call) {
  const candidates = [
    call?.recording_wav,
    call?.recording_url,
    call?.record_link,
    call?.audio_url,
    call?.recording,
    call?.record,
  ];
  return candidates.find(value => typeof value === 'string' && /^https:\/\//i.test(value)) || null;
}

function audioFormat(url, contentType = '') {
  const content = contentType.toLowerCase();
  if (content.includes('wav') || /\.wav(?:\?|$)/i.test(url)) return 'wav';
  if (content.includes('mpeg') || /\.mp3(?:\?|$)/i.test(url)) return 'mp3';
  if (content.includes('ogg') || /\.ogg(?:\?|$)/i.test(url)) return 'ogg';
  if (content.includes('aac') || /\.aac(?:\?|$)/i.test(url)) return 'aac';
  if (content.includes('mp4') || /\.(m4a|mp4)(?:\?|$)/i.test(url)) return 'm4a';
  if (content.includes('webm') || /\.webm(?:\?|$)/i.test(url)) return 'webm';
  return null;
}

function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function parseJson(value) {
  const trimmed = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(trimmed);
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function normalizeEvaluation(value) {
  const stages = value?.stages || {};
  return {
    summary: String(value?.summary || 'Аналіз завершено. Перегляньте транскрипцію та ключові моменти.'),
    contact_probability: percent(value?.contact_probability),
    stages: {
      contact: percent(stages.contact), needs: percent(stages.needs), presentation: percent(stages.presentation),
      objections: percent(stages.objections), cross_sell: percent(stages.cross_sell), closing: percent(stages.closing),
    },
    recommendations: Array.isArray(value?.recommendations) ? value.recommendations.slice(0, 3).map(item => ({
      issue: String(item?.issue || 'Потрібно уточнити наступний крок'),
      say: String(item?.say || 'Уточніть потребу клієнта та запропонуйте конкретний час наступного контакту.'),
    })) : [],
  };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadRingostatRecording(url) {
  let lastResponse;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'Auth-key': process.env.RINGOSTAT_AUTH_KEY,
        Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok || response.status !== 429 || attempt === 3) return response;
    lastResponse = response;
    const retryAfter = Number(response.headers.get('retry-after'));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 12_000 * (attempt + 1));
  }
  return lastResponse;
}

async function transcribeRecording(url) {
  const audio = await downloadRingostatRecording(url);
  if (!audio.ok) throw new Error(`Запис недоступний (${audio.status})`);
  const declaredLength = Number(audio.headers.get('content-length') || 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error('Запис перевищує ліміт тестового аналізу');
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('Запис перевищує ліміт тестового аналізу');
  const format = audioFormat(url, audio.headers.get('content-type') || '');
  if (!format) throw new Error('Невідомий формат аудіозапису');

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua',
      'X-OpenRouter-Title': 'Dialog',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_STT_MODEL || 'openai/whisper-1',
      input_audio: { data: bytes.toString('base64'), format },
      language: 'uk',
      temperature: 0,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Помилка транскрипції (${response.status})`);
  return { text: String(payload.text || '').trim(), cost: Number(payload?.usage?.cost || 0) };
}

async function evaluateTranscript(transcript) {
  const prompt = `Ти — аналітик якості продажів DIA Consulting. Проаналізуй український або російський транскрипт дзвінка. Не вигадуй фактів. Поверни виключно JSON з полями summary, contact_probability (0..100), stages (contact, needs, presentation, objections, cross_sell, closing — усі 0..100) та recommendations (до 3 об'єктів issue, say). Фраза say має бути короткою і готовою до використання менеджером.\n\nТранскрипт:\n${transcript.slice(0, 50000)}`;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua',
      'X-OpenRouter-Title': 'Dialog',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_ANALYSIS_MODEL || 'openai/gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Помилка DIA-оцінки (${response.status})`);
  return {
    evaluation: normalizeEvaluation(parseJson(payload?.choices?.[0]?.message?.content)),
    model: String(payload.model || process.env.OPENROUTER_ANALYSIS_MODEL || 'openai/gpt-4o-mini'),
    cost: Number(payload?.usage?.cost || 0),
  };
}

async function runAnalysis(callId) {
  if (!pool || runningAnalyses.has(callId)) return;
  runningAnalyses.add(callId);
  try {
    const { rows } = await pool.query('SELECT id, recording_url FROM ringostat_calls WHERE id = $1', [callId]);
    const call = rows[0];
    if (!call?.recording_url) throw new Error('Для цього дзвінка немає доступного аудіозапису');
    await pool.query("UPDATE dialog_analyses SET status = 'processing', error_message = NULL, updated_at = now() WHERE call_id = $1", [callId]);
    const transcription = await transcribeRecording(call.recording_url);
    if (!transcription.text) throw new Error('Транскрипція повернула порожній текст');
    const result = await evaluateTranscript(transcription.text);
    await pool.query(
      `UPDATE dialog_analyses
       SET status = 'completed', transcript = $2, evaluation = $3, model = $4,
           transcription_cost = $5, evaluation_cost = $6, error_message = NULL, updated_at = now()
       WHERE call_id = $1`,
      [callId, transcription.text, result.evaluation, result.model, transcription.cost, result.cost],
    );
  } catch (error) {
    await pool.query(
      "UPDATE dialog_analyses SET status = 'failed', error_message = $2, updated_at = now() WHERE call_id = $1",
      [callId, String(error.message || 'Невідома помилка аналізу').slice(0, 1000)],
    );
  } finally {
    runningAnalyses.delete(callId);
  }
}

async function enqueueAnalysis(callIds) {
  if (!pool || !openRouterConfigured()) return { queued: 0, reason: 'OPENROUTER_API_KEY is not configured' };
  const uniqueIds = [...new Set(callIds)].slice(0, MAX_IMPORT_CALLS);
  const queuedIds = [];
  for (const callId of uniqueIds) {
    const queued = await pool.query(
      `INSERT INTO dialog_analyses (call_id, status) VALUES ($1, 'pending')
       ON CONFLICT (call_id) DO UPDATE SET status = 'pending', error_message = NULL, updated_at = now()
       WHERE dialog_analyses.status <> 'completed'`,
      [callId],
    );
    if (queued.rowCount) queuedIds.push(callId);
  }
  for (const callId of queuedIds) setImmediate(() => runAnalysis(callId));
  return { queued: queuedIds.length };
}

function ringostatDate(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchRingostatCalls({ from, to }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.valueOf() - 30 * 86400 * 1000);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) throw new Error('Invalid date range');
  const url = new URL('https://api.ringostat.net/calls/list');
  url.searchParams.set('export_type', 'json');
  url.searchParams.set('from', ringostatDate(start));
  url.searchParams.set('to', ringostatDate(end));
  url.searchParams.set('order', 'calldate desc');
  url.searchParams.set('fields', 'calldate,caller,dst,disposition,billsec,call_type,uniqueid,recording,recording_wav,employee_fio,caller_number');
  const response = await fetch(url, {
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
  const equal = (received, expected) => {
    const left = Buffer.from(received || '');
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  };
  return equal(user, expectedUser) && equal(password, expectedPassword);
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

app.post('/api/auth/password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    return res.status(400).json({ error: 'Введіть email і пароль' });
  }
  try {
    const discovery = await stytchB2B('/v1/b2b/passwords/discovery/authenticate', {
      email_address: email,
      password
    });
    const intermediateSessionToken = discovery.intermediate_session_token;
    if (!intermediateSessionToken) return res.status(502).json({ error: 'Не вдалося підтвердити вхід' });

    const organizations = await stytchB2B('/v1/b2b/discovery/organizations', {
      intermediate_session_token: intermediateSessionToken
    });
    const available = organizations.discovered_organizations || [];
    if (available.length !== 1) {
      return res.status(409).json({ error: 'Для цього входу потрібен вибір робочого простору. Скористайтеся входом через email.' });
    }
    const organizationId = available[0].organization_id || available[0].organization?.organization_id;
    if (!organizationId) return res.status(502).json({ error: 'Не вдалося визначити робочий простір' });

    const session = await stytchB2B('/v1/b2b/discovery/intermediate_sessions/exchange', {
      intermediate_session_token: intermediateSessionToken,
      organization_id: organizationId,
      session_duration_minutes: 60
    });
    const sessionToken = session.session_token || session.member_session?.session_token;
    if (!sessionToken) return res.status(502).json({ error: 'Не вдалося створити сесію входу' });
    res.setHeader('Set-Cookie', `dialog_stytch_session=${encodeURIComponent(sessionToken)}; ${cookieOptions()}`);
    res.json({ ok: true });
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('password') && (message.includes('disabled') || message.includes('not enabled'))) {
      return res.status(503).json({ error: 'Вхід за паролем ще не увімкнений у Stytch для цього проєкту.' });
    }
    res.status(401).json({ error: 'Невірний email або пароль' });
  }
});

// Passwords are owned by Stytch. Dialog only starts the recovery flow and
// receives the short-lived reset token back from the email link.
app.post('/api/auth/password/reset/start', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Введіть коректний email' });
  const publicUrl = process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua';
  try {
    await stytchB2B('/v1/b2b/passwords/discovery/email/reset/start', {
      email_address: email,
      reset_password_redirect_url: `${publicUrl}/reset-password`,
      discovery_redirect_url: `${publicUrl}/authenticate`,
      reset_password_expiration_minutes: 30
    });
  } catch (error) {
    // Do not disclose whether an address belongs to a member.
    console.warn('Password reset start was rejected by Stytch:', error.message);
  }
  res.status(202).json({ ok: true });
});

app.post('/api/auth/password/reset/complete', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (!token || password.length < 8) return res.status(400).json({ error: 'Пароль має містити щонайменше 8 символів' });
  try {
    const discovery = await stytchB2B('/v1/b2b/passwords/discovery/email/reset', { password_reset_token: token, password });
    const organizations = await stytchB2B('/v1/b2b/discovery/organizations', { intermediate_session_token: discovery.intermediate_session_token });
    const available = organizations.discovered_organizations || [];
    if (available.length !== 1) return res.status(409).json({ error: 'Оберіть робочий простір через вхід за email.' });
    const organizationId = available[0].organization_id || available[0].organization?.organization_id;
    const session = await stytchB2B('/v1/b2b/discovery/intermediate_sessions/exchange', { intermediate_session_token: discovery.intermediate_session_token, organization_id: organizationId, session_duration_minutes: 60 });
    const sessionToken = session.session_token || session.member_session?.session_token;
    if (!sessionToken) return res.status(502).json({ error: 'Не вдалося створити сесію входу' });
    res.setHeader('Set-Cookie', `dialog_stytch_session=${encodeURIComponent(sessionToken)}; ${cookieOptions()}`);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Посилання недійсне або пароль не відповідає вимогам безпеки.' });
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

    // Only the configured bootstrap owner can create the first workspace.
    // Stytch assigns that first member the built-in `stytch_admin` role, which
    // is the super-admin role for the workspace.
    const bootstrapEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const authenticatedEmail = String(discovery.email_address || '').trim().toLowerCase();
    if (available.length === 0 && bootstrapEmail && authenticatedEmail === bootstrapEmail) {
      const uniqueSlug = `dialog-${Date.now()}`;
      const created = await stytchB2B('/v1/b2b/discovery/organizations/create', {
        intermediate_session_token: intermediateSessionToken,
        organization_name: 'Dialog — робочий простір',
        organization_slug: uniqueSlug,
        session_duration_minutes: 60
      });
      const createdSessionToken = created.session_token || created.member_session?.session_token;
      if (!createdSessionToken) return res.status(502).json({ error: 'Stytch не повернув сесію нового робочого простору' });

      res.setHeader('Set-Cookie', `dialog_stytch_session=${encodeURIComponent(createdSessionToken)}; ${cookieOptions()}`);
      return res.json({ ok: true, createdWorkspace: true });
    }

    if (available.length === 0) {
      return res.status(403).json({
        error: 'Для цього email ще немає доступу до робочого простору Dialog. Зверніться до адміністратора.',
        requiresOrganization: true
      });
    }

    // A B2B user may belong to several organisations. The first release
    // automatically continues only if there is exactly one unambiguous choice.
    if (available.length !== 1) {
      return res.status(409).json({
        error: 'Оберіть робочий простір для входу',
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

app.get('/api/integrations/ringostat', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  res.json({
    provider: 'ringostat',
    configured: configured(),
    projectId: process.env.RINGOSTAT_PROJECT_ID || null,
    webhookUrl: `${process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua'}/api/webhooks/ringostat`
  });
});

app.post('/api/ringostat/sync', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!configured()) return res.status(503).json({ error: 'Ringostat or database is not configured' });
  try {
    const payload = await fetchRingostatCalls({ from: req.body?.from, to: req.body?.to });
    const calls = asCalls(payload).filter(call => recordingUrl(call)).slice(0, MAX_IMPORT_CALLS);
    const callIds = await saveCalls(calls);
    const analysis = await enqueueAnalysis(callIds);
    res.status(202).json({ imported: calls.length, ...analysis, limit: MAX_IMPORT_CALLS });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/dialogs', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!pool) return res.status(503).json({ error: 'База даних недоступна' });
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.occurred_at, c.phone, c.direction, c.recording_url, c.payload,
              a.status AS analysis_status, a.evaluation, a.error_message
       FROM ringostat_calls c
       LEFT JOIN dialog_analyses a ON a.call_id = c.id
       WHERE c.project_id = $1
       ORDER BY c.occurred_at DESC NULLS LAST, c.id DESC
       LIMIT $2`,
      [process.env.RINGOSTAT_PROJECT_ID, limit],
    );
    const calls = rows.map(row => ({
      id: row.id,
      occurredAt: row.occurred_at,
      client: row.payload?.caller_name || row.payload?.caller || row.phone || 'Клієнт без номера',
      phone: row.phone,
      manager: row.payload?.employee_fio || row.payload?.connected_with || 'Не призначено',
      durationSeconds: Number(row.payload?.billsec || 0),
      direction: row.direction,
      hasRecording: Boolean(row.recording_url),
      status: row.analysis_status || (row.recording_url ? 'ready' : 'no_recording'),
      evaluation: row.evaluation || null,
      error: row.error_message || null,
    }));
    res.json({ calls, configured: configured(), openRouter: openRouterConfigured() });
  } catch (error) {
    res.status(500).json({ error: 'Не вдалося отримати список діалогів' });
  }
});

app.get('/api/dialogs/:id', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!pool) return res.status(503).json({ error: 'База даних недоступна' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некоректний ідентифікатор діалогу' });
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.occurred_at, c.phone, c.direction, c.recording_url, c.payload,
              a.status AS analysis_status, a.transcript, a.evaluation, a.error_message
       FROM ringostat_calls c
       LEFT JOIN dialog_analyses a ON a.call_id = c.id
       WHERE c.id = $1 AND c.project_id = $2`,
      [id, process.env.RINGOSTAT_PROJECT_ID],
    );
    const call = rows[0];
    if (!call) return res.status(404).json({ error: 'Діалог не знайдено' });
    let deal = { probability: null, contacts: 1 };
    if (call.phone) {
      const aggregate = await pool.query(
        `SELECT COUNT(*)::int AS contacts,
                ROUND(AVG((a.evaluation->>'contact_probability')::numeric))::int AS probability
         FROM ringostat_calls c
         LEFT JOIN dialog_analyses a ON a.call_id = c.id AND a.status = 'completed'
         WHERE c.project_id = $1 AND c.phone = $2`,
        [process.env.RINGOSTAT_PROJECT_ID, call.phone],
      );
      deal = aggregate.rows[0] || deal;
    }
    res.json({
      id: call.id, occurredAt: call.occurred_at, phone: call.phone, direction: call.direction,
      client: call.payload?.caller_name || call.payload?.caller || call.phone || 'Клієнт без номера',
      manager: call.payload?.employee_fio || call.payload?.connected_with || 'Не призначено',
      durationSeconds: Number(call.payload?.billsec || 0), hasRecording: Boolean(call.recording_url),
      status: call.analysis_status || (call.recording_url ? 'ready' : 'no_recording'),
      transcript: call.transcript || null, evaluation: call.evaluation || null, error: call.error_message || null,
      deal: { probability: deal.probability == null ? null : Number(deal.probability), contacts: Number(deal.contacts || 1) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Не вдалося отримати DIA-аналіз' });
  }
});

app.get('/api/dialogs/:id/audio', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!pool) return res.status(503).json({ error: 'База даних недоступна' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некоректний ідентифікатор діалогу' });
  try {
    const { rows } = await pool.query('SELECT recording_url FROM ringostat_calls WHERE id = $1 AND project_id = $2', [id, process.env.RINGOSTAT_PROJECT_ID]);
    const recording = rows[0]?.recording_url;
    if (!recording) return res.status(404).json({ error: 'Аудіозапис відсутній' });
    const audio = await fetch(recording);
    if (!audio.ok || !audio.body) return res.status(502).json({ error: 'Не вдалося завантажити запис із Ringostat' });
    const declaredLength = Number(audio.headers.get('content-length') || 0);
    if (declaredLength > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Запис перевищує ліміт відтворення' });
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Запис перевищує ліміт відтворення' });
    res.setHeader('Content-Type', audio.headers.get('content-type') || 'audio/mpeg');
    const length = audio.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    res.end(bytes);
  } catch (error) {
    res.status(502).json({ error: 'Не вдалося відтворити аудіозапис' });
  }
});

app.post('/api/dialogs/:id/analyze', async (req, res) => {
  if (!await authenticatedMember(req)) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!pool || !openRouterConfigured()) return res.status(503).json({ error: 'OpenRouter або база даних не налаштовані' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некоректний ідентифікатор діалогу' });
  const exists = await pool.query('SELECT id, recording_url FROM ringostat_calls WHERE id = $1 AND project_id = $2', [id, process.env.RINGOSTAT_PROJECT_ID]);
  if (!exists.rows[0]?.recording_url) return res.status(400).json({ error: 'Для дзвінка немає доступного запису' });
  const queued = await enqueueAnalysis([id]);
  res.status(202).json({ ok: true, ...queued });
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

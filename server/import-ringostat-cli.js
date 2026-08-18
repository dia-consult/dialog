import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const limit = Math.min(Math.max(Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 10), 1), 10);
const maxAudioBytes = Math.min(Math.max(Number(process.env.DIALOG_MAX_AUDIO_BYTES || 20 * 1024 * 1024), 1_000_000), 30 * 1024 * 1024);

if (process.env.DIALOG_INTERNAL_SYNC !== 'true') {
  throw new Error('Set DIALOG_INTERNAL_SYNC=true to run this protected import.');
}
if (!process.env.DATABASE_URL || !process.env.RINGOSTAT_PROJECT_ID || !process.env.RINGOSTAT_AUTH_KEY || !process.env.OPENROUTER_API_KEY) {
  throw new Error('DATABASE_URL, RINGOSTAT_PROJECT_ID, RINGOSTAT_AUTH_KEY and OPENROUTER_API_KEY are required.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const asCalls = payload => Array.isArray(payload) ? payload : (payload?.data || payload?.calls || payload?.result || []);
const recordingUrl = call => [call?.recording_wav, call?.recording_url, call?.record_link, call?.audio_url, call?.recording, call?.record]
  .find(value => typeof value === 'string' && /^https:\/\//i.test(value)) || null;
const externalId = call => String(call.id ?? call.call_id ?? call.uuid ?? call.uniqueid ?? crypto.createHash('sha256').update(JSON.stringify(call)).digest('hex'));
const toDate = value => {
  if (value == null) return null;
  if (typeof value === 'number' || /^\d{10}$/.test(String(value))) return new Date(Number(value) * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};
const percent = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : 0;
const format = (url, type = '') => {
  const value = `${url} ${type}`.toLowerCase();
  if (value.includes('wav')) return 'wav';
  if (value.includes('mpeg') || value.includes('.mp3')) return 'mp3';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('aac')) return 'aac';
  if (value.includes('m4a') || value.includes('mp4')) return 'm4a';
  if (value.includes('webm')) return 'webm';
  return null;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadRecording(url) {
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
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 12_000 * (attempt + 1));
  }
  return lastResponse;
}

function normalize(value) {
  const stages = value?.stages || {};
  return {
    summary: String(value?.summary || 'Аналіз завершено. Перегляньте транскрипцію та ключові моменти.'),
    contact_probability: percent(value?.contact_probability),
    stages: Object.fromEntries(['contact', 'needs', 'presentation', 'objections', 'cross_sell', 'closing'].map(key => [key, percent(stages[key])])),
    recommendations: Array.isArray(value?.recommendations) ? value.recommendations.slice(0, 3).map(item => ({
      issue: String(item?.issue || 'Потрібно уточнити наступний крок'),
      say: String(item?.say || 'Уточніть потребу клієнта та запропонуйте конкретний час наступного контакту.'),
    })) : [],
  };
}

async function ringostatCalls() {
  const to = new Date();
  const from = new Date(to.valueOf() - 30 * 86400 * 1000);
  const url = new URL('https://api.ringostat.net/calls/list');
  url.searchParams.set('export_type', 'json');
  url.searchParams.set('from', from.toISOString().slice(0, 19).replace('T', ' '));
  url.searchParams.set('to', to.toISOString().slice(0, 19).replace('T', ' '));
  url.searchParams.set('order', 'calldate desc');
  url.searchParams.set('fields', 'calldate,caller,dst,disposition,billsec,call_type,uniqueid,recording,recording_wav,employee_fio,caller_number');
  const response = await fetch(url, { headers: { 'Auth-key': process.env.RINGOSTAT_AUTH_KEY, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Ringostat API returned ${response.status}`);
  return asCalls(await response.json()).filter(recordingUrl).slice(0, limit);
}

async function save(call) {
  const result = await pool.query(
    `INSERT INTO ringostat_calls (project_id, external_id, occurred_at, phone, direction, recording_url, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id, external_id) DO UPDATE SET occurred_at = EXCLUDED.occurred_at, phone = EXCLUDED.phone,
       direction = EXCLUDED.direction, recording_url = EXCLUDED.recording_url, payload = EXCLUDED.payload, received_at = now()
     RETURNING id`,
    [process.env.RINGOSTAT_PROJECT_ID, externalId(call), toDate(call.calldate ?? call.started_at ?? call.date ?? call.created_at),
      call.caller_number ?? call.phone ?? call.client_phone ?? call.caller ?? call.from ?? null,
      call.direction ?? call.call_type ?? null, recordingUrl(call), call],
  );
  return result.rows[0].id;
}

async function analyze(callId, url) {
  await pool.query(`INSERT INTO dialog_analyses (call_id, status) VALUES ($1, 'processing')
    ON CONFLICT (call_id) DO UPDATE SET status = 'processing', error_message = NULL, updated_at = now()`, [callId]);
  try {
    const audio = await downloadRecording(url);
    if (!audio.ok) throw new Error(`Запис недоступний (${audio.status})`);
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.length > maxAudioBytes) throw new Error('Запис перевищує ліміт тестового аналізу');
    const audioFormat = format(url, audio.headers.get('content-type') || '');
    if (!audioFormat) throw new Error('Невідомий формат аудіозапису');
    const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua', 'X-OpenRouter-Title': 'Dialog' };
    const transcriptionResponse = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', { method: 'POST', headers, body: JSON.stringify({ model: process.env.OPENROUTER_STT_MODEL || 'openai/whisper-1', input_audio: { data: bytes.toString('base64'), format: audioFormat }, language: 'uk', temperature: 0 }) });
    const transcriptionPayload = await transcriptionResponse.json().catch(() => ({}));
    if (!transcriptionResponse.ok) throw new Error(transcriptionPayload?.error?.message || `Помилка транскрипції (${transcriptionResponse.status})`);
    const transcript = String(transcriptionPayload.text || '').trim();
    if (!transcript) throw new Error('Транскрипція повернула порожній текст');
    const prompt = `Ти — аналітик якості продажів DIA Consulting. Проаналізуй український або російський транскрипт дзвінка. Не вигадуй фактів. Поверни виключно JSON з полями summary, contact_probability (0..100), stages (contact, needs, presentation, objections, cross_sell, closing — усі 0..100) та recommendations (до 3 об'єктів issue, say). Фраза say має бути короткою і готовою до використання менеджером.\n\nТранскрипт:\n${transcript.slice(0, 50000)}`;
    const evaluationResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model: process.env.OPENROUTER_ANALYSIS_MODEL || 'openai/gpt-4o-mini', temperature: .2, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) });
    const evaluationPayload = await evaluationResponse.json().catch(() => ({}));
    if (!evaluationResponse.ok) throw new Error(evaluationPayload?.error?.message || `Помилка DIA-оцінки (${evaluationResponse.status})`);
    const raw = String(evaluationPayload?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const evaluation = normalize(JSON.parse(raw));
    await pool.query(`UPDATE dialog_analyses SET status='completed', transcript=$2, evaluation=$3, model=$4, transcription_cost=$5, evaluation_cost=$6, error_message=NULL, updated_at=now() WHERE call_id=$1`, [callId, transcript, evaluation, String(evaluationPayload.model || process.env.OPENROUTER_ANALYSIS_MODEL || 'openai/gpt-4o-mini'), Number(transcriptionPayload?.usage?.cost || 0), Number(evaluationPayload?.usage?.cost || 0)]);
    return { ok: true };
  } catch (error) {
    await pool.query(`UPDATE dialog_analyses SET status='failed', error_message=$2, updated_at=now() WHERE call_id=$1`, [callId, String(error.message || 'Невідома помилка').slice(0, 1000)]);
    return { ok: false, error: String(error.message || 'Невідома помилка') };
  }
}

try {
  const calls = await ringostatCalls();
  console.log(`Importing ${calls.length} Ringostat calls (limit ${limit})`);
  let completed = 0;
  for (const call of calls) {
    const id = await save(call);
    const result = await analyze(id, recordingUrl(call));
    completed += Number(result.ok);
    console.log(`Call ${id}: ${result.ok ? 'completed' : `failed — ${result.error}`}`);
    // Ringostat can throttle consecutive recording downloads, even for serial requests.
    if (call !== calls[calls.length - 1]) await sleep(6_000);
  }
  console.log(JSON.stringify({ imported: calls.length, completed, failed: calls.length - completed }));
} finally {
  await pool.end();
}

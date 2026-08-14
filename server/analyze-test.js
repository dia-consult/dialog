import pg from 'pg';

const { Pool } = pg;
const MAX_CALLS = 10;
const MAX_AUDIO_BYTES = Number(process.env.DIALOG_MAX_AUDIO_BYTES || 20 * 1024 * 1024);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function recordingUrl(payload, storedUrl) {
  const fields = [
    storedUrl,
    payload?.recording_wav,
    payload?.recording_url,
    payload?.record_link,
    payload?.audio_url,
  ];
  return fields.find((value) => typeof value === 'string' && /^https:\/\//.test(value)) || null;
}

function audioFormat(url, contentType) {
  const content = (contentType || '').toLowerCase();
  if (content.includes('wav') || /\.wav(?:\?|$)/i.test(url)) return 'wav';
  if (content.includes('mpeg') || /\.mp3(?:\?|$)/i.test(url)) return 'mp3';
  if (content.includes('ogg') || /\.ogg(?:\?|$)/i.test(url)) return 'ogg';
  if (content.includes('aac') || /\.aac(?:\?|$)/i.test(url)) return 'aac';
  if (content.includes('mp4') || /\.m4a(?:\?|$)/i.test(url)) return 'm4a';
  return null;
}

function cleanJson(value) {
  const fenced = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(fenced);
}

async function transcribe(url) {
  const audioResponse = await fetch(url);
  if (!audioResponse.ok) throw new Error(`Запис недоступний (${audioResponse.status})`);
  const length = Number(audioResponse.headers.get('content-length') || 0);
  if (length > MAX_AUDIO_BYTES) throw new Error('Запис завеликий для тестового аналізу');
  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('Запис завеликий для тестового аналізу');
  const format = audioFormat(url, audioResponse.headers.get('content-type'));
  if (!format) throw new Error('Невідомий формат запису');

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua',
      'X-OpenRouter-Title': 'DIALOG',
    },
    body: JSON.stringify({
      model: 'openai/whisper-1',
      language: 'uk',
      input_audio: { data: bytes.toString('base64'), format },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Помилка транскрипції (${response.status})`);
  return { text: result.text, cost: Number(result?.usage?.cost || 0) };
}

async function evaluate(transcript) {
  const prompt = `Ти — аналітик якості продажів DIA Consulting. Проаналізуй український або російський транскрипт дзвінка. Поверни ВИКЛЮЧНО JSON без Markdown за схемою:
{"summary":"короткий висновок","contact_probability":0,"stages":{"contact":0,"needs":0,"presentation":0,"objections":0,"cross_sell":0,"closing":0},"recommendations":[{"issue":"що не так","say":"що конкретно сказати"}]}
Оцінки — цілі числа 0..100. Не вигадуй фактів, яких немає у транскрипті. До 3 коротких рекомендацій.

Транскрипт:
${transcript.slice(0, 50000)}`;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://dialog.dia-consulting.com.ua',
      'X-OpenRouter-Title': 'DIALOG',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Помилка оцінки (${response.status})`);
  return {
    evaluation: cleanJson(result?.choices?.[0]?.message?.content || '{}'),
    cost: Number(result?.usage?.cost || 0),
    model: result.model,
  };
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) {
    throw new Error('Відсутні DATABASE_URL або OPENROUTER_API_KEY');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dialog_analyses (
      id BIGSERIAL PRIMARY KEY,
      call_id BIGINT NOT NULL REFERENCES ringostat_calls(id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      evaluation JSONB NOT NULL,
      model TEXT NOT NULL,
      transcription_cost NUMERIC NOT NULL DEFAULT 0,
      evaluation_cost NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(call_id)
    )
  `);

  const { rows } = await pool.query(`
    SELECT id, recording_url, payload
    FROM ringostat_calls
    WHERE COALESCE(payload->>'recording_wav', payload->>'recording_url', payload->>'record_link', recording_url) IS NOT NULL
      AND id NOT IN (SELECT call_id FROM dialog_analyses)
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT 30
  `);

  let completed = 0;
  let totalCost = 0;
  const skipped = [];
  for (const call of rows) {
    if (completed >= MAX_CALLS) break;
    try {
      const url = recordingUrl(call.payload, call.recording_url);
      if (!url) throw new Error('Немає посилання на запис');
      const transcription = await transcribe(url);
      if (!transcription.text?.trim()) throw new Error('Порожня транскрипція');
      const analysis = await evaluate(transcription.text);
      await pool.query(
        `INSERT INTO dialog_analyses (call_id, transcript, evaluation, model, transcription_cost, evaluation_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [call.id, transcription.text, analysis.evaluation, analysis.model, transcription.cost, analysis.cost],
      );
      completed += 1;
      totalCost += transcription.cost + analysis.cost;
      console.log(`Аналіз готовий: ${completed}/${MAX_CALLS}`);
    } catch (error) {
      skipped.push({ id: call.id, reason: error.message });
      console.warn(`Пропущено запис ${call.id}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ completed, totalCost, skipped: skipped.length }, null, 2));
  if (completed === 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());

import { config } from '../config.js';

/* ==================================================================== */
/*  Engine: Anthropic Messages API (used when the CLI is unavailable    */
/*  or ENGINE=api is forced).                                           */
/* ==================================================================== */

export function isConfigured() {
  return !!config.apiKey;
}

export function getAvailability() {
  return { ok: isConfigured(), reason: isConfigured() ? null : 'ANTHROPIC_API_KEY is not set.' };
}

export async function execute({ userMessage, history = [], onEvent }) {
  const url = `${config.apiBaseUrl}/v1/messages`;
  const emit = (type, payload) => {
    try { onEvent?.({ type, ...payload, ts: new Date().toISOString() }); } catch { /* closed */ }
  };

  const system = [
    'You are Claude Code running inside the Claude Code Web Console.',
    'You help the user with programming, files, analysis and creative work.',
    'Answer thoroughly and in the same language the user writes in (Vietnamese if they write Vietnamese).',
    'Format answers in clean Markdown with fenced code blocks when code is involved.',
  ].join('\n');

  const conv = [
    ...(history || []).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: config.apiMaxTokens,
      system,
      messages: conv,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`Anthropic API error ${res.status}: ${detail || res.statusText}`.trim());
  }

  emit('status', { message: `streaming ${config.apiModel}…` });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';

  const feed = async (chunk) => {
    buf += decoder.decode(chunk, { stream: true }).toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text;
          emit('text', { text: ev.delta.text });
        }
      } catch { /* skip */ }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    await feed(value);
  }
  feed(new Uint8Array(0)); // flush

  return { ok: true, text, engine: 'api', model: config.apiModel };
}

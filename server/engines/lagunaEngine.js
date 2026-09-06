import { config } from '../config.js';
import { nowIso } from '../util.js';

/* ==================================================================== */
/*  Engine: LAGUNA S 2.1 — OpenRouter-compatible chat completions.      */
/*  Dùng khi muốn model hosted (đa nhà cung cấp) mà không cần CLI.       */
/*  System prompt là nội dung gốc của dự án — KHÔNG nhúng system prompt   */
/*  "leak" của bất kỳ hãng nào (tài liệu mật, không được phép sao chép). */
/* ==================================================================== */

export const LAGUNA_NAME = 'Laguna S 2.1';

export function isConfigured() {
  return !!config.openrouterKey;
}

export function getAvailability() {
  return {
    ok: isConfigured(),
    reason: isConfigured() ? null : 'Thiếu OPENROUTER_API_KEY (hoặc LAGUNA_API_KEY) trong .env.',
    model: config.lagunaModel,
  };
}

function systemPrompt() {
  return [
    `Bạn là ${LAGUNA_NAME} — trợ lý lập trình cấp cao chạy trong Claude Code Console.`,
    'Trả lời bằng đúng ngôn ngữ người dùng viết (mặc định: tiếng Việt).',
    'Phong cách: trực tiếp, thực dụng, có chiều sâu; code luôn trong fenced block kèm ngôn ngữ.',
    'Khi đưa quyết định kỹ thuật, nêu trade-off ngắn gọn thay vì liệt kê an toàn.',
    'Không bịa API/cú pháp; không chắc thì nói rõ và đề xuất cách kiểm chứng.',
  ].join('\n');
}

export async function execute({ userMessage, history = [], onEvent, signal }) {
  const emit = (type, payload) => {
    try { onEvent?.({ type, ...payload, ts: nowIso() }); } catch { /* closed */ }
  };
  if (!isConfigured()) throw new Error(getAvailability().reason);

  emit('status', { message: `đang kết nối OpenRouter (${config.lagunaModel})…` });

  const messages = [
    { role: 'system', content: systemPrompt() },
    ...(history || []).slice(-40).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })),
    { role: 'user', content: String(userMessage || '') },
  ];

  const res = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.openrouterKey}`,
      'x-title': 'Claude Code Console — Laguna S 2.1',
      'http-referer': 'http://localhost:' + config.port,
    },
    body: JSON.stringify({
      model: config.lagunaModel,
      stream: true,
      max_tokens: config.apiMaxTokens,
      messages,
    }),
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`OpenRouter API lỗi ${res.status}: ${detail || res.statusText}`.trim());
  }

  emit('meta', { model: config.lagunaModel });
  emit('status', { message: `streaming ${config.lagunaModel}…` });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';

  const feed = () => {
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const ev = JSON.parse(payload);
        const delta = ev.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          emit('text', { text: delta });
        }
        const usage = ev.usage;
        if (usage) emit('usage', { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens });
      } catch { /* skip malformed keep-alive lines */ }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    feed();
  }

  return { ok: true, text, engine: 'laguna', model: config.lagunaModel };
}

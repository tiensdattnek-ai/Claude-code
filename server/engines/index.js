import { config } from '../config.js';
import { log, nowIso } from '../util.js';
import * as cli from './cliEngine.js';
import * as api from './apiEngine.js';
import * as demo from './demoEngine.js';
import * as menos from './menosEngine.js';
import * as laguna from './lagunaEngine.js';

/* ==================================================================== */
/*  Engine resolver                                                     */
/*  auto -> cli (if available) -> api -> laguna (if key) -> menos       */
/*  menos = bộ não cục bộ, luôn sẵn sàng; demo = fallback lịch sử.      */
/* ==================================================================== */

const engines = { cli, api, demo, menos, laguna };

export function resolveEngine() {
  if (config.engine === 'cli' && cli.getAvailability().ok) return cli;
  if (config.engine === 'api' && api.isConfigured()) return api;
  if (config.engine === 'demo') return demo;
  if (config.engine === 'laguna') return laguna.isConfigured() ? laguna : menos;
  if (config.engine === 'menos') return menos;
  if (cli.getAvailability().ok) return cli;
  if (api.isConfigured()) return api;
  if (laguna.isConfigured()) return laguna;
  return menos; // always-on local brain beats the old demo stub
}

export function resolveEngineName() {
  if (config.engine === 'demo') return 'demo';
  if (config.engine === 'api') return api.isConfigured() ? 'api' : 'menos';
  if (config.engine === 'cli') return cli.isConfigured() ? 'cli' : 'menos';
  if (config.engine === 'laguna') return laguna.isConfigured() ? 'laguna' : 'menos';
  if (config.engine === 'menos') return 'menos';
  if (cli.getAvailability().ok) return 'cli';
  if (api.isConfigured()) return 'api';
  if (laguna.isConfigured()) return 'laguna';
  return 'menos';
}

/** Pick the engine module for an explicit per-message engine name. */
export function pickEngine(engineName) {
  const e = engines[engineName];
  if (!e || engineName === 'auto') return resolveEngine();
  if (e.isConfigured && !e.isConfigured()) return resolveEngine(); // e.g. "laguna" without a key
  return e;
}

export function engineStatus() {
  const name = resolveEngineName();
  const preferred = config.engine;
  const modes = {
    cli: {
      ok: !!cli.getAvailability().ok,
      detail: cli.getAvailability().reason || (cli.getAvailability().version ? `v${cli.getAvailability().version}` : ''),
      probing: !!cli.getAvailability().probing,
    },
    api: { ok: api.isConfigured(), detail: api.isConfigured() ? `model ${config.apiModel}` : 'set ANTHROPIC_API_KEY' },
    laguna: {
      ok: laguna.isConfigured(),
      detail: laguna.isConfigured() ? `OpenRouter · ${config.lagunaModel}` : 'set OPENROUTER_API_KEY',
    },
    menos: { ok: true, detail: `bộ não local v${menos.getAvailability().version} · ${menos.getAvailability().topics} chủ đề` },
    demo: { ok: true, detail: 'offline simulation' },
  };
  return {
    active: name,
    requested: preferred,
    modes,
    cliBin: config.claudeCliBin,
    message:
      name === 'cli'
        ? 'Claude Code CLI đang chạy mọi yêu cầu bên trong sandbox này.'
        : name === 'api'
          ? 'Anthropic API — chưa có CLI trong sandbox.'
          : name === 'laguna'
            ? `Laguna S 2.1 qua OpenRouter (${config.lagunaModel}).`
            : name === 'menos'
              ? 'Menos AI — bộ não tri thức cục bộ, offline, trainable (đọc cả mã nguồn trong workspace).'
              : 'Demo — cài `claude` CLI hoặc đặt ANTHROPIC_API_KEY để kích hoạt model thật.',
  };
}

export function warmup() {
  cli.warmup();
  menos.menosInit();
  const preferred = resolveEngineName();
  log.info(`engine preference: ${preferred}`);
}

/** Abortable wrapper shared by every engine. */
export async function runTurn({ conversationId, engineName, userMessage, history, toolsEnabled, resume, onEvent, signal }) {
  const engine = pickEngine(engineName);
  const started = Date.now();
  const emit = (type, payload = {}) =>
    onEvent({ type, conversationId, ...payload, ts: nowIso() });

  try {
    emit('status', { message: 'đang suy nghĩ…' });
    const result = await engine.execute({
      userMessage,
      history,
      toolsEnabled,
      onEvent: (e) => emit(e.type, e),
      resume,
      signal,
    });
    emit('meta', { elapsedMs: Date.now() - started });
    emit('done');
    return result;
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      emit('status', { message: 'đã hủy' });
      emit('done');
      return { ok: false, aborted: true, text: '' };
    }
    log.err('engine error:', err.message);
    emit('error', { message: err.message });
    emit('done');
    return { ok: false, error: err.message, text: '' };
  }
}

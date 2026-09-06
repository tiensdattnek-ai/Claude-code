import { config } from '../config.js';
import { log, nowIso } from '../util.js';
import * as cli from './cliEngine.js';
import * as api from './apiEngine.js';
import * as demo from './demoEngine.js';

/* ==================================================================== */
/*  Engine resolver                                                     */
/*  auto -> cli (if available) -> api (if configured) -> demo           */
/* ==================================================================== */

const engines = { cli, api, demo };

export function resolveEngine() {
  if (config.engine === 'cli' || config.engine === 'api' || config.engine === 'demo') {
    return engines[config.engine];
  }
  if (cli.getAvailability().ok) return cli;
  if (api.isConfigured()) return api;
  return demo;
}

export function resolveEngineName() {
  if (config.engine === 'demo') return 'demo';
  if (config.engine === 'api') return api.isConfigured() ? 'api' : 'demo';
  if (config.engine === 'cli') return cli.isConfigured() ? 'cli' : 'demo';
  if (cli.getAvailability().ok) return 'cli';
  if (api.isConfigured()) return 'api';
  return 'demo';
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
          : 'Demo — cài `claude` CLI hoặc đặt ANTHROPIC_API_KEY để kích hoạt model thật.',
  };
}

export function warmup() {
  cli.warmup();
  const preferred = resolveEngineName();
  log.info(`engine preference: ${preferred}`);
}

/** Abortable wrapper shared by every engine. */
export async function runTurn({ conversationId, engineName, userMessage, history, toolsEnabled, resume, onEvent, signal }) {
  const engine = engineName === 'demo' ? demo : resolveEngine();
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

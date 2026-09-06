import path from 'node:path';
import express from 'express';
import { config, SUPPORTED_ENGINES } from './config.js';
import { log, uid, safeEqual, nowIso } from './util.js';
import { bootstrapAuth, requireAuth, currentUser, setSessionCookie, clearSessionCookie, createSession, destroySession, isLocked, lockRemainingMs, registerFailure, registerSuccess, getAdmin, SESSION_COOKIE, parseCookies } from './auth.js';
import { bootstrapStore, store } from './store.js';
import { engineStatus, resolveEngineName, runTurn, warmup } from './engines/index.js';
import { menosStats, menosLearn } from './engines/menosEngine.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

/* ------------------------------------------------------------------ */
/*  Static web app                                                     */
/* ------------------------------------------------------------------ */
const dist = config.clientDist;
app.use(express.static(dist, { index: 'index.html', maxAge: '2h', etag: true }));
// all client routing paths (e.g. /c/:id) fall back to the SPA shell
app.get(/^\/(?!api\/)(?!assets\/).*/, (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(dist, 'index.html'), (e) => {
    if (e) res.status(404).send('Not found. Run `npm run build` first.');
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/health — public                                          */
/* ------------------------------------------------------------------ */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'claude-code-web-console', time: nowIso(), boot: bootedAt });
});

/* ------------------------------------------------------------------ */
/*  POST /api/auth/login — public                                      */
/* ------------------------------------------------------------------ */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  if (isLocked(ip, username)) {
    const wait = Math.ceil(lockRemainingMs(ip, username) / 1000);
    return res.status(429).json({ error: 'locked', message: `Quá nhiều lần thử sai. Thử lại sau ${wait}s.` });
  }
  const admin = getAdmin();
  if (!safeEqual(String(username || ''), admin.username) || !admin.verify(String(password || ''))) {
    registerFailure(ip, username);
    return res.status(401).json({ error: 'invalid_credentials', message: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  registerSuccess(ip, username);
  const sid = createSession(admin.username);
  setSessionCookie(res, sid);
  res.json({ ok: true, username: admin.username });
});

app.post('/api/auth/logout', (req, res) => {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (sid) destroySession(sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Everything below requires an authenticated admin                   */
/* ------------------------------------------------------------------ */
app.use('/api', requireAuth);

app.get('/api/session', (req, res) => {
  res.json({ ok: true, username: req.user.username });
});

app.get('/api/config', (req, res) => {
  res.json({
    maxMessageChars: config.maxMessageChars,
    sessionTtlHours: Math.round(config.sessionTtlMs / 3600000),
  });
});

app.get('/api/status', (_req, res) => {
  res.json({ engine: engineStatus(), serverTime: nowIso() });
});

/* ---------------- menos brain (trainable local knowledge) ---------------- */
app.get('/api/menos/stats', (_req, res) => {
  res.json(menosStats());
});

app.post('/api/menos/learn', (req, res) => {
  try {
    const { title, content, tags, note } = req.body || {};
    const result = menosLearn({ title, content, tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',') : []), note });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'invalid_seed', message: err.message || 'Không học được chủ đề này.' });
  }
});

/* ---------------- conversations ---------------- */
app.get('/api/conversations', (_req, res) => {
  res.json({ conversations: store.list() });
});

app.post('/api/conversations', (req, res) => {
  const body = req.body || {};
  const engine = SUPPORTED_ENGINES.includes(body.engine) ? body.engine : 'auto';
  const c = store.create({
    title: null,
    engine,
    toolsEnabled: !!body.toolsEnabled,
  });
  res.json({ conversation: { id: c.id, title: c.title, engine: c.engine, toolsEnabled: c.toolsEnabled, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: 0 } });
});

app.get('/api/conversations/:id', (req, res) => {
  const c = store.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Không tìm thấy hội thoại.' });
  res.json({ conversation: { ...c, busy: !!c.busy } });
});

app.patch('/api/conversations/:id', (req, res) => {
  const c = store.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Không tìm thấy hội thoại.' });
  const body = req.body || {};
  const patch = {};
  if (typeof body.toolsEnabled === 'boolean') patch.toolsEnabled = body.toolsEnabled;
  if (SUPPORTED_ENGINES.includes(body.engine)) patch.engine = body.engine;
  if (typeof body.title === 'string') patch.title = body.title;
  store.updateMeta(c.id, patch);
  res.json({ ok: true });
});

app.delete('/api/conversations/:id', (req, res) => {
  res.json({ ok: store.remove(req.params.id) });
});

/* ---------------- chat (SSE) ---------------- */
app.post('/api/chat/:id', async (req, res) => {
  const convo = store.get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'not_found', message: 'Không tìm thấy hội thoại.' });
  if (convo.busy) return res.status(409).json({ error: 'busy', message: 'Hội thoại này đang xử lý tin nhắn khác.' });

  const content = String(req.body?.message || '').trim();
  const toolsEnabled = !!req.body?.toolsEnabled;
  if (!content) return res.status(400).json({ error: 'empty', message: 'Tin nhắn trống.' });
  if (content.length > config.maxMessageChars)
    return res.status(400).json({ error: 'too_long', message: `Tin nhắn tối đa ${config.maxMessageChars} ký tự.` });

  const engineName = SUPPORTED_ENGINES.includes(req.body?.engine) ? req.body.engine : resolveEngineName();
  const history = convo.messages.slice(-40).map((m) => ({ role: m.role, content: m.content }));

  // Persist the user message before streaming.
  const um = { id: uid('m_'), role: 'user', content, ts: nowIso(), engine: engineName, toolsEnabled };
  store.pushMessage(convo.id, um);
  store.updateMeta(convo.id, { engine: engineName, toolsEnabled });
  store.autoTitle(convo.id);

  const resumed = convo.sessionId || null;

  // SSE plumbing
  const startedAt = Date.now();
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, messageId: um.id, engine: engineName })}\n\n`);

  const send = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* socket already gone */ }
  };

  store.setBusy(convo.id, true);
  let assistantId = uid('m_');
  let textSoFar = '';
  let sessionId = resumed;
  let toolCalls = [];
  let usage = null;

  const onEvent = (e) => {
    switch (e.type) {
      case 'status':
        send('status', { message: e.message, ts: e.ts });
        break;
      case 'meta':
        if (e.sessionId) {
          sessionId = e.sessionId;
          store.updateMeta(convo.id, { sessionId: e.sessionId });
        }
        if (e.model) store.updateMeta(convo.id, { model: e.model });
        break;
      case 'text': {
        textSoFar += e.text;
        if (textSoFar.length > config.maxHistoryChars) return;
        send('delta', { id: assistantId, delta: e.text, ts: e.ts });
        break;
      }
      case 'tool': {
        if (e.action === 'start') {
          toolCalls.push({ id: e.id, name: e.name, brief: e.brief || '', ts: e.ts });
          send('tool', { id: e.id, name: e.name, action: 'start', brief: e.brief || '', ts: e.ts });
        } else {
          send('tool', { id: e.id, name: e.name, action: 'end', outcome: e.outcome, brief: e.brief || '', ts: e.ts });
        }
        break;
      }
      case 'usage':
        usage = e;
        break;
      case 'error':
        send('error', { message: e.message, ts: e.ts });
        break;
      default:
        break;
    }
  };

  // If the browser disconnects mid-stream, abort the engine work so no
  // orphan agent keeps running in the sandbox. NOTE: watch `res`, not `req`:
  // for POST bodies, `req` emits 'close' as soon as the body is fully read
  // (immediately) — a false disconnect.
  const ac = new AbortController();
  const onResClose = () => {
    if (!res.writableFinished && !res.writableEnded && !ac.signal.aborted) ac.abort();
  };
  res.on('close', onResClose);

  try {
    const result = await runTurn({
      conversationId: convo.id,
      engineName,
      userMessage: content,
      history,
      toolsEnabled,
      resume: resumed,
      onEvent,
      signal: ac.signal,
    });

    const finalText = (textSoFar || result?.text || '').trim();
    if (result?.ok && finalText) {
      const am = { id: assistantId, role: 'assistant', content: finalText, ts: nowIso(), engine: engineName, sessionId: sessionId || undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
      store.pushMessage(convo.id, am);
      store.updateMeta(convo.id, { sessionId: sessionId || store.get(convo.id)?.sessionId });
      send('end', { id: assistantId, usage, elapsedMs: Date.now() - startedAt });
    } else if (result?.ok) {
      const am = { id: assistantId, role: 'assistant', content: '_*(không có phản hồi văn bản)*_', ts: nowIso() };
      store.pushMessage(convo.id, am);
      send('end', { id: assistantId, usage, elapsedMs: Date.now() - startedAt });
    }
  } catch (err) {
    log.err('chat error:', err);
    send('error', { message: err.message || 'Internal error', ts: nowIso() });
  } finally {
    res.removeListener('close', onResClose);
    store.setBusy(convo.id, false);
    if (!res.writableEnded && !res.destroyed) {
      try { res.end(); } catch { /* ignore */ }
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */
const bootedAt = nowIso();
bootstrapAuth();
bootstrapStore();
warmup();

app.listen(config.port, config.host, () => {
  const base = `http://localhost:${config.port}`;
  log.ok('┌──────────────────────────────────────────────────────────────┐');
  log.ok('│  Claude Code Web Console                                      │');
  log.ok(`│  → ${base.padEnd(54)}│`);
  log.ok(`│  engine = ${resolveEngineName().padEnd(49)}│`);
  log.ok(`│  cwd     = ${config.workdir.slice(0, 44).padEnd(44)}│`);
  log.ok('└──────────────────────────────────────────────────────────────┘');
});

export default app;

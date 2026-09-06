import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log, uid, nowIso, writeJsonAtomic, readJson } from './util.js';

/* ==================================================================== */
/*  Conversation store — persistent JSON database, atomic writes.       */
/* ==================================================================== */

const dbFile = () => path.join(config.dataDir, 'conversations.json');
const conversations = new Map(); // id -> conversation

let loaded = false;
let saveTimer = null;

export function bootstrapStore() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const data = readJson(dbFile(), { conversations: [] });
  for (const c of Array.isArray(data?.conversations) ? data.conversations : []) {
    if (c && c.id) conversations.set(c.id, c);
  }
  loaded = true;
  log.ok(`store ready · ${conversations.size} conversation(s) restored`);
}

function persist() {
  if (!loaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeJsonAtomic(dbFile(), { conversations: [...conversations.values()] });
    } catch (e) {
      log.err('failed to persist conversations:', e.message);
    }
  }, 200);
}

const metaOf = (c) => ({
  id: c.id,
  title: c.title,
  engine: c.engine,
  toolsEnabled: c.toolsEnabled,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  messageCount: c.messages.length,
  busy: !!c.busy,
});

export const store = {
  list() {
    return [...conversations.values()]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(metaOf);
  },

  get(id) {
    return conversations.get(id) || null;
  },

  create({ title = null, engine = null, toolsEnabled = false } = {}) {
    const now = nowIso();
    const convo = {
      id: uid('c_'),
      title,
      engine: engine || 'auto',
      toolsEnabled: !!toolsEnabled,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    conversations.set(convo.id, convo);
    persist();
    return convo;
  },

  remove(id) {
    const ok = conversations.delete(id);
    if (ok) persist();
    return ok;
  },

  touch(id) {
    const c = conversations.get(id);
    if (!c) return;
    c.updatedAt = nowIso();
    persist();
  },

  updateMeta(id, patch) {
    const c = conversations.get(id);
    if (!c) return null;
    if (typeof patch.title === 'string') {
      const t = patch.title.trim();
      c.title = t.slice(0, 96);
    }
    if (patch.toolsEnabled !== undefined) c.toolsEnabled = !!patch.toolsEnabled;
    if (patch.engine !== undefined) c.engine = patch.engine;
    if (typeof patch.sessionId === 'string') c.sessionId = patch.sessionId;
    if (typeof patch.model === 'string') c.model = patch.model;
    c.updatedAt = nowIso();
    persist();
    return c;
  },

  pushMessage(id, message) {
    const c = conversations.get(id);
    if (!c) return null;
    c.messages.push(message);
    c.updatedAt = nowIso();
    persist();
    return c;
  },

  autoTitle(id) {
    const c = conversations.get(id);
    if (!c || c.title) return;
    const first = c.messages.find((m) => m.role === 'user');
    if (!first) return;
    const raw = String(first.content || '').replace(/\s+/g, ' ').trim();
    c.title = (raw.length > 64 ? raw.slice(0, 64) + '…' : raw) || 'New chat';
    persist();
  },

  setBusy(id, busy) {
    const c = conversations.get(id);
    if (c) c.busy = busy;
  },

  isBusy(id) {
    return !!conversations.get(id)?.busy;
  },
};

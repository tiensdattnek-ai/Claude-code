/* ------------------------------------------------------------------ */
/*  API client — thin fetch wrapper + SSE stream helper                */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers || {},
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('ccw:unauthorized'));
    }
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data?.error);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/session'),
  config: () => request('/api/config'),
  status: () => request('/api/status'),
  conversations: () => request('/api/conversations'),
  createConversation: (opts = {}) =>
    request('/api/conversations', { method: 'POST', body: JSON.stringify(opts) }),
  getConversation: (id) => request(`/api/conversations/${id}`),
  deleteConversation: (id) => request(`/api/conversations/${id}`, { method: 'DELETE' }),
  patchConversation: (id, patch) =>
    request(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  chat: (id, message, { toolsEnabled, engine } = {}) =>
    request(`/api/chat/${id}`, {
      method: 'POST',
      body: JSON.stringify({ message, toolsEnabled, engine }),
    }),
};

/**
 * Stream server-sent events for a chat message.
 * Handlers: { hello, status, delta, tool, error, end }
 * Returns an AbortController.
 */
export function streamChat(id, payload, handlers) {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(`/api/chat/${id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      let msg = `HTTP ${res.status}`;
      try {
        const d = await res.json();
        msg = d.message || msg;
        if (res.status === 401) window.dispatchEvent(new CustomEvent('ccw:unauthorized'));
      } catch { /* ignore */ }
      handlers.error?.({ fatal: true, message: msg });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = 'message';
        const dataLines = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try {
          const parsed = JSON.parse(dataLines.join('\n'));
          if (handlers[event]) handlers[event](parsed);
          else if (handlers.message) handlers.message(parsed);
        } catch { /* skip malformed */ }
      }
    }
  })().catch((err) => {
    if (err.name !== 'AbortError') handlers.error?.({ fatal: true, message: err.message || 'Connection lost' });
  });
  return ctrl;
}

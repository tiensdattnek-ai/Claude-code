/* DOM smoke test for the React client (run via node, not a browser). */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* noop */ }

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
globalThis.matchMedia = window.matchMedia;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLTextAreaElement.prototype.select = () => {};
Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 0 });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 0 });

const React = (await import('../client/node_modules/react/index.js')).default;
const { useState } = React;
const { createRoot } = await import('../client/node_modules/react-dom/client.js');
const Chat = (await import('../client/src/components/Chat.jsx')).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const failures = [];
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(name); console.log('  ✗', name); }
};

/* ---------- stub fetch: an "engine" that streams SSE back ---------- */
let engineAnswer = '**streaming hoạt động** ✨';
let lastSentBody = null;

globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.endsWith('/api/chat/c_test1') && opts?.method === 'POST') {
    lastSentBody = JSON.parse(opts.body);
    const enc = new TextEncoder();
    const events = [
      `event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`,
      `event: status\ndata: ${JSON.stringify({ message: 'agent đang chạy trong sandbox' })}\n\n`,
      `event: tool\ndata: ${JSON.stringify({ id: 'ta1', name: 'Bash', action: 'start', brief: 'ls -la' })}\n\n`,
      `event: delta\ndata: ${JSON.stringify({ id: 'ma1', delta: 'Kết quả: ' })}\n\n`,
      `event: delta\ndata: ${JSON.stringify({ id: 'ma1', delta: engineAnswer })}\n\n`,
      `event: tool\ndata: ${JSON.stringify({ id: 'ta1', name: 'Bash', action: 'end', outcome: 'success', brief: 'drwxr-xr-x' })}\n\n`,
      `event: end\ndata: ${JSON.stringify({ id: 'ma1' })}\n\n`,
    ];
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(enc.encode(events[0] + events[1] + events[2] + events[3]));
        await sleep(180); // keep the stream open mid-answer
        controller.enqueue(enc.encode(events[4] + events[5] + events[6]));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  throw new Error('unexpected fetch: ' + url);
};

/* ---------- stateful driver replicating App behaviour ---------- */
function Driver() {
  const [convo, setConvo] = useState(null);
  React.useEffect(() => {
    setConvo({
      id: 'c_test1',
      title: 'Test conversation',
      engine: 'auto',
      toolsEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      busy: false,
      messages: [
        { id: 'm1', role: 'user', content: 'Viết function đảo chuỗi bằng JS', ts: new Date().toISOString() },
        {
          id: 'm2',
          role: 'assistant',
          content:
            '## Code mẫu\n\n```js\nfunction reverse(s) {\n  return [...s].reverse().join("");\n}\n```\n\n> Ghi chú: dùng spread để xử lý Unicode.\n\nBảng:\n| A | B |\n|---|---|\n| 1 | 2 |',
          ts: new Date().toISOString(),
          toolCalls: [
            { id: 't1', name: 'Bash', brief: 'node -e "console.log(1)"' },
            { id: 't2', name: 'Read', brief: 'package.json' },
          ],
        },
      ],
    });
  }, []);

  const refreshConversation = React.useCallback(() => {
    setConvo((prev) => {
      if (!prev) return prev;
      // user msg + assistant msg got persisted by the server
      const userText = lastSentBody?.message || '(unknown)';
      const hasUser = prev.messages.some((m) => m.role === 'user' && m.content === userText);
      const list = [...prev.messages];
      if (!hasUser) list.push({ id: 'm3', role: 'user', content: userText, ts: new Date().toISOString() });
      list.push({
        id: 'ma1',
        role: 'assistant',
        content: 'Kết quả: ' + engineAnswer,
        ts: new Date().toISOString(),
        toolCalls: [
          { id: 'ta1', name: 'Bash', brief: 'ls -la' },
          { id: 'ta2', name: 'Bash', brief: 'drwxr-xr-x' },
        ],
      });
      return { ...prev, messages: list, busy: false };
    });
  }, []);

  return React.createElement(Chat, {
    conversation: convo,
    engineOptions: { active: 'demo' },
    onMetaChange: () => {},
    onListRefresh: () => {},
    onRefreshConversation: refreshConversation,
    username: 'admin',
    theme: 'dark',
    onToggleTheme: () => {},
  });
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(Driver));
await sleep(180);

/* ---- 1. initial render with history ---- */
let text = document.body.textContent;
check('user bubble rendered', text.includes('Viết function đảo chuỗi'));
check('assistant markdown h2 rendered', text.includes('Code mẫu'));
check('code block content rendered', text.includes('reverse'));
check('blockquote rendered', text.includes('Ghi chú'));
check('table cells rendered', document.querySelectorAll('.md-table td').length >= 2);
check('tool chips rendered', document.querySelectorAll('.tool-chip').length >= 2);
check('composer rendered', !!document.querySelector('.composer-shell textarea'));
check('engine select exists', !!document.querySelector('.engine-select'));
check('agent tools switch exists', !!document.querySelector('.switch input'));
check('theme toggle exists', !!document.querySelector('.pill-btn.icon-only'));

/* ---- 2. full SSE round trip ---- */
const ta = document.querySelector('.composer-shell textarea');
const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
setter.call(ta, 'Hãy chạy thử lệnh ls trong sandbox');
ta.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(80);

const sendBtn = [...document.querySelectorAll('button')].find((b) => b.title === 'Gửi (Enter)');
sendBtn?.click();
await sleep(60); // mid-stream (engine pauses for 180ms before the final deltas)

text = document.body.textContent;
check('user message appears immediately', text.includes('Hãy chạy thử lệnh ls'));
check('first streaming delta visible before end', text.includes('Kết quả:'));
check('tool chip rendered while running', document.querySelectorAll('.tool-chip').length >= 3);
check('send swapped for stop while streaming', !document.querySelector('button[title="Gửi (Enter)"]') && !!document.querySelector('button[title="Dừng phản hồi"]'));

await sleep(800); // let it finish + refresh
text = document.body.textContent;
check('final assistant answer persisted in thread', text.includes('streaming hoạt động') && text.includes('Kết quả:'));
check('send button re-enabled', !!document.querySelector('button[title="Gửi (Enter)"]'));
check('stop button not present after finish', !document.querySelector('button[title="Dừng phản hồi"]'));

root.unmount();
await sleep(50);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('FAILED:', failures.join(', '));
  process.exit(1);
}
process.exit(0);

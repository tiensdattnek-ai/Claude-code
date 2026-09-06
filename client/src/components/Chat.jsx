import { useRef, useState, useEffect, useCallback, useLayoutEffect, useReducer } from 'react';
import { streamChat } from '../lib/api.js';
import { UserMessage, AssistantMessage } from './MessageBubble.jsx';
import Composer from './Composer.jsx';
import Ico from './icons.jsx';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const SUGGESTIONS = [
  { text: 'Viết một REST API Node.js + Express hoàn chỉnh với JWT', icon: 'bolt' },
  { text: 'Tạo landing page đẹp bằng React + CSS thuần', icon: 'spark' },
  { text: 'Dịch thuật ngữ kỹ thuật sang tiếng Việt tự nhiên', icon: 'chat' },
  { text: 'Giải thích design pattern Observer kèm ví dụ code', icon: 'pencil' },
];

const LIVE_ENGINES = ['auto', 'cli', 'api', 'demo'];

export default function Chat({
  conversation,
  engineOptions,
  onMetaChange,
  onListRefresh,
  onRefreshConversation,
  username,
  theme,
  onToggleTheme,
  onOpenSidebar,
}) {
  const [convo, setConvo] = useState(conversation);
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [engine, setEngine] = useState('auto');
  const [atBottom, setAtBottom] = useState(true);
  // Streaming uses refs for correctness + a tick state to force renders.
  const [, bumpTick] = useReducer((x) => x + 1, 0);
  const forceRender = useCallback(() => bumpTick(), []);

  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const contentRef = useRef('');
  const toolsRef = useRef([]);
  const pendingRef = useRef(null); // current in-flight assistant msg {id, engine}
  const localBusyRef = useRef(false);

  /* ---------------- sync when switching conversation ---------------- */
  useEffect(() => {
    setConvo(conversation);
    setToolsEnabled(conversation?.toolsEnabled || false);
    setEngine(conversation?.engine || engineOptions?.active || 'auto');
    setStreaming(false);
    setStatusText('');
    contentRef.current = '';
    toolsRef.current = [];
    pendingRef.current = null;
    localBusyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  useEffect(() => {
    if (conversation && !localBusyRef.current) setConvo(conversation);
  }, [conversation]);

  const messages = [
    ...(convo?.messages || []),
    ...(streaming && pendingRef.current
      ? [{
          id: pendingRef.current.id,
          role: 'assistant',
          content: contentRef.current,
          ts: pendingRef.current.ts,
          streaming: true,
          local: true,
          toolCalls: toolsRef.current,
          statusText,
          engine: pendingRef.current.engine,
        }]
      : []),
  ];

  /* ---------------- autoscroll ---------------- */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    if (atBottom) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [streaming, atBottom, convo?.messages?.length, messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 150);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', onScroll, { passive: true });
    return () => el?.removeEventListener('scroll', onScroll);
  }, [convo?.id, streaming]);

  /* ---------------- send ---------------- */
  const send = useCallback(
    async (text) => {
      if (!convo || streaming || localBusyRef.current) return;
      const userMsg = { id: uid(), role: 'user', content: text, ts: new Date().toISOString(), local: true };
      const pid = uid();
      const effEngine = LIVE_ENGINES.includes(engine) ? engine : 'auto';

      localBusyRef.current = true;
      contentRef.current = '';
      toolsRef.current = [];
      pendingRef.current = { id: pid, ts: new Date().toISOString(), engine: effEngine };
      abortRef.current = null;

      setConvo((c) => ({ ...c, messages: [...(c?.messages || []), userMsg], busy: true }));
      setStreaming(true);
      setStatusText('đang kết nối engine…');
      scrollToBottom(false);

      let errored = false;
      let finished = false;

      const finish = (opts = {}) => {
        if (finished) return;
        finished = true;
        const { serverPersisted = false, error = null } = opts;
        const pend = pendingRef.current;
        const content = contentRef.current.trim();
        const toolList = toolsRef.current
          .filter((t) => t.state === 'done' || t.state === 'err' || true)
          .map((t) => ({ name: t.name, brief: t.brief, outcome: t.state === 'err' ? 'error' : 'success', ts: t.ts }))
          .slice(0, 30);
        const finalMsg = {
          id: pend?.id || uid(),
          role: 'assistant',
          content,
          ts: pend?.ts || new Date().toISOString(),
          engine: pend?.engine,
          toolCalls: toolList.length ? toolList : undefined,
          local: !serverPersisted,
          error: error || (errored ? 'Đã có lỗi xảy ra trong quá trình xử lý.' : undefined),
        };
        pendingRef.current = null;
        abortRef.current = null;
        localBusyRef.current = false;

        setStreaming(false);
        setStatusText('');

        if (!serverPersisted && (finalMsg.content || finalMsg.error)) {
          setConvo((c) => ({ ...c, busy: false, messages: [...(c?.messages || []), finalMsg] }));
        } else if (serverPersisted) {
          setConvo((c) => ({ ...c, busy: false }));
          if (onRefreshConversation) onRefreshConversation();
        } else {
          setConvo((c) => ({ ...c, busy: false }));
        }
        if (onListRefresh) onListRefresh();
        scrollToBottom();
      };

      const ctrl = streamChat(
        convo.id,
        { message: text, toolsEnabled, engine: effEngine },
        {
          status: (d) => {
            setStatusText(d.message || 'đang xử lý…');
          },
          delta: (d) => {
            contentRef.current += d.delta;
            forceRender();
            scrollToBottom();
          },
          tool: (d) => {
            const calls = toolsRef.current;
            if (d.action === 'start') {
              calls.push({ id: d.id || uid(), name: d.name || 'tool', brief: d.brief || '', state: 'run', ts: d.ts || new Date().toISOString() });
            } else {
              const i = calls.findIndex((t) => t.id === d.id);
              if (i >= 0) {
                calls[i] = {
                  ...calls[i],
                  state: d.outcome === 'error' ? 'err' : 'done',
                  brief: d.brief && d.brief.length ? d.brief.slice(0, 3000) : calls[i].brief,
                };
              } else {
                calls.push({ id: d.id || uid(), name: d.name || 'tool', brief: d.brief || '', state: d.outcome === 'error' ? 'err' : 'done', ts: d.ts || new Date().toISOString() });
              }
            }
            forceRender();
            scrollToBottom();
          },
          error: (d) => {
            errored = true;
            if (d?.message) setStatusText(d.message);
            finish({ serverPersisted: false, error: d?.message });
          },
          end: () => {
            finish({ serverPersisted: !errored });
          },
        }
      );
      abortRef.current = ctrl;
    },
    [convo, streaming, toolsEnabled, engine, onListRefresh, onRefreshConversation, scrollToBottom]
  );

  /* ---------------- stop ---------------- */
  const stop = () => {
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    const pend = pendingRef.current;
    const hasContent = contentRef.current.trim().length > 0;
    setStreaming(false);
    pendingRef.current = null;
    abortRef.current = null;
    localBusyRef.current = false;
    const finalMsg = {
      id: pend?.id || uid(),
      role: 'assistant',
      content: hasContent ? contentRef.current.trim() : '',
      ts: pend?.ts || new Date().toISOString(),
      local: true,
      toolCalls: toolsRef.current.filter((t) => t.brief).map((t) => ({ name: t.name, brief: t.brief, outcome: t.state === 'err' ? 'error' : 'success' })).slice(0, 30),
      error: hasContent ? undefined : 'Đã dừng phản hồi.',
    };
    setConvo((c) => ({ ...c, busy: false, messages: [...(c?.messages || []), finalMsg] }));
    setStatusText('');
    onListRefresh?.();
  };

  /* ---------------- retry handler ---------------- */
  useEffect(() => {
    const onRetry = (e) => {
      const id = e.detail?.messageId;
      if (!id || !convo || streaming) return;
      const all = convo.messages || [];
      const idx = all.findIndex((m) => m.id === id);
      if (idx < 0) return;
      const lastUser = all.slice(0, idx).reverse().find((m) => m.role === 'user');
      if (lastUser) send(String(lastUser.content));
    };
    window.addEventListener('ccw:retry', onRetry);
    return () => window.removeEventListener('ccw:retry', onRetry);
  }, [convo, streaming, send]);

  /* ---------------- meta toggles ---------------- */
  const toggleTools = () => {
    const next = !toolsEnabled;
    setToolsEnabled(next);
    if (convo) onMetaChange({ toolsEnabled: next });
  };
  const changeEngine = (val) => {
    setEngine(val);
    if (convo) onMetaChange({ engine: val });
  };

  const isStreaming = streaming;
  const noConvo = !convo;
  const emptyView = !noConvo && convo.messages?.length === 0 && !isStreaming;
  const canSend = !!convo && !convo.busy && !isStreaming;
  const isBusyElsewhere = !!convo?.busy && !localBusyRef.current;

  return (
    <div className="chat-col">
      <Topbar
        convo={convo}
        isStreaming={isStreaming}
        statusText={statusText}
        toolsEnabled={toolsEnabled}
        onToggleTools={toggleTools}
        engine={engine}
        onEngine={changeEngine}
        engineOptions={engineOptions}
        isBusy={isBusyElsewhere}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="messages-scroll" ref={scrollRef}>
        {emptyView ? (
          <Hero onPick={(t) => send(t)} canSend={canSend} engineActive={engineOptions?.active} />
        ) : (
          <div className="messages-inner">
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserMessage key={m.id} m={m} />
              ) : (
                <AssistantMessage key={m.id} m={m} streaming={!!m.streaming} />
              )
            )}
          </div>
        )}
      </div>

      {!atBottom && (
        <button className="jump-pill" onClick={() => scrollToBottom()}>
          <Ico name="arrowDown" size={13} /> Tin mới nhất
        </button>
      )}

      <Composer
        onSend={send}
        streaming={isStreaming}
        onStop={stop}
        disabled={isBusyElsewhere || noConvo}
        toolsEnabled={toolsEnabled}
        onToggleTools={toggleTools}
        placeholder={noConvo ? 'Chọn hoặc tạo một hội thoại để bắt đầu…' : 'Hỏi Claude Code bất cứ điều gì…'}
      />
    </div>
  );
}

function Hero({ onPick, canSend, engineActive }) {
  return (
    <div className="hero">
      <div className="hero-badge">
        <Ico name="spark" size={13} /> Claude Code chạy trong sandbox của bạn
      </div>
      <h1 className="hero-title">
        Viết code cùng <span className="grad">Claude Code</span>
        <br />
        ngay trên trình duyệt
      </h1>
      <p className="hero-desc">
        Console <b>cao cấp</b> kết nối thẳng tới sandbox máy chủ — mỗi tin nhắn là một phiên{' '}
        <b>Claude Code CLI</b> thật: đọc file, chạy lệnh, sửa code trong môi trường của bạn.
      </p>
      <div className="hero-stats">
        <div className="hero-stat"><div className="n">sandbox</div><div className="l">thực thi tại máy chủ</div></div>
        <div className="hero-stat"><div className="n">SSE</div><div className="l">stream từng chữ realtime</div></div>
        <div className="hero-stat"><div className="n">⌘K</div><div className="l">phím tắt đầy đủ</div></div>
      </div>
      <div className="hero-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s.text} className="hero-chip" onClick={() => canSend && onPick(s.text)}>
            <Ico name={s.icon} size={13} />
            {s.text}
          </button>
        ))}
      </div>
      <div className="hero-foot">
        <Ico name="lock" size={12} /> chỉ admin mới vào được · engine: {engineActive || '…'}
      </div>
    </div>
  );
}

function Topbar({ convo, isStreaming, statusText, toolsEnabled, onToggleTools, engine, onEngine, isBusy, theme, onToggleTheme, onOpenSidebar }) {
  const sub = isBusy
    ? '⏳ hội thoại đang được xử lý…'
    : isStreaming
      ? (statusText || 'đang xử lý trong sandbox…')
      : `sandbox · ${engine} engine`;
  return (
    <div className="topbar">
      {onOpenSidebar && (
        <button className="tb-side-toggle" onClick={onOpenSidebar} title="Mở danh sách hội thoại" aria-label="Mở menu">
          <Ico name="menu" size={17} />
        </button>
      )}
      <div className="tb-title">
        <span className="name">{convo?.title || 'Hội thoại mới'}</span>
        <span className="sub">
          {isStreaming && !isBusy && <span className="live-dot" />}
          {sub}
        </span>
      </div>
      <div className="tb-right">
        <label className="switch" title="Cho Claude dùng công cụ trong sandbox (Bash, Write, Edit…)" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={toolsEnabled} onChange={onToggleTools} />
          <span className="track" />
          <span className="switch-label">Agent tools</span>
        </label>
        <div className="engine-select-wrap">
          <select className="engine-select" value={engine} onChange={(e) => onEngine(e.target.value)} title="Engine xử lý tin nhắn">
            <option value="auto">Auto</option>
            <option value="cli">Claude Code CLI (sandbox)</option>
            <option value="api">Anthropic API</option>
            <option value="demo">Demo</option>
          </select>
        </div>
        <button className="pill-btn icon-only" onClick={onToggleTheme} title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}>
          {theme === 'dark' ? <Ico name="sun" size={15} /> : <Ico name="moon" size={15} />}
        </button>
      </div>
    </div>
  );
}

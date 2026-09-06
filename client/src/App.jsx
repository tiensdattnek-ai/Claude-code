import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './lib/api.js';
import Login from './components/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import Chat from './components/Chat.jsx';
import Ico from './components/icons.jsx';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('ccw-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [username, setUsername] = useState('admin');
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null); // full conversation detail
  const [status, setStatus] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ccw-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  /* ---------- auth gate ---------- */
  useEffect(() => {
    api
      .me()
      .then((d) => {
        setUsername(d.username);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));

    const onUnauthorized = () => {
      setAuthed(false);
      setActive(null);
      setConversations([]);
    };
    window.addEventListener('ccw:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ccw:unauthorized', onUnauthorized);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const d = await api.conversations();
      setConversations(d.conversations || []);
    } catch { /* ignore */ }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const d = await api.status();
      setStatus(d);
    } catch { /* ignore */ }
  }, []);

  /* ---------- initial loads + status poll ---------- */
  useEffect(() => {
    if (!authed || loadedRef.current) return;
    loadedRef.current = true;
    loadStatus();
    const iv = setInterval(loadStatus, 25000);
    (async () => {
      try {
        const d = await api.conversations();
        setConversations(d.conversations || []);
        // deep link /c/:id → or resume newest → or start a fresh chat
        const m = window.location.pathname.match(/^\/c\/([\w-]+)/);
        if (m) {
          const found = (d.conversations || []).some((c) => c.id === m[1]);
          await selectConversation(m[1], found ? false : true);
        } else if (d.conversations?.length) {
          await selectConversation(d.conversations[0].id, false);
        } else {
          await createNew();
        }
      } catch { /* retried below on next login */ }
    })();
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  /* ---------- conversation actions ---------- */
  const selectConversation = useCallback(
    async (id, push = true) => {
      try {
        const d = await api.getConversation(id);
        setActive(d.conversation);
        setMobileOpen(false);
        if (push) window.history.pushState({}, '', `/c/${id}`);
      } catch { /* ignore */ }
    },
    []
  );

  const createNew = useCallback(async () => {
    try {
      const d = await api.createConversation({});
      await loadConversations();
      await selectConversation(d.conversation.id, true);
    } catch { /* ignore */ }
  }, [loadConversations, selectConversation]);

  const delConversation = useCallback(
    async (id) => {
      try {
        await api.deleteConversation(id);
        if (active?.id === id) {
          setActive(null);
          window.history.pushState({}, '', '/');
        }
        await loadConversations();
      } catch { /* ignore */ }
    },
    [active, loadConversations]
  );

  const refreshActive = useCallback(async () => {
    if (!active) return;
    try {
      const d = await api.getConversation(active.id);
      setActive(d.conversation);
      setConversations((cs) => cs.map((c) => (c.id === active.id ? { ...d.conversation, messageCount: d.conversation.messages.length } : c)));
    } catch { /* ignore */ }
  }, [active]);

  /* popstate (back/forward) */
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/c\/([\w-]+)/);
      if (m) selectConversation(m[1], false);
      else setActive(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectConversation]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setAuthed(false);
    setActive(null);
    setConversations([]);
  }, []);

  /* ---------- gate ---------- */
  if (authed === null) {
    return (
      <div className="login-wrap">
        <div className="login-orb o1" /><div className="login-orb o2" />
        <div className="login-card" style={{ textAlign: 'center', padding: 60 }}>
          <span className="think-spinner" style={{ width: 22, height: 22, display: 'inline-block' }} />
          <p style={{ color: 'var(--text2)', fontSize: 13.5, margin: '18px 0 0' }}>Đang xác thực phiên…</p>
        </div>
      </div>
    );
  }
  if (!authed) return <Login onLogin={(u) => { setUsername(u); setAuthed(true); }} />;

  const busyId = conversations.find((c) => c.busy)?.id || null;
  const metaPatch = (patch) => {
    if (active?.id) {
      api.patchConversation(active.id, patch).then(loadConversations).catch(() => {});
      setActive((a) => (a ? { ...a, ...patch } : a));
      if (patch.toolsEnabled !== undefined || patch.engine !== undefined) {
        setConversations((cs) => cs.map((c) => (c.id === active.id ? { ...c, ...patch } : c)));
      }
    }
  };

  return (
    <div className="app">
      <div className="ambient" />
      <Sidebar
        collapsed={sideCollapsed}
        mobileOpen={mobileOpen}
        onToggleMobile={() => {
          if (window.innerWidth <= 860) setMobileOpen((v) => !v);
          else setSideCollapsed((v) => !v);
        }}
        conversations={conversations}
        activeId={active?.id || null}
        busyId={busyId}
        onSelect={(id) => selectConversation(id, true)}
        onNewChat={createNew}
        onDelete={delConversation}
        onLogout={logout}
        username={username}
        status={status}
      />
      <div className="main">
        <Chat
          conversation={active}
          engineOptions={status?.engine || { active: 'auto' }}
          onMetaChange={metaPatch}
          onListRefresh={loadConversations}
          onRefreshConversation={refreshActive}
          username={username}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import Ico from './icons.jsx';

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hôm qua';
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const ENGINES = {
  auto: { label: 'Auto', dot: 'ok' },
  cli: { label: 'Claude Code CLI', dot: 'ok' },
  api: { label: 'Anthropic API', dot: 'warn' },
  demo: { label: 'Demo', dot: 'err' },
};

export default function Sidebar({
  collapsed,
  mobileOpen,
  onToggleMobile,
  conversations,
  activeId,
  busyId,
  onSelect,
  onNewChat,
  onDelete,
  onLogout,
  username,
  status,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, query]);

  const engine = status?.engine;
  const eMeta = engine?.modes?.[engine.active];

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sb-head">
        <div className="sb-logo"><Ico name="bot" size={18} /></div>
        <div className="sb-title">
          Claude Code <b>Console</b>
          <small>sandbox · realtime</small>
        </div>
        <button className="sb-collapse" onClick={onToggleMobile} title={collapsed ? 'Mở sidebar' : 'Thu sidebar'}>
          <Ico name="menu" size={17} />
        </button>
      </div>

      <div className="sb-actions">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Ico name="plus" size={15} />
          Hội thoại mới
        </button>
      </div>

      <div className="sb-search">
        <div className="search-box">
          <Ico name="search" size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm hội thoại…"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="sb-list">
        {conversations.length > 0 && <div className="sb-section">Hội thoại</div>}
        {filtered.map((c, i) => (
          <div
            key={c.id}
            className={`convo-row${c.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(c.id)}
            style={{ animationDelay: `${Math.min(i * 0.03, 0.4)}s` }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
          >
            {busyId === c.id ? (
              <span className="think-spinner" style={{ margin: '0 3px' }} />
            ) : (
              <span className="convo-ico"><Ico name="chat" size={15} /></span>
            )}
            <span className="convo-main">
              <span className="convo-title">{c.title || 'Hội thoại mới'}</span>
              <span className="convo-time">{timeAgo(c.updatedAt)}</span>
            </span>
            <button
              className="convo-del"
              title="Xoá"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Xoá hội thoại này?')) onDelete(c.id);
              }}
            >
              <Ico name="trash" size={14} />
            </button>
          </div>
        ))}
        {!conversations.length && (
          <div className="sb-empty">
            <Ico name="spark" size={22} style={{ color: 'var(--brand-b)' }} />
            <p>Chưa có hội thoại nào.<br />Bấm <b>+ Hội thoại mới</b> để bắt đầu!</p>
          </div>
        )}
      </div>

      <div className="sb-footer">
        <div className="engine-chip" title={engine?.message || ''}>
          <span className={`engine-dot ${engine && eMeta?.ok ? 'ok' : 'warn'}`} />
          <span className="engine-name">{(engine && ENGINES[engine.active]?.label) || '…'}</span>
          <span className="engine-det">
            {engine?.active === 'demo' ? 'offline' : engine?.active === 'cli' ? engine?.modes?.cli?.detail || 'sandbox' : engine?.modes?.api?.detail?.replace('model ', '') || ''}
          </span>
        </div>
        <div className="sb-user">
          <div className="sb-avatar">{(username || 'A')[0].toUpperCase()}</div>
          <div className="sb-user-name">
            {username || 'admin'}
            <small>Administrator · online</small>
          </div>
          <button className="sb-logout" onClick={onLogout} title="Đăng xuất">
            <Ico name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

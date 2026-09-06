import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import Ico from './icons.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current?.focus();
    const t = setTimeout(() => userRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username.trim(), password);
      onLogin(res.username);
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-orb o1" />
      <div className="login-orb o2" />

      <div className={`login-card${shake ? ' shake' : ''}`}>
        <div className="brand-mark">
          <div className="brand-logo">
            <Ico name="bot" size={26} />
          </div>
          <div>
            <div className="brand-name">Claude Code <b>Console</b></div>
            <div className="brand-sub">Premium web terminal · sandbox-powered</div>
          </div>
        </div>

        <h1 className="login-title">Chào mừng trở lại 👋</h1>
        <p className="login-desc">
          Khu vực quản trị. Đăng nhập để điều khiển Claude Code chạy trong sandbox của máy chủ.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="lu">Tên đăng nhập</label>
            <div className="in-ico">
              <Ico name="user" size={16} />
              <input
                id="lu"
                ref={userRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lp">Mật khẩu</label>
            <div className="in-ico">
              <Ico name="lock" size={16} />
              <input
                id="lp"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="login-err">
              <Ico name="warn" size={15} />
              <span>{error}</span>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={busy || !username.trim() || !password} style={{ marginTop: 6 }}>
            {busy ? (
              <span className="think-spinner" style={{ borderTopColor: '#fff' }} />
            ) : (
              <Ico name="lock" size={15} />
            )}
            {busy ? 'Đang xác thực…' : 'Vào console'}
          </button>
        </form>

        <div className="login-hint">
          <Ico name="term" size={14} />
          <span>
            Quyền truy cập bị giới hạn — chỉ admin được vào. Nếu là lần chạy đầu tiên,
            mật khẩu tự sinh được in ở terminal máy chủ hoặc đặt qua <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>.env</code>
            {' '}(ADMIN_PASSWORD).
          </span>
        </div>
      </div>
    </div>
  );
}

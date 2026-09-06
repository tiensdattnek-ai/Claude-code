import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Ico from './icons.jsx';

export default function Composer({
  onSend,
  streaming,
  onStop,
  disabled,
  placeholder,
  toolsEnabled,
  onToggleTools,
}) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const taRef = useRef(null);
  const recognitionRef = useRef(null);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  useEffect(() => {
    if (!disabled) taRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        taRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value || streaming || disabled) return;
    onSend(value);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleMic = async () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Trình duyệt của bạn chưa hỗ trợ nhập liệu bằng giọng nói.');
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = (navigator.language || 'vi-VN').startsWith('vi') ? 'vi-VN' : navigator.language || 'vi-VN';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setRecording(true);
      rec.onend = () => setRecording(false);
      rec.onerror = () => setRecording(false);
      rec.onresult = (e) => {
        const t = e.results?.[0]?.[0]?.transcript;
        if (t) setText((v) => (v ? v + ' ' : '') + t);
      };
      rec.start();
    } catch {
      setRecording(false);
    }
  };

  const hasMic = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <div className="composer-zone">
      <div className="composer-inner">
        <div className={`composer-shell${disabled || streaming ? '' : ''}${disabled ? ' disabled' : ''}`}>
          <div className="composer-input">
            <textarea
              ref={taRef}
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={disabled ? '⏳ hội thoại đang xử lý ở nơi khác…' : streaming ? 'Claude Code đang trả lời…' : placeholder || 'Hỏi Claude Code bất cứ điều gì…'}
              disabled={disabled}
              spellCheck={false}
            />
            {streaming ? (
              <button className="send-btn stop" onClick={onStop} title="Dừng phản hồi">
                <Ico name="stop" size={17} />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={submit}
                disabled={disabled || !text.trim()}
                title="Gửi (Enter)"
              >
                <Ico name="send" size={17} />
              </button>
            )}
          </div>

          <div className="composer-tools">
            <button
              className={`c-icon-btn${toolsEnabled ? ' active' : ''}`}
              onClick={onToggleTools}
              title="Bật/tắt quyền dùng công cụ (Bash, Read, Write…) cho Claude trong sandbox"
            >
              <Ico name="term" size={16} />
            </button>
            {hasMic && (
              <button
                className={`c-icon-btn${recording ? ' recording' : ''}`}
                onClick={toggleMic}
                title="Nhập liệu bằng giọng nói"
              >
                <Ico name="mic" size={16} />
              </button>
            )}
            <div className="composer-hints">
              <span><span className="kbd">Enter</span> gửi</span>
              <span><span className="kbd">Shift</span>+<span className="kbd">Enter</span> xuống dòng</span>
              <span><span className="kbd">⌘/Ctrl</span>+<span className="kbd">K</span> focus</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

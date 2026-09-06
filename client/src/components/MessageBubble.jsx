import { memo, useState } from 'react';
import Markdown from './Markdown.jsx';
import Ico from './icons.jsx';

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const engineLabel = (e) => {
  if (e === 'cli') return 'Claude Code CLI';
  if (e === 'api') return 'API';
  if (e === 'demo') return 'demo';
  return 'claude';
};

const TOOL_ICON = {
  Bash: 'term',
  Write: 'pencil',
  Edit: 'pencil',
  Read: 'search',
  Glob: 'search',
  Grep: 'search',
  WebSearch: 'search',
  WebFetch: 'search',
  Task: 'bolt',
  TodoWrite: 'check',
  NotebookRead: 'search',
};

export const UserMessage = memo(function UserMessage({ m }) {
  return (
    <div className="msg msg-user">
      <div className="avatar-col" />
      <div>
        <div className="bubble-user">
          {m.content}
          <div className="msg-meta-mini">
            <span>{(m.engine === 'cli' || m.engine === 'api' || m.engine === 'demo') ? engineLabel(m.engine) : 'bạn'}</span>
            {fmtTime(m.ts) && <span>{fmtTime(m.ts)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
});

export const AssistantMessage = memo(function AssistantMessage({ m, streaming }) {
  const [copied, setCopied] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const tools = m.toolCalls || [];

  const copy = async () => {
    try { await navigator.clipboard.writeText(m.content || ''); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const retryReq = m.id;

  return (
    <div className="msg msg-ai">
      <div className="avatar-col">
        <div className={`msg-avatar${streaming ? ' streaming' : ''}`}>
          {streaming ? <Ico name="spark" size={16} /> : <Ico name="bot" size={16} />}
        </div>
      </div>
      <div className="msg-ai-body">
        <div className="ai-head">
          <span className="who">Claude <b>Code</b></span>
          {m.engine && <span className="engine-tag"><b>◆</b>{engineLabel(m.engine)}</span>}
          {m.model && <span className="engine-tag">{m.model}</span>}
          <span className="ai-time">{fmtTime(m.ts)}</span>
        </div>

        {(tools.length > 0 || streaming) && (
          <div className="tool-strip">
            {tools.slice(0, 6).map((t) => (
              <ToolChip key={t.id || t.ts} tool={t} />
            ))}
            {tools.length > 6 && (
              <button
                className="tool-chip"
                style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                onClick={() => setShowTools((v) => !v)}
              >
                + {tools.length - 6} tool call nữa
              </button>
            )}
            {showTools && tools.slice(6).map((t) => <ToolChip key={t.id || t.ts} tool={t} />)}
          </div>
        )}

        {streaming && !m.content && (
          <div className="think-strip">
            <div className="think-line">
              <span className="think-spinner" />
              {m.statusText || 'đang suy nghĩ & thao tác trong sandbox…'}
              <span className="think-dots"><i /><i /><i /></span>
            </div>
          </div>
        )}

        {(m.content || !streaming) && (
          <div className="ai-panel">
            <Markdown content={m.content || ''} className="md" />
            {streaming && <span className="stream-caret" />}
          </div>
        )}

        {m.error && (
          <div className="msg-err">
            <Ico name="warn" size={15} style={{ flex: 'none', marginTop: 2 }} />
            <span>{m.error}</span>
          </div>
        )}

        {!streaming && m.content && (
          <div className="ai-foot">
            <span className="spacer" />
            {!m.error && (
              <button className={`copy-btn${copied ? ' on' : ''}`} onClick={copy}>
                {copied ? <Ico name="check" size={13} /> : <Ico name="copy" size={13} />}
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </button>
            )}
            <button className="retry-btn" onClick={() => window.dispatchEvent(new CustomEvent('ccw:retry', { detail: { messageId: retryReq } }))}>
              <Ico name="refresh" size={13} />
              Thử lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function ToolChip({ tool }) {
  const [open, setOpen] = useState(false);
  const name = tool.name || 'tool';
  const IconName = TOOL_ICON[name] || 'bolt';
  const state = tool.state || 'done';
  const stateCls = state === 'done' ? 'done' : state === 'err' ? 'err' : 'spin';
  const isRun = state === 'run';
  const doneOrErr = state === 'done' || state === 'err';

  return (
    <div className="tool-history">
      <div
        className={`tool-chip${open ? ' expanded' : ''}`}
        onClick={() => tool.brief && setOpen((v) => !v)}
        title={tool.brief ? (open ? 'Thu lại' : 'Xem chi tiết') : undefined}
        role={tool.brief ? 'button' : undefined}
        tabIndex={tool.brief ? 0 : undefined}
      >
        <span className="tc-state">
          <span className={`s-ico ${stateCls}`}>
            {isRun ? <Ico name="refresh" size={11} /> : doneOrErr ? <Ico name="check" size={11} /> : <Ico name={IconName} size={11} />}
          </span>
          <span className="tc-name">{name}</span>
        </span>
        {tool.brief && <span className="tc-brief">{tool.brief}</span>}
        <span className="tc-spacer" />
        {tool.brief && <span className="tc-arrow" />}
      </div>
      {open && tool.brief && (
        <div className="tool-output">{tool.brief}</div>
      )}
    </div>
  );
}

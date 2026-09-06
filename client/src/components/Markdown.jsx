import { useState } from 'react';
import Ico from './icons.jsx';

/* ==================================================================== */
/*  Markdown renderer (custom, dependency-free).                        */
/*  Headings, paragraphs, emphasis, lists, tables, blockquotes, code,   */
/*  inline code, links, hr, strikethrough.                              */
/* ==================================================================== */

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

function linkify(text) {
  // bare URLs without an enclosing link
  return text.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)/g, (m, pre, url) => {
    const trimmed = url.replace(/[.,;:!?)]+$/, '');
    return `${pre}<a href="${escAttr(trimmed)}" target="_blank" rel="noreferrer">${esc(trimmed)}</a>${url.slice(trimmed.length)}`;
  });
}

function inline(text) {
  let out = esc(text);

  // escape already-inserted links from linkify later; do emphasis first instead:
  // simple pipeline: code -> bold -> italic -> strike -> links
  out = out.replace(/`([^`\n]+)`/g, (_, code) => `<c>${code}</c>`);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/__([^_\n]+)__/g, '<b>$1</b>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<i>$2</i>');
  out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => `<a href="${escAttr(url)}" target="_blank" rel="noreferrer">${label}</a>`
  );
  return linkify(out);
}

/* ---- Table of contents splitter ------------------------------------ */
function tokenize(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let listStack = []; // ['ul'|'ol']

  const flushList = () => {
    if (!listStack.length) return;
    for (let k = listStack.length - 1; k >= 0; k--) {
      blocks.push({ type: 'close_list', tag: listStack[k] });
    }
    listStack = [];
  };
  const closeTo = (target) => {
    while (listStack.length && listStack[listStack.length - 1] !== target) {
      blocks.push({ type: 'close_list', tag: listStack.pop() });
    }
  };

  while (i < lines.length) {
    let line = lines[i];
    const next = () => (i < lines.length - 1 ? lines[i + 1] : null);

    // fenced code
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/);
    if (fence) {
      flushList();
      const lang = fence[2];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('~~~')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', lang, code: buf.join('\n') });
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      blocks.push({ type: 'heading', level: h[1].length, html: inline(h[2]) });
      i++;
      continue;
    }

    // hr
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushList();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // blockquote (collect consecutive)
    if (line.trim().startsWith('>')) {
      flushList();
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', html: inline(buf.join('\n')) });
      continue;
    }

    // table: header row then separator
    const tableSep = /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line) && /^\s*\|/.test(line) && /^\s*\|?[^\|]*\|[^\|]*\|?\s*$/.test(line);
    if (line.includes('|') && next() && /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(next()) && line.trim().startsWith('|')) {
      flushList();
      const headCells = line.split('|').slice(1, -1).map((s) => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].includes('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map((s) => s.trim()));
        i++;
      }
      blocks.push({ type: 'table', head: headCells, rows });
      continue;
    }

    // unordered list
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    // ordered list
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);

    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      const content = (ul || ol)[1];
      const isTight = content === '' || !next() || !/^\s*[-*+]\s|^\s*\d+\.\s/.test(next() || '');
      if (!listStack.length) {
        blocks.push({ type: 'open_list', tag });
        listStack.push(tag);
      } else if (listStack[listStack.length - 1] !== tag) {
        closeTo(tag === 'ul' ? 'ul' : 'ol');
        if (listStack[listStack.length - 1] !== tag) {
          blocks.push({ type: 'open_list', tag });
          listStack.push(tag);
        }
      }
      // nested list continuation on same item
      if (/^\s{2,}[-*+]\s/.test(line)) {
        blocks.push({ type: 'list_item', html: '', nested: true });
      }
      const itemHtml = content
        ? (() => {
            const s = content.trim();
            const m = s.match(/^\[([ xX])\]\s+(.*)$/);
            if (m) {
              const done = m[1] !== ' ';
              return `<task ${done ? 'done' : ''}>${inline(m[2])}</task>`;
            }
            return inline(s);
          })()
        : '';
      blocks.push({ type: 'list_item', html: itemHtml, tight: isTight });
      i++;
      continue;
    }

    // paragraph / blank handling
    if (line.trim() === '') {
      flushList();
      i++;
      continue;
    }

    flushList();
    // paragraph: accumulate until blank or block-start
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*(#{1,6}\s|```|~~~|>|[-*+]\s|\d+\.\s)/.test(lines[i]) &&
      !(lines[i].includes('|') && /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(lines[i + 1] || ''))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', html: inline(para.join('\n')) });
  }
  flushList();
  return blocks;
}

/* ---- React renderer ------------------------------------------------ */
function Renderer({ blocks, className }) {
  const rows = [];
  let listTag = null;
  let openListKey = null;
  let listItems = [];
  let inList = false;

  const flushList = (keyBase) => {
    if (!inList) return;
    rows.push(
      listTag === 'ul' ? (
        <ul className="md-ul" key={`${keyBase}-ul`}>
          {listItems.map((it, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: it.html }} className={it.nested ? 'nested' : ''} />
          ))}
        </ul>
      ) : (
        <ol className="md-ol" key={`${keyBase}-ol`}>
          {listItems.map((it, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: it.html }} />
          ))}
        </ol>
      )
    );
    listItems = [];
    listTag = null;
    inList = false;
  };

  blocks.forEach((b, idx) => {
    switch (b.type) {
      case 'open_list':
        inList = true;
        listTag = b.tag;
        break;
      case 'close_list':
        flushList(idx);
        break;
      case 'list_item':
        if (!inList) {
          inList = true;
          listTag = /^-|^\*/.test('') ? 'ul' : 'ul';
        }
        listItems.push({ html: b.html, nested: b.nested });
        break;
      case 'p':
        flushList(idx);
        rows.push(<p key={idx} dangerouslySetInnerHTML={{ __html: b.html }} />);
        break;
      case 'heading':
        flushList(idx);
        rows.push(
          <div key={idx} className={`md-h h${b.level}`}>
            <span className="md-anchor" />
            <span dangerouslySetInnerHTML={{ __html: b.html }} />
          </div>
        );
        break;
      case 'code':
        flushList(idx);
        rows.push(<CodeBlock key={idx} lang={b.lang} code={b.code} />);
        break;
      case 'table':
        flushList(idx);
        rows.push(
          <div className="md-table-wrap" key={idx}>
            <table className="md-table">
              <thead>
                <tr>{b.head.map((c, k) => <th key={k} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, k2) => <td key={k2} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        break;
      case 'quote':
        flushList(idx);
        rows.push(<blockquote key={idx} dangerouslySetInnerHTML={{ __html: b.html }} />);
        break;
      case 'hr':
        flushList(idx);
        rows.push(<hr key={idx} />);
        break;
      default:
        break;
    }
  });
  flushList('final');

  return <div className={className || 'md'}>{rows}</div>;
}

/* ---- Code block with copy + download -------------------------------- */
function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const doDownload = () => {
    const ext = { js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts', py: 'py', sh: 'sh', bash: 'sh', json: 'json', html: 'html', css: 'css', jsx: 'jsx', tsx: 'tsx', sql: 'sql', md: 'md', go: 'go', rs: 'rs', java: 'java', c: 'c', cpp: 'cpp', rb: 'rb', yaml: 'yaml', yml: 'yaml' }[lang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `claude-answer.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="codeblock-lang">{lang || 'text'}</span>
        <span className="codeblock-actions">
          <button className="mini-btn" onClick={doDownload} title="Tải file xuống">
            <Ico name="download" size={14} />
          </button>
          <button className="mini-btn" onClick={doCopy} title="Sao chép">
            {copied ? <Ico name="check" size={14} /> : <Ico name="copy" size={14} />}
            <span>{copied ? 'Đã chép' : 'Copy'}</span>
          </button>
        </span>
      </div>
      <pre className="codeblock-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Markdown({ content, className }) {
  const blocks = tokenize(content || '');
  return <Renderer blocks={blocks} className={className} />;
}

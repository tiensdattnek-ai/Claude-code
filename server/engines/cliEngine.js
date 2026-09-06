import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { stripMarkdown, nowIso, log } from '../util.js';

/* ==================================================================== */
/*  Engine: claude CLI — every chat runs as a real Claude Code agent    */
/*  INSIDE this machine / sandbox.                                      */
/* ==================================================================== */

let availability = null; // null = probing, {ok:boolean, reason:string} = resolved

function probe(onDone) {
  execFile(config.claudeCliBin, ['--version'], { timeout: 12000 }, (err, stdout) => {
    if (err || !stdout) {
      availability = { ok: false, reason: `${config.claudeCliBin} not found or not runnable (${err?.message || 'no version output'}).` };
    } else {
      availability = { ok: true, version: String(stdout).trim().split('\n')[0], reason: null };
      log.ok(`cli engine ready · ${config.claudeCliBin} ${availability.version}`);
    }
    if (onDone) onDone(availability);
  });
}

export function getAvailability() {
  if (availability === null) {
    availability = { ok: false, probing: true, reason: 'probing…' };
    probe();
  }
  return availability;
}

export function isConfigured() {
  return !!(config.claudeCliBin);
}

/* ------------------------------------------------------------------ */
/*  Clean raw CLI bytes into parseable text lines.                     */
/* ------------------------------------------------------------------ */
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const clean = (buf) =>
  String(buf).replace(OSC_RE, '\n').replace(CSI_RE, '').replace(/\r/g, '');

const normWs = (s) => String(s).replace(/\s+/g, ' ').trim();

/**
 * The CLI delivers the same answer twice: `stream_event` text deltas on
 * stderr AND a full assistant message on stdout (which repeats everything,
 * including what the deltas already streamed). Merge pieces so nothing is
 * duplicated while preserving whitespace for code blocks / markdown.
 *
 *   - exact normalized duplicate ending → drop the incoming piece
 *   - incoming piece whose head overlaps the content tail → drop the head
 *   - otherwise append raw
 */
function mergeText(content, incoming) {
  const b = String(incoming || '');
  if (!b.trim()) return { content, appended: '' };
  const nc = normWs(content);
  const nb = normWs(b);
  if (nc.endsWith(nb)) return { content, appended: '' }; // whole-piece duplicate

  const max = Math.min(nc.length, nb.length);
  let overlap = 0;
  for (let K = max; K >= 1; K--) {
    if (nc.endsWith(nb.slice(0, K))) { overlap = K; break; }
  }
  if (!overlap) return { content: content + b, appended: b };

  // map the overlapping prefix (normalized chars) back to a raw offset in b
  let units = 0;
  let i = 0;
  let prevWs = false;
  for (; i < b.length && units < overlap; i++) {
    const ws = /\s/.test(b[i]);
    if (ws) { if (!prevWs) units += 1; } else units += 1;
    prevWs = ws;
  }
  const remainder = b.slice(i);
  return { content: content + remainder, appended: remainder };
}

/**
 * Parse one JSON object that may be buried in ANSI noise on a line.
 */
function tryParseJson(text) {
  try {
    const start = text.indexOf('{');
    if (start === -1) return null;
    const obj = JSON.parse(text.slice(start));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Execute one user turn as a headless Claude Code agent.             */
/*  resume: prior CLI session id for true multi-turn continuity        */
/* ------------------------------------------------------------------ */
export async function execute({ userMessage, history = [], toolsEnabled = false, onEvent, resume = null, signal = null }) {
  // When resuming a live CLI session the conversation already exists on the
  // agent side, so no transcript is needed (and it would duplicate context).
  const transcript = resume
    ? ''
    : history
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${stripMarkdown(String(m.content || ''))}`)
        .join('\n\n');

  const args = ['-p'];
  if (config.cliModel) args.push('--model', config.cliModel);
  args.push('--output-format', 'json');
  if (resume) args.push('--resume', resume);
  if (toolsEnabled) {
    args.push('--allowedTools', config.allowedTools);
    args.push('--max-turns', String(config.cliMaxTurns));
  }
  args.push('--dangerously-skip-permissions');
  if (!toolsEnabled) args.push('--max-turns', '1');
  args.push('--verbose', '2');

  const parts = [];
  if (transcript) {
    parts.push(
      '<transcript>',
      'This is an existing conversation that already happened. Treat its context as part of the current session, and answer the new message below.',
      transcript,
      '</transcript>'
    );
  }
  parts.push(userMessage);

  const prompt = parts.join('\n\n');
  if (transcript) log.ok(`cli turn · resume=${resume ? 'yes' : 'no'} · history=${history.length} msgs · len=${prompt.length}ch`);
  else log.ok(`cli turn · fresh session · len=${prompt.length}ch`);

  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeCliBin, args, {
      cwd: config.workdir,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let outBuf = '';
    let errBuf = '';
    let content = '';
    let statusSent = false;
    let sawToolUse = false;
    let toolResultNames = [];
    let timedKill = null;

    const failTimer = setTimeout(() => {
      log.warn('cli turn timed out (>5 min) — killing agent');
      child.kill('SIGKILL');
    }, 5 * 60 * 1000);

    const emit = (type, payload) => {
      try { onEvent?.({ type, ...payload, ts: nowIso() }); } catch { /* sink may be closed */ }
    };

    const handleLine = (line, stream) => {
      const cleaned = clean(line).trim();
      if (!cleaned || cleaned.startsWith('\x1b')) return;
      const obj = tryParseJson(cleaned);
      if (!obj) return;

      // system init → capture the CLI session id (needed for --resume later)
      if (obj.type === 'system' && obj.subtype === 'init' && obj.session_id && !statusSent) {
        statusSent = true;
        emit('status', { message: 'agent ready' });
        emit('meta', { sessionId: obj.session_id });
        return;
      }

      if (obj.type === 'assistant' && obj.message) {
        const msg = obj.message;
        const textPart = (msg.content || [])
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n');
        if (textPart.trim()) {
          const merged = mergeText(content, textPart);
          if (merged.appended) {
            content = merged.content;
            emit('text', { text: merged.appended });
          }
        }
        const toolUses = (msg.content || []).filter((p) => p.type === 'tool_use');
        for (const tu of toolUses) {
          sawToolUse = true;
          const cmd = tu.input?.command || tu.input?.file_path || tu.input?.pattern || JSON.stringify(tu.input || {}).slice(0, 160);
          const name = tu.name || 'tool';
          emit('tool', { id: tu.id, name, action: 'start', brief: String(cmd).slice(0, 300) });
          if (name === 'Task') toolResultNames.push('Task');
          else if (name === 'Bash') toolResultNames.push('Bash');
          else toolResultNames.push(name);
        }
      } else if (obj.type === 'user' && obj.message) {
        const results = (obj.message.content || []).filter((p) => p.type === 'tool_result');
        for (const r of results) {
          const out = Array.isArray(r.content)
            ? r.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('\n')
            : String(r.content || '');
          emit('tool', {
            id: r.tool_use_id,
            name: toolResultNames.shift() || 'tool',
            action: 'end',
            outcome: r.is_error ? 'error' : 'success',
            brief: out.slice(0, 1600),
          });
        }
      } else if (obj.type === 'stream_event' && obj.event) {
        const ev = obj.event;
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          const merged = mergeText(content, ev.delta.text);
          if (merged.appended) {
            content = merged.content;
            emit('text', { text: merged.appended });
          }
        }
      } else if (obj.type === 'error' && obj.error) {
        const errText = obj.error.message || obj.error.type || JSON.stringify(obj.error);
        emit('status', { message: String(errText).slice(0, 200) });
      }
    };

    child.stdout.on('data', (d) => {
      outBuf += d.toString();
      let idx;
      while ((idx = outBuf.indexOf('\n')) !== -1) {
        const line = outBuf.slice(0, idx);
        outBuf = outBuf.slice(idx + 1);
        try { handleLine(line, 'out'); } catch { /* skip malformed */ }
      }
    });

    child.stderr.on('data', (d) => {
      errBuf += d.toString();
      const cleanedChunk = clean(d.toString());
      for (const line of cleanedChunk.split('\n')) {
        try { handleLine(line, 'err'); } catch { /* skip malformed */ }
      }
    });

    child.on('error', (err) => {
      clearTimeout(failTimer);
      if (err.code === 'ENOENT') {
        availability = { ok: false, reason: `${config.claudeCliBin} is not installed.` };
      }
      reject(new Error(`${config.claudeCliBin} could not be started: ${err.message}`));
    });

    const onAbort = () => {
      log.warn('cli turn aborted by client disconnect — killing agent');
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500).unref();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('close', (code) => {
      clearTimeout(failTimer);
      signal?.removeEventListener('abort', onAbort);
      const final = content.trim();

      if (code === 0 && final) {
        resolve({ ok: true, text: final });
      } else if (code === 0 && !final) {
        resolve({ ok: true, text: '' }); // agent decided no textual answer
      } else {
        // Gather the most human-readable reason from either stream.
        const stderrTail = clean(errBuf).split('\n').filter(Boolean).slice(-6).join(' ');
        const stdoutTail = clean(outBuf).split('\n').filter(Boolean).slice(-3).join(' ');
        const reason =
          stderrTail.replace(/.*?(error|Error)[:\s].*/i, '$&').slice(0, 400) ||
          stdoutTail.slice(0, 400) ||
          `agent exited with code ${code}`;
        resolve({ ok: false, error: reason.slice(0, 600) });
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Warm availability check at server boot (non-blocking). */
export function warmup() {
  if (availability === null) getAvailability();
}

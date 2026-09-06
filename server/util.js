import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/* ------------------------------------------------------------------ */
/* Tiny console logger with leveled colors                             */
/* ------------------------------------------------------------------ */
const paint = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
export const log = {
  info: (...a) => console.log(paint('36', '[web]'), ...a),
  ok: (...a) => console.log(paint('32', '[web]'), ...a),
  warn: (...a) => console.log(paint('33', '[web]'), ...a),
  err: (...a) => console.error(paint('31', '[web]'), ...a),
};

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */
export const uid = (prefix = '') =>
  prefix + crypto.randomBytes(9).toString('base64url');

export const nowIso = () => new Date().toISOString();

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Constant-time string comparison (safe against timing attacks). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Write a JSON file atomically (tmp file + rename). */
export function writeJsonAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function prettyUsd(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return '$' + (n < 0.001 ? n.toFixed(5) : n.toFixed(4)).replace(/0+$/, '').replace(/\.$/, '.0');
}

export function prettyTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/* ------------------------------------------------------------------ */
/* Markdown->plain-text used to build the CLI transcript                */
/* ------------------------------------------------------------------ */
export function stripMarkdown(md = '') {
  return String(md)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*/gm, '').replace(/^```$/gm, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*|__|\*|_|~~/g, '')
    .trim();
}

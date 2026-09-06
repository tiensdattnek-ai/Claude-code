import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log, safeEqual, readJson, writeJsonAtomic, uid } from './util.js';

/* ==================================================================== */
/*  Sessions — in-memory map, mirrored to disk so sign-ins survive      */
/*  server restarts. Signed random ids live in an httpOnly cookie.      */
/* ==================================================================== */
const sessionsFile = () => path.join(config.dataDir, 'sessions.json');
const sessions = new Map();

export function bootstrapAuth() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  loadSessions();
  admin = loadOrCreateAdmin();
  pruneExpired();
  log.ok(`auth ready · admin "${admin.username}" · ${sessions.size} session(s) restored`);
  return admin;
}

function loadSessions() {
  const data = readJson(sessionsFile(), []);
  if (!Array.isArray(data)) return;
  for (const s of data) {
    if (s && s.id && s.expiresAt > Date.now()) sessions.set(s.id, s);
  }
}

let persistTimer = null;
function persistSessions() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      writeJsonAtomic(
        sessionsFile(),
        [...sessions.values()].map(({ id, username, createdAt, expiresAt }) => ({
          id, username, createdAt, expiresAt,
        }))
      );
    } catch (e) {
      log.err('failed to persist sessions:', e.message);
    }
  }, 400);
}

function pruneExpired() {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) { sessions.delete(id); changed = true; }
  }
  if (changed) persistSessions();
}

export function createSession(username) {
  pruneExpired();
  const sid = crypto.randomBytes(24).toString('base64url');
  const createdAt = Date.now();
  sessions.set(sid, { id: sid, username, createdAt, expiresAt: createdAt + config.sessionTtlMs });
  persistSessions();
  return sid;
}

export function getSession(sid) {
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(sid);
    persistSessions();
    return null;
  }
  // sliding expiration
  s.expiresAt = Date.now() + config.sessionTtlMs;
  return s;
}

export function destroySession(sid) {
  if (sessions.delete(sid)) persistSessions();
}

/* ==================================================================== */
/*  Admin identity                                                      */
/* ==================================================================== */
let admin = null;

function scryptHash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function scryptVerify(pw, stored) {
  try {
    const [tag, salt, hash] = String(stored).split('$');
    if (tag !== 'scrypt' || !salt || !hash) return false;
    const derived = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    return safeEqual(derived, hash);
  } catch {
    return false;
  }
}

function loadOrCreateAdmin() {
  const username = config.adminUsername || 'admin';

  // 1. explicit env password — highest priority
  if (config.adminPassword) {
    return { username, verify: (pw) => safeEqual(pw, config.adminPassword) };
  }
  // 2. explicit env hash
  if (config.adminPasswordHash) {
    return { username, verify: (pw) => scryptVerify(pw, config.adminPasswordHash) };
  }
  // 3. persisted secrets (from a previous boot)
  const secretsFile = path.join(config.dataDir, 'secrets.json');
  const secrets = readJson(secretsFile, {});
  if (secrets.adminPasswordHash) {
    return { username, verify: (pw) => scryptVerify(pw, secrets.adminPasswordHash) };
  }
  // 4. first boot → generate a strong random password and print it once
  const plain = crypto.randomBytes(6).toString('base64url'); // 8 chars, url-safe
  const hash = scryptHash(plain);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify({ adminPasswordHash: hash }, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (e) {
    log.err('could not store admin secrets:', e.message);
  }
  const banner = [
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    '  │  FIRST BOOT — auto-generated admin credentials               │',
    '  │                                                              │',
    `  │  username : ${(username + ' '.repeat(Math.max(0, 52 - username.length)))}│`,
    `  │  password : ${(plain + ' '.repeat(Math.max(0, 52 - plain.length)))}│`,
    '  │                                                              │',
    '  │  Set ADMIN_USERNAME / ADMIN_PASSWORD in .env to override.    │',
    '  └──────────────────────────────────────────────────────────────┘',
    '',
  ].join('\n');
  console.log('\x1b[33m' + banner + '\x1b[0m');
  return { username, verify: (pw) => scryptVerify(pw, hash) };
}

export const getAdmin = () => admin;

/* ==================================================================== */
/*  Login brute-force protection (per IP + per username)                */
/* ==================================================================== */
const attempts = new Map();
const WINDOW = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function attemptKey(ip, username) {
  return `${ip}::${String(username).toLowerCase()}`;
}

export function isLocked(ip, username) {
  const rec = attempts.get(attemptKey(ip, username));
  return !!(rec && rec.lockUntil && rec.lockUntil > Date.now());
}

export function lockRemainingMs(ip, username) {
  const rec = attempts.get(attemptKey(ip, username));
  return rec?.lockUntil ? Math.max(0, rec.lockUntil - Date.now()) : 0;
}

export function registerFailure(ip, username) {
  const key = attemptKey(ip, username);
  const rec = attempts.get(key) || { count: 0, lockUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockUntil = Date.now() + 60 * 1000;
    rec.count = 0;
  }
  attempts.set(key, rec);
  setTimeout(() => {
    const cur = attempts.get(key);
    if (cur && (cur.count === 0 || Date.now() - (cur.lockUntil || Date.now()) > WINDOW)) attempts.delete(key);
  }, WINDOW);
}

export function registerSuccess(ip, username) {
  attempts.delete(attemptKey(ip, username));
}

/* ==================================================================== */
/*  Express helpers                                                     */
/* ==================================================================== */
export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const SESSION_COOKIE = 'ccw_sid';

export function setSessionCookie(res, sid) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function currentUser(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  const s = sid ? getSession(sid) : null;
  return s ? { sid, username: s.username } : null;
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Sign in required.' });
  req.user = user;
  next();
}

export { uid };

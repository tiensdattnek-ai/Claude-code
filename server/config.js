import 'dotenv/config';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const hoursToMs = (v, d) => int(v, d) * 3600 * 1000;

export const config = {
  root: ROOT,
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  // --- admin ---
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || null,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || null,
  sessionTtlMs: hoursToMs(process.env.SESSION_TTL_HOURS, 12),

  // --- engine ---
  engine: String(process.env.ENGINE || 'auto').toLowerCase(),
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_WEB_API_KEY || null,
  apiBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
  apiModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
  apiMaxTokens: int(process.env.API_MAX_TOKENS, 8192),

  claudeCliBin: process.env.CLAUDE_CLI_BIN || 'claude',
  cliModel: process.env.CLAUDE_CLI_MODEL || process.env.CLAUDE_MODEL || null,
  cliMaxTurns: int(process.env.CLI_MAX_TURNS, 30),
  allowedTools: process.env.ALLOWED_TOOLS || 'Bash,Edit,Write,Read,Glob,Grep,WebSearch,WebFetch',
  workdir: process.env.WORKDIR ? path.resolve(process.env.WORKDIR) : ROOT,

  // --- limits / storage ---
  maxMessageChars: int(process.env.MAX_MESSAGE_CHARS, 60000),
  maxHistoryChars: int(process.env.MAX_HISTORY_CHARS, 120000),
  dataDir: path.resolve(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')),
  clientDist: path.join(ROOT, 'client', 'dist'),
};

export const SUPPORTED_ENGINES = ['auto', 'cli', 'api', 'demo'];

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { log, nowIso, uid, readJson, writeJsonAtomic } from '../util.js';
import { MENOS_SEEDS, MENOS_GROUPS, MENOS_VERSION } from './menos-knowledge.js';

/* ==================================================================== */
/*  Engine: MENOS — bộ não tri thức cục bộ, "trainable", đọc mã nguồn.  */
/*  - Retrieval: chuẩn hóa tiếng Việt (bỏ dấu) + chấm điểm token theo    */
/*    trường (title/tags/id/content). Không cần model, không cần mạng.   */
/*  - Trainable: bài học mới từ người dùng lưu data/menos-brain.json     */
/*    (gitignored) — nạp lại nóng, không đụng file seed gốc.              */
/*  - Đọc mã nguồn: hỏi về đường dẫn file trong workdir → Menos đọc và   */
/*    tóm tắt cấu trúc file (imports, exports, hàm/lớp, số dòng).        */
/* ==================================================================== */

/* ------------------------- text utilities --------------------------- */

/** lowercase + bỏ dấu + bỏ ký tự lạ → từ điển token ASCII */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+#.\-_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(
  ('va la cua voi cho duoc khong toi ban lam sao the nao nhu nao cai nao ay thi nen se da dang tai trong tren duoi ' +
    've bang cach qua rat hieu ve gi nay do day giup ho hoan thanh viet cai tao cho toi ve ho ' +
    'the a an is are of to in on for with how what why when where do does can could should would will i you it its this that there please explain tell me about my your').split(' ').map(normalize)
);

function tokenize(norm) {
  const raw = norm.split(' ').filter(Boolean);
  const out = [];
  for (const t of raw) {
    if (t.length < 2 && !/^[a-z]$/.test(t)) continue; // giữ "js" "go" "c" "r"
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

/* ------------------------------ indexing ---------------------------- */

function indexSeed(seed) {
  const titleTokens = tokenize(normalize(seed.title));
  const tagTokens = tokenize(normalize((seed.tags || []).join(' ')));
  const idTokens = tokenize(normalize(String(seed.id).replace(/[-_]/g, ' ')));
  const bodyMap = new Map();
  for (const ln of seed.content) {
    for (const tk of tokenize(normalize(ln))) bodyMap.set(tk, (bodyMap.get(tk) || 0) + 1);
  }
  return {
    seed,
    titleNorm: normalize(seed.title),
    titleSet: new Set(titleTokens),
    tagSet: new Set(tagTokens),
    idSet: new Set(idTokens),
    body: bodyMap,
    bodyLen: seed.content.reduce((s, l) => s + l.length, 0),
  };
}

let INDEX = [];
let learned = [];
let DF = new Map(); // document frequency của từng token trong corpus
let CORPUS = 1;

const brainFile = () => path.join(config.dataDir, 'menos-brain.json');

function rebuildIndex() {
  const all = [...MENOS_SEEDS, ...learned.map((l) => ({ ...l, learned: true }))];
  INDEX = all.map(indexSeed);
  DF = new Map();
  for (const idx of INDEX) {
    const uniq = new Set([...idx.titleSet, ...idx.tagSet, ...idx.idSet, ...idx.body.keys()]);
    for (const t of uniq) DF.set(t, (DF.get(t) || 0) + 1);
  }
  CORPUS = INDEX.length;
}

/** Trọng số idf: token xuất hiện ở nhiều chủ đề (quán, tạo, ...) gần như vô giá trị. */
function idf(token) {
  return Math.log(1 + (0.5 + CORPUS) / (0.5 + (DF.get(token) || CORPUS)));
}

export function menosInit() {
  const data = readJson(brainFile(), []);
  learned = Array.isArray(data) ? data.filter((s) => s && s.id && s.title && Array.isArray(s.content)) : [];
  rebuildIndex();
  log.ok(`menos brain ready · ${MENOS_SEEDS.length} chủ đề seed + ${learned.length} đã học · v${MENOS_VERSION}`);
}

/** Học thêm một chủ đề (persist vào data/menos-brain.json). */
export function menosLearn({ title, content, tags = [], note = null }) {
  const t = String(title || '').trim().slice(0, 120);
  if (!t) throw new Error('Thiếu "title" cho chủ đề học.');
  const lines = (Array.isArray(content) ? content : String(content || '').split('\n'))
    .map((x) => String(x).replace(/\s+$/, ''))
    .filter((x) => x.trim().length > 0);
  if (!lines.length) throw new Error('Nội dung "content" rỗng.');
  const seed = {
    id: uid('learned_'),
    title: t,
    group: 'learned',
    tags: [...new Set((tags.length ? tags : t.toLowerCase().split(/[^a-z0-9#]+/i)).map((x) => String(x).toLowerCase().trim()).filter(Boolean))].slice(0, 24),
    content: lines.slice(0, 400),
    learnedAt: nowIso(),
    note: note ? String(note).slice(0, 200) : undefined,
  };
  learned.push(seed);
  writeJsonAtomic(brainFile(), learned);
  rebuildIndex();
  return { ok: true, seed: { ...seed, content: undefined, contentLines: lines.length } };
}

export function menosStats() {
  const by = {};
  for (const g of MENOS_GROUPS) by[g.id] = { label: g.label, count: 0 };
  by.learned = { label: 'Đã học thêm', count: 0 };
  for (const s of INDEX) {
    const g = s.seed.group || 'learned';
    if (!by[g]) by[g] = { label: g, count: 0 };
    by[g].count += 1;
  }
  return {
    version: MENOS_VERSION,
    topics: INDEX.length,
    seeds: MENOS_SEEDS.length,
    learned: learned.length,
    groups: by,
    brainFile: path.relative(config.root, brainFile()),
    engine: 'menos',
  };
}

/* ------------------------------ retrieval --------------------------- */

function scoreQuery(qTokens, qSet, norm, idx) {
  let score = 0;
  let tagHits = 0;
  for (const tk of new Set(qTokens)) {
    const w = idf(tk);
    if (idx.tagSet.has(tk)) { score += 6 * w; tagHits++; }
    else if (idx.titleSet.has(tk)) score += 5 * w;
    else if (idx.idSet.has(tk)) score += 4 * w;
    const tf = idx.body.get(tk);
    if (tf) score += Math.min(tf, 3) * w; // body nhẹ: dễ nhiễu
  }
  // độ phủ query chỉ tính cho token phân biệt tốt (idf cao)
  let hits = 0;
  let total = 0;
  for (const tk of qSet) {
    const w = idf(tk);
    if (w < 1.5) continue;
    total += w;
    if (idx.tagSet.has(tk) || idx.titleSet.has(tk) || idx.idSet.has(tk) || idx.body.has(tk)) hits += w;
  }
  if (total > 0) score += (hits / total) * 6;
  // khớp nguyên cụm tiêu đề = chủ đề chính xác
  if (norm.length > 4 && idx.titleNorm.includes(norm)) score += 40;
  for (const tag of idx.seed.tags || []) {
    const nt = normalize(tag);
    if (nt.length > 3 && norm.includes(nt)) score += 3 * idf(nt.split(' ')[0]);
  }
  // phạt chủ đề phình quá to (chống "hút" mọi query)
  score *= 1 / Math.sqrt(1 + idx.bodyLen / 40000);
  if (idx.seed.learned) score *= 1.25; // ưu tiên thứ người dạy
  return { score, tagHits };
}

export function menosRetrieve(message, { limit = 2, minScore = 18 } = {}) {
  const norm = normalize(message);
  const qTokens = tokenize(norm);
  const qSet = new Set(qTokens);
  if (!qSet.size) return [];
  const ranked = [];
  for (const idx of INDEX) {
    const { score, tagHits } = scoreQuery(qTokens, qSet, norm, idx);
    if (score > 0) ranked.push({ idx, score, tagHits });
  }
  ranked.sort((a, b) => b.score - a.score || b.tagHits - a.tagHits || a.idx.seed.content.length - b.idx.seed.content.length);
  const top = ranked.filter((r) => r.score >= minScore).slice(0, limit);
  const max = top[0]?.score || 1;
  return top.map((r) => ({ ...r.idx.seed, matchScore: Math.round(Math.min(0.99, r.score / max) * 100) / 100, raw: Math.round(r.score) }));
}

/* ------------------------- source code reading ---------------------- */

const FILE_RE = /(?:^|[\s`('"])(~?\/?[A-Za-z0-9_\-/][A-Za-z0-9_.\-/]*\.(?:js|mjs|cjs|jsx|ts|tsx|json|md|markdown|py|go|rs|java|kt|c|h|cpp|hpp|css|scss|html|yml|yaml|toml|sh|bash|sql|tf|lock))(?=$|[\s.,;:!?)'"`])/i;

function resolveInWorkdir(p) {
  const rel = p.replace(/^~\//, '').replace(/^\.\//, '');
  const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(config.workdir, rel);
  const root = path.resolve(config.workdir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // chống traversal
  const inside = path.relative(root, abs).split(path.sep);
  if (inside.some((seg) => ['node_modules', '.git', 'dist', 'data'].includes(seg))) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

function summarizeSource(absPath) {
  const st = fs.statSync(absPath);
  if (st.size > 512 * 1024) return `**${path.basename(absPath)}** quá lớn (${(st.size / 1024).toFixed(0)}KB) — Menos chỉ đọc tới 512KB.`;
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const ext = path.extname(absPath);
  const grab = (re) => {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) out.push(`\`${lines[i].trim().slice(0, 110)}\` *(dòng ${i + 1})*`);
      if (out.length >= 12) break;
    }
    return out;
  };
  let imports = [];
  let exports_ = [];
  let funcs = [];
  let classes = [];
  if (['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'].includes(ext)) {
    imports = grab(/^\s*import\s.+from\s|^\s*require\(/);
    exports_ = grab(/^\s*export\s+(const|function|class|async|default|\{)/);
    funcs = grab(/^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*const\s+\w+\s*=\s*(async\s*)?\(|^\s*(export\s+)?const\s+\w+\s*=\s*[^=]*=>/);
    classes = grab(/^\s*(export\s+)?(abstract\s+)?class\s+\w+/);
  } else if (ext === '.py') {
    imports = grab(/^\s*(from\s.+\s)?import\s/);
    funcs = grab(/^\s*(async\s+)?def\s+\w+/);
    classes = grab(/^\s*class\s+\w+/);
  } else if (ext === '.go') {
    funcs = grab(/^func\s+(\([^)]*\)\s*)?\w+/);
    classes = grab(/^type\s+\w+\s+(struct|interface)/);
  }
  const md = [`### 📖 Menos đã đọc: \`${path.relative(config.workdir, absPath)}\``, ''];
  md.push(
    `**${lines.length} dòng · ${(st.size / 1024).toFixed(1)}KB · sửa lần cuối ${new Date(st.mtime).toISOString().slice(0, 16).replace('T', ' ')} UTC**`
  );
  const section = (title, arr) => (arr.length ? ['', `**${title}** (${arr.length})`, ...arr.map((x) => '- ' + x)] : []);
  md.push(...section('Imports', imports), ...section('Exports', exports_), ...section('Hàm', funcs), ...section('Lớp', classes));
  if (ext === '.json') {
    try {
      const keys = Object.keys(JSON.parse(src)).slice(0, 20);
      md.push('', '**Khóa cấp cao nhất (tối đa 20):** ' + (keys.map((k) => '`' + k + '`').join(', ') || '(mảng/giá trị đơn)'));
    } catch {
      md.push('', '_(JSON không parse được — có thể có comment hoặc định dạng chưa escape)_');
    }
  }
  return md.join('\n');
}

/* ------------------------------ answers ----------------------------- */

const ANSWER_FOOTER = () =>
  `\n\n> ⚙️ *Menos v${MENOS_VERSION} · bộ não cục bộ ${INDEX.length} chủ đề · offline, riêng tư — mọi tri thức học thêm nằm trong máy bạn.*`;

const groupLabel = (id) => MENOS_GROUPS.find((g) => g.id === id)?.label || (id === 'learned' ? 'Đã học thêm' : id);

function renderTopics(topics) {
  return topics
    .map((t) => {
      const head = `## ${t.title}\n\n_\`${groupLabel(t.group)} · id: ${t.id} · độ khớp ${(t.matchScore * 100).toFixed(0)}%_\n`;
      return head + '\n' + t.content.join('\n');
    })
    .join('\n\n---\n\n');
}

function greeting() {
  const s = menosStats();
  const perGroup = Object.values(s.groups).map((g) => `- **${g.label}**: ${g.count} chủ đề`).join('\n');
  return `Xin chào! 👋 Tôi là **Menos** — bộ não tri thức **cục bộ** của Claude Code Console, chạy hoàn toàn offline trong sandbox này.

**Trạng thái hiện tại của tôi**

- Phiên bản: **v${s.version}** · Tổng số chủ đề: **${s.topics}** (seed ${s.seeds} + đã học ${s.learned})
${perGroup}

**Tôi làm được gì**

1. Trả lời **52 chủ đề kỹ thuật** (lập trình, web, dữ liệu, devops, công cụ) bằng tiếng Việt — cứ hỏi kiểu _"giải thích HTTP cache"_ hay _"window function trong SQL"_.
2. **Đọc mã nguồn**: hỏi _"tóm tắt server/index.js"_ — tôi mở file trong workspace và liệt kê imports/exports/hàm.
3. **Học được**: bạn dạy gì, tôi nhớ nấy (lưu \`data/menos-brain.json\`). Đăng nhập API: \`POST /api/menos/learn\`.

Tôi không bịa: chủ đề chưa có trong đầu, tôi sẽ nói thẳng và gợi ý engine mạnh hơn (CLI/API/Laguna).`;
}

function fallbackAnswer(message, near) {
  const list = near.length
    ? `Chủ đề **gần nhất** trong não tôi lúc này:\n\n${near.map((n) => `- ${n.title} *(${n.id} · khớp ${(n.matchScore * 100).toFixed(0)}%)*`).join('\n')}\n\n`
    : '';
  return `🤔 Chủ đề *"${String(message).slice(0, 120)}"* **chưa có** trong bộ não Menos (và tôi nguyên tắc không bịa).

${list}Bạn có thể:
1. Dạy tôi ngay: \`POST /api/menos/learn\` với \`{ title, tags, content }\` — tôi sẽ nhớ mãi về sau.
2. Chuyển engine ở góc phải để hỏi **Claude Code CLI / Anthropic API / Laguna S 2.1 (OpenRouter)** cho câu trả lời tổng quát.`;
}

/* ------------------------------ engine ------------------------------ */

export function isConfigured() {
  return true;
}

export function getAvailability() {
  return { ok: true, reason: null, topics: INDEX.length, version: MENOS_VERSION };
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

export async function execute({ userMessage, onEvent, signal }) {
  const emit = (type, payload) => {
    try { onEvent?.({ type, ...payload, ts: nowIso() }); } catch { /* closed */ }
  };
  const msg = String(userMessage || '').trim();
  const norm = normalize(msg);
  emit('status', { message: `menos đang tra bộ não ${INDEX.length} chủ đề…` });

  let answer = '';

  if (/^(hi|hello|chao|xin chao|hey|alo)\b/i.test(msg) && norm.split(' ').length <= 4) {
    answer = greeting();
  } else if (/(bao nhieu|how many).*(chu de|topic)|trang thai (bo nao|menos)|thong ke (bo nao|menos)|stats|menos-status/.test(norm)) {
    answer = '🧠 **Sức khỏe bộ não Menos**\n\n```json\n' + JSON.stringify(menosStats(), null, 2) + '\n```';
  } else {
    const wantsRead = /(tóm tắt|tom tat|đọc|doc|giải thích|giai thich|phân tích|phan tich|review|lint|cấu trúc file|cau truc)/i.test(msg);
    const m = msg.match(FILE_RE);
    if (m) {
      const abs = resolveInWorkdir(m[1]);
      if (abs) {
        answer = summarizeSource(abs);
      } else if (wantsRead) {
        answer = `📂 Tôi tìm file \`${m[1]}\` trong workspace \`${config.workdir}\` nhưng **không thấy** (hoặc nó nằm trong thư mục bị chặn: node_modules / dist / data / .git).`;
      }
    }
  }

  if (!answer) {
    const top = menosRetrieve(msg);
    if (top.length) {
      answer = renderTopics(top) + ANSWER_FOOTER();
    } else {
      const near = menosRetrieve(msg, { limit: 3, minScore: 5 });
      answer = fallbackAnswer(msg, near) + ANSWER_FOOTER();
    }
  }

  // stream từng mảng vừa phải để giao diện "gõ" tự nhiên
  const chunks = answer.match(/[\s\S]{1,700}/g) || [answer];
  for (const ch of chunks) {
    if (signal?.aborted) return { ok: false, aborted: true, text: '' };
    emit('text', { text: ch });
    await sleep(18, signal);
  }
  return { ok: true, text: answer, engine: 'menos' };
}

export async function menosWarm() {
  if (!INDEX.length) menosInit();
}

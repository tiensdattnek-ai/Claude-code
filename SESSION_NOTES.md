# SESSION NOTES — Claude Code Console

> Sổ tay bàn giao giữa các phiên làm việc. **Phiên bản: 2026-09-06.**
> Đọc file này TRƯỚC khi tin bất kỳ mô tả nào từ session trước.

---

## 0. Trạng thái GitHub (tính đến 2026-09-06)

- Branch làm việc của session này: **`arena/01a074fd-claude-code`** (session Arena bị khoá vào
  branch này — không push branch khác được).
- `main` trên GitHub = merge của **PR #1** (`arena/01a074b1-claude-code`, commit `b16ea60`),
  gồm toàn bộ nền tảng web console + fix sidebar mobile (`e6997fc`).
- Session này bổ sung: **Menos AI (não bộ 52 chủ đề) + engine, Laguna S 2.1 (OpenRouter),
  engine selector trên UI, accent "GitHub Copilot" (tím→xanh), endpoints train/stats** —
  xem PR #2 (merge vào main).

### ⚠️ Bài học bàn giao (đã ghi nhận 2026-09-06)

Notes của session trước mô tả: `SESSION_NOTES.md`, `menOS ~1/3 mở rộng`,
`claude-code-updates.bundle`, `claude-code-web-console-full.tar.gz`, `data/system-prompts/`…
**TẤT CẢ những file/commit đó KHÔNG TỒN TẠI trong repo hay workspace này** (không có trong
git history, không có file backup nào). Kết luận: công việc của session cũ **chưa từng được
commit ở đâu cả** và đã mất. Session này đã **xây lại từ đầu** (không phải "tiếp 2/3").
→ Từ giờ: **commit + push sau MỖI nhóm thay đổi lớn**, cập nhật file này cùng commit đó.

## 1. Kiến trúc hiện tại

```
client/ (React 18 + Vite, build → client/dist, server Express phục vụ tĩnh)
  - Chat.jsx: engine selector — auto | cli | api | menos | laguna | demo
  - index.css: design system 2 theme; brand = tím→xanh "Copilot"
server/index.js (REST + SSE /api/chat/:id; /api/menos/stats; /api/menos/learn)
server/auth.js (scrypt, cookie httpOnly ccw_sid, khoá brute-force 6 lần/10 phút)
server/store.js (JSON atomic tại DATA_DIR, mặc định ./data — git-ignored)
server/engines/index.js
  auto-chain: cli → api → laguna → menos (demo chỉ khi ENGINE=demo)
  ├── cliEngine.js       spawn claude CLI trong sandbox (--resume, tools)
  ├── apiEngine.js       Anthropic Messages API
  ├── menosEngine.js     🧠 MENOS: retrieval tiếng Việt (bỏ dấu + IDF), không cần mạng
  │     - 52 chủ đề seed  : server/engines/menos-knowledge.js (MENOS_SEEDS)
  │     - học thêm        : DATA_DIR/menos-brain.json (POST /api/menos/learn, nạp nóng)
  │     - đọc mã nguồn    : hỏi "tóm tắt file <path>" → tóm tắt trong WORKDIR
  │     - greeting/stats  : "chào" / "meno-status|stats|bao nhiêu chủ đề"
  ├── lagunaEngine.js    🌊 Laguna S 2.1 — OpenRouter /chat/completions (stream)
  └── demoEngine.js      fallback offline cũ
test/harness.jsx  17 DOM assertions (esbuild bundle + jsdom) — npm run test:dom
test/bin/claude   fake CLI để test engine offline
```

### Menos — cấu trúc seed

`MENOS_SEEDS: Array<{ id, title, group, tags: string[], content: string[] }>` — mỗi phần tử
`content` là **một dòng markdown**. 5 nhóm (`MENOS_GROUPS`): `lap-trinh` (18), `web` (12),
`data` (6), `devops` (9), `tools` (7) = **52 chủ đề**. Retrieval: normalize bỏ dấu →
tokenize (stoplist vi/en) → score: tag×6 + title×5 + id×4 + body×min(tf,3), tất cả nhân IDF;
bonus khớp-cả-tiêu-đề +40; phạt chủ đề phình; `minScore=18`; tie-break theo số tag-hit rồi
độ gọn. Dưới ngưỡng → Menos **nói thật là chưa biết** + gợi ý.

## 2. Bảo mật (bất biến — giữ nguyên qua các phiên)

- KHÔNG commit: `.env`, `.env.*`, `data/`, `node_modules/`, `client/dist`, `*.bundle`, `*.tar.gz` (đã vào .gitignore).
- KHÔNG in API key ra chat/log; key chỉ nằm trong `.env` (git-ignored).
- **KHÔNG nhúng system prompt "leak" của Anthropic (hay của hãng nào) vào sản phẩm** —
  đó là tài liệu mật, không phải public domain; dự án dùng system prompt gốc
  (`lagunaEngine.js#systemPrompt`). `data/system-prompts/` nếu xuất hiện phải ở ngoài git.
- Login lần đầu: `ADMIN_PASSWORD` trống → server tự sinh mật khẩu mạnh, lưu hash, in 1 lần.

## 3. Việc còn dở (nice-to-have, chưa làm)

- [ ] UI chọn/nạp chủ đề cho Menos (hiện train qua REST, chưa có nút trong client).
- [ ] Gộp tri thức Menos vào ngữ cảnh khi engine API/Laguna trả lời (hybrid local+hosted).
- [ ] Embedding thật (sqlite-vec / vector) thay lexical retrieval khi seed > 500 chủ đề.
- [ ] `npm run test:menos` — bộ eval 20 câu truy hồi (đã test tay 23/24 đúng chủ đề).
- [ ] Copilot-UI: đã đổi palette, chưa "skin" lại toàn bộ layout theo GitHub.com.

## 4. Lệnh kiểm tra chuẩn

```bash
node --check server/index.js server/auth.js server/store.js server/config.js server/util.js \
  server/engines/index.js server/engines/apiEngine.js server/engines/cliEngine.js \
  server/engines/demoEngine.js server/engines/menosEngine.js server/engines/lagunaEngine.js \
  server/engines/menos-knowledge.js
npm run build && npm run test:dom          # 17 assertions
node -e "import('./server/engines/menos-knowledge.js').then(m=>console.log(m.MENOS_SEEDS.length))"   # 52
# smoke test Menos qua HTTP:
ENGINE=demo PORT=3123 ADMIN_PASSWORD=*** node server/index.js &
curl -c /tmp/cj -X POST localhost:3123/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"admin","password":"***"}'
CID=$(curl -s -b /tmp/cj -X POST localhost:3123/api/conversations -d '{}' -H 'content-type: application/json' | jq -r .conversation.id)
curl -sN -b /tmp/cj -X POST localhost:3123/api/chat/$CID -H 'content-type: application/json' \
  -d '{"message":"window function trong SQL","engine":"menos"}'
```

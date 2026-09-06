<div align="center">

# Claude Code Console

**Giao diện web cao cấp điều khiển Claude Code chạy trong sandbox/máy của bạn.**

Chạy trên **localhost** · Đăng nhập **admin** · Mỗi tin nhắn = một phiên **Claude Code CLI thật**
trong sandbox máy chủ · Stream SSE từng chữ realtime.

![Dark](https://img.shields.io/badge/theme-dark%20%2B%20light-0b0d19?style=flat-square)
![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)
![Stack](https://img.shields.io/badge/React%20%2B%20Express%20%2B%20SSE-8b7bff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-3ecf8e?style=flat-square)

</div>

---

## ✨ Vì sao nó "cao cấp"?

| | |
|---|---|
| 🔐 **Chỉ admin vào được** | Session cookie httpOnly + scrypt hash mật khẩu + khoá tạm sau 6 lần sai. Chưa đăng nhập → API trả `401`, giao diện chặn cứng. |
| 🧠 **Chạy ngay trong sandbox** | Yêu cầu của bạn được chuyển thành một agent **Claude Code CLI** thực thụ spawn trên máy chủ — agent đọc file, chạy lệnh, sửa code trong sandbox của bạn. |
| 🔁 **Hội thoại liên tục thật** | Mỗi lượt sau dùng `claude --resume <session_id>` → agent *nhớ nguyên vẹn* ngữ cảnh, file đã đọc, việc đang làm dở. |
| ⚡ **Stream realtime (SSE)** | Text chảy từng ký tự; tool-call (Bash/Write/Read…) hiện live dưới dạng thẻ trạng thái chạy → xong → lỗi. |
| 🎨 **Design system hoàn chỉnh** | Dark/Light theme, gradient brand, glassmorphism, font Inter + Be Vietnam Pro + JetBrains Mono, markdown renderer tự viết (code block copy/download, table, blockquote…), phím tắt, nhập liệu giọng nói. |
| 🗄️ **Lưu trữ bền vững** | Hội thoại lưu JSON atomic (không cần database), phục hồi sau restart server. |
| 🛡️ **An toàn khi chạy lâu** | Abort engine khi trình duyệt ngắt kết nối → không để agent mồ côi trong sandbox. |

## 🧱 Kiến trúc

```
┌────────────────────────────  Browser  ────────────────────────────┐
│  React 18 + Vite  ·  Markdown renderer  ·  SSE client            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP (JSON + text/event-stream)
┌──────────────────────────────▼───────────────────────────────────┐
│  Node.js + Express (server/index.js)                             │
│  ├─ Auth admin: scrypt · httpOnly cookie · brute-force lock      │
│  ├─ Store: conversations/messages JSON atomic                    │
│  └─ Router: REST + SSE chat                                      │
│                    │ engine orchestration                        │
│  ┌─────────────────▼──────────────────────────────┐              │
│  │  engines/                                      │              │
│  │   cliEngine  → spawn `claude -p` NGAY TRONG     │              │
│  │                sandbox (--resume, tools, JSON)  │              │
│  │   apiEngine  → Anthropic Messages API (stream)  │              │
│  │   demoEngine → trợ lý offline (fallback)        │              │
│  └─────────────────────────────────────────────────┘              │
└───────────────────────────────────────────────────────────────────┘
```

### Cây thư mục

```
.
├── server/                  # Node.js backend
│   ├── index.js             # Express app: REST + SSE streaming
│   ├── auth.js              # Admin, session, brute-force protection
│   ├── store.js             # Conversation store (JSON, atomic)
│   ├── config.js            # Mọi cấu hình từ biến môi trường
│   ├── util.js              # Logger, helpers
│   └── engines/
│       ├── index.js         # Chọn engine: auto → cli → api → demo
│       ├── cliEngine.js     # Spawn Claude Code CLI trong sandbox
│       ├── apiEngine.js     # Gọi Anthropic API trực tiếp
│       └── demoEngine.js    # Mô phỏng offline (không cần key)
├── client/                  # React 18 + Vite
│   ├── src/
│   │   ├── App.jsx          # Điều phối auth / sidebar / chat / theme
│   │   ├── index.css        # Toàn bộ design system (dark + light)
│   │   └── components/      # Login, Sidebar, Chat, Composer,
│   │                        # MessageBubble, Markdown, icons
│   └── vite.config.js       # Proxy /api → backend khi dev
└── test/
    ├── harness.jsx          # DOM smoke-test (jsdom + esbuild)
    └── bin/claude           # Fake CLI mô phỏng đúng protocol của
                             # Claude Code để test engine offline
```

## 🚀 Chạy nhanh

```bash
npm install            # cài server + client
npm run build          # build giao diện vào client/dist
cp .env.example .env   # đặt ADMIN_USERNAME / ADMIN_PASSWORD, PORT, ENGINE
npm start              # mở http://localhost:3000
```

> Lần đầu nếu bỏ trống `ADMIN_PASSWORD`, server **tự sinh mật khẩu mạnh**,
> lưu bản hash vào `data/secrets.json` và in mật khẩu một lần duy nhất ở terminal.

### Kích hoạt Claude Code thật (trong sandbox/máy chạy server)

```bash
npm i -g @anthropic-ai/claude-code   # cài CLI ngay trong sandbox
claude                              # đăng nhập một lần (OAuth)
# khởi động lại server
```

Khi CLI có mặt, `ENGINE=auto` tự phát hiện → mọi chat chạy như một phiên
Claude Code CLI ngay trong máy chủ (có thể bật **Agent tools** để cho phép
Bash/Write/Edit…). Không có CLI cũng không có API key? Server rơi về
**demo engine** để bạn vẫn dùng thử toàn bộ giao diện.

### Chế độ dev (hot reload)

```bash
npm run dev   # API :3000 + Vite :5173 (proxy /api)
```

## ⚙️ Engine & cấu hình chính

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Web server |
| `ADMIN_USERNAME` | `admin` | Tài khoản admin |
| `ADMIN_PASSWORD` | *(tự sinh)* | Mật khẩu admin (hoặc `ADMIN_PASSWORD_HASH` scrypt) |
| `ENGINE` | `auto` | `auto` \| `cli` \| `api` \| `demo` |
| `CLAUDE_CLI_BIN` | `claude` | Đường dẫn CLI (thử nghiệm có thể trỏ tới `test/bin/claude`) |
| `CLAUDE_CLI_MODEL` | *(mặc định CLI)* | Ví dụ `claude-sonnet-4-5` |
| `ALLOWED_TOOLS` | Bash, Edit, Write, Read… | Bộ công cụ khi bật "Agent tools" |
| `CLI_MAX_TURNS` | `30` | Số vòng agent tối đa một lượt chat |
| `WORKDIR` | thư mục dự án | Nơi agent CLI làm việc (mặc định là repo này) |
| `ANTHROPIC_API_KEY` | *(trống)* | Bật engine API khi không có CLI |
| `CLAUDE_MODEL` | `claude-sonnet-4-5` | Model cho engine API / CLI |
| `SESSION_TTL_HOURS` | `12` | Thời hạn đăng nhập |

## 🔌 Giao thức SSE (một lượt chat)

`POST /api/chat/:conversationId` trả về `text/event-stream`:

```
event: hello   → { ok, messageId, engine }
event: status  → đang suy nghĩ / agent đã sẵn sàng / lỗi nhẹ
event: delta   → { id, delta }            (text stream từng phần)
event: tool    → { action: start|end, name, brief, outcome }
event: error   → { message }
event: end     → { id, elapsedMs }
```

Toàn bộ các API khác yêu cầu cookie phiên của admin (bắt buộc đăng nhập).

## 🧪 Kiểm thử

```bash
npm run test:dom   # 17 assertion DOM: render, markdown, streaming SSE, stop/send…
```

Để test engine CLI *không cần tài khoản Anthropic*, đặt
`CLAUDE_CLI_BIN=test/bin/claude` (file giả lập đúng wire-protocol của
Claude Code: init/session_id, tool_use/tool_result, stream_event) rồi gửi
tin nhắn — kiểm chứng được cả cơ chế `--resume`.

## ⚠️ Bảo mật

- Mật khẩu luôn so sánh constant-time; lưu dạng `scrypt` nếu không dùng env.
- Khoá đăng nhập 60s sau 6 lần sai (theo IP + username).
- Agent CLI có toàn quyền trong sandbox máy chủ (đúng bản chất Claude Code);
  hãy chạy trong môi trường bạn **muốn** cho nó thao tác, và chỉ mời đúng
  người bạn tin vào tài khoản admin. Toggle **Agent tools** để giới hạn agent
  chỉ trả lời (không tự ý chạy công cụ).

## 🧰 Stack

Node.js ≥ 20 · Express 4 · React 18 · Vite 5 · SSE · scrypt · JSON store ·
jsdom (test) — **zero dependency nặng ở client** (markdown tự render).

---

<div align="center">Built with 💜 & Claude Code — bởi bạn, cho bạn.</div>

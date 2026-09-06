import { config } from '../config.js';

/* ==================================================================== */
/*  Engine: built-in demo assistant.                                    */
/*  Used only when no real engine is available, so the console always   */
/*  works out of the box. A banner explains how to enable real models.  */
/* ==================================================================== */

const canDo = (content) => {
  const c = String(content || '').toLowerCase();
  const flags = [];
  if (/code|function|thư viện|hàm|api|sql|regex|script/.test(c)) flags.push('code');
  if (/nghĩa là|mean|explain|giải thích|là gì|what/.test(c)) flags.push('explain');
  if (/vim|git|command|terminal|lệnh/.test(c)) flags.push('terminal');
  return flags;
};

export function isConfigured() {
  return true; // always available as last-resort
}

export function getAvailability() {
  return { ok: true, reason: 'demo mode' };
}

export async function execute({ userMessage, onEvent }) {
  const emit = (type, payload) => {
    try { onEvent?.({ type, ...payload, ts: new Date().toISOString() }); } catch { /* closed */ }
  };
  const emitStatus = (msg) => emit('status', { message: msg });

  emitStatus('demo engine activated');
  await delay(380);

  const first = () => {
    emit('text', { text: `> **Cảnh báo demo** — chưa có engine thật nào được cấu hình (thiếu \`claude\` CLI hoặc \`ANTHROPIC_API_KEY\`), nên máy chủ đang chạy **trợ lý mô phỏng offline** này.\n\n` });
  };

  const c = String(userMessage || '');
  const flags = canDo(c);

  if (/(hi|hello|xin chào|chào)\b/i.test(c) && !flags.length) {
    first();
    emit('text', {
      text: `Xin chào! 👋 Tôi là phiên bản **demo** của Claude Code Web Console.\n\nMọi thứ đang hoạt động hoàn hảo: bạn đã đăng nhập, server đang chạy, luồng phản hồi realtime (SSE) đã kết nối.\n\nĐể kích hoạt **Claude Code thật** chạy ngay trong sandbox của máy chủ:\n\n1. Cài Claude Code CLI trong môi trường server: \`npm i -g @anthropic-ai/claude-code\`\n2. Xác thực: \`claude\` (đăng nhập một lần)\n3. Khởi động lại server — trạng thái sẽ chuyển sang *"Claude Code CLI — sẵn sàng"*\n\nCứ thử hỏi tôi về code, văn bản hay bất cứ điều gì — tôi vẫn trả lời để bạn kiểm tra toàn bộ giao diện!`,
    });
    return { ok: true, text: '' };
  }

  first();
  await delay(200);

  if (flags.includes('code') || /viết|tạo|code|script|hàm|function|đoạn/.test(c)) {
    emit('text', {
      text: `**Ý tưởng tuyệt vời!** Trong bản demo, đây là hình dạng câu trả lời code thật sẽ trông như thế nào:\n\n\`\`\`js\n// Khi Claude Code CLI được kết nối, đoạn code này sẽ được\n// viết và chạy ngay bên trong sandbox của máy chủ.\nfunction greet(name) {\n  return \`Chào \${name} — chào mừng đến với giao diện web đẹp nhất của Claude Code!\`;\n}\nconsole.log(greet('bạn'));\n\`\`\`\n\n💡 Mẹo: bật toggle **Agent tools** trên thanh công cụ — khi có CLI thật, Claude sẽ được phép đọc file, chạy lệnh và sửa code trong sandbox.`,
    });
  } else if (/cảm ơn|thanks|thank/.test(c)) {
    emit('text', { text: `Rất vui được giúp bạn! 💜 Khi engine thật được kết nối, tôi sẽ đủ sức mạnh để cùng bạn xây dựng mọi thứ — chúc bạn một ngày code thật năng suất!` });
  } else {
    emit('text', {
      text: `Tôi hiểu câu hỏi của bạn về: *"${c.slice(0, 140)}"*\n\n**Trạng thái console (bản demo):**\n\n| Thành phần | Trạng thái |\n|---|---|\n| Đăng nhập admin | ✅ |\n| Server + SSE realtime | ✅ |\n| Claude Code CLI | ⏳ chưa cài trong sandbox |\n| Anthropic API | ⏳ chưa cấu hình |\n\nMọi tính năng giao diện (streaming từng chữ, thẻ tool-call, phím tắt, đổi chủ đề…) đều hoạt động đầy đủ ngay bây giờ. Hãy cài \`@anthropic-ai/claude-code\` trong sandbox rồi khởi động lại để thấy sức mạnh thật! 🚀`,
    });
  }

  return { ok: true, text: '' };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

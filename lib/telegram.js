// ارسال پیام به تلگرام از طریق Bot API

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("⚠️ توکن یا چت آی‌دی تلگرام تنظیم نشده است.");
    return { ok: false, error: "توکن یا Chat ID تلگرام تنظیم نشده است" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("خطای تلگرام:", data);
      return { ok: false, error: data.description || "خطای نامشخص تلگرام" };
    }
    return { ok: true };
  } catch (err) {
    console.error("خطا در اتصال به تلگرام:", err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendTelegramMessage };

const db = require("./db");
const { sendTelegramMessage } = require("./telegram");
const { daysUntil, isoToJalaliString } = require("./jalali");

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMessage(sub, kind) {
  const jalaliExpiry = isoToJalaliString(sub.expiry_date);
  const name = escapeHtml(sub.name);
  const sid = escapeHtml(sub.subscriber_id);
  const ip = escapeHtml(sub.ip || "-");
  const mobile = escapeHtml(sub.mobile || "-");

  if (kind === "5day") {
    return (
      `🔔 <b>یادآوری انقضای اشتراک</b>\n\n` +
      `👤 مشترک: <b>${name}</b>\n` +
      `🆔 شناسه: ${sid}\n` +
      `🌐 آی‌پی: ${ip}\n` +
      `📱 موبایل: ${mobile}\n` +
      `📅 تاریخ انقضا: ${jalaliExpiry}\n\n` +
      `⏳ <b>۵ روز</b> تا پایان اعتبار این مشترک باقی مانده است.`
    );
  }
  if (kind === "3day") {
    return (
      `⚠️ <b>هشدار نزدیک شدن انقضا</b>\n\n` +
      `👤 مشترک: <b>${name}</b>\n` +
      `🆔 شناسه: ${sid}\n` +
      `🌐 آی‌پی: ${ip}\n` +
      `📱 موبایل: ${mobile}\n` +
      `📅 تاریخ انقضا: ${jalaliExpiry}\n\n` +
      `⏳ فقط <b>۳ روز</b> تا پایان اعتبار این مشترک باقی مانده است!`
    );
  }
  // expired
  return (
    `⛔️ <b>اشتراک منقضی شد</b>\n\n` +
    `👤 مشترک: <b>${name}</b>\n` +
    `🆔 شناسه: ${sid}\n` +
    `🌐 آی‌پی: ${ip}\n` +
    `📱 موبایل: ${mobile}\n` +
    `📅 تاریخ انقضا: ${jalaliExpiry}\n\n` +
    `🚫 اعتبار این مشترک امروز به پایان رسید.`
  );
}

async function runExpiryCheck() {
  const rows = db
    .prepare(`SELECT * FROM subscribers WHERE monitored = 1`)
    .all();

  const results = [];

  for (const sub of rows) {
    const remaining = daysUntil(sub.expiry_date);
    let kind = null;

    if (remaining === 5 && !sub.notified_5) kind = "5day";
    else if (remaining === 3 && !sub.notified_3) kind = "3day";
    else if (remaining <= 0 && !sub.notified_0) kind = "expired";

    if (!kind) continue;

    const msg = buildMessage(sub, kind);
    const res = await sendTelegramMessage(msg);

    if (res.ok) {
      const col = kind === "5day" ? "notified_5" : kind === "3day" ? "notified_3" : "notified_0";
      db.prepare(`UPDATE subscribers SET ${col} = 1 WHERE id = ?`).run(sub.id);
      db.prepare(
        `INSERT INTO notification_log (subscriber_id_fk, kind) VALUES (?, ?)`
      ).run(sub.id, kind);
      results.push({ id: sub.id, name: sub.name, kind, sent: true });
    } else {
      results.push({ id: sub.id, name: sub.name, kind, sent: false, error: res.error });
    }
  }

  return results;
}

module.exports = { runExpiryCheck };

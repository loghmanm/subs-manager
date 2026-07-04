// وارد کردن یک‌بارهٔ داده‌های قدیمی از فایل‌های CSV به دیتابیس
// این اسکریپت فقط در صورتی اجرا می‌شود که جدول مشترکین خالی باشد.

const fs = require("fs");
const path = require("path");
const db = require("./db");
const { jalaliStringToISO } = require("./jalali");

const IMPORT_DIR = path.join(__dirname, "..", "import");

function parseCsvLine(line) {
  // پارسر ساده CSV با پشتیبانی از کاما داخل نقل‌قول
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

function readCsv(file) {
  const raw = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return raw.split("\n").filter((l) => l.trim().length > 0).map(parseCsvLine);
}

function safeExpiryIso(raw) {
  const iso = jalaliStringToISO(raw);
  if (iso) return iso;
  // اگر تاریخ قابل تشخیص نبود، یک سال بعد از امروز به عنوان مقدار پیش‌فرض غیرقطعی قرار می‌گیرد
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

let autoIdCounter = 1;
function makeFallbackId(prefix) {
  autoIdCounter += 1;
  return `${prefix}-${Date.now()}-${autoIdCounter}`;
}

function insertRow({ name, subscriber_id, ip, mobile, expiry_raw, provider, note }) {
  if (!name) return;
  const expiry_date = safeExpiryIso(expiry_raw);
  const sid = subscriber_id && subscriber_id.trim() ? subscriber_id.trim() : makeFallbackId("SUB");

  try {
    db.prepare(
      `INSERT INTO subscribers (name, subscriber_id, ip, mobile, expiry_date, provider, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), sid, ip ? ip.trim() : "", mobile ? mobile.trim() : "", expiry_date, provider || "", note || "");
  } catch (err) {
    // شناسه تکراری -> با شناسه جدید دوباره امتحان کن
    if (String(err.message).includes("UNIQUE")) {
      const newSid = makeFallbackId("SUB");
      db.prepare(
        `INSERT INTO subscribers (name, subscriber_id, ip, mobile, expiry_date, provider, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(name.trim(), newSid, ip ? ip.trim() : "", mobile ? mobile.trim() : "", expiry_date, provider || "", note || "");
    } else {
      console.error("خطا در درج ردیف:", err.message);
    }
  }
}

function importFile1() {
  // نام مشترک, شناسه کاربری, تاریخ شروع/تمدید, تاریخ پایان, IP, Phone number, یادداشت
  const file = path.join(IMPORT_DIR, "Sheet_1-Table_1.csv");
  if (!fs.existsSync(file)) return;
  const rows = readCsv(file).slice(1); // رد کردن سطر هدر
  for (const r of rows) {
    const [name, subscriber_id, , expiry_raw, ip, mobile, note] = r;
    insertRow({ name, subscriber_id, ip, mobile, expiry_raw, provider: "", note });
  }
}

function importFile2() {
  // نام, شناسه, تاریخ شروع, تاریخ پایان, provider, protocol, ip, mobile, note  (بدون سطر هدر)
  const file = path.join(IMPORT_DIR, "Expired_Disabled-Table_1.csv");
  if (!fs.existsSync(file)) return;
  const rows = readCsv(file);
  for (const r of rows) {
    const [name, subscriber_id, , expiry_raw, provider, protocol, ip, mobile, note] = r;
    const combinedNote = [protocol, note].filter(Boolean).join(" - ");
    insertRow({ name, subscriber_id, ip, mobile, expiry_raw, provider, note: combinedNote });
  }
}

function runSeedIfEmpty() {
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM subscribers`).get();
  if (count > 0) {
    console.log(`ℹ️ دیتابیس از قبل شامل ${count} مشترک است، وارد کردن اطلاعات قدیمی انجام نشد.`);
    return;
  }
  console.log("⏳ در حال وارد کردن اطلاعات قدیمی از فایل‌های CSV ...");
  importFile1();
  importFile2();
  const { count: after } = db.prepare(`SELECT COUNT(*) as count FROM subscribers`).get();
  console.log(`✅ وارد کردن اطلاعات انجام شد. تعداد کل مشترکین: ${after}`);
}

module.exports = { runSeedIfEmpty };

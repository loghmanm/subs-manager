require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

const db = require("./lib/db");
const { requireAuth, checkCredentials } = require("./lib/auth");
const { jalaliStringToISO, isoToJalaliString, daysUntil, renewIso, todayISO } = require("./lib/jalali");
const { runExpiryCheck } = require("./lib/scheduler");
const { sendTelegramMessage } = require("./lib/telegram");
const { runSeedIfEmpty } = require("./lib/seed");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 8080;

// ---------- بارگذاری اولیه داده‌های قدیمی (فقط اگر دیتابیس خالی باشد) ----------
runSeedIfEmpty();

// ---------- تنظیمات پایه ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 12, // ۱۲ ساعت
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// ---------- صفحات ورود ----------
app.get("/login", (req, res) => {
  if (req.session.loggedIn) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (checkCredentials(username, password)) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.redirect("/");
  }
  return res.render("login", { error: "نام کاربری یا رمز عبور اشتباه است" });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ---------- صفحه اصلی ----------
app.get("/", requireAuth, (req, res) => {
  res.render("dashboard", { username: req.session.username });
});

// =====================================================================
//  API مشترکین
// =====================================================================

function toClient(row) {
  const remaining = daysUntil(row.expiry_date);
  let status = "active";
  if (remaining < 0) status = "expired";
  else if (remaining <= 5) status = "soon";

  return {
    id: row.id,
    name: row.name,
    subscriber_id: row.subscriber_id,
    ip: row.ip || "",
    mobile: row.mobile || "",
    expiry_date: row.expiry_date,
    expiry_date_jalali: isoToJalaliString(row.expiry_date),
    provider: row.provider || "",
    note: row.note || "",
    monitored: !!row.monitored,
    days_remaining: remaining,
    status,
  };
}

// لیست + جستجو
app.get("/api/subscribers", requireAuth, (req, res) => {
  const q = (req.query.q || "").trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT * FROM subscribers
         WHERE name LIKE ? OR subscriber_id LIKE ? OR ip LIKE ? OR mobile LIKE ? OR expiry_date LIKE ?
         ORDER BY expiry_date ASC`
      )
      .all(like, like, like, like, like);
  } else {
    rows = db.prepare(`SELECT * FROM subscribers ORDER BY expiry_date ASC`).all();
  }
  res.json(rows.map(toClient));
});

// آمار داشبورد
app.get("/api/stats", requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT expiry_date, monitored FROM subscribers`).all();
  let total = rows.length;
  let expired = 0;
  let soon = 0;
  let monitored = 0;
  for (const r of rows) {
    const d = daysUntil(r.expiry_date);
    if (d < 0) expired += 1;
    else if (d <= 5) soon += 1;
    if (r.monitored) monitored += 1;
  }
  res.json({ total, expired, soon, monitored });
});

// دریافت یک مشترک
app.get("/api/subscribers/:id", requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "مشترک یافت نشد" });
  res.json(toClient(row));
});

function validateBody(body, { partial = false } = {}) {
  const required = ["name", "subscriber_id", "ip", "expiry_date", "mobile"];
  const errors = [];
  if (!partial) {
    for (const field of required) {
      if (!body[field] || String(body[field]).trim() === "") {
        errors.push(field);
      }
    }
  }
  return errors;
}

// افزودن مشترک جدید
app.post("/api/subscribers", requireAuth, (req, res) => {
  const body = req.body;
  const missing = validateBody(body);
  if (missing.length) {
    return res.status(400).json({ error: "فیلدهای اجباری وارد نشده‌اند", missing });
  }

  const iso = jalaliStringToISO(body.expiry_date);
  if (!iso) {
    return res.status(400).json({ error: "فرمت تاریخ انقضا نامعتبر است (مثال صحیح: 1404/05/12)" });
  }

  const dup = db.prepare(`SELECT id FROM subscribers WHERE subscriber_id = ?`).get(body.subscriber_id.trim());
  if (dup) {
    return res.status(400).json({ error: "این شناسه مشترک قبلاً ثبت شده است" });
  }

  const info = db
    .prepare(
      `INSERT INTO subscribers (name, subscriber_id, ip, mobile, expiry_date, provider, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name.trim(),
      body.subscriber_id.trim(),
      body.ip.trim(),
      body.mobile.trim(),
      iso,
      (body.provider || "").trim(),
      (body.note || "").trim()
    );

  const row = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(toClient(row));
});

// ویرایش مشترک
app.put("/api/subscribers/:id", requireAuth, (req, res) => {
  const existing = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "مشترک یافت نشد" });

  const body = req.body;
  const missing = validateBody(body);
  if (missing.length) {
    return res.status(400).json({ error: "فیلدهای اجباری وارد نشده‌اند", missing });
  }

  const iso = jalaliStringToISO(body.expiry_date);
  if (!iso) {
    return res.status(400).json({ error: "فرمت تاریخ انقضا نامعتبر است (مثال صحیح: 1404/05/12)" });
  }

  const dup = db
    .prepare(`SELECT id FROM subscribers WHERE subscriber_id = ? AND id != ?`)
    .get(body.subscriber_id.trim(), req.params.id);
  if (dup) {
    return res.status(400).json({ error: "این شناسه مشترک قبلاً برای مشترک دیگری ثبت شده است" });
  }

  // اگر تاریخ انقضا تغییر کرده، پرچم‌های اطلاع‌رسانی ریست شوند تا چرخه جدید اعلان‌ها درست کار کند
  const expiryChanged = existing.expiry_date !== iso;

  db.prepare(
    `UPDATE subscribers
     SET name = ?, subscriber_id = ?, ip = ?, mobile = ?, expiry_date = ?, provider = ?, note = ?,
         updated_at = datetime('now')
         ${expiryChanged ? ", notified_5 = 0, notified_3 = 0, notified_0 = 0" : ""}
     WHERE id = ?`
  ).run(
    body.name.trim(),
    body.subscriber_id.trim(),
    body.ip.trim(),
    body.mobile.trim(),
    iso,
    (body.provider || "").trim(),
    (body.note || "").trim(),
    req.params.id
  );

  const row = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  res.json(toClient(row));
});

// حذف مشترک
app.delete("/api/subscribers/:id", requireAuth, (req, res) => {
  const existing = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "مشترک یافت نشد" });
  db.prepare(`DELETE FROM subscribers WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// افزودن/حذف از لیست نظارت (کنترل تاریخ انقضا)
app.post("/api/subscribers/:id/monitor", requireAuth, (req, res) => {
  const existing = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "مشترک یافت نشد" });

  const newVal = existing.monitored ? 0 : 1;
  // وقتی به لیست نظارت اضافه می‌شود، پرچم‌های اطلاع‌رسانی ریست می‌شوند
  db.prepare(
    `UPDATE subscribers SET monitored = ?, notified_5 = 0, notified_3 = 0, notified_0 = 0 WHERE id = ?`
  ).run(newVal, req.params.id);

  const row = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  res.json(toClient(row));
});

// تمدید اشتراک مشترک
app.post("/api/subscribers/:id/renew", requireAuth, (req, res) => {
  const existing = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "مشترک یافت نشد" });

  const months = parseInt(req.body.months, 10);
  const basis = req.body.basis; // 'now' | 'expiry'

  if (!months || months < 1 || months > 12) {
    return res.status(400).json({ error: "تعداد ماه باید بین ۱ تا ۱۲ باشد" });
  }
  if (basis !== "now" && basis !== "expiry") {
    return res.status(400).json({ error: "مبدأ تمدید نامعتبر است" });
  }

  const baseIso = basis === "now" ? todayISO() : existing.expiry_date;
  const newExpiry = renewIso(baseIso, months);

  db.prepare(
    `UPDATE subscribers
     SET expiry_date = ?, notified_5 = 0, notified_3 = 0, notified_0 = 0, updated_at = datetime('now')
     WHERE id = ?`
  ).run(newExpiry, req.params.id);

  db.prepare(
    `INSERT INTO renewals (subscriber_id_fk, months, basis, old_expiry, new_expiry)
     VALUES (?, ?, ?, ?, ?)`
  ).run(req.params.id, months, basis, existing.expiry_date, newExpiry);

  const row = db.prepare(`SELECT * FROM subscribers WHERE id = ?`).get(req.params.id);
  res.json(toClient(row));
});

// تاریخچه‌ی تمدیدهای یک مشترک
app.get("/api/subscribers/:id/renewals", requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM renewals WHERE subscriber_id_fk = ? ORDER BY renewed_at DESC`)
    .all(req.params.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      months: r.months,
      basis: r.basis,
      old_expiry_jalali: isoToJalaliString(r.old_expiry),
      new_expiry_jalali: isoToJalaliString(r.new_expiry),
      renewed_at: r.renewed_at,
    }))
  );
});

// فهرست لیست نظارت
app.get("/api/watchlist", requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM subscribers WHERE monitored = 1 ORDER BY expiry_date ASC`).all();
  res.json(rows.map(toClient));
});

// اجرای دستی بررسی انقضا (برای تست فوری)
app.post("/api/check-now", requireAuth, async (req, res) => {
  try {
    const result = await runExpiryCheck();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// تست اتصال تلگرام
app.post("/api/test-telegram", requireAuth, async (req, res) => {
  const result = await sendTelegramMessage(
    "✅ این یک پیام آزمایشی از سامانه مدیریت مشترکین است. اتصال تلگرام با موفقیت برقرار است."
  );
  res.json(result);
});

// ---------- ۴۰۴ ----------
app.use((req, res) => {
  res.status(404).send("صفحه مورد نظر یافت نشد");
});

// =====================================================================
//  زمان‌بند روزانه بررسی انقضا
// =====================================================================
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 9 * * *"; // هر روز ساعت ۹ صبح
cron.schedule(CRON_SCHEDULE, () => {
  console.log("⏰ اجرای بررسی روزانه انقضای مشترکین ...");
  runExpiryCheck()
    .then((r) => console.log(`بررسی انجام شد. ${r.length} اعلان بررسی/ارسال شد.`))
    .catch((e) => console.error("خطا در بررسی انقضا:", e.message));
});

app.listen(PORT, () => {
  console.log(`🚀 سرور روی پورت ${PORT} اجرا شد`);
  console.log(`⏰ زمان‌بند بررسی انقضا: ${CRON_SCHEDULE}`);
});

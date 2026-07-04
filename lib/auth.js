const bcrypt = require("bcryptjs");

// رمز عبور از متغیر محیطی به صورت متن ساده خوانده می‌شود و فقط یک‌بار،
// در حافظه (نه روی دیسک) هش می‌شود تا در تطبیق ورود استفاده شود.
const VALID_USER = process.env.APP_USERNAME || "admin";
const PLAIN_PASSWORD = process.env.APP_PASSWORD || "changeme";
const PASSWORD_HASH = bcrypt.hashSync(PLAIN_PASSWORD, 10);

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "برای ادامه باید وارد شوید" });
  }
  return res.redirect("/login");
}

function checkCredentials(username, password) {
  if (username !== VALID_USER) return false;
  return bcrypt.compareSync(password, PASSWORD_HASH);
}

module.exports = { requireAuth, checkCredentials };

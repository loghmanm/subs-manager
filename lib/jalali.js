// -----------------------------------------------------------------------
// تبدیل تاریخ شمسی (جلالی) <-> میلادی
// پیاده‌سازی بر اساس الگوریتم استاندارد و متن‌باز jalaali (بدون نیاز به پکیج خارجی)
// -----------------------------------------------------------------------

const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
  1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

function div(a, b) {
  return ~~(a / b);
}
function mod(a, b) {
  return a - ~~(a / b) * b;
}

function jalCal(jy) {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error("سال شمسی خارج از محدوده معتبر است: " + jy);
  }
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function g2d(gy, gm, gd) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn) {
  let gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd;
  let jm;
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/** تبدیل تاریخ شمسی به میلادی -> رشته YYYY-MM-DD */
function jalaaliToGregorian(jy, jm, jd) {
  const jdn = j2d(jy, jm, jd);
  const g = d2g(jdn);
  return { gy: g.gy, gm: g.gm, gd: g.gd };
}

/** تبدیل تاریخ میلادی به شمسی */
function gregorianToJalaali(gy, gm, gd) {
  const jdn = g2d(gy, gm, gd);
  return d2j(jdn);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** ورودی: "1404/05/12" یا "1404-05-12" -> خروجی: "2025-07-03" (ISO میلادی) */
function jalaliStringToISO(str) {
  if (!str) return null;
  const parts = String(str)
    .trim()
    .split(/[\/\-]/)
    .map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  let [jy, jm, jd] = parts;
  if (jy < 100) jy += 1400; // پشتیبانی از سال‌های دو رقمی/کوتاه قدیمی
  const g = jalaaliToGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

/** ورودی: "2025-07-03" (ISO میلادی) -> خروجی: "1404/04/12" (شمسی) */
function isoToJalaliString(iso) {
  if (!iso) return "";
  const [gy, gm, gd] = iso.split("-").map((p) => parseInt(p, 10));
  if (!gy || !gm || !gd) return "";
  const j = gregorianToJalaali(gy, gm, gd);
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

/** تعداد روزهای باقیمانده تا تاریخ ISO (می‌تواند منفی باشد یعنی گذشته) */
function daysUntil(iso) {
  const today = new Date();
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [gy, gm, gd] = iso.split("-").map((p) => parseInt(p, 10));
  const targetUTC = Date.UTC(gy, gm - 1, gd);
  return Math.round((targetUTC - todayUTC) / 86400000);
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** تعداد روزهای یک ماه شمسی خاص (با محاسبه دقیق، بدون فرض ثابت ۳۰ روزه) */
function jalaaliMonthLength(jy, jm) {
  const nextJy = jm === 12 ? jy + 1 : jy;
  const nextJm = jm === 12 ? 1 : jm + 1;
  return j2d(nextJy, nextJm, 1) - j2d(jy, jm, 1);
}

/** افزودن تعداد دلخواهی ماه شمسی به یک تاریخ شمسی؛ روز به‌صورت خودکار در بازه‌ی ماه مقصد محدود می‌شود */
function addJalaaliMonths(jy, jm, jd, monthsToAdd) {
  const totalMonths = jy * 12 + (jm - 1) + monthsToAdd;
  const newJy = Math.floor(totalMonths / 12);
  const newJm = ((totalMonths % 12) + 12) % 12 + 1;
  const maxDay = jalaaliMonthLength(newJy, newJm);
  const newJd = Math.min(jd, maxDay);
  return { jy: newJy, jm: newJm, jd: newJd };
}

/**
 * محاسبه‌ی تاریخ انقضای جدید پس از تمدید
 * baseIso: تاریخ مبنا به میلادی (ISO) | months: تعداد ماه (۱ تا ۱۲) | خروجی: ISO میلادی
 */
function renewIso(baseIso, months) {
  const [gy, gm, gd] = baseIso.split("-").map((p) => parseInt(p, 10));
  const j = gregorianToJalaali(gy, gm, gd);
  const newJ = addJalaaliMonths(j.jy, j.jm, j.jd, months);
  const g = jalaaliToGregorian(newJ.jy, newJ.jm, newJ.jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

module.exports = {
  jalaaliToGregorian,
  gregorianToJalaali,
  jalaliStringToISO,
  isoToJalaliString,
  daysUntil,
  todayISO,
  jalaaliMonthLength,
  addJalaaliMonths,
  renewIso,
};
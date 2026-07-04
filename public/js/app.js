(function () {
  "use strict";

  let allSubscribers = [];
  let currentView = "all"; // 'all' | 'watch'
  let editingId = null;

  const tableBody = document.getElementById("tableBody");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const form = document.getElementById("subscriberForm");
  const formError = document.getElementById("formError");
  const toastWrap = document.getElementById("toastWrap");

  // ---------------------------------------------------------------
  // ابزارها
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function toast(msg, isError) {
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s";
      setTimeout(() => el.remove(), 250);
    }, 3200);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* بدون بدنه */
    }
    if (!res.ok) {
      const msg = (data && data.error) || "خطای غیرمنتظره رخ داد";
      throw new Error(msg);
    }
    return data;
  }

  // ---------------------------------------------------------------
  // بارگذاری داده‌ها
  // ---------------------------------------------------------------
  async function loadStats() {
    const s = await api("/api/stats");
    document.getElementById("statTotal").textContent = s.total;
    document.getElementById("statSoon").textContent = s.soon;
    document.getElementById("statExpired").textContent = s.expired;
    document.getElementById("statMonitored").textContent = s.monitored;
  }

  async function loadSubscribers() {
    const q = searchInput.value.trim();
    const url = q ? `/api/subscribers?q=${encodeURIComponent(q)}` : "/api/subscribers";
    allSubscribers = await api(url);
    render();
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadSubscribers()]);
  }

  // ---------------------------------------------------------------
  // رندر جدول
  // ---------------------------------------------------------------
  function signalLevel(days) {
    if (days < 0) return 0;
    if (days <= 3) return 1;
    if (days <= 5) return 2;
    if (days <= 10) return 3;
    return 4;
  }

  function statusBadge(sub) {
    if (sub.status === "expired") return `<span class="badge badge-expired">منقضی شده</span>`;
    if (sub.status === "soon") return `<span class="badge badge-soon">رو به اتمام</span>`;
    return `<span class="badge badge-active">فعال</span>`;
  }

  function daysText(days) {
    if (days < 0) return `${Math.abs(days)} روز پیش منقضی شد`;
    if (days === 0) return "امروز منقضی می‌شود";
    return `${days} روز مانده`;
  }

  function render() {
    const list = allSubscribers.filter((s) => (currentView === "watch" ? s.monitored : true));

    document.getElementById("tabCountAll").textContent = allSubscribers.length;
    document.getElementById("tabCountWatch").textContent = allSubscribers.filter((s) => s.monitored).length;

    if (!list.length) {
      tableBody.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");

    tableBody.innerHTML = list
      .map((s) => {
        const lvl = signalLevel(s.days_remaining);
        return `
        <tr data-id="${s.id}">
          <td class="cell-name">${escapeHtml(s.name)}</td>
          <td class="mono">${escapeHtml(s.subscriber_id)}</td>
          <td class="mono">${escapeHtml(s.ip || "-")}</td>
          <td class="mono">${escapeHtml(s.mobile || "-")}</td>
          <td>
            <div class="signal-count lvl-${lvl}">
              <span class="bars"><i></i><i></i><i></i><i></i></span>
              <span class="mono days-text" title="${daysText(s.days_remaining)}">${escapeHtml(s.expiry_date_jalali)}</span>
            </div>
          </td>
          <td>${statusBadge(s)}</td>
          <td>
            <button class="monitor-toggle ${s.monitored ? "on" : ""}" data-action="monitor" data-id="${s.id}" title="${s.monitored ? "حذف از لیست نظارت" : "افزودن به لیست نظارت"}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${s.monitored ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
            </button>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn-icon" data-action="edit" data-id="${s.id}" title="ویرایش">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="btn-icon" data-action="delete" data-id="${s.id}" title="حذف">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  // ---------------------------------------------------------------
  // مودال افزودن / ویرایش
  // ---------------------------------------------------------------
  function openModal(sub) {
    editingId = sub ? sub.id : null;
    modalTitle.textContent = sub ? "ویرایش مشترک" : "افزودن مشترک جدید";
    document.getElementById("f_name").value = sub ? sub.name : "";
    document.getElementById("f_subscriber_id").value = sub ? sub.subscriber_id : "";
    document.getElementById("f_ip").value = sub ? sub.ip : "";
    document.getElementById("f_mobile").value = sub ? sub.mobile : "";
    document.getElementById("f_expiry").value = sub ? sub.expiry_date_jalali : "";
    document.getElementById("f_provider").value = sub ? sub.provider : "";
    document.getElementById("f_note").value = sub ? sub.note : "";
    formError.classList.add("hidden");
    updateExpiryPreview();
    modalOverlay.classList.remove("hidden");
    document.getElementById("f_name").focus();
  }

  function closeModal() {
    modalOverlay.classList.add("hidden");
    editingId = null;
    form.reset();
  }

  function updateExpiryPreview() {
    const val = document.getElementById("f_expiry").value.trim();
    const preview = document.getElementById("expiryPreview");
    if (!val) {
      preview.textContent = "مثال: 1404/05/12";
      return;
    }
    try {
      const iso = window.Jalali.jalaliStringToISO(val);
      if (!iso) {
        preview.textContent = "فرمت تاریخ صحیح نیست";
        return;
      }
      const days = window.Jalali.daysUntil(iso);
      preview.textContent = days >= 0 ? `${days} روز تا انقضا باقی مانده` : `${Math.abs(days)} روز از انقضا گذشته`;
    } catch (e) {
      preview.textContent = "فرمت تاریخ صحیح نیست";
    }
  }

  // ---------------------------------------------------------------
  // رویدادها
  // ---------------------------------------------------------------
  document.getElementById("btnAdd").addEventListener("click", () => openModal(null));
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("btnCancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.getElementById("f_expiry").addEventListener("input", updateExpiryPreview);

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadSubscribers, 250);
  });

  document.getElementById("viewTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    currentView = btn.dataset.view;
    document.querySelectorAll("#viewTabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });

  tableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "edit") {
      const sub = allSubscribers.find((s) => String(s.id) === id);
      openModal(sub);
    } else if (action === "delete") {
      const sub = allSubscribers.find((s) => String(s.id) === id);
      if (!confirm(`آیا از حذف مشترک «${sub.name}» مطمئن هستید؟`)) return;
      try {
        await api(`/api/subscribers/${id}`, { method: "DELETE" });
        toast("مشترک با موفقیت حذف شد");
        refreshAll();
      } catch (err) {
        toast(err.message, true);
      }
    } else if (action === "monitor") {
      try {
        await api(`/api/subscribers/${id}/monitor`, { method: "POST" });
        refreshAll();
      } catch (err) {
        toast(err.message, true);
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.classList.add("hidden");

    const payload = {
      name: document.getElementById("f_name").value.trim(),
      subscriber_id: document.getElementById("f_subscriber_id").value.trim(),
      ip: document.getElementById("f_ip").value.trim(),
      mobile: document.getElementById("f_mobile").value.trim(),
      expiry_date: document.getElementById("f_expiry").value.trim(),
      provider: document.getElementById("f_provider").value.trim(),
      note: document.getElementById("f_note").value.trim(),
    };

    try {
      if (editingId) {
        await api(`/api/subscribers/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("تغییرات با موفقیت ذخیره شد");
      } else {
        await api(`/api/subscribers`, { method: "POST", body: JSON.stringify(payload) });
        toast("مشترک جدید با موفقیت اضافه شد");
      }
      closeModal();
      refreshAll();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove("hidden");
    }
  });

  document.getElementById("btnTestTelegram").addEventListener("click", async () => {
    try {
      const res = await api("/api/test-telegram", { method: "POST" });
      if (res.ok) toast("پیام آزمایشی با موفقیت به تلگرام ارسال شد");
      else toast(res.error || "ارسال پیام ناموفق بود", true);
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---------------------------------------------------------------
  // شروع
  // ---------------------------------------------------------------
  refreshAll();
})();

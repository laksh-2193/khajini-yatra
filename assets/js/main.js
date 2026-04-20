/* ================================================================
   KHAJNI YATRA — main.js
   - Bilingual (EN/HI) toggle
   - Burger menu
   - Intersection reveal
   - Poll: checkboxes (max 3), AWS IP dedup, live counts after vote
   - Feedback: AWS IP dedup, posts to Apps Script
================================================================ */

/* ========= CONFIG ============================================= */
const CONFIG = {
  // Deploy apps-script/Code.gs as a Web App. Paste the URL below.
  // Format: https://script.google.com/macros/s/XXXX/exec
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx5uwESUJD8PYA34Ax7p4vbKDOqBo-3_xzsM2WfjN1X7ISPmgqyKTOKYrFcFjZGiqin/exec",

  // AWS public IP echo service — used to dedupe submissions by IP.
  AWS_CHECKIP_URL: "https://checkip.amazonaws.com/",

  // Yatra social pages (replace # with real URLs when available)
  FB_YATRA: "#",
  YT_YATRA: "#",
};

/* ========= DOM READY ========================================== */
document.addEventListener("DOMContentLoaded", () => {
  initLangToggle();
  initBurger();
  initHeatmap();
  initReveal();
  initForms();
  initYear();
  initExternalLinks();
  initPollCounts();
});

/* ========= HEATMAP (455 booths, dummy state) ================== */
const HEATMAP = {
  total: 455,
  // booth 1 = Bhabhaya (भभया) — first visit
  first: 1,
  done: [1, 7, 104, 262, 11, 23, 45, 88, 126, 189, 231, 275, 301, 340, 400, 420, 13, 67, 92, 118, 144, 167, 210, 235, 260, 285, 315, 355, 380, 405, 430, 450],
  now:  [32, 156, 60, 198, 250, 333, 410, 75, 109, 172],
  soon: [81, 208, 310, 100, 170, 220, 280, 360, 440, 26, 50, 115, 138, 175, 240, 295, 325, 370, 395, 425],
};
function initHeatmap() {
  const host = document.querySelector("[data-dots]");
  if (!host) return;
  const state = new Array(HEATMAP.total + 1).fill("pending");
  ["done","now","soon"].forEach(k => HEATMAP[k].forEach(n => {
    if (n >= 1 && n <= HEATMAP.total) state[n] = k;
  }));
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= HEATMAP.total; i++) {
    const dot = document.createElement("span");
    if (state[i] !== "pending") dot.dataset.state = state[i];
    if (i === HEATMAP.first) { dot.dataset.first = "1"; dot.title = "Booth 1 · Bhabhaya (first visit)"; }
    else dot.title = `Booth ${i}`;
    frag.appendChild(dot);
  }
  host.appendChild(frag);

  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
  set("[data-hm-done]", HEATMAP.done.length);
  set("[data-hm-now]",  HEATMAP.now.length);
  set("[data-hm-soon]", HEATMAP.soon.length);
}

/* ========= 1. LANGUAGE TOGGLE ================================= */
function initLangToggle() {
  const body = document.body;
  const btn  = document.querySelector("[data-lang-toggle]");

  const apply = (lang) => {
    body.dataset.lang = lang;
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
    document.querySelectorAll("[data-en][data-hi]").forEach(el => {
      const v = el.getAttribute(`data-${lang}`);
      if (v != null) el.innerHTML = v;
    });
    try { localStorage.setItem("ky-lang", lang); } catch {}
  };

  const saved = (() => { try { return localStorage.getItem("ky-lang"); } catch { return null; } })();
  apply(saved === "hi" ? "hi" : "en");

  btn?.addEventListener("click", () => {
    apply(body.dataset.lang === "en" ? "hi" : "en");
  });
}

/* ========= 2. BURGER MENU ===================================== */
function initBurger() {
  const burger = document.querySelector("[data-burger]");
  const links  = document.querySelector(".nav__links");
  if (!burger || !links) return;
  burger.addEventListener("click", () => links.classList.toggle("is-open"));
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("is-open")));
}

/* ========= 3. INTERSECTION REVEAL ============================= */
function initReveal() {
  const targets = document.querySelectorAll(
    ".section-title, .about__cols, .about__pillars article, .cand__portrait, .cand__body, .booth, .manif__stamp, .manif__body, .poll__options, .poll__foot, .fb__copy, .fb__form, .sm-card, .poster"
  );
  targets.forEach(el => el.classList.add("reveal"));

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, idx) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = Math.min(idx * 60, 240) + "ms";
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -50px 0px" });

  targets.forEach(el => io.observe(el));
}

/* ========= 4. GET PUBLIC IP (AWS) ============================= */
async function fetchIP() {
  try {
    const r = await fetch(CONFIG.AWS_CHECKIP_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("checkip " + r.status);
    const txt = (await r.text()).trim();
    // basic validation — v4 or v6 ish
    if (/^[0-9a-fA-F:.]{3,45}$/.test(txt)) return txt;
  } catch (e) { console.warn("IP fetch failed", e); }
  return "";
}

/* ========= 4b. FIRE-AND-FORGET POST ========================== */
// Apps Script doesn't reliably allow CORS-readable POST responses in all
// browsers. Fire the payload without waiting for the body (sendBeacon
// preferred, no-cors fetch fallback), then use a separate GET for data.
function firePost(url, payload) {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      if (navigator.sendBeacon(url, blob)) return true;
    }
  } catch (e) { /* fall through */ }
  try {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch (e) { return false; }
}

async function fetchPollCountsRemote() {
  const r = await fetch(CONFIG.APPS_SCRIPT_URL + "?action=counts", { cache: "no-store" });
  if (!r.ok) throw new Error("counts " + r.status);
  return r.json();
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ========= 5. POLL — checkbox max-3 enforcement =============== */
function initPollMaxPick(form) {
  const max = Number(form.dataset.maxPick) || 3;
  const boxes = form.querySelectorAll('input[type="checkbox"][name="priority"]');
  const update = () => {
    const checked = Array.from(boxes).filter(b => b.checked);
    boxes.forEach(b => {
      if (!b.checked) b.disabled = checked.length >= max;
    });
  };
  boxes.forEach(b => b.addEventListener("change", update));
  update();
}

/* ========= 6. FORMS → APPS SCRIPT ============================= */
function initForms() {
  document.querySelectorAll("form[data-form]").forEach(form => {
    const kind = form.dataset.form;

    if (kind === "poll") initPollMaxPick(form);

    // Block repeat submissions from this device
    const localKey = "ky-submitted-" + kind;
    if (localStorage.getItem(localKey)) {
      if (kind === "poll") {
        form.classList.add("is-submitted");
        showPollResults(form); // show last known counts
      } else {
        setStatus(form, true,
          "You've already sent a message from this device. Dhanyavaad.",
          "आप पहले ही संदेश भेज चुके हैं। धन्यवाद।");
        form.querySelector('button[type=submit]')?.setAttribute("disabled", "true");
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");

      // validation
      if (kind === "poll") {
        const picks = form.querySelectorAll('input[name="priority"]:checked');
        if (picks.length < 1) {
          setStatus(form, false, "Pick at least one priority.", "कम से कम एक विकल्प चुनें।");
          return;
        }
        if (picks.length > 3) {
          setStatus(form, false, "Maximum 3 priorities.", "अधिकतम ३ विकल्प।");
          return;
        }
      } else if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // payload
      const payload = { formType: kind };
      const fd = new FormData(form);
      const priorities = [];
      fd.forEach((v, k) => {
        if (k === "priority") priorities.push(String(v));
        else payload[k] = v;
      });
      if (kind === "poll") payload.priority = priorities.join("|");

      payload.submittedAt = new Date().toISOString();
      payload.userAgent = navigator.userAgent;
      payload.pageLang = document.body.dataset.lang;
      payload.ip = await fetchIP();

      if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes("REPLACE_WITH")) {
        setStatus(form, false,
          "Form endpoint not configured. Set APPS_SCRIPT_URL in main.js.",
          "फ़ॉर्म endpoint सेट नहीं है। main.js में APPS_SCRIPT_URL भरें।");
        return;
      }

      btn && (btn.disabled = true);
      setStatus(form, true, "Sending…", "भेजा जा रहा है…");

      // Fire-and-forget. Response body is opaque under no-cors/sendBeacon,
      // so trust the local write and fetch counts separately for polls.
      const fired = firePost(CONFIG.APPS_SCRIPT_URL, payload);
      if (!fired) {
        setStatus(form, false,
          "Could not send. Please try again in a moment.",
          "भेजने में दिक़्क़त। कृपया थोड़ी देर में फिर से कोशिश करें।");
        btn && (btn.disabled = false);
        return;
      }

      localStorage.setItem(localKey, "1");

      if (kind === "poll") {
        form.classList.add("is-submitted");
        setStatus(form, true,
          "Vote recorded. Fetching live results…",
          "मत दर्ज हुआ। परिणाम लाए जा रहे हैं…");
        // Give the Apps Script a beat to write the row.
        await wait(1500);
        try {
          const data = await fetchPollCountsRemote();
          if (data && data.counts) renderPollCounts(form, data.counts);
          setStatus(form, true,
            "Vote recorded. See what others think ↓",
            "मत दर्ज हुआ। दूसरे क्या सोचते हैं — देखें ↓");
        } catch (err) {
          console.warn(err);
          setStatus(form, true,
            "Vote recorded. Results will appear on next reload.",
            "मत दर्ज हुआ। परिणाम अगली बार दिखेंगे।");
        }
      } else {
        form.reset();
        setStatus(form, true,
          "Sent. Chote Bhai will read your message.",
          "भेज दिया गया। छोटे भाई आपका संदेश पढ़ेंगे।");
        btn && (btn.disabled = true);
      }
    });
  });
}

function setStatus(form, ok, en, hi) {
  const s = form.querySelector("[data-status]");
  if (!s) return;
  s.classList.remove("is-ok", "is-err");
  s.classList.add(ok ? "is-ok" : "is-err");
  s.textContent = document.body.dataset.lang === "hi" ? hi : en;
}

/* ========= 7. RENDER POLL COUNTS ============================== */
function renderPollCounts(form, counts) {
  try { localStorage.setItem("ky-poll-counts", JSON.stringify(counts)); } catch {}
  const opts = form.querySelectorAll(".poll__opt");
  let total = 0;
  Object.values(counts).forEach(n => (total += Number(n) || 0));
  let max = 1;
  Object.values(counts).forEach(n => { if (n > max) max = n; });

  opts.forEach(opt => {
    const val = opt.querySelector("input").value;
    const n = counts[val] || 0;
    const bar = opt.querySelector("[data-bar]");
    if (!bar) return;
    const i = bar.querySelector("i");
    const b = bar.querySelector("b");
    const pct = Math.round((n / max) * 100);
    i.style.setProperty("--w", pct + "%");
    b.textContent = n;
    const share = total ? Math.round((n / total) * 100) : 0;
    bar.title = `${n} vote${n === 1 ? "" : "s"} · ${share}% of ${total}`;
  });

  const totalEl = form.querySelector("[data-poll-total]");
  if (totalEl) {
    const en = `${total} vote${total === 1 ? "" : "s"} recorded so far.`;
    const hi = `अब तक ${total} मत दर्ज।`;
    totalEl.textContent = document.body.dataset.lang === "hi" ? hi : en;
  }
}

function showPollResults(form) {
  // On page load, if user already voted, fetch latest counts.
  initPollCounts(form);
}

async function initPollCounts(formMaybe) {
  const form = formMaybe || document.querySelector('form[data-form="poll"]');
  if (!form) return;
  const alreadySubmitted = localStorage.getItem("ky-submitted-poll");
  if (!alreadySubmitted) return;
  form.classList.add("is-submitted");

  // cached first for instant paint
  try {
    const cached = localStorage.getItem("ky-poll-counts");
    if (cached) renderPollCounts(form, JSON.parse(cached));
  } catch {}

  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes("REPLACE_WITH")) return;

  try {
    const data = await fetchPollCountsRemote();
    if (data && data.ok && data.counts) renderPollCounts(form, data.counts);
  } catch { /* silent */ }
}

/* ========= 8. FOOTER YEAR + EXTERNAL LINKS ==================== */
function initYear() {
  document.querySelectorAll("[data-year]").forEach(el => { el.textContent = new Date().getFullYear(); });
}

function initExternalLinks() {
  const fb = document.querySelector("[data-fb-yatra]");
  if (fb) fb.href = CONFIG.FB_YATRA;
  const yt = document.querySelector("[data-yt-yatra]");
  if (yt) yt.href = CONFIG.YT_YATRA;
}

/*!
 * ATT/DES Analytics — truck.js (v2)
 * Drop-in tracker: <script src="https://YOUR-HOST/truck.js" defer></script>
 * Works automatically on attdes.online and any *.attdes.online subdomain.
 */
(function () {
  "use strict";

  // ====================== CONFIG — EDIT THESE TWO LINES ======================
  var SUPABASE_URL = "https://sfsrquxrayrqljwszwhek.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc3JxdXJheXJxbGp3c3p3aGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNjY4MjksImV4cCI6MjEwMjg0MjgyOX0.v716gJO5zsm1QwIZu3_gnIhg-M70ESvlgAGbZeuHEgY";
  // ============================================================================

  var ALLOWED_ROOT = "attdes.online";
  var ALSO_ALLOW = ["localhost", "127.0.0.1"]; // أزل هذه للاستخدام الإنتاجي الصارم
  var PING_INTERVAL_MS = 20000;
  var MAX_RETRY_DELAY_MS = 30000; // أقصى وقت لإعادة المحاولة

  var host = location.hostname;
  var allowed =
    host === ALLOWED_ROOT ||
    host.endsWith("." + ALLOWED_ROOT) ||
    ALSO_ALLOW.indexOf(host) !== -1;

  if (!allowed) {
    // لا تفعل شيئاً في النطاقات غير المسموحة
    return;
  }

  // ---------------------------- helpers ----------------------------
  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    try {
      var id = localStorage.getItem("attdes_vid");
      if (!id) {
        id = uuid();
        localStorage.setItem("attdes_vid", id);
      }
      return id;
    } catch (e) {
      return "novid-" + uuid();
    }
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem("attdes_sid");
      if (!id) {
        id = uuid();
        sessionStorage.setItem("attdes_sid", id);
      }
      return id;
    } catch (e) {
      return "nosid-" + uuid();
    }
  }

  function parseUA(ua) {
    ua = ua || navigator.userAgent || "";
    var browser = "Unknown",
      os = "Unknown",
      device = "desktop";

    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\//.test(ua)) browser = "Opera";
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
    else if (/MSIE|Trident/.test(ua)) browser = "Internet Explorer";

    if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua) && !/Mobile/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    if (/Mobi|Android/.test(ua) && !/Tablet|iPad/.test(ua)) device = "mobile";
    else if (/Tablet|iPad/.test(ua)) device = "tablet";

    return { browser: browser, os: os, device: device };
  }

  function getUTM() {
    var p = new URLSearchParams(location.search);
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_term: p.get("utm_term"),
      utm_content: p.get("utm_content"),
    };
  }

  function sb(path, opts) {
    opts = opts || {};
    var headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    if (opts.prefer) headers["Prefer"] = opts.prefer;
    return fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive,
    }).then(function (resp) {
      if (!resp.ok) {
        // نحول الخطأ إلى رفض الوعد مع تفاصيل الحالة
        return resp.text().then(function (text) {
          throw new Error("Supabase error " + resp.status + ": " + text);
        });
      }
      return resp;
    });
  }

  // ---------------------------- state ----------------------------
  var ua = parseUA();
  var utm = getUTM();
  var siteId = host;
  var visitorId = getVisitorId();
  var sessionId = getSessionId();
  var startedAt = Date.now();
  var sessionEnsured = false;
  var pendingEvents = []; // قائمة انتظار للأحداث إذا فشل إنشاء الجلسة
  var retryTimeout = null;

  // الدالة الأساسية لضمان وجود الموقع والجلسة (مع إعادة المحاولة التلقائية)
  function ensureSiteAndSession() {
    if (sessionEnsured) {
      return Promise.resolve();
    }

    // ننفذ الطلبات بالتسلسل
    return sb("sites?on_conflict=site_id", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: [{ site_id: siteId, domain: host, name: host }],
    })
      .then(function () {
        return sb("sessions?on_conflict=session_id", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=minimal",
          body: [
            {
              session_id: sessionId,
              site_id: siteId,
              visitor_id: visitorId,
              device: ua.device,
              browser: ua.browser,
              os: ua.os,
              language: navigator.language,
              referrer: document.referrer || null,
              utm_source: utm.utm_source,
              utm_medium: utm.utm_medium,
              utm_campaign: utm.utm_campaign,
              utm_term: utm.utm_term,
              utm_content: utm.utm_content,
            },
          ],
        });
      })
      .then(function () {
        sessionEnsured = true;
        // بعد نجاح الجلسة، نرسل أي أحداث كانت معلقة
        if (pendingEvents.length > 0) {
          var eventsToSend = pendingEvents.slice();
          pendingEvents = [];
          return Promise.all(eventsToSend.map(function (ev) { return logEvent(ev.type, ev.extra); }));
        }
      })
      .catch(function (err) {
        console.warn("ATT/DES: Failed to ensure session, will retry later.", err);
        // نعيد جدولة المحاولة بعد فترة (تزايدية)
        if (!retryTimeout) {
          retryTimeout = setTimeout(function () {
            retryTimeout = null;
            sessionEnsured = false; // نسمح بإعادة المحاولة
            ensureSiteAndSession().catch(function () { /* تجاهل الأخطاء المتكررة */ });
          }, Math.min(5000 + Math.random() * 10000, MAX_RETRY_DELAY_MS));
        }
        return Promise.reject(err);
      });
  }

  function ping(keepalive) {
    var duration = Math.round((Date.now() - startedAt) / 1000);
    return sb("sessions?session_id=eq." + encodeURIComponent(sessionId), {
      method: "PATCH",
      prefer: "return=minimal",
      keepalive: keepalive,
      body: { last_ping: new Date().toISOString(), duration: duration },
    }).catch(function () {
      // لا نريد أن يفشل الـ ping بشكل ظاهر
    });
  }

  function logEvent(type, extra) {
    var payload = Object.assign(
      {
        session_id: sessionId,
        site_id: siteId,
        event_type: type,
        page_url: location.href,
        page_title: document.title,
      },
      extra || {}
    );

    // إذا لم تكن الجلسة مؤكدة بعد، نضع الحدث في قائمة الانتظار
    if (!sessionEnsured) {
      pendingEvents.push({ type: type, extra: extra });
      // نحاول ضمان الجلسة (قد تكون قيد المحاولة)
      ensureSiteAndSession().catch(function () {});
      return Promise.resolve(); // لا ننتظر
    }

    return sb("events", {
      method: "POST",
      prefer: "return=minimal",
      body: [payload],
    }).catch(function (err) {
      console.warn("ATT/DES: Failed to log event, will retry on next session ensure.", err);
      // في حال فشل إرسال الحدث، نعيد وضعه في قائمة الانتظار
      pendingEvents.push({ type: type, extra: extra });
    });
  }

  function trackPageview() {
    ensureSiteAndSession()
      .then(function () {
        return logEvent("pageview");
      })
      .catch(function () {});
  }

  // ---------------------------- التهيئة ----------------------------
  // أول صفحة
  trackPageview();

  // الـ Ping الدوري
  var pingTimer = setInterval(function () {
    ping(false);
  }, PING_INTERVAL_MS);

  // عند إخفاء الصفحة أو إغلاقها
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      ping(true);
      // نرسل أي أحداث معلقة قد تكون موجودة (لكنها ستُرسل عند نجاح الجلسة لاحقاً)
    }
  });
  window.addEventListener("pagehide", function () {
    ping(true);
  });

  // تتبع النقرات على الروابط والأزرار والعناصر ذات السمة data-track
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest ? e.target.closest("a, button, [data-track]") : null;
      if (!el) return;
      var label =
        el.getAttribute("data-label") ||
        el.getAttribute("aria-label") ||
        (el.textContent || "").trim().slice(0, 100) ||
        el.tagName.toLowerCase();
      logEvent("click", { target_label: label });
    },
    true
  );

  // دعم تطبيقات SPA (تغيير المسار دون إعادة تحميل الصفحة)
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var ret = orig.apply(this, arguments);
      // نستخدم setTimeout لتجنب تنفيذ trackPageview قبل اكتمال تغيير الحالة
      setTimeout(trackPageview, 0);
      return ret;
    };
  });
  window.addEventListener("popstate", trackPageview);
})();
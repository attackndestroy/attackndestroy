(function () {
  const SUPABASE_URL = "https://jphbbwvncyxwaforfrnx.supabase.co";
  const SUPABASE_KEY = "sb_publishable_OgE_7eKXWZzYqeRe1uLKWQ_z9kzwJEY";

  function getBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("SamsungBrowser")) return "Samsung Internet";
    if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
    if (ua.includes("Edge")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    return "Browser";
  }

  function getOS() {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "MacOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("like Mac")) return "iOS";
    return "OS";
  }

  function getUTM() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || ""
    };
  }

  let visitorId = localStorage.getItem("attdes_visitor_id");
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("attdes_visitor_id", visitorId);
  }

  const currentDomain = window.location.hostname || "attdes.online";
  let siteId = null;
  let sessionId = null;
  let startTime = Date.now();

  async function api(endpoint, method = "GET", body = null) {
    const headers = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=representation"
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      const data = await res.json();
      
      if (!res.ok) {
        console.error(`[Supabase Error ${res.status}] on ${method} ${endpoint}:`, data);
      } else {
        console.log(`[Supabase Success] ${method} ${endpoint}:`, data);
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error(`[Fetch Network Error] on ${method} ${endpoint}:`, err);
      return { ok: false, error: err };
    }
  }

  async function initTracking() {
    // 1. جلب أو إنشاء site_id
    let siteRes = await api(`sites?domain=eq.${currentDomain}`);
    if (siteRes.ok && Array.isArray(siteRes.data) && siteRes.data.length > 0) {
      siteId = siteRes.data[0].site_id;
    } else {
      let createSite = await api("sites", "POST", { domain: currentDomain, name: currentDomain });
      if (createSite.ok && Array.isArray(createSite.data) && createSite.data.length > 0) {
        siteId = createSite.data[0].site_id;
      }
    }

    if (!siteId) {
      console.error("فشل الحصول على site_id، توقف التتبع.");
      return;
    }

    // 2. إرسال الجلسة POST
    const sessionData = {
      site_id: siteId,
      visitor_id: visitorId,
      device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
      browser: getBrowser(),
      os: getOS(),
      language: navigator.language || "ar",
      referrer: document.referrer || "Direct",
      utm: getUTM(),
      duration: 0,
      last_ping: new Date().toISOString()
    };

    const sessionRes = await api("sessions", "POST", sessionData);

    if (sessionRes.ok && Array.isArray(sessionRes.data) && sessionRes.data.length > 0) {
      sessionId = sessionRes.data[0].session_id;

      // 3. إرسال حدث زيارة الصفحة POST
      logEvent("pageview", window.location.href, document.title, "زيارة صفحة");

      // 4. تحديث مدة البقاء كل 10 ثوانٍ (PATCH)
      setInterval(() => {
        if (!sessionId) return;
        const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        api(`sessions?session_id=eq.${sessionId}`, "PATCH", {
          last_ping: new Date().toISOString(),
          duration: durationSeconds
        });
      }, 10000);
    }
  }

  async function logEvent(eventType, url, title, label) {
    if (!siteId || !sessionId) return;
    await api("events", "POST", {
      session_id: sessionId,
      site_id: siteId,
      event_type: eventType,
      page_url: url,
      page_title: title,
      target_label: label
    });
  }

  document.addEventListener("click", function (e) {
    const target = e.target.closest("a, button, input");
    if (target) {
      const label = target.innerText.trim().substring(0, 20) || target.tagName;
      logEvent("click", window.location.href, document.title, label);
    }
  });

  initTracking();
})();

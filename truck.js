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
    return "Unknown";
  }

  function getOS() {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "MacOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("like Mac")) return "iOS";
    return "Unknown";
  }

  function getDevice() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
  }

  function getUTM() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || null,
      utm_medium: params.get("utm_medium") || null,
      utm_campaign: params.get("utm_campaign") || null,
      utm_term: params.get("utm_term") || null,
      utm_content: params.get("utm_content") || null
    };
  }

  let visitorId = localStorage.getItem("attdes_visitor_id");
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem("attdes_visitor_id", visitorId);
  }

  const currentDomain = window.location.hostname || "localhost";
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    return res.json();
  }

  async function initTracking() {
    try {
      let sites = await api(`sites?domain=eq.${currentDomain}`);
      if (!Array.isArray(sites) || sites.length === 0) {
        sites = await api("sites", "POST", { domain: currentDomain, name: currentDomain });
      }
      siteId = sites[0].site_id;

      const sessionData = {
        site_id: siteId,
        visitor_id: visitorId,
        device: getDevice(),
        browser: getBrowser(),
        os: getOS(),
        language: navigator.language || "en",
        referrer: document.referrer || "Direct / None",
        utm: getUTM(),
        duration: 0,
        last_ping: new Date().toISOString()
      };

      const sessionRes = await api("sessions", "POST", sessionData);
      sessionId = sessionRes[0].session_id;

      logEvent("pageview", window.location.href, document.title, "page_load");

      // Ping كل 10 ثوانٍ لتحديث مدة البقاء وتتبع التفاعل
      setInterval(() => {
        if (!sessionId) return;
        const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        fetch(`${SUPABASE_URL}/rest/v1/sessions?session_id=eq.${sessionId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({
            last_ping: new Date().toISOString(),
            duration: durationSeconds
          })
        });
      }, 10000);

    } catch (err) {
      console.error("ATT/DES Tracking Error:", err);
    }
  }

  async function logEvent(eventType, url, title, label) {
    if (!siteId || !sessionId) return;
    api("events", "POST", {
      session_id: sessionId,
      site_id: siteId,
      event_type: eventType,
      page_url: url,
      page_title: title,
      target_label: label
    });
  }

  document.addEventListener("click", function (e) {
    const target = e.target.closest("a, button, input, div");
    if (target) {
      const label = target.innerText.trim().substring(0, 30) || target.getAttribute("aria-label") || target.tagName;
      logEvent("click", window.location.href, document.title, label);
    }
  });

  initTracking();
})();

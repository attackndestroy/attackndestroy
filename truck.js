(function () {
  // 1. المعرفات والإعدادات المأخوذة من مشروعك
  const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
  const PROJECT_ID = '6a864872000d5c2e73fa';
  const DATABASE_ID = '6a864b5700077b69880f';

  // قم بتغيير هذا المعرف إلى معرف الموقع الخطي من جدول sites الخاص بك
  const SITE_ID = 'YOUR_SITE_ID'; 

  // 2. توليد معرفات الزائر والجلسة
  function getOrSetID(storage, key, prefix) {
    let id = storage.getItem(key);
    if (!id) {
      id = prefix + '_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      storage.setItem(key, id);
    }
    return id;
  }

  const visitorId = getOrSetID(localStorage, 'att_visitor_id', 'vstr');
  const isNewSession = !sessionStorage.getItem('att_session_id');
  const sessionId = getOrSetID(sessionStorage, 'att_session_id', 'sess');

  // 3. استخراج معلومات الجهاز ومتصفح الزائر
  const ua = navigator.userAgent;
  const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Other';
  const os = ua.includes('Android') ? 'Android' : ua.includes('Windows') ? 'Windows' : ua.includes('iPhone') ? 'iOS' : 'Other';
  const device = /Mobi|Android/i.test(ua) ? 'Mobile' : 'Desktop';

  // 4. دالة إرسال البيانات مباشرة عبر REST API الخاصة بـ Appwrite
  async function createDocument(tableId, data) {
    try {
      const response = await fetch(`${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${tableId}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': PROJECT_ID
        },
        body: JSON.stringify({
          documentId: 'unique()',
          data: data
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[ATT/DES Analytics Error - ${tableId}]:`, errorData.message);
      }
    } catch (err) {
      console.error(`[ATT/DES Analytics Network Error]:`, err);
    }
  }

  // 5. إنشاء الجلسة في جدول sessions عند الزيارة الأولى
  if (isNewSession) {
    createDocument('sessions', {
      session_id: sessionId,
      site_id: SITE_ID,
      visitor_id: visitorId,
      is_new: true,
      device: device,
      os: os,
      browser: browser,
      language: navigator.language || 'en',
      referrer: document.referrer || 'Direct',
      last_ping: new Date().toISOString()
    });
  }

  // 6. تسجيل زيارة الصفحة في جدول events
  createDocument('events', {
    site_id: SITE_ID,
    session_id: sessionId,
    event_type: 'pageview',
    page_url: window.location.href,
    page_title: document.title || 'Untitled',
    target_label: null
  });

  // 7. تتبع النقرات على الأزرار والروابط في جدول events
  document.addEventListener('click', function (e) {
    const target = e.target.closest('a, button, [role="button"]');
    if (target) {
      const label = target.innerText.trim() || target.id || target.className || target.tagName;
      createDocument('events', {
        site_id: SITE_ID,
        session_id: sessionId,
        event_type: 'click',
        page_url: window.location.href,
        page_title: document.title || 'Untitled',
        target_label: label.substring(0, 100)
      });
    }
  });
})();

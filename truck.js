(function () {
  const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
  const PROJECT_ID = '6a864872000d5c2e73fa';
  const DATABASE_ID = '6a864b5700077b69880f';

  // دالة إرسال الجلسة
  async function sendSession() {
    try {
      const response = await fetch(`${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/sessions/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': PROJECT_ID
        },
        body: JSON.stringify({
          documentId: 'unique()',
          data: {
            session_id: 'sess_' + Math.random().toString(36).substring(2, 9),
            site_id: 'site_main',
            visitor_id: 'vstr_' + Math.random().toString(36).substring(2, 9),
            is_new: true,
            device: 'Mobile',
            os: 'Android',
            browser: 'Chrome',
            language: 'ar',
            last_ping: new Date().toISOString()
          }
        })
      });

      const result = await response.json();
      if (response.ok) {
        alert('✅ نجاح! تم تسجيل الزيارة بنجاح في Appwrite');
      } else {
        alert('❌ خطأ من Appwrite: ' + result.message);
      }
    } catch (err) {
      alert('❌ خطأ في الشبكة: ' + err.message);
    }
  }

  // تشغيل الإرسال فور فتح الصفحة
  sendSession();
})();

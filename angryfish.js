(function() {
    // التأكد أن الكود يعمل فقط على موقعك
    if (!window.location.hostname.endsWith("attdes.online")) return;

    // جلب معلومات الزائر
    fetch('https://ipapi.co/json/')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var message = "🚨 زائر جديد وصل لموقعك!\n\n" +
                          "🌐 الصفحة: " + window.location.href + "\n" +
                          "📍 البلد: " + (data.country_name || 'غير معروف') + "\n" +
                          "🏙️ المدينة: " + (data.city || 'غير معروفة') + "\n" +
                          "💻 الـ IP: " + data.ip + "\n" +
                          "📱 الجهاز: " + navigator.userAgent;

            var botToken = "8937491933:AAFF536VliIGoDYHcSh4n8MK7n_K9IPPFqY";
            var chatId = "8821973500"; // هذا هو رقمك الذي أرسلته للتو

            // إرسال الإشعار إلى بوت تليجرام الخاص بك
            fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message })
            });
        }).catch(function(e) {});
})();

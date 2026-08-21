(function(){
  const API_URL = "https://vcxajhvvsmhwtnapxyje.supabase.co/functions/v1/dynamic-task";
  const SITE_ID = "3de7a517-e965-4ec5-860c-29509222e776"; // بتاعك
  
  const session_id = localStorage.getItem('truck_session') || crypto.randomUUID();
  localStorage.setItem('truck_session', session_id);

  // اول ما يدخل الموقع
  fetch(API_URL, {
    method: 'POST', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify({type: 'new_session', session_id, site_id: SITE_ID, page: location.pathname, domain: location.hostname})
  });

  // مع كل صفحة
  fetch(API_URL, {
    method: 'POST', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify({type: 'pageview', session_id, site_id: SITE_ID, path: location.pathname})
  });

  // اي ضغطة
  document.addEventListener('click', (e) => {
    fetch(API_URL, {
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({type: 'click', session_id, site_id: SITE_ID, target: e.target.tagName, path: location.pathname})
    });
  });
})();
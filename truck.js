(function(){
  const SITE_ID = "3de7a517-e965-4ec5-860c-29509222e776";
  const SUPABASE_URL = "https://vcxajhvvsmhwtnapxyje.supabase.co/rest/v1/events";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeGFqaHZ2c21od3RuYXB4eWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMzIxMzAsImV4cCI6MjEwMjkwODEzMH0.5_4Bc4wkxXGgW2pS1fTzikVBrsktujqbH3v_9bIO0vY";

  function sendEvent(type, data = {}) {
    const payload = {
      site_id: SITE_ID,
      type: type,
      path: location.pathname,
      referrer: document.referrer || 'direct',
      language: navigator.language,
      session_id: sessionStorage.getItem('truck_sid') || crypto.randomUUID(),
      data: data,
      created_at: new Date().toISOString()
    };
    sessionStorage.setItem('truck_sid', payload.session_id);

    navigator.sendBeacon(SUPABASE_URL + `?apikey=${SUPABASE_KEY}`, JSON.stringify(payload));
  }

  window.addEventListener('load', ()=> sendEvent('pageview'));
  
  document.addEventListener('click', (e) => {
    sendEvent('click', { element: e.target.tagName });
  });

})();
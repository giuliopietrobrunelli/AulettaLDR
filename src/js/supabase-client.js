import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL     = 'https://nafmfpmvvhiazrgvhqqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hZm1mcG12dmhpYXpyZ3ZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTM5NTEsImV4cCI6MjA5NjU2OTk1MX0.1OhZbfYbG-rt3CwVsuv77gzaL1w2l3LC4hwSvacZ-Es';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// promise che si risolve solo quando la sessione (se esiste) è stata recuperata
// e il client realtime ha ricevuto il token corretto
export const sessionReady = (async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }
  return session;
})();

// tiene aggiornato il token realtime ad ogni cambio di sessione
// (login, refresh automatico del token, logout)
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }
});

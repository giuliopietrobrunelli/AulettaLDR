import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL     = 'https://nafmfpmvvhiazrgvhqqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hZm1mcG12dmhpYXpyZ3ZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTM5NTEsImV4cCI6MjA5NjU2OTk1MX0.1OhZbfYbG-rt3CwVsuv77gzaL1w2l3LC4hwSvacZ-Es';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit', // flow più sicuro per app web senza backend
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // intercetta il magic link al ritorno
  },
});

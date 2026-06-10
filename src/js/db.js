import { supabase } from './supabase-client.js';


// utente

// get info profilo utente loggato
export async function getProfiloUtente() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    return { data: null, error: sessionError ?? new Error('Non autenticato') };
  }

  const user = session.user;

  // id_utente in tabella Utente può differire da auth.users.id (creato al magic link)
  const idCandidates = [
    user.user_metadata?.id_utente,
    user.id,
  ].filter(Boolean);

  for (const id of idCandidates) {
    const { data, error } = await supabase
      .from('Utente')
      .select('*')
      .eq('id_utente', id)
      .maybeSingle();

    if (data) return { data, error: null };
    if (error) return { data: null, error };
  }

  if (user.email) {
    return await supabase
      .from('Utente')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
  }

  return { data: null, error: new Error('Profilo non trovato') };
}

// turni e prenotazioni

export async function getTurniByIndici(indici) {
  return await supabase
    .from('Turno')
    .select('id_turno, indice, orario_inizio, orario_fine')
    .in('indice', indici);
}

export async function createPrenotazione({ id_utente, id_turno, data_prenotazione }) {
  return await supabase
    .from('Prenotazione')
    .insert({ id_utente, id_turno, data_prenotazione })
    .select()
    .single();
}

export async function createPrenotazioni(prenotazioni) {
  return await supabase
    .from('Prenotazione')
    .insert(prenotazioni)
    .select();
}

export async function getPrenotazioniByDateRange(startDate, endDate) {
  const { data: prenotazioni, error } = await supabase
    .from('Prenotazione')
    .select('id_prenotazione, data_prenotazione, id_utente, id_turno, Turno(indice)')
    .gte('data_prenotazione', startDate)
    .lte('data_prenotazione', endDate);

  if (error || !prenotazioni?.length) {
    return { data: prenotazioni ?? [], error };
  }

  const userIds = [...new Set(prenotazioni.map((p) => p.id_utente))];
  const { data: utenti, error: utentiError } = await supabase
    .from('Utente')
    .select('id_utente, nome, cognome')
    .in('id_utente', userIds);

  if (utentiError) return { data: [], error: utentiError };

  const utenteById = new Map((utenti ?? []).map((u) => [u.id_utente, u]));

  const data = prenotazioni.map((p) => ({
    ...p,
    Utente: utenteById.get(p.id_utente) ?? null,
  }));

  return { data, error: null };
}

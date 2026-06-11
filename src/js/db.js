import { supabase } from './supabase-client.js';

// utente

// restituisce le info del profilo utente loggato
export async function getProfiloUtente() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    return { data: null, error: sessionError ?? new Error('non autenticato') };
  }

  const user = session.user;

  // l'id_utente sulla tabella può essere diverso dall'id di auth.users
  const idCandidates = [
    user.user_metadata?.id_utente,
    user.id,
  ].filter(Boolean);

  // prova a recuperare il profilo con tutti i possibili id
  for (const id of idCandidates) {
    const { data, error } = await supabase
      .from('Utente')
      .select('*')
      .eq('id_utente', id)
      .maybeSingle();

    if (data) return { data, error: null };
    if (error) return { data: null, error };
  }

  // se non trovato prova con l'email
  if (user.email) {
    return await supabase
      .from('Utente')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
  }

  return { data: null, error: new Error('profilo non trovato') };
}

// turni e prenotazioni

// restituisce i turni corrispondenti agli indici dati
export async function getTurniByIndici(indici) {
  return await supabase
    .from('Turno')
    .select('id_turno, indice, orario_inizio, orario_fine')
    .in('indice', indici);
}

// crea una nuova prenotazione singola
export async function createPrenotazione({ id_utente, id_turno, data_prenotazione }) {
  return await supabase
    .from('Prenotazione')
    .insert({ id_utente, id_turno, data_prenotazione })
    .select()
    .single();
}

// crea più prenotazioni in una volta sola
export async function createPrenotazioni(prenotazioni) {
  return await supabase
    .from('Prenotazione')
    .insert(prenotazioni)
    .select();
}

// recupera tutte le prenotazioni in un certo intervallo di date
export async function getPrenotazioniByDateRange(startDate, endDate) {
  const { data: prenotazioni, error } = await supabase
    .from('Prenotazione')
    .select('id_prenotazione, data_prenotazione, id_utente, id_turno, stato, data_conferma, Turno(indice, orario_inizio, orario_fine)')
    .gte('data_prenotazione', startDate)
    .lte('data_prenotazione', endDate);

  if (error) return { data: [], error };
  if (!prenotazioni?.length) return { data: [], error: null };

  // recupera gli utenti delle prenotazioni per avere informazioni aggiuntive
  const userIds = [...new Set(prenotazioni.map((p) => p.id_utente))];
  const { data: utenti, error: utentiError } = await supabase
    .from('Utente')
    .select('id_utente, nome, cognome, foto_profilo')
    .in('id_utente', userIds);

  if (utentiError) return { data: prenotazioni, error: utentiError };

  const utenteById = new Map((utenti ?? []).map((u) => [u.id_utente, u]));

  // aggiunge le info dell'utente alla singola prenotazione
  return {
    data: prenotazioni.map((p) => ({
      ...p,
      Utente: utenteById.get(p.id_utente) ?? null,
    })),
    error: null,
  };
}

// restituisce tutte le prenotazioni di un utente da una certa data
export async function getPrenotazioniUtente(id_utente, fromDate) {
  const { data: prenotazioni, error } = await supabase
    .from('Prenotazione')
    .select('id_prenotazione, data_prenotazione, id_utente, id_turno, stato, data_conferma, Turno(indice, orario_inizio, orario_fine)')
    .eq('id_utente', id_utente)
    .gte('data_prenotazione', fromDate)
    .order('data_prenotazione');

  if (error) return { data: [], error };
  if (!prenotazioni?.length) return { data: [], error: null };

  return { data: prenotazioni, error: null };
}

// restituisce tutti i turni ordinati per indice
export async function getAllTurni() {
  return await supabase
    .from('Turno')
    .select('id_turno, indice, orario_inizio, orario_fine')
    .order('indice');
}

// conferma la presenza a una prenotazione aggiorando stato e data_conferma
export async function confermaPresenza(id_prenotazione) {
  return await supabase
    .from('Prenotazione')
    .update({
      data_conferma: new Date().toISOString(),
      stato: 'confermata',
    })
    .eq('id_prenotazione', id_prenotazione)
    .select()
    .single();
}

// aggiorna i campi di profilo di un utente dato l'id
export async function updateProfiloUtente(id_utente, fields) {
  return await supabase
    .from('Utente')
    .update(fields)
    .eq('id_utente', id_utente)
    .select()
    .single();
}

// carica e aggiorna la foto profilo utente nello storage
export async function uploadFotoProfilo(id_utente, file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'webp';
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!allowed.includes(ext)) {
    return { data: null, error: new Error('formato immagine non supportato') };
  }

  const path = `${id_utente}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('profili-utente')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { data: null, error: uploadError };

  const { data: urlData } = supabase.storage.from('profili-utente').getPublicUrl(path);
  const foto_profilo = `${urlData.publicUrl}?t=${Date.now()}`;

  return await updateProfiloUtente(id_utente, { foto_profilo });
}

// restituisce tutti gli utenti escluso quello loggato (per la funzione cedi turno)
export async function getAllUtenti() {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;

  return await supabase
    .from('Utente')
    .select('id_utente, nome, cognome, numero_tessera')
    .neq('id_utente', myId ?? '')
    .order('cognome');
}

// annulla una prenotazione soltanto se è dell'utente loggato
export async function annullaPrenotazione(id_prenotazione) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  return await supabase
    .from('Prenotazione')
    .delete()
    .eq('id_prenotazione', id_prenotazione)
    .eq('id_utente', myId); // garantisce che l'utente possa cancellare solo le proprie
}

// cede una prenotazione a un altro utente aggiornando id_utente
export async function cediPrenotazione(id_prenotazione, id_utente_destinatario) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  return await supabase
    .from('Prenotazione')
    .update({
      id_utente: id_utente_destinatario,
      stato: 'non_confermata',
      data_conferma: null,
    })
    .eq('id_prenotazione', id_prenotazione)
    .eq('id_utente', myId)
    .select()
    .single();
}
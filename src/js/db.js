import { supabase } from './supabase-client.js';

// ─── get informazioni utente loggato e altri utenti ────────────────────────────────────────────

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

// restituisce tutti gli utenti escluso quello loggato (per la funzione cedi turno)
export async function getAllUtentiRegistrati() {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;

  return await supabase
    .from('Utente')
    .select('id_utente, nome, cognome, numero_tessera')
    .neq('id_utente', myId ?? '')
    .eq('registrato', true)
    .order('cognome');
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

// ─── get informazioni sui turni ────────────────────────────────────────────

// restituisce i turni corrispondenti agli indici dati
export async function getTurniByIndici(indici) {
  return await supabase
    .from('Turno')
    .select('id_turno, indice, orario_inizio, orario_fine')
    .in('indice', indici);
}

// crea una nuova prenotazione singola
export async function createPrenotazione({ id_utente, id_turno, data_prenotazione }) {
  const { data, error } = await supabase
    .from('Prenotazione')
    .insert({ id_utente, id_turno, data_prenotazione })
    .select()
    .single();

  if (error?.code === '23505') {
    return { data: null, error: { ...error, userMessage: 'turno già occupato' } };
  }

  return { data, error };
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

// invia una richiesta di cessione (non sposta più il turno direttamente)
export async function cediPrenotazione(id_prenotazione, id_destinatario) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  // verifica che la prenotazione appartenga ancora al mittente e recupera i dati del turno per popolare la notifica
  const { data: pren, error: prenError } = await supabase
    .from('Prenotazione')
    .select('id_prenotazione, id_utente, data_prenotazione, Turno:id_turno (indice, orario_inizio, orario_fine)')
    .eq('id_prenotazione', id_prenotazione)
    .eq('id_utente', myId)
    .maybeSingle();

  if (prenError || !pren) {
    return { error: new Error('prenotazione non trovata o non di tua proprietà') };
  }

  // recupera i dati del mittente per il testo della notifica
  const { data: mittente } = await supabase
    .from('Utente')
    .select('nome, cognome')
    .eq('id_utente', myId)
    .maybeSingle();

  // crea la richiesta di cessione
  const { data: richiesta, error: richiestaError } = await supabase
    .from('RichiestaCessione')
    .insert({
      id_prenotazione,
      id_mittente: myId,
      id_destinatario,
    })
    .select()
    .single();

  if (richiestaError) return { data: null, error: richiestaError };

  // formatta data e turno per il contenuto della notifica
  const dataFormattata = new Date(pren.data_prenotazione).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const turno = pren.Turno;
  const nomeMittente = mittente ? `${mittente.nome} ${mittente.cognome}` : 'Un utente';

  // crea la notifica per il destinatario (fa scattare la push)
  const { error: notificaError } = await supabase
    .from('Notifica')
    .insert({
      id_utente: id_destinatario,
      tipologia: 'richiesta_cessione',
      titolo: 'Vuoi il mio turno?',
      contenuto: `${nomeMittente} vuole cederti il ${turno.indice}° turno (${turno.orario_inizio?.slice(0, 5)} - ${turno.orario_fine?.slice(0, 5)}) del ${dataFormattata}`,
      dati: {
        id_richiesta: richiesta.id_richiesta,
        id_prenotazione,
        id_mittente: myId,
      },
    });

  if (notificaError) {
    // la richiesta è comunque stata creata: logga ma non bloccare il flusso
    console.error('errore creazione notifica:', notificaError);
  }

  return { data: richiesta, error: null };
}

// carica le richieste di cessione in arrivo per l'utente loggato (ancora in_attesa)
export async function getRichiesteInArrivo() {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('RichiestaCessione')
    .select(`
      id_richiesta,
      stato,
      created_at,
      id_prenotazione,
      Prenotazione:id_prenotazione (
        data_prenotazione,
        id_utente,
        Turno:id_turno (indice, orario_inizio, orario_fine)
      ),
      Mittente:id_mittente (id_utente, nome, cognome, foto_profilo)
    `)
    .eq('id_destinatario', myId)
    .eq('stato', 'in_attesa')
    .order('created_at', { ascending: false });

  return { data: data ?? [], error };
}

// elimina la notifica di richiesta_cessione originale (fallback: normalmente ci pensa il trigger DB)
async function eliminaNotificaRichiesta(id_richiesta, id_destinatario) {
  const { error } = await supabase
    .from('Notifica')
    .delete()
    .eq('tipologia', 'richiesta_cessione')
    .eq('id_utente', id_destinatario)
    .contains('dati', { id_richiesta });

  if (error) console.error('errore cancellazione notifica richiesta:', error);
}

// crea la notifica di esito della cessione (accettata/rifiutata) per il mittente
async function notificaEsitoCessione({ id_richiesta, id_prenotazione, id_mittente, id_destinatario, turno, data_prenotazione, esito }) {
  const dataFormattata = new Date(data_prenotazione).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const { data: utente } = await supabase
    .from('Utente')
    .select('nome, cognome')
    .eq('id_utente', id_destinatario)
    .maybeSingle();

  const nomeUtente = utente ? `${utente.nome} ${utente.cognome}` : 'Un utente';
  const fasciaOraria = `${turno.orario_inizio?.slice(0, 5)} - ${turno.orario_fine?.slice(0, 5)}`;

  const testi = {
    accettata: { tipologia: 'cessione_accettata', titolo: 'Richiesta accettata', verbo: 'accettato' },
    rifiutata: { tipologia: 'cessione_rifiutata', titolo: 'Richiesta rifiutata', verbo: 'rifiutato' },
  }[esito];

  const { error } = await supabase
    .from('Notifica')
    .insert({
      id_utente: id_mittente,
      tipologia: testi.tipologia,
      titolo: testi.titolo,
      contenuto: `${nomeUtente} ha ${testi.verbo} il ${turno.indice}° turno (${fasciaOraria}) del ${dataFormattata}`,
      dati: { id_richiesta, id_prenotazione, id_destinatario },
    });

  if (error) console.error('errore creazione notifica esito:', error);
}

// accetta una richiesta: sposta la prenotazione al destinatario
export async function accettaRichiestaCessione(id_richiesta) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  const { data: richiesta, error: rErr } = await supabase
    .from('RichiestaCessione')
    .select('id_prenotazione, id_mittente, stato')
    .eq('id_richiesta', id_richiesta)
    .eq('id_destinatario', myId)
    .maybeSingle();

  if (rErr || !richiesta) return { error: new Error('richiesta non trovata') };
  if (richiesta.stato !== 'in_attesa') return { error: new Error('richiesta non più valida') };

  const { data: pren, error: pErr } = await supabase
    .from('Prenotazione')
    .select('id_prenotazione, id_utente, data_prenotazione, Turno:id_turno (indice, orario_inizio, orario_fine)')
    .eq('id_prenotazione', richiesta.id_prenotazione)
    .maybeSingle();

  if (pErr || !pren) return { error: new Error('prenotazione non trovata') };

  if (pren.id_utente !== richiesta.id_mittente) {
    await supabase.from('RichiestaCessione').update({ stato: 'scaduta' }).eq('id_richiesta', id_richiesta);
    await eliminaNotificaRichiesta(id_richiesta, myId);
    return { error: new Error('il turno non appartiene più a chi te lo ha ceduto') };
  }

  const turno = pren.Turno;
  if (turno?.orario_fine) {
    const fineTurno = new Date(`${pren.data_prenotazione}T${turno.orario_fine}`);
    if (fineTurno.getTime() <= Date.now()) {
      await supabase.from('RichiestaCessione').update({ stato: 'scaduta' }).eq('id_richiesta', id_richiesta);
      await eliminaNotificaRichiesta(id_richiesta, myId);
      return { error: new Error('il turno richiesto è già terminato') };
    }
  }

  const { error: updateErr } = await supabase
    .from('Prenotazione')
    .update({ id_utente: myId, stato: 'non_confermata', data_conferma: null })
    .eq('id_prenotazione', richiesta.id_prenotazione);

  if (updateErr) return { error: updateErr };

  await supabase.from('RichiestaCessione').update({ stato: 'accettata' }).eq('id_richiesta', id_richiesta);
  await eliminaNotificaRichiesta(id_richiesta, myId);

  await notificaEsitoCessione({
    id_richiesta,
    id_prenotazione: richiesta.id_prenotazione,
    id_mittente: richiesta.id_mittente,
    id_destinatario: myId,
    turno,
    data_prenotazione: pren.data_prenotazione,
    esito: 'accettata',
  });

  return { error: null };
}

// rifiuta una richiesta di cessione
export async function rifiutaRichiestaCessione(id_richiesta) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  const { data: richiesta, error: rErr } = await supabase
    .from('RichiestaCessione')
    .select('id_prenotazione, id_mittente, stato, Prenotazione:id_prenotazione (data_prenotazione, Turno:id_turno (indice, orario_inizio, orario_fine))')
    .eq('id_richiesta', id_richiesta)
    .eq('id_destinatario', myId)
    .maybeSingle();

  if (rErr || !richiesta) return { error: new Error('richiesta non trovata') };
  if (richiesta.stato !== 'in_attesa') return { error: new Error('richiesta non più valida') };

  const { error } = await supabase
    .from('RichiestaCessione')
    .update({ stato: 'rifiutata' })
    .eq('id_richiesta', id_richiesta)
    .eq('id_destinatario', myId);

  if (error) return { error };

  await eliminaNotificaRichiesta(id_richiesta, myId);

  const pren = richiesta.Prenotazione;
  if (pren?.Turno && pren?.data_prenotazione) {
    await notificaEsitoCessione({
      id_richiesta,
      id_prenotazione: richiesta.id_prenotazione,
      id_mittente: richiesta.id_mittente,
      id_destinatario: myId,
      turno: pren.Turno,
      data_prenotazione: pren.data_prenotazione,
      esito: 'rifiutata',
    });
  }

  return { error: null };
}

// controllo se account loggato è amministratore
export async function isAmministratore(id_utente) {
  if (!id_utente) return {data: false, error: null};

  const {data, error } = await supabase
    .from('Amministratore')
    .select('id_amministratore')
    .eq('id_utente', id_utente);

    if (error) return { data: false, error};
    

    if(data.length != 0){
      return { data: true, error: null};
    }

    return { data: false, error: null};
}
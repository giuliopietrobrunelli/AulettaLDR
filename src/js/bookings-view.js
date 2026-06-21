import {
  getPrenotazioniByDateRange,
  getPrenotazioniUtente,
  getAllTurni,
  confermaPresenza,
  getAllUtenti,
  annullaPrenotazione,
  cediPrenotazione,
} from './db.js';
import { getProfilePicUrl } from './profile-utils.js';

// array dei nomi dei mesi in italiano
const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// array dei giorni della settimana in italiano
const WEEKDAYS_FULL = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];


// massimo numero prenotazioni settimanali consentite
export const MAX_WEEKLY_BOOKINGS = 7;

// cache dei turni caricati dal db
let turniCache = null;
// timer per il refresh periodico della vista
let refreshTimer = null;

// formatta una data oggetto js in stringa yyyy-mm-dd
function formatDbDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// converte una stringa data del db in oggetto js date
function parseDbDate(str) {
  const [y, m, d] = str.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

// converte una stringa orario (hh:mm) in minuti totali
function parseTimeMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// restituisce solo ore e minuti da una stringa orario
function formatClock(timeStr) {
  return timeStr?.slice(0, 5) ?? '';
}

// crea etichetta oraria leggibile per il turno
function formatTurnLabel(turn) {
  if (!turn) return '';
  if (turn.indice === 7) return `${formatClock(turn.orario_inizio)} in poi`;
  return `${formatClock(turn.orario_inizio)} - ${formatClock(turn.orario_fine)}`;
}

// ritorna le iniziali+nome utente (es. M.Rossi)
function formatUserShortName(user) {
  if (!user?.nome || !user?.cognome) return '';
  return `${user.nome.charAt(0).toUpperCase()}.${user.cognome}`;
}

// formatta la data del giorno per titoli (es. Martedì 17 Maggio 2024)
function formatDayTitle(date) {
  const weekday = WEEKDAYS_FULL[date.getDay()];
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${label} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// trova inizio settimana (lunedì) relativa a una data
function getWeekStart(date) {
  const d = new Date(date);
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// carica i turni dal db e memorizza in cache
async function loadTurni() {
  if (turniCache) return turniCache;
  const { data, error } = await getAllTurni();
  if (error) {
    console.error('impossibile caricare i turni:', error);
    return [];
  }
  turniCache = data ?? [];
  return turniCache;
}

// determina il turno corrente in base all'orario attuale
function getCurrentTurn(turni, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();

  for (const turn of [...turni].sort((a, b) => a.indice - b.indice)) {
    const start = parseTimeMinutes(turn.orario_inizio);
    let end = parseTimeMinutes(turn.orario_fine);
    if (turn.indice === 7 || end <= start) end = 24 * 60;
    if (minutes >= start && minutes < end) return turn;
  }

  return null;
}

// verifica se una prenotazione è futura rispetto a ora
function isUpcomingBooking(prenotazione, turni, now = new Date()) {
  const date = parseDbDate(prenotazione.data_prenotazione);
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);

  if (date > todayDate) return true;
  if (date < todayDate) return false;

  const turn = turni.find((t) => t.id_turno === prenotazione.id_turno);
  if (!turn) return false;

  const current = getCurrentTurn(turni, now);
  if (current?.id_turno === prenotazione.id_turno) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return parseTimeMinutes(turn.orario_inizio) > minutes;
}

// restituisce lo stato leggibile della prenotazione (confermata/non confermata)
function getStatoInfo(prenotazione, isActive) {
  if (prenotazione.data_conferma || prenotazione.stato === 'confermata') {
    return { label: 'Confermata', className: 'confermata' };
  }
  return { label: 'Non confermata', className: 'non-confermata' };
}

// conta il numero di prenotazioni dell'utente nella settimana attuale
export function countWeeklyBookings(prenotazioni) {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return prenotazioni.filter((p) => {
    const d = parseDbDate(p.data_prenotazione);
    return d >= weekStart && d <= weekEnd;
  }).length;
}

// aggiorna la scritta con il numero di prenotazioni settimanali
function updateBookingCount(count) {
  const label = `${count}/${MAX_WEEKLY_BOOKINGS}`;
  document.querySelectorAll('[data-booking-count]').forEach((el) => {
    el.textContent = label;
  });
}

// aggiorna lo stato attuale dell'auletta (libera, tua, occupata)
function updateAulettaState(currentBooking, profilo) {
  const el = document.getElementById('auletta-state');
  if (!el) return;

  if (!currentBooking) {
    el.textContent = 'libera';
    el.className = 'available';
    return;
  }

  if (currentBooking.id_utente === profilo?.id_utente) {
    el.textContent = 'occupata da te';
    el.className = 'mine';
  } else {
    el.textContent = 'occupata';
    el.className = 'occupied';
  }
}

// genera il badge di stato (confermata/non confermata)
function createStatusBadge(prenotazione, isActive) {
  const { label, className } = getStatoInfo(prenotazione, isActive);
  const badge = document.createElement('span');
  badge.className = `reservation-status ${className}`;
  badge.textContent = label;
  return badge;
}

// genera una riga utente con foto profilo e nome breve
function createUserRow(user) {
  const row = document.createElement('div');
  row.className = 'horizontal-container';

  const img = document.createElement('img');
  img.className = 'profile-pic';
  img.src = getProfilePicUrl(user);
  img.alt = '';

  const name = document.createElement('span');
  name.textContent = formatUserShortName(user);

  row.append(img, name);
  return row;
}

// genera la card grafica di una prenotazione
function createReservationCard(prenotazione, { isActive = false, isOwn = false } = {}) {
  const turn = prenotazione.Turno;
  const card = document.createElement('div');
  card.className = 'reservation-card';
  if (isActive) card.classList.add('reservation-card-active');

  const info = document.createElement('div');
  info.className = 'reservation-info';

  const turnInfo = document.createElement('div');
  turnInfo.className = 'reservation-turn-info';

  const title = document.createElement('h2');
  title.className = 'semibold';
  title.textContent = `${turn?.indice ?? '?'}° Turno`;

  const time = document.createElement('span');
  time.textContent = formatTurnLabel(turn);

  turnInfo.append(title, time);

  const meta = document.createElement('div');
  meta.className = 'reservation-meta horizontal-container';
  meta.appendChild(createStatusBadge(prenotazione, isActive));

  info.append(turnInfo, meta);

  if (isActive) {
    const user = isOwn ? window.ldrProfilo : prenotazione.Utente;
    if (user) info.appendChild(createUserRow(user));
  }

  card.appendChild(info);

  // azioni disponibili sulla propria prenotazione
  if (isOwn) {
    const actions = document.createElement('div');
    actions.className = 'horizontal-container';

    // bottone per confermare presenza (solo attivo e non già confermata)
    if (isActive && !prenotazione.data_conferma && prenotazione.stato !== 'confermata') {
      const btnConfirm = document.createElement('button');
      btnConfirm.type = 'button';
      btnConfirm.className = 'w-text';
      btnConfirm.innerHTML = '<span>Conferma presenza</span>';
      btnConfirm.addEventListener('click', async () => {
        btnConfirm.disabled = true;
        const { error } = await confermaPresenza(prenotazione.id_prenotazione);
        if (error) {
          alert('impossibile confermare la presenza. riprova più tardi.');
          btnConfirm.disabled = false;
          return;
        }
        await refreshBookingsData();
      });
      actions.appendChild(btnConfirm);
    }

    // bottone per aprire la modifica della prenotazione
    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'w-text';
    btnEdit.innerHTML = '<span>Modifica</span>';
    btnEdit.addEventListener('click', () => openModificaModal(prenotazione));
    actions.appendChild(btnEdit);

    card.appendChild(actions);
  }

  return card;
}

// genera una riga che raccoglie prenotazioni di una certa data o sezione
function createBookingsRow(title, cards) {
  const row = document.createElement('div');
  row.className = 'bookings-row';

  const indicator = document.createElement('div');
  indicator.className = 'bookings-day-indicator';
  indicator.innerHTML = `<span>${title}</span>`;

  row.appendChild(indicator);
  cards.forEach((card) => row.appendChild(card));
  return row;
}

// aggiorna la modal riepilogo settimanale prenotazioni per il mese visualizzato
async function renderBookingsModal(profilo, viewDate) {
  const modal = document.getElementById('modal-le-mie-prenotazioni');
  if (!modal) return;

  const lista = modal.querySelector('.lista-notifiche');
  if (!lista) return;

  // usa la data passata, oppure il mese del calendario, oppure oggi
  const date = viewDate ?? window.calendarRender?.getMonthViewDate?.() ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth();

  // calcola tutte le settimane che intersecano il mese
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const weeks = [];
  let cursor = getWeekStart(firstDay);
  while (cursor <= lastDay) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    weeks.push({ start: new Date(cursor), end });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  // carica le prenotazioni dell'utente per tutto il periodo necessario
  const rangeStart = formatDbDate(weeks[0].start);
  const rangeEnd = formatDbDate(weeks[weeks.length - 1].end);
  const { data: prenotazioni } = await getPrenotazioniUtente(profilo.id_utente, rangeStart, rangeEnd);

  lista.replaceChildren();

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const { start, end } of weeks) {
    const startCopy = new Date(start); startCopy.setHours(0, 0, 0, 0);
    const endCopy = new Date(end); endCopy.setHours(0, 0, 0, 0);

    const count = (prenotazioni ?? []).filter(p => {
      const d = parseDbDate(p.data_prenotazione);
      return d >= startCopy && d <= endCopy;
    }).length;

    const row = document.createElement('div');
    row.className = 'booking-week-row';

    // Se la settimana è già passata, aggiungi la classe "past"
    if (endCopy < now) {
      row.classList.add('past');
    }

    const label = document.createElement('span');
    label.className = 'booking-week-label';
    label.textContent = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} –  ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;

    const counter = document.createElement('span');
    counter.className = 'booking-week-count';
    if (count >= MAX_WEEKLY_BOOKINGS) counter.classList.add('full');
    counter.textContent = `${count}/${MAX_WEEKLY_BOOKINGS}`;

    row.append(label, counter);
    lista.appendChild(row);
  }
}

// rende la vista delle prenotazioni dell'utente
export async function renderBookingsView() {
  const container = document.getElementById('my-bookings');
  if (!container) return;

  const profilo = window.ldrProfilo;
  // se utente non loggato mostro messaggio
  if (!profilo?.id_utente) {
    container.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'bookings-empty disabled';
    empty.textContent = 'Accedi per visualizzare le tue prenotazioni.';
    container.appendChild(empty);
    return;
  }

  // carico turni e prenotazioni odierne/mie
  const turni = await loadTurni();
  const today = formatDbDate(new Date());
  const weekStart = formatDbDate(getWeekStart(new Date()));

  const [{ data: oggiPrenotazioni }, { data: miePrenotazioni }] = await Promise.all([
    getPrenotazioniByDateRange(today, today),
    getPrenotazioniUtente(profilo.id_utente, weekStart),
  ]);

  // prendo eventuale prenotazione corrente
  const currentTurn = getCurrentTurn(turni);
  const currentBooking = currentTurn
    ? (oggiPrenotazioni ?? []).find((p) => p.id_turno === currentTurn.id_turno)
    : null;

  // aggiorno stato auletta e contatore
  updateAulettaState(currentBooking, profilo);
  updateBookingCount(countWeeklyBookings(miePrenotazioni ?? []));

  // svuoto e preparo i contenitori
  container.replaceChildren();
  const fragments = [];

  // se in questo momento c'è una prenotazione attiva per qualcuno
  if (currentBooking) {
    const isOwn = currentBooking.id_utente === profilo.id_utente;
    const title = isOwn
      ? 'Attualmente ti trovi in auletta:'
      : "Attualmente l'auletta è occupata:";

    fragments.push(
      createBookingsRow(title, [
        createReservationCard(currentBooking, { isActive: true, isOwn }),
      ]),
    );
  }

  // tutte le future prenotazioni
  const futureBookings = (miePrenotazioni ?? []).filter((p) => {
    if (currentBooking && p.id_prenotazione === currentBooking.id_prenotazione) {
      return false;
    }
    return isUpcomingBooking(p, turni);
  });

  // divisore se esistono sia attuale che future prenotazioni
  if (fragments.length && futureBookings.length) {
    const divider = document.createElement('div');
    divider.className = 'divider';
    fragments.push(divider);
  }

  // raggruppo e disegno prenotazioni future per data
  if (futureBookings.length) {
    const byDate = new Map();
    for (const p of futureBookings) {
      const key = p.data_prenotazione.split('T')[0];
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(p);
    }

    for (const [dateKey, prenotazioni] of byDate) {
      prenotazioni.sort((a, b) => (a.Turno?.indice ?? 0) - (b.Turno?.indice ?? 0));
      fragments.push(
        createBookingsRow(
          formatDayTitle(parseDbDate(dateKey)),
          prenotazioni.map((p) => createReservationCard(p, { isOwn: true })),
        ),
      );
    }
  }

  // se non ci sono prenotazioni, mostro messaggio vuoto
  if (!fragments.length) {
    const empty = document.createElement('span');
    empty.className = 'bookings-empty disabled';
    empty.textContent = currentBooking
      ? 'Nessuna altra prenotazione in programma.'
      : 'Nessuna prenotazione in programma.';
    container.appendChild(empty);
  } else {
    fragments.forEach((el) => container.appendChild(el));
  }

  await renderBookingsModal(profilo);

}

// ─── modal modifica prenotazione ────────────────────────────────────────────

// cache degli utenti caricati
let utentiCache = null;

// carica l'elenco utenti dal db e salva in cache
async function loadUtenti() {
  if (utentiCache) return utentiCache;
  const { data, error } = await getAllUtenti();
  if (error) { console.error('impossibile caricare gli utenti:', error); return []; }
  utentiCache = data ?? [];
  return utentiCache;
}

// apre il modal per modificare una prenotazione
async function openModificaModal(prenotazione) {
  const modal = document.getElementById('modal-modifica-prenotazione');
  if (!modal) return;

  const inputData   = document.getElementById('modifica-turno-data');
  const inputTurno  = document.getElementById('modifica-turno-orario');
  const selectCedi  = document.getElementById('modifica-turno-cedi');
  const btnCedi     = document.getElementById('btn-cedi-turno');
  const btnRinuncia = document.getElementById('btn-rinuncia-turno');

  // resetto i bottoni ad ogni apertura modal
  if (btnCedi)     { btnCedi.disabled = true;     btnCedi.onclick = null; }
  if (btnRinuncia) { btnRinuncia.disabled = false; btnRinuncia.onclick = null; }

  // aggiorno la data visualizzata
  if (inputData) {
    const date = parseDbDate(prenotazione.data_prenotazione);
    inputData.value = formatDayTitle(date);
  }

  // aggiorno il turno visualizzato
  if (inputTurno) {
    const turn = prenotazione.Turno;
    inputTurno.value = turn ? `${turn.indice}° Turno — ${formatTurnLabel(turn)}` : '';
  }

  // popolo la select degli utenti a cui cedere il turno
  if (selectCedi) {
    selectCedi.innerHTML = '<option value="">Seleziona utente</option>';
    const utenti = await loadUtenti();
    utenti.forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id_utente;
      opt.textContent = `${u.cognome} ${u.nome} — tessera n.${u.numero_tessera}`;
      selectCedi.appendChild(opt);
    });
    // reset della select e del suo handler
    selectCedi.value = '';
    selectCedi.onchange = () => {
      if (btnCedi) {
        btnCedi.disabled = !selectCedi.value;
        if (selectCedi.value) {
          btnCedi.classList.add("active");
        } else {
          btnCedi.classList.remove("active");
        }
      }
    };
  }

  // assegno handler ai bottoni alla fine per evitare errori
  if (btnCedi) {
    btnCedi.onclick = () => handleCediTurno(prenotazione.id_prenotazione, selectCedi);
  }

  if (btnRinuncia) {
    btnRinuncia.onclick = () => handleRinunciaTurno(prenotazione.id_prenotazione);
  }

  window.modal?.open('modifica-prenotazione');
}

// gestisce la cessione del turno ad altro utente
async function handleCediTurno(id_prenotazione, selectCedi) {
  const id_destinatario = selectCedi?.value;
  if (!id_destinatario) return;

  const nomeDestinatario = selectCedi.options[selectCedi.selectedIndex]?.text ?? 'questo utente';
  const confermato = confirm(`sei sicuro di voler cedere il turno a ${nomeDestinatario}?`);
  if (!confermato) return;

  const btnCedi = document.getElementById('btn-cedi-turno');
  if (btnCedi) {
    btnCedi.disabled = true;
  }

  const { error } = await cediPrenotazione(id_prenotazione, id_destinatario);

  if (error) {
    alert('impossibile cedere il turno. riprova più tardi.');
    if (btnCedi) {
      btnCedi.disabled = false;
    }
    return;
  }

  window.modal?.closeAll();
  utentiCache = null;
  await refreshBookingsData();
}

// gestisce la rinuncia a una prenotazione
async function handleRinunciaTurno(id_prenotazione) {
  const confermato = confirm('sei sicuro di voler rinunciare a questo turno?');
  if (!confermato) return;

  const btnRinuncia = document.getElementById('btn-rinuncia-turno');
  if (btnRinuncia) btnRinuncia.disabled = true;

  const { error } = await annullaPrenotazione(id_prenotazione);

  if (error) {
    alert('impossibile rinunciare al turno. riprova più tardi.');
    if (btnRinuncia) btnRinuncia.disabled = false;
    return;
  }

  window.modal?.closeAll();
  await refreshBookingsData();
}

// ────────────────────────────────────────────────────────────────────────────

// inizializza la vista prenotazioni e il timer di refresh automatico
export function initBookingsView() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshAulettaState(), 60_000);

  window.ldrBookings = {
    refresh: refreshBookingsData,
    refreshAulettaState,
    refreshBookingsModal: async (viewDate) => {
      const profilo = window.ldrProfilo;
      if (profilo?.id_utente) await renderBookingsModal(profilo, viewDate);
    },
  };
}

// aggiorna solo lo stato dell'auletta, senza forzare sempre la vista
export async function refreshAulettaState() {
  const profilo = window.ldrProfilo;
  if (!profilo?.id_utente) return;

  const turni = await loadTurni();
  const today = formatDbDate(new Date());
  const { data } = await getPrenotazioniByDateRange(today, today);

  const currentTurn = getCurrentTurn(turni);
  const currentBooking = currentTurn
    ? (data ?? []).find((p) => p.id_turno === currentTurn.id_turno)
    : null;

  updateAulettaState(currentBooking, profilo);

  // aggiorna la vista delle prenotazioni solo se è visibile
  if (!document.getElementById('my-bookings')?.classList.contains('hidden')) {
    await renderBookingsView();
  }
}

export async function refreshBookingsData() {
  turniCache = null;
  window.calendarRender?.invalidateBookingsCache?.();

  const profilo = window.ldrProfilo;
  if (!profilo?.id_utente) return;

  const turni = await loadTurni();
  const today = formatDbDate(new Date());
  const weekStart = formatDbDate(getWeekStart(new Date()));

  const [{ data: oggiPrenotazioni }, { data: miePrenotazioni }] = await Promise.all([
    getPrenotazioniByDateRange(today, today),
    getPrenotazioniUtente(profilo.id_utente, weekStart),
  ]);

  const currentTurn = getCurrentTurn(turni);
  const currentBooking = currentTurn
    ? (oggiPrenotazioni ?? []).find((p) => p.id_turno === currentTurn.id_turno)
    : null;

  updateAulettaState(currentBooking, profilo);
  updateBookingCount(countWeeklyBookings(miePrenotazioni ?? []));

  if (!document.getElementById('my-bookings')?.classList.contains('hidden')) {
    await renderBookingsView();
  }

  await renderBookingsModal(profilo);

}

window.ldrBookingConfig = {
  MAX_WEEKLY_BOOKINGS: 7,
  countWeeklyBookings,
};
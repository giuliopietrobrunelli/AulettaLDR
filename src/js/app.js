// importa le funzioni dal database e i moduli necessari
import {
  getProfiloUtente,
  getTurniByIndici,
  createPrenotazioni,
  getPrenotazioniByDateRange,
  getPrenotazioniUtente,
  getAllTurni,
  confermaPresenza,
  updateProfiloUtente,
  uploadFotoProfilo,
  isAmministratore,
} from './db.js';
import { initBookingsView, refreshBookingsData, initPrenotaModal } from './bookings-view.js';
import { initFeedbackModal } from './feedback.js'
import { initMainView, setMainView, registerAccountSettingsRenderer } from './main-view.js';
import { initAccountSettings, renderAccountSettings } from './account-settings-view.js';
import { syncProfilePictures } from './profile-utils.js';
import { supabase } from './supabase-client.js'
import { showToast } from './toast.js';

// ── chiave pubblica VAPID ─────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BHaLkN5pLWDWpek98BHimSKWBthlvdbrSu_j77UHw41wV38ILeoyK5YJotZf1j_xD6hWbH62npJY9OyDWpbPTQU';

// espone alcune funzioni utili globalmente
window.ldrDb = {
  supabase,
  getTurniByIndici,
  createPrenotazioni,
  getPrenotazioniByDateRange,
  getPrenotazioniUtente,
  getAllTurni,
  confermaPresenza,
  updateProfiloUtente,
  uploadFotoProfilo,
};

// ── helpers push ──────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

async function registerPushSubscription() {
  const profilo = window.ldrProfilo;
  if (!profilo?.id_utente) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { error } = await window.ldrDb.supabase
      .from('PushSubscription')
      .upsert(
        {
          id_utente: profilo.id_utente,
          subscription: subscription.toJSON(),
          user_agent: navigator.userAgent,
          endpoint: subscription.endpoint,
        },
        { onConflict: 'endpoint' }
      );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Errore registrazione push:', err);
    return false;
  }
}

// controlla se le notifiche push sono attualmente attive su questo dispositivo (permesso concesso + sottoscrizione esistente nel service worker)
export async function getPushSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, active: false };
  }

  if (Notification.permission !== 'granted') {
    return { supported: true, active: false };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    return { supported: true, active: !!subscription };
  } catch (err) {
    console.error('Errore controllo stato push:', err);
    return { supported: true, active: false };
  }
}

// disattiva le notifiche push su questo dispositivo e rimuove la sottoscrizione dal db
export async function disablePushNotifications() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      showToast('info', 'Nessuna notifica attiva da disattivare', 'bell-off');
      return true;
    }

    const endpoint = subscription.endpoint;

    // annulla la sottoscrizione lato browser
    await subscription.unsubscribe();

    // rimuove la riga corrispondente dal db, se presente
    const { error } = await window.ldrDb.supabase
      .from('PushSubscription')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      // la sottoscrizione browser è comunque annullata: logga ma non bloccare
      console.error('Errore rimozione sottoscrizione dal db:', error);
    }

    showToast('success', 'Notifiche disattivate', 'bell-off');
    return true;
  } catch (err) {
    console.error('Errore disattivazione push:', err);
    showToast('error', 'Impossibile disattivare le notifiche', 'x');
    return false;
  }
}

// questa viene chiamata solo da un click utente
export async function initPushNotifications() {

  // debug permesso notifiche o compatibilità:

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('error', 'Notifiche non supportate da questo browser', 'x');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('error', 'Permesso notifiche negato', 'x');
      return;
    }

  const ok = await registerPushSubscription();
  if (ok) showToast('success', 'Notifiche attivate', 'check');
  return ok;
}
// ── profilo utente ────────────────────────────────────────────────────────────

// carica e aggiorna i dati del profilo utente loggato
async function caricaProfiloUtente() {
  const { data: profilo, error } = await getProfiloUtente();
  if (error || !profilo) {
    console.error('Impossibile caricare il profilo:', error?.message ?? 'dati mancanti');
    return;
  }

  // salva il profilo in una variabile globale
  window.ldrProfilo = profilo;

  // aggiorna elementi della pagina col nome utente
  document.querySelectorAll('[data-get-info="username-name"]').forEach((el) => {
    el.textContent = profilo.nome;
  });
  document.querySelectorAll('[data-get-info="username-fullname"]').forEach((el) => {
    el.textContent = `${profilo.nome} ${profilo.cognome}`;
  });

  // aggiorna nome completo nel modal dell'account
  const nomeCompleto = document.querySelector('#modal-account .modal-title');
  if (nomeCompleto) nomeCompleto.textContent = `${profilo.nome} ${profilo.cognome}`;

  // aggiorna il numero tessera nel modal dell'account
  const nTessera = document.querySelector('#modal-account .modal-subtitle');
  if (nTessera) nTessera.textContent = `n.${profilo.numero_tessera}`;

  // sincronizza l'immagine del profilo
  syncProfilePictures(profilo);

  // mostra il link alla dashboard admin solo se l'utente è amministratore
  await syncAdminDashboardLink(profilo);

  // imposta la vista predefinita se necessario
  if (profilo.vista_predefinita === 'week' && window.calendarRender?.viewMode === 'month') {
    window.calendarRender.setViewMode('week');
  }

  // aggiorna le prenotazioni dopo aver caricato il profilo
  await refreshBookingsData();
}

// mostra od occulta il bottono 'Dashboard amministratore' in base al ruolo dell'utente
async function syncAdminDashboardLink(profilo) {
  
  let link = document.getElementById("dashboard-admin-link");

  // aspetta finché l'elemento non esiste

  while (!link) {

    await new Promise(resolve => setTimeout(resolve, 100));

    link = document.getElementById("dashboard-admin-link");

  }

  if(!profilo?.id_utente) return;

  const { data: isAdmin, error } = await isAmministratore(profilo.id_utente);
  if (error) {
    console.error('Impossibile verificare i permessi di amministratore', error.message);
    return;
  }

  // true --> aggiunge 'hidden', false --> rimouove (o non aggiunge) 'hidden'
  link.classList.toggle('hidden', !isAdmin);
  
}

// ── service worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    console.log('PWA pronta');
  });
}

// ── init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  registerAccountSettingsRenderer(renderAccountSettings);
  initMainView();
  initBookingsView();
  initFeedbackModal();
  initAccountSettings(setMainView);
  caricaProfiloUtente();
  initPrenotaModal();
});
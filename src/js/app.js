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
} from './db.js';
import { initBookingsView, refreshBookingsData, initPrenotaModal } from './bookings-view.js';
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

  // imposta la vista predefinita se necessario
  if (profilo.vista_predefinita === 'week' && window.calendarRender?.viewMode === 'month') {
    window.calendarRender.setViewMode('week');
  }

  // aggiorna le prenotazioni dopo aver caricato il profilo
  await refreshBookingsData();
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
  initAccountSettings(setMainView);
  caricaProfiloUtente();
  initPrenotaModal();
  // initPushNotifications();
});
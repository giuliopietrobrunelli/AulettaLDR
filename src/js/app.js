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

// espone alcune funzioni utili globalmente
window.ldrDb = {
  getTurniByIndici,
  createPrenotazioni,
  getPrenotazioniByDateRange,
  getPrenotazioniUtente,
  getAllTurni,
  confermaPresenza,
  updateProfiloUtente,
  uploadFotoProfilo,
};

// carica e aggiorna i dati del profilo utente loggato
async function caricaProfiloUtente() {
  const { data: profilo, error } = await getProfiloUtente();
  if (error || !profilo) {
    console.error('Impossibile caricare il profilo:', error?.message ?? 'dati mancanti');
    return;
  }

  // salva il profilo in una variabile globale
  window.ldrProfilo = profilo;

  // aggiorna username negli elementi della pagina
  document.querySelectorAll('[data-get-info="username-name"]').forEach((el) => {
    el.textContent = profilo.nome;
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

if ("serviceWorker" in navigator) {

  navigator.serviceWorker.register("/sw.js")
  .then(() => {
    console.log("PWA pronta");
  });
 
 }

// esegue l'inizializzazione dell'app al caricamento della pagina
document.addEventListener('DOMContentLoaded', () => {
  registerAccountSettingsRenderer(renderAccountSettings);
  initMainView();
  initBookingsView();
  initAccountSettings(setMainView);
  caricaProfiloUtente();
  initPrenotaModal();
});

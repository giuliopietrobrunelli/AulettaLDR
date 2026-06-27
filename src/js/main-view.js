import { renderBookingsView } from './bookings-view.js';

// funzione da chiamare per mostrare le impostazioni account, inizialmente nulla
let renderAccountSettingsFn = null;

// registra una funzione che serve per mostrare la vista delle impostazioni account
export function registerAccountSettingsRenderer(fn) {
  renderAccountSettingsFn = fn;
}

// cambia la vista principale (calendario, prenotazioni, account)
export function setMainView(view) {
  // controlla quale vista deve essere attiva
  const isCalendar = view === 'calendar';
  const isBookings = view === 'bookings';
  const isAccount = view === 'account';

  // aggiorna lo stato attivo dei bottoni di navigazione
  document.querySelectorAll('[data-main-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mainView === view);
  });

  // mostra o nasconde le varie sezioni in base alla vista attiva
  document.getElementById('calendar-header')?.classList.toggle('hidden', !isCalendar);
  document.getElementById('back-to-bar')?.classList.toggle('hidden', !isCalendar);
  document.getElementById('my-bookings')?.classList.toggle('hidden', !isBookings);
  document.getElementById('account-settings')?.classList.toggle('hidden', !isAccount);

  // se calendario, mostra il calendario nel modo corrente
  if (isCalendar) {
    window.calendarRender?.setViewMode(window.calendarRender.viewMode || 'month');
  } else {
    // se non calendario, nascondi tutte le viste del calendario
    document.getElementById('calendar-container')?.classList.add('hidden');
    document.getElementById('week-calendar-container')?.classList.add('hidden');
    document.getElementById('day-calendar-container')?.classList.add('hidden');
  }

  // se prenotazioni, mostra la vista delle prenotazioni
  if (isBookings) renderBookingsView();
  // se account, chiama la funzione per mostrare le impostazioni account se registrata
  if (isAccount && renderAccountSettingsFn) renderAccountSettingsFn();
}

// inizializza i bottoni per cambiare vista principale
export function initMainView() {
  document.querySelectorAll('[data-main-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      setMainView(btn.dataset.mainView);
    });
  });

  // all'avvio nascondi le sezioni delle prenotazioni e dell'account
  document.getElementById('my-bookings')?.classList.add('hidden');
  document.getElementById('account-settings')?.classList.add('hidden');
}

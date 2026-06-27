// tempo di transizione per chiudere il modal in millisecondi
// const MODAL_TRANSITION_MS = 230;
const MODAL_TRANSITION_MS = 0;

const modal = {
  // insiemi per tracciare gli id dei modal piccoli e a schermo intero
  smallIds: new Set(),
  fullIds: new Set(),

  // inizializza la gestione dei modal
  init() {
    this.discover();
    // ascolta i click globali per aprire o chiudere i modal
    document.addEventListener('click', (e) => this.onClick(e));
    // chiude tutto se si preme esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  },

  // cerca tutti gli elementi con id che iniziano per modal- e li registra nei rispettivi insiemi
  discover() {
    document.querySelectorAll('[id^="modal-"]').forEach((el) => {
      const id = el.id.slice(6);
      if (!id) return;
      if (el.classList.contains('full-modal')) this.fullIds.add(id);
      else if (el.classList.contains('modal')) this.smallIds.add(id);
    });
  },

  // controlla se un id corrisponde ad un modal registrato
  isKnown(id) {
    return this.smallIds.has(id) || this.fullIds.has(id);
  },

  // restituisce l'elemento modal dato l'id
  getEl(id) {
    return document.getElementById('modal-' + id);
  },

  // restituisce tutti gli elementi modal o full-modal attualmente visibili
  getShowing() {
    return document.querySelectorAll('.modal.showing, .full-modal.showing');
  },

  // gestisce i click globali sulla pagina
  onClick(e) {
    const target = e.target;
    // cerca un bottone (o qualsiasi elemento) che attiva un modal tramite data-modal
    const activator = target.closest('[data-modal]');

    if (activator) {
      const id = activator.dataset.modal;

      // se si clicca su un bottone di chiusura
      if (id === 'close-modal') {
        e.preventDefault();
        // prova a chiudere solo il modal padre, altrimenti chiudi tutti i modal visibili
        const parent = activator.closest('.modal.showing, .full-modal.showing');
        if (parent) this.closeEl(parent);
        else this.closeAll();
        return;
      }

      // se si clicca su un elemento che apre/toglie il modal con quell'id
      if (this.isKnown(id)) {
        e.preventDefault();
        this.toggle(id);
      }
      return;
    }

    // impedisce la chiusura immediata appena aperto (es: click rimbalzo dopo apertura)
    if (this._openedAt && Date.now() - this._openedAt < 220) return;

    // chiude tutti i modal visibili tranne quello dove si è cliccato dentro (se serve)
    this.getShowing().forEach((m) => {
      if (this.shouldKeepOpen(m, target)) return;
      this.closeEl(m);
    });
  },

  // controlla se il click era dentro la zona che deve restare aperta
  shouldKeepOpen(modalEl, target) {
    // per i full-modal considera solo il corpo come zona attiva da non chiudere se cliccata
    if (modalEl.classList.contains('full-modal')) {
      const body = modalEl.querySelector('.full-modal-body');
      return body?.contains(target) ?? false;
    }
    // per modal normali resta aperto se si clicca all'interno
    return modalEl.contains(target);
  },

  // apre o chiude un modal, in base al suo stato corrente
  toggle(id) {
    const el = this.getEl(id);
    if (!el) return;
    if (el.classList.contains('showing')) {
      this.closeEl(el);
      return;
    }
    this.open(id);
  },

  // aggiorna lo stato attivo dei bottoni che aprono i modal
  syncActivatorActive(id) {
    const known = new Set([...this.smallIds, ...this.fullIds]);
    document.querySelectorAll('[data-modal]').forEach((btn) => {
      const btnId = btn.dataset.modal;
      if (!known.has(btnId)) return;
      btn.classList.toggle('active', btnId === id);
    });
  },

  // apre il modal dato l'id (chiude prima gli altri)
  open(id) {
    const el = this.getEl(id);
    if (!el) return;
    this.closeAll();
    // annulla eventuali timer di hide ancora attivi
    if (el._hideT) {
      clearTimeout(el._hideT);
      el._hideT = null;
    }
    // mostra l'elemento
    el.style.display = 'flex';
    // forza il ricalcolo del layout per triggerare la transizione
    void el.offsetHeight;
    el.classList.add('showing');
    this.syncActivatorActive(id);
    this._openedAt = Date.now();
  },

  // chiude un singolo modal con transizione
  closeEl(el) {
    if (!el) return;
    el.classList.remove('showing');
    // aggiorna lo stato dei bottoni associati
    if (el.id.startsWith('modal-')) {
      this.syncActivatorActive(null);
    }
    // cancella eventuali timer di hide precedenti
    if (el._hideT) clearTimeout(el._hideT);
    // gestisce una chiusura sicura anche se si chiude/riapre di nuovo rapidamente
    const token = (el._closeToken || 0) + 1;
    el._closeToken = token;
    // nasconde l'elemento dopo la transizione
    el._hideT = setTimeout(() => {
      if (el._closeToken !== token) return;
      el.style.display = 'none';
      el._hideT = null;
    }, MODAL_TRANSITION_MS);
  },

  // chiude tutti i modal aperti sulla pagina
  closeAll() {
    this.getShowing().forEach((el) => this.closeEl(el));
  },
};

// inizializza tutto quando il dom è pronto
document.addEventListener('DOMContentLoaded', () => modal.init());
// rende l'oggetto disponibile globalmente
window.modal = modal;

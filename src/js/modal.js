// gestione modali -------------------------------------------------------------------------------------------

// set di id dei modali che compaiono nell'header
const MODAL_ID = new Set(['notifiche', 'le-mie-prenotazioni', 'account']);

// oggetto che gestisce l'apertura e chiusura dei modali
const modal = {
  
    // inizializza gli event listener per la gestione dei modali
    init() {
        document.addEventListener('click', (e) => {
            // cerca se il click è avvenuto su un attivatore di modal nell'header
            const activator = e.target.closest('header [data-modal]'); // controlla l'attributo data-modal
            if (activator) {
                const id = activator.dataset.modal;
                // controlla che l'id sia tra quelli previsti per i modali dell'header
                if (MODAL_ID.has(id)) {
                    e.preventDefault();
                    this.toggle(id); // apre o chiude il modal relativo
                }
                return;
            }

            // chiude tutti i modali visibili se si clicca fuori da essi
            document.querySelectorAll('.modal.showing').forEach((m) => {
                if (m.contains(e.target)) return;
                this.closeEl(m);
            });
        });

        // chiude tutti i modali premendo il tasto "esc"
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAll();
        });
    },

    // alterna l'apertura/chiusura del modal col dato id
    toggle(id) {
        const el = document.getElementById('modal-' + id);
        if (!el) return;
        if (el.classList.contains('showing')) {
            this.closeEl(el); // se già visibile lo chiude
            return;
        }
        this.open(id); // altrimenti lo apre
    },

    // apre il modal col dato id, chiudendo prima gli altri (se ce ne sono aperti)
    open(id) {
        const el = document.getElementById('modal-' + id);
        if (!el) return;
        this.closeAll(); // chiude tutti i modali aperti
        if (el._hideT) {
            clearTimeout(el._hideT); // interrompe eventuale timeout di chiusura
            el._hideT = null;
        }
        el.style.display = 'flex';
        void el.offsetHeight; // forza il repaint per far partire l'animazione css
        el.classList.add('showing');
        this._openedAt = Date.now(); // salva quando è stato aperto per debounce
    },

    // chiude un singolo elemento modal con transizione
    closeEl(el) {
        if (!el) return;
        el.classList.remove('showing');
        if (el._hideT) clearTimeout(el._hideT);
        // usa un token per evitare problemi in caso di chiusure multiple ravvicinate
        const token = (el._closeToken || 0) + 1;
        el._closeToken = token;
        el._hideT = setTimeout(() => {
            // solo l'ultimo token valido nasconde davvero il modal
            if (el._closeToken !== token) return;
            el.style.display = 'none';
            el._hideT = null;
        }, 230); // tempo dell'animazione di transizione css
    },

    // chiude tutti i modali visibili
    closeAll() {
        document.querySelectorAll('.modal.showing').forEach((el) => this.closeEl(el));
    },
};

// inizializza la gestione dei modali una volta caricata la pagina
document.addEventListener('DOMContentLoaded', () => modal.init());

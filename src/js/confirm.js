// mostra la modal di conferma con messaggio, titolo e opzioni, e ritorna una promise<boolean>
export async function confirmAction(options) {
  // non fare nulla se non in browser
  if (typeof document === "undefined") return false;

  // configura le opzioni di default e quelle passate dall'utente
  const cfg = Object.assign(
    {
      message: "sei sicuro di voler procedere?",
      title: "conferma azione",
      subtitle: "",
      confirmText: "conferma",
      danger: false,
    },
    typeof options === "string" ? { message: options } : options || {},
  );

  const modal = obtainModal();

  return new Promise((resolve) => {
    // se una conferma era già aperta, la annulliamo prima di aprirne un'altra
    if (resolveFn) closeModal(false);

    resolveFn = resolve;

    modal.titleEl.textContent = cfg.title;

    modal.subtitleEl.textContent = cfg.subtitle;
    modal.subtitleEl.style.display = cfg.subtitle ? "" : "none";

    modal.messageEl.textContent = cfg.message;
    modal.confirmTextEl.textContent = cfg.confirmText;

    modal.confirmBtn.classList.toggle("danger", !!cfg.danger);
    modal.confirmBtn.classList.toggle("active", !cfg.danger);

    previousActiveElement = document.activeElement;

    // apre la modal al tick successivo: se il click che ha innescato
    // confirmAction sta ancora facendo bubbling verso il document, un
    // eventuale listener globale "click fuori = chiudi modal" riceverebbe
    // lo stesso evento e richiuderebbe la modal appena aperta nello stesso tick
    setTimeout(() => {
      modal.el.classList.add("showing");
      requestAnimationFrame(() => modal.confirmBtn.focus());
    }, 0);
  });
}

// id della modal già presente in index.html
const MODAL_ID = "modal-confirm";

// stato del modulo: riferimenti alla modal, resolve in sospeso, elemento con focus precedente
let modalRefs = null;
let resolveFn = null;
let previousActiveElement = null;

// recupera i riferimenti alla modal esistente e collega gli eventi (una sola volta)
function obtainModal() {
  if (modalRefs) return modalRefs;

  const el = document.getElementById(MODAL_ID);
  if (!el) {
    throw new Error(`modal con id "${MODAL_ID}" non trovata nell'html`);
  }

  const titleEl = el.querySelector("#confirm-action-title");
  const subtitleEl = el.querySelector("#confirm-action-subtitle");
  const messageEl = el.querySelector("#confirm-action-message");
  const confirmTextEl = el.querySelector("#confirm-action-confirm-text");
  const cancelBtn = el.querySelector("#btn-confirm-action-cancel");
  const confirmBtn = el.querySelector("#btn-confirm-action-confirm");

  // ferma sempre la propagazione dei click dentro la modal, altrimenti un
  // click "a vuoto" (dentro full-modal-body ma non su un bottone) sale fino
  // al document e il listener globale chiude la modal sottostante
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target === el) {
      closeModal(false);
    }
  });

  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeModal(false);
  });
  confirmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeModal(true);
  });

  // tasto esc = annulla
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("showing")) {
      closeModal(false);
    }
  });

  // aggiorna le icone lucide se disponibili
  if (typeof lucide !== "undefined") {
    lucide.createIcons({ nameAttr: "data-lucide", nodes: [el] });
  }

  modalRefs = { el, titleEl, subtitleEl, messageEl, confirmTextEl, confirmBtn };
  return modalRefs;
}

// chiude la modal e risolve la promise in sospeso
function closeModal(result) {
  if (!modalRefs) return;

  modalRefs.el.classList.remove("showing");

  if (
    previousActiveElement &&
    typeof previousActiveElement.focus === "function"
  ) {
    previousActiveElement.focus();
  }

  if (resolveFn) {
    resolveFn(result);
    resolveFn = null;
  }
}

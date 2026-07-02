import { supabase } from './supabase-client.js';
import { showToast } from './toast.js';

// categorie disponibili per il feedback (devono coincidere con il CHECK constraint su Supabase)
const CATEGORIE_VALIDE = ['bug', 'suggerimento', 'altro'];

// invia un nuovo feedback a nome dell'utente loggato
export async function inviaFeedback(categoria, contenuto) {
  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  if (!myId) return { error: new Error('non autenticato') };

  if (!CATEGORIE_VALIDE.includes(categoria)) {
    return { error: new Error('categoria non valida') };
  }

  const testo = contenuto?.trim();
  if (!testo) {
    return { error: new Error('il feedback non può essere vuoto') };
  }

  return await supabase
    .from('Feedback')
    .insert({
      id_utente: myId,
      categoria,
      contenuto: testo,
    })
    .select()
    .single();
}

// gestisce la selezione esclusiva delle categorie (checkbox che si comportano come radio)
function initCategorieSelector(container) {
  const checkboxes = container.querySelectorAll('input[name="feedback-categoria"]');

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        // deseleziona tutte le altre appena una viene scelta
        checkboxes.forEach((other) => {
          if (other !== checkbox) other.checked = false;
        });
      }
    });
  });

  return () => {
    const selected = [...checkboxes].find((c) => c.checked);
    return selected?.value ?? null;
  };
}

// resetta il contenuto del modal (testo e categorie) alla chiusura/dopo invio
function resetFeedbackModal(textarea, checkboxes) {
  if (textarea) textarea.value = '';
  checkboxes.forEach((c) => { c.checked = false; });
}

// inizializza il modal feedback: selezione categoria, validazione e invio
export function initFeedbackModal() {
  const modal = document.getElementById('modal-feedback');
  if (!modal) return;

  const textarea = document.getElementById('modal-feedback-text');
  const btnInvia = document.getElementById('btn-modal-invia-feedback');
  const btnAnnulla = modal.querySelector('[data-modal="close-modal"]');
  const categorieContainer = modal.querySelector('.feedback-categorie');
  const checkboxes = modal.querySelectorAll('input[name="feedback-categoria"]');

  if (!textarea || !btnInvia || !categorieContainer) return;

  // evita listener duplicati se initFeedbackModal venisse richiamata più volte
  if (modal._feedbackAbort) modal._feedbackAbort.abort();
  const ac = new AbortController();
  modal._feedbackAbort = ac;
  const signal = ac.signal;

  const getCategoriaSelezionata = initCategorieSelector(categorieContainer);

  btnAnnulla?.addEventListener('click', () => {
    resetFeedbackModal(textarea, checkboxes);
  }, { signal });

  btnInvia.addEventListener('click', async () => {
    if (btnInvia.disabled) return;

    const categoria = getCategoriaSelezionata();
    const contenuto = textarea.value?.trim();

    if (!categoria) {
      showToast('error', 'Seleziona una categoria', 'x');
      return;
    }
    if (!contenuto) {
      showToast('error', 'Scrivi un messaggio prima di inviare', 'x');
      return;
    }

    btnInvia.disabled = true;

    const { error } = await inviaFeedback(categoria, contenuto);

    if (error) {
      showToast('error', 'Impossibile inviare il feedback', 'x');
      btnInvia.disabled = false;
      return;
    }

    showToast('success', 'Feedback inviato, grazie!', 'check');
    resetFeedbackModal(textarea, checkboxes);
    window.modal?.closeAll();
    btnInvia.disabled = false;
  }, { signal });
}
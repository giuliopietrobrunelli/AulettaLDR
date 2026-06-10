import { getProfiloUtente, getTurniByIndici, createPrenotazioni, getPrenotazioniByDateRange } from './db.js';

window.ldrDb = { getTurniByIndici, createPrenotazioni, getPrenotazioniByDateRange };

async function caricaProfiloUtente() {
  const { data: profilo, error } = await getProfiloUtente();
  if (error || !profilo) {
    console.error('Impossibile caricare il profilo:', error?.message ?? 'dati mancanti');
    return;
  }

  window.ldrProfilo = profilo;

  document.querySelectorAll('[data-get-info="username-name"]').forEach((el) => {
    el.textContent = profilo.nome;
  });

  const nomeCompleto = document.querySelector('#modal-account .modal-title');
  if (nomeCompleto) nomeCompleto.textContent = `${profilo.nome} ${profilo.cognome}`;

  const nTessera = document.querySelector('#modal-account .modal-subtitle');
  if (nTessera) nTessera.textContent = `n.${profilo.numero_tessera}`;
}

document.addEventListener('DOMContentLoaded', caricaProfiloUtente);

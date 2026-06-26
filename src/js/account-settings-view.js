import { updateProfiloUtente, uploadFotoProfilo } from './db.js';
import { getProfilePicUrl, syncProfilePictures } from './profile-utils.js';
import { showToast } from './toast.js';

// massimo 3mb per la foto profilo
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;

let navigateToView = null;

// crea un campo che mostra un'informazione di sola lettura
function createReadonlyField(label, value) {
  const block = document.createElement('div');
  block.className = 'form-block account-field readonly';

  const lbl = document.createElement('label');
  lbl.innerHTML = `<span>${label}</span>`;

  const val = document.createElement('span');
  val.className = 'account-readonly-value';
  val.textContent = value ?? '—';

  block.append(lbl, val);
  return block;
}

// mostra la vista delle impostazioni account
export function renderAccountSettings() {
  const container = document.getElementById('account-settings');
  if (!container) return;

  const profilo = window.ldrProfilo;
  container.replaceChildren();

  // se nessun profilo, mostra un messaggio che invita ad accedere
  if (!profilo?.id_utente) {
    const empty = document.createElement('p');
    empty.className = 'bookings-empty disabled';
    empty.textContent = 'Accedi per visualizzare le impostazioni account.';
    container.appendChild(empty);
    return;
  }

  // titolo informazioni account
  const title = document.createElement('span');
  title.textContent = 'Informazioni account';
  title.classList.add('account-section-indicator');
  container.appendChild(title);

  // blocco per mostrare e cambiare la foto profilo
  const profileBlock = document.createElement('div');
  profileBlock.className = 'account-profile-block';

  const profileRow = document.createElement('div');
  profileRow.className = 'horizontal-container account-profile-row';

  const img = document.createElement('img');
  img.className = 'account-profile-pic profile-pic';
  img.src = getProfilePicUrl(profilo);
  img.alt = '';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;

  const btnUpload = document.createElement('button');
  btnUpload.type = 'button';
  btnUpload.className = 'w-text';
  btnUpload.innerHTML = 'Cambia immagine profilo';

  // al click sul bottone si apre la selezione file
  btnUpload.addEventListener('click', () => fileInput.click());

  // quando si sceglie una immagine
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    // se il file è troppo grande mostra un avviso
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('warning', 'Immagine troppo grande (max 3 MB).', 'image');
      return;
    }

    btnUpload.disabled = true;
    // carica la nuova foto profilo
    const { data, error } = await uploadFotoProfilo(profilo.id_utente, file);

    // gestisci eventuali errori di upload
    if (error || !data) {
      showToast('error', "Impossibile caricare l'immagine. Riprova più tardi.", 'image-off');
      btnUpload.disabled = false;
      return;
    }

    // aggiorna la foto profilo e sincronizza ovunque
    window.ldrProfilo = data;
    img.src = getProfilePicUrl(data);
    syncProfilePictures(data);
    showToast('success', 'Immagine profilo aggiornata.', 'user-round-check');
    btnUpload.disabled = false;
  });

  profileRow.append(img, btnUpload, fileInput);
  profileBlock.append(profileRow);
  container.appendChild(profileBlock);

  // mostra i campi con le info anagrafiche utente
  const infoSection = document.createElement('div');
  infoSection.className = 'account-info-section';
  infoSection.append(
    createReadonlyField('Nome', profilo.nome),
    createReadonlyField('Cognome', profilo.cognome),
    createReadonlyField('Numero tessera', `n.${profilo.numero_tessera}`),
    createReadonlyField('Email', profilo.email),
  );
  container.appendChild(infoSection);

  // // titolo per la sezione preferenze
  // const title2 = document.createElement('span');
  // title2.textContent = 'Preferenze e impostazioni';
  // title2.classList.add('account-section-indicator');
  // container.appendChild(title2);

  // // blocco preferenze utente
  // const settingsBlock = document.createElement('div');
  // settingsBlock.className = 'form-block';

  // // campo per selezionare la vista calendario predefinita
  // const viewLabel = document.createElement('label');
  // viewLabel.setAttribute('for', 'default-calendar-view');
  // viewLabel.innerHTML = '<span>Vista calendario predefinita</span>';

  // const viewSelect = document.createElement('select');
  // viewSelect.id = 'default-calendar-view';
  // viewSelect.innerHTML = `
  //   <option value="month">Mensile</option>
  //   <option value="week">Settimanale</option>
  // `;
  // viewSelect.value = profilo.vista_predefinita === 'week' ? 'week' : 'month';

  // // quando cambia la preferenza aggiorna il profilo
  // viewSelect.addEventListener('change', async () => {
  //   const vista_predefinita = viewSelect.value;
  //   viewSelect.disabled = true;

  //   const { data, error } = await updateProfiloUtente(profilo.id_utente, { vista_predefinita });

  //   viewSelect.disabled = false;

  //   // se errore, mostra notifica e ripristina il valore precedente
  //   if (error || !data) {
  //     showToast('error', "Impossibile salvare l'impostazione.", 'calendar-x');
  //     viewSelect.value = profilo.vista_predefinita === 'week' ? 'week' : 'month';
  //     return;
  //   }

  //   // aggiorna il profilo con la nuova impostazione
  //   window.ldrProfilo = data;
  //   showToast('success', 'Impostazione salvata.', 'calendar-check');
  // });

  settingsBlock.append(viewLabel, viewSelect);
  container.appendChild(settingsBlock);
}

// inizializza la gestione delle impostazioni account
export function initAccountSettings(onNavigate) {
  navigateToView = onNavigate;

  // gestisce il click sui link per andare alle opzioni account
  document.querySelectorAll('[data-goto="opzioni"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.modal?.closeAll?.();
      navigateToView?.('account');
    });
  });

  // nasconde la sezione account all'inizio
  document.getElementById('account-settings')?.classList.add('hidden');
}
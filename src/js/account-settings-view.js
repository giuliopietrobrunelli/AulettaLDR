import { updateProfiloUtente, uploadFotoProfilo } from './db.js';
import { getProfilePicUrl, syncProfilePictures } from './profile-utils.js';

// dimensione massima per l'avatar (3 mb)
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;

// riferimento alla funzione di navigazione, viene settato all'inizializzazione
let navigateToView = null;

// crea un campo in sola lettura da mostrare all'utente
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

// mostra un messaggio di feedback all'utente (esito positivo o errore)
function showAccountMessage(container, text, isError = false) {
  container.querySelector('.account-message')?.remove();
  const msg = document.createElement('p');
  msg.className = `account-message ${isError ? 'form-error' : 'form-success'}`;
  msg.textContent = text;
  container.prepend(msg);
  setTimeout(() => msg.remove(), 3500);
}

// renderizza la sezione delle impostazioni account
export function renderAccountSettings() {
  const container = document.getElementById('account-settings');
  if (!container) return;

  const profilo = window.ldrProfilo;
  container.replaceChildren();

  // se l'utente non è loggato mostra un messaggio bloccante
  if (!profilo?.id_utente) {
    const empty = document.createElement('p');
    empty.className = 'bookings-empty disabled';
    empty.textContent = 'Accedi per visualizzare le impostazioni account.';
    container.appendChild(empty);
    return;
  }

  // titolo della sezione
  const title = document.createElement('span');
  title.textContent = 'Opzioni account';
  title.classList.add("account-section-indicator");
  container.appendChild(title);

  // blocco per la foto profilo
  const profileBlock = document.createElement('div');
  profileBlock.className = 'account-profile-block';

  const profileRow = document.createElement('div');
  profileRow.className = 'horizontal-container account-profile-row';

  // elemento img della foto profilo
  const img = document.createElement('img');
  img.className = 'account-profile-pic profile-pic';
  img.src = getProfilePicUrl(profilo);
  img.alt = '';

  // campo input file per selezionare immagine
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;

  // bottone per selezionare nuova immagine
  const btnUpload = document.createElement('button');
  btnUpload.type = 'button';
  btnUpload.className = 'w-text';
  btnUpload.innerHTML = 'Cambia immagine profilo';

  // apre il selettore file al click sul bottone
  btnUpload.addEventListener('click', () => fileInput.click());

  // gestione caricamento nuova foto profilo
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    // verifica dimensione immagine
    if (file.size > MAX_AVATAR_SIZE) {
      showAccountMessage(container, 'Immagine troppo grande (max 3 MB).', true);
      return;
    }

    btnUpload.disabled = true;
    const { data, error } = await uploadFotoProfilo(profilo.id_utente, file);

    // gestione errore durante upload
    if (error || !data) {
      showAccountMessage(container, "Impossibile caricare l'immagine. Riprova più tardi.", true);
      btnUpload.disabled = false;
      return;
    }

    // aggiorna la foto in memoria, nell'interfaccia e sincronizza globalmente
    window.ldrProfilo = data;
    img.src = getProfilePicUrl(data);
    syncProfilePictures(data);
    showAccountMessage(container, 'Immagine profilo aggiornata.');
    btnUpload.disabled = false;
  });

  profileRow.append(img, btnUpload, fileInput);
  profileBlock.append(profileRow);
  container.appendChild(profileBlock);

  // sezione info anagrafica (nome, cognome, tessera, email)
  const infoSection = document.createElement('div');
  infoSection.className = 'account-info-section';
  infoSection.append(
    createReadonlyField('Nome', profilo.nome),
    createReadonlyField('Cognome', profilo.cognome),
    createReadonlyField('Numero tessera', `n.${profilo.numero_tessera}`),
    createReadonlyField('Email', profilo.email),
  );
  container.appendChild(infoSection);

  // blocco impostazioni calendario
  const settingsBlock = document.createElement('div');
  settingsBlock.className = 'form-block';

  // titolo della sezione
  const title2 = document.createElement('span');
  title2.textContent = 'Preferenze e impostazioni';
  title2.classList.add("account-section-indicator");
  container.appendChild(title2);

  // label della select vista calendario di default
  const viewLabel = document.createElement('label');
  viewLabel.setAttribute('for', 'default-calendar-view');
  viewLabel.innerHTML = '<span>Vista calendario predefinita</span>';

  // select per scegliere la vista predefinita
  const viewSelect = document.createElement('select');
  viewSelect.id = 'default-calendar-view';
  viewSelect.innerHTML = `
    <option value="month">Mensile</option>
    <option value="week">Settimanale</option>
  `;
  viewSelect.value = profilo.vista_predefinita === 'week' ? 'week' : 'month';

  // salva la vista selezionata quando cambia
  viewSelect.addEventListener('change', async () => {
    const vista_predefinita = viewSelect.value;
    viewSelect.disabled = true;

    const { data, error } = await updateProfiloUtente(profilo.id_utente, {
      vista_predefinita,
    });

    viewSelect.disabled = false;

    if (error || !data) {
      showAccountMessage(container, "Impossibile salvare l'impostazione.", true);
      viewSelect.value = profilo.vista_predefinita === 'week' ? 'week' : 'month';
      return;
    }

    window.ldrProfilo = data;
    showAccountMessage(container, 'Impostazione salvata.');
  });

  settingsBlock.append(viewLabel, viewSelect);
  container.appendChild(settingsBlock);
}

// inizializza la vista opzioni account e collega la navigazione
export function initAccountSettings(onNavigate) {
  navigateToView = onNavigate;

  document.querySelectorAll('[data-goto="opzioni"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.modal?.closeAll?.();
      navigateToView?.('account');
    });
  });

  document.getElementById('account-settings')?.classList.add('hidden');
}

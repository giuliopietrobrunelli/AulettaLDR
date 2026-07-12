import { updateProfiloUtente, uploadFotoProfilo, rimuoviFotoProfilo } from "./db.js";
import { getProfilePicUrl, syncProfilePictures } from "./profile-utils.js";
import { showToast } from "./toast.js";
import {
  initPushNotifications,
  disablePushNotifications,
  getPushSubscriptionStatus,
} from "./app.js";
import { modal } from "./modal.js";
import { profiloUtente, setProfiloUtente } from "./user-state.js"
import { confirmAction } from "./confirm.js";

// massimo 3mb per la foto profilo
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;

let navigateToView = null;

// crea un campo che mostra un'informazione di sola lettura
function createReadonlyField(label, value) {
  const block = document.createElement("div");
  block.className = "form-block account-field readonly";

  const lbl = document.createElement("label");
  lbl.innerHTML = `<span>${label}</span>`;

  const val = document.createElement("span");
  val.className = "account-readonly-value";
  val.textContent = value ?? "—";

  block.append(lbl, val);
  return block;
}

// aggiorna la visibilità/stato dei due bottoni notifiche in base alla sottoscrizione attuale
async function syncPushButtonsState(btnAbilita, btnDisabilita) {
  const { supported, active } = await getPushSubscriptionStatus();

  if (!supported) {
    btnAbilita.disabled = true;
    btnAbilita.title = "Notifiche non supportate da questo browser";
    btnDisabilita.classList.add("hidden");
    return;
  }

  btnAbilita.classList.toggle("hidden", active);
  btnDisabilita.classList.toggle("hidden", !active);
}

// mostra la vista delle impostazioni account
export function renderAccountSettings() {
  const container = document.getElementById("account-settings");
  if (!container) return;

  const profilo = profiloUtente;
  container.replaceChildren();

  // se nessun profilo, mostra un messaggio che invita ad accedere
  if (!profilo?.id_utente) {
    const empty = document.createElement("span");
    empty.className = "bookings-empty disabled";
    empty.textContent = "Accedi per visualizzare le impostazioni account.";
    container.appendChild(empty);
    return;
  }

  // titolo informazioni account
  const title = document.createElement("span");
  title.textContent = "Informazioni account";
  title.classList.add("account-section-indicator");
  container.appendChild(title);

  // blocco per mostrare e cambiare la foto profilo
  const profileBlock = document.createElement("div");
  profileBlock.className = "account-profile-block";

  const profileRow = document.createElement("div");
  profileRow.className = "horizontal-container account-profile-row";

  const img = document.createElement("img");
  img.className = "account-profile-pic profile-pic";
  img.src = getProfilePicUrl(profilo);
  img.alt = "";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
  fileInput.hidden = true;

  const btnUpload = document.createElement("button");
  btnUpload.type = "button";
  btnUpload.className = "w-text active";
  btnUpload.innerHTML = "Cambia immagine profilo";

  // al click sul bottone si apre la selezione file
  btnUpload.addEventListener("click", () => fileInput.click());

  // quando si sceglie una immagine
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    // se il file è troppo grande mostra un avviso
    if (file.size > MAX_AVATAR_SIZE) {
      showToast("warning", "Immagine troppo grande (max 3 MB).", "image");
      return;
    }

    btnUpload.disabled = true;
    // carica la nuova foto profilo
    const { data, error } = await uploadFotoProfilo(profilo.id_utente, file);

    // gestisci eventuali errori di upload
    if (error || !data) {
      showToast("error", "Impossibile caricare l'immagine. Riprova più tardi.", "image-off",);
      btnUpload.disabled = false;
      return;
    }

    // aggiorna la foto profilo e sincronizza ovunque
    setProfiloUtente(data);
    img.src = getProfilePicUrl(data);
    syncProfilePictures(data);
    btnReset.disabled = !data.foto_profilo;
    showToast("success", "Immagine profilo aggiornata.", "user-round-check");
    btnUpload.disabled = false;
  });

  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.className = "w-text";
  btnReset.innerHTML = "Rimuovi immagine profilo";
  // disabilitato se non c'è già una foto personalizzata da rimuovere
  btnReset.disabled = !profilo.foto_profilo;

  // al click chiede conferma e rimuove la foto profilo, tornando a quella di default
  btnReset.addEventListener("click", async () => {
    if (btnReset.disabled) return;

    const confirmed = await confirmAction({
      title: "Rimuovi immagine profilo",
      message: "Vuoi tornare all'immagine profilo predefinita?",
      confirmText: "Rimuovi",
      danger: true,
    });
    if (!confirmed) return;

    btnReset.disabled = true;
    btnUpload.disabled = true;

    const { data, error } = await rimuoviFotoProfilo(profilo.id_utente);

    if (error || !data) {
      showToast(
        "error",
        "Impossibile rimuovere l'immagine. Riprova più tardi.",
        "image-off",
      );
      btnReset.disabled = false;
      btnUpload.disabled = false;
      return;
    }

    // aggiorna la foto profilo (torna a quella di default) e sincronizza ovunque
    setProfiloUtente(data);
    img.src = getProfilePicUrl(data);
    syncProfilePictures(data);
    showToast("success", "Immagine profilo rimossa.", "user-round-x");
    btnReset.disabled = true; // non c'è più nulla da rimuovere
    btnUpload.disabled = false;
  });

  profileRow.append(img, btnUpload, btnReset, fileInput);

  profileBlock.append(profileRow);
  container.appendChild(profileBlock);

  // mostra i campi con le info anagrafiche utente
  const infoSection = document.createElement("div");
  infoSection.className = "account-info-section";
  infoSection.append(
    createReadonlyField("Nome", profilo.nome),
    createReadonlyField("Cognome", profilo.cognome),
    createReadonlyField("Numero tessera", `n.${profilo.numero_tessera}`),
    createReadonlyField("Email", profilo.email),
  );
  container.appendChild(infoSection);

  // titolo informazioni account
  const title2 = document.createElement("span");
  title2.textContent = "Preferenze";
  title2.classList.add("account-section-indicator");
  container.appendChild(title2);

  // blocco notifiche push
  const pushBlock = document.createElement("div");
  pushBlock.className = "form-block account-push-block";

  const pushLabel = document.createElement("label");
  pushLabel.innerHTML = `<span>Notifiche push</span>`;

  const pushDesc = document.createElement("span");
  pushDesc.className = "setting-desc disabled";
  pushDesc.textContent =
    "Ricevi notifiche sul tuo dispositivo per prenotazioni e aggiornamenti.";
  const pushDesc2 = document.createElement("span");
  pushDesc2.className = "setting-desc disabled";
  pushDesc2.innerHTML =
    'Per dispositivi iOS richiede che la pagina sia stata aggiunta alla home <span class="italic">(Condividi -> Aggiungi alla schermata Home)</span>.';

  const pushButtonsRow = document.createElement("div");
  pushButtonsRow.className = "horizontal-container";

  const btnNotifiche = document.createElement("button");
  btnNotifiche.type = "button";
  btnNotifiche.className = "w-text hidden active"; // nascosto finché non si conosce lo stato
  btnNotifiche.id = "btn-abilita-notifiche";
  btnNotifiche.innerHTML = `<span>Abilita notifiche</span>`;

  const btnDisabilitaNotifiche = document.createElement("button");
  btnDisabilitaNotifiche.type = "button";
  btnDisabilitaNotifiche.className = "w-text hidden active"; // nascosto finché non si conosce lo stato
  btnDisabilitaNotifiche.id = "btn-disabilita-notifiche";
  btnDisabilitaNotifiche.innerHTML = `<span>Disattiva notifiche</span>`;

  btnNotifiche.addEventListener("click", async () => {
    btnNotifiche.disabled = true;
    await initPushNotifications();
    await syncPushButtonsState(btnNotifiche, btnDisabilitaNotifiche);
    btnNotifiche.disabled = false;
  });

  btnDisabilitaNotifiche.addEventListener("click", async () => {
    btnDisabilitaNotifiche.disabled = true;
    await disablePushNotifications();
    await syncPushButtonsState(btnNotifiche, btnDisabilitaNotifiche);
    btnDisabilitaNotifiche.disabled = false;
  });

  pushButtonsRow.append(btnNotifiche, btnDisabilitaNotifiche);
  pushBlock.append(pushLabel, pushDesc, pushDesc2, pushButtonsRow);
  container.appendChild(pushBlock);

  // blocco preferenza visualizzazione utenti prenotati nel calendario mese
  const recapBlock = document.createElement("div");
  recapBlock.className = "form-block account-recap-block";

  const recapLabel = document.createElement("label");
  recapLabel.innerHTML = `<span>Visualizzazione utenti prenotati</span>`;

  const recapDesc = document.createElement("span");
  recapDesc.className = "setting-desc disabled";
  recapDesc.textContent =
    "Scegli come vengono mostrati gli utenti che hanno prenotato un turno nella vista mensile";

  const recapButtonsRow = document.createElement("div");
  recapButtonsRow.className = "horizontal-container";

  const btnRecapFoto = document.createElement("button");
  btnRecapFoto.type = "button";
  btnRecapFoto.className = "w-text active";
  btnRecapFoto.innerHTML = "<span>Immagini profilo</span>";

  const btnRecapDot = document.createElement("button");
  btnRecapDot.type = "button";
  btnRecapDot.className = "w-text active";
  btnRecapDot.innerHTML = "<span>Pallini</span>";

  // evidenzia il bottone corrispondente alla preferenza attuale
  function syncRecapButtonsState(mostraFoto) {
    btnRecapFoto.classList.toggle("active", mostraFoto);
    btnRecapDot.classList.toggle("active", !mostraFoto);
  }

  syncRecapButtonsState(profilo.mostra_foto_prenotazioni ?? true);

  // salva la preferenza sul profilo e aggiorna subito il calendario
  async function updateRecapPreference(mostraFoto) {
    btnRecapFoto.disabled = true;
    btnRecapDot.disabled = true;

    const { data, error } = await updateProfiloUtente(profilo.id_utente, {
      mostra_foto_prenotazioni: mostraFoto,
    });

    if (error || !data) {
      showToast(
        "error",
        "Impossibile salvare la preferenza. Riprova più tardi.",
        "x",
      );
    } else {
      setProfiloUtente(data);
      syncRecapButtonsState(data.mostra_foto_prenotazioni);
      showToast("success", "Preferenze aggiornate");
    }

    btnRecapFoto.disabled = false;
    btnRecapDot.disabled = false;
  }

  btnRecapFoto.addEventListener("click", () => updateRecapPreference(true));
  btnRecapDot.addEventListener("click", () => updateRecapPreference(false));

  recapButtonsRow.append(btnRecapFoto, btnRecapDot);
  recapBlock.append(recapLabel, recapDesc, recapButtonsRow);
  container.appendChild(recapBlock);

  // determina quale dei due bottoni mostrare in base allo stato attuale
  syncPushButtonsState(btnNotifiche, btnDisabilitaNotifiche);
}

// inizializza la gestione delle impostazioni account
export function initAccountSettings(onNavigate) {
  navigateToView = onNavigate;

  // gestisce il click sui link per andare alle opzioni account
  document.querySelectorAll('[data-goto="opzioni"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      modal.closeAll();
      navigateToView?.("account");
    });
  });

  // nasconde la sezione account all'inizio
  document.getElementById("account-settings")?.classList.add("hidden");
}

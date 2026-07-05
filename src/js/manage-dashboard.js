import {
    getAllUtenti,
    getAllUtentiAdmin,
    getAllUtentiRegistrati,
    getAllTurni,
    getPrenotazioniUtente,
    getPrenotazioniByDateRange,
    createPrenotazione,
    getProfiloUtente,
    isAmministratore,
    setTurnoAttivo,
    annullaPrenotazioneAdmin,
    getAllFeedback,
    deleteFeedback,
    getSettimaneAnticipo,
    updateSettimaneAnticipo,
    updateLimiteSettimanale,
    getLimiteSettimanale,
} from './db.js';
import { supabase } from "./supabase-client.js";
import { setMainView } from "./main-view.js";
import { showToast } from './toast.js';
import { confirmAction } from "./confirm.js";

import { confirmAction } from './confirm.js';

import {
    parseDbDate,
    formatDayTitle,
    formatTurnLabel,
    loadUtenti,
} from './bookings-view.js';

// ─── 1. ESPOSIZIONE DI SICUREZZA ──────────────────────────────
window.ldrDb = {
  getAllUtenti,
  getAllUtentiRegistrati,
  getAllTurni,
  getPrenotazioniByDateRange,
  createPrenotazione,
  getAllFeedback,
  deleteFeedback,
  getSettimaneAnticipo,
  updateSettimaneAnticipo,
  updateLimiteSettimanale,
  getLimiteSettimanale,
};

// ─── Controllo accesso amministratore ───────────────────────────────────────────
// blocca l'accesso diretto via url a chi non è amministratore
async function guardAdminAccess() {

    const { data: profilo, error: profiloError } = await getProfiloUtente();

    // se il profilo non è disponibile, lascio che auth.js gestisca il redirect al login
    if (profiloError || !profilo?.id_utente) {
        window.location.href = '/login.html';
        return false;
    }

    const { data: isAdmin, error } = await isAmministratore(profilo.id_utente);

    if (error || !isAdmin) {
        window.location.href = '/index.html'
        return false;
    }

    return true;

}

// ─── Stato locale ───────────────────────────────────────────
let allUtenti = [];
let allPrenotazioni = [];
let prenotazioniFuture = [];
let prenotazioniPassate = [];
let turniCache = [];
let limiteSettimanale = null;
let pendingDeleteFn = null;
let turnoInModificaId = null; // id del turno attualmente aperto nel modal "Modifica turno"

// ─── Helpers UI ─────────────────────────────────────────────
window.openModal = (id) => {
    if (window.modal?.open) { window.modal.open(id); return; }
    document.getElementById(`modal-${id}`)?.classList.add('showing');
};

window.closeModal = (id) => {
    if (window.modal?.close) {
        window.modal.close(id);
        return;
    }
    document.getElementById(`modal-${id}`)?.classList.remove("showing");
};

function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
}

function fmtDate(str) {
    if (!str) return "—";
    const d = new Date(str.split("T")[0]);
    return d.toLocaleDateString("it-IT");
}

function fmtTime(t) {
    return t?.slice(0, 5) ?? "—";
}

// ─── Gestione Viste Estesa con main-view.js ──────────────────
window.showSection = (id) => {
    if (id === 'calendario') setMainView('calendar');
    if (id === 'prenotazioni') setMainView('bookings');
    if (id === 'account') setMainView('account');

    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${id}`)?.classList.add('active');

    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-nav-${id}`)?.classList.add('active');

    if (id === 'stats') window.loadStats();
    if (id === 'utenti') window.loadUtenti();
    if (id === 'turni') window.loadTurni();
    if (id === 'calendario') window.calendarRender?.render?.();
    if (id === 'feedback') window.loadFeedback();
    if (id === 'impostazioni') loadImpostazioni();
};

let utentiCache = null;

// apre il modal per modificare una prenotazione
export async function openModificaPrenotazioneAdmin(prenotazione) {
    const modal = document.getElementById("modal-modifica-prenotazione");
    if (!modal) {
        return;
    }

    const inputData = document.getElementById("modifica-turno-data");
    const inputTurno = document.getElementById("modifica-turno-orario");
    const selectCedi = document.getElementById("modifica-turno-cedi");
    const btnCedi = document.getElementById("btn-cedi-turno");
    const btnRinuncia = document.getElementById("btn-rinuncia-turno");

    // resetto i bottoni ad ogni apertura modal
    if (btnCedi) {
        btnCedi.disabled = true;
        btnCedi.onclick = null;
    }
    if (btnRinuncia) {
        btnRinuncia.disabled = false;
        btnRinuncia.onclick = null;
    }

    // aggiorno la data visualizzata
    if (inputData) {
        const date = parseDbDate(prenotazione.data_prenotazione);
        inputData.value = formatDayTitle(date);
    }

    // aggiorno il turno visualizzato
    if (inputTurno) {
        const turn = prenotazione.Turno;
        inputTurno.value = turn
            ? `${turn.indice}° Turno — ${formatTurnLabel(turn)}`
            : "";
    }

    // popolo la select degli utenti a cui cedere il turno
    if (selectCedi) {
        selectCedi.innerHTML = '<option value="">Seleziona utente</option>';
        const { data: utenti, error } = await getAllUtentiAdmin();
        if (error) {
            console.error("impossibile caricare gli utetni: ", error);
        }
        else {
            (utenti ?? []).forEach((u) => {
                const opt = document.createElement("option");
                opt.value = u.id_utente;
                opt.textContent = `${u.cognome} ${u.nome}`;
                selectCedi.appendChild(opt);
            });
        }

        // reset della select e del suo handler
        selectCedi.value = "";
        selectCedi.onchange = () => {
            if (btnCedi) {
                btnCedi.disabled = !selectCedi.value;
                btnCedi.classList.toggle("active", !!selectCedi.value);
            }
        };
    }

    // assegno handler ai bottoni alla fine per evitare errori
    if (btnCedi) {
        btnCedi.onclick = () =>
            handleCediTurnoAdmin(prenotazione.id_prenotazione, selectCedi);
    }

    if (btnRinuncia) {
        btnRinuncia.onclick = () =>
            handleRinunciaTurnoAdmin(prenotazione.id_prenotazione);
    }

    window.modal?.open("modifica-prenotazione");
}

// gestisce la cessione del turno ad altro utente
async function handleCediTurnoAdmin(id_prenotazione, selectCedi) {
    const id_destinatario = selectCedi?.value;
    if (!id_destinatario) return;

    const nomeDestinatario =
        selectCedi.options[selectCedi.selectedIndex]?.text ?? "questo utente";
    const confirmed = await confirmAction({
        title: "Conferma riassegnazione turno",
        message: `Stai per riassegnare questa prenotazione a ${nomeDestinatario}. La modifica sarà immediata, senza bisogno di conferma da parte dell'utente`,
        confirmText: "Riassegna",
    });
    if (!confirmed) return;

    const btnCedi = document.getElementById("btn-cedi-turno");
    if (btnCedi) {
        btnCedi.disabled = true;
    }

    try {
        const { error } = await supabase
            .from("Prenotazione")
            .update({ id_utente: id_destinatario })
            .eq("id_prenotazione", id_prenotazione);

        if (error) throw error;
        window.modal?.closeAll();
        showToast("success", "Turno riassegnato", "check");
        await window.loadStats();
        window.calendarRender?.invalidateBookingsCache?.();
        window.calendarRender?.render?.();
    } catch (e) {
        console.error("Errore riassegnazione turno: ", e);
        showToast("error", "Impossibile riassegnare il turno", "x");
        if (btnCedi) btnCedi.disabled = false;
    }

    if (window.lucide?.createIcons) window.lucide.createIcons();

}

// gestisce la rinuncia a una prenotazione
// gestisce la rinuncia/eliminazione di una prenotazione (lato admin)
async function handleRinunciaTurnoAdmin(id_prenotazione) {
  const confirmed = await confirmAction({
    title: "Conferma eliminazione prenotazione",
    message: `Stai per eliminare questa prenotazione. L'operazione è immediata e non richiede conferma da parte dell'utente.`,
    confirmText: "Elimina",
  });
  if (!confirmed) return;

  const btnRinuncia = document.getElementById("btn-rinuncia-turno");
  if (btnRinuncia) btnRinuncia.disabled = true;

  try {
    const { error } = await annullaPrenotazioneAdmin(id_prenotazione);
    if (error) throw error;

    window.modal?.closeAll();
    showToast("success", "Prenotazione eliminata", "check");

    // ricarica le tabelle prenotazioni future/passate + statistiche
    await window.loadStats();

    // tiene allineata anche la vista calendario
    window.calendarRender?.invalidateBookingsCache?.();
    window.calendarRender?.render?.();
  } catch (e) {
    console.error("Errore eliminazione prenotazione:", e);
    showToast("error", "Impossibile eliminare la prenotazione", "x");
    if (btnRinuncia) btnRinuncia.disabled = false;
  }

  if (window.lucide?.createIcons) window.lucide.createIcons();
}

// ─── Rendering tabelle prenotazioni (future / passate) ───────
function renderTabellaPrenotazioni(tbodyId, lista) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.replaceChildren();
    if (!lista?.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nessuna prenotazione</td></tr>';
        return;
    }
    for (const p of lista) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.Utente?.cognome ?? ''} ${p.Utente?.nome ?? ''}</td>
            <td>${fmtDate(p.data_prenotazione)}</td>
            <td>${p.Turno?.indice ?? "?"}°</td>
            <td>
            ${(() => {
                if (p.stato === "riservata") return '<span class="badge badge-yellow">Riservata</span>';
                if (p.stato === "confermata" || p.data_conferma) return '<span class="badge badge-green">Confermata</span>';
                return '<span class="badge badge-gray">Non confermata</span>';
            })()}
            </td>
            <td>${fmtDate(p.data_creazione_prenotazione)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-modifica-prenotazione" title="Modifica">
                        <i data-lucide="pencil" class="lucide"></i>
                    </button>
                </div>
            </td>
            
        `;
        tr.querySelector('.btn-modifica-prenotazione')
            ?.addEventListener('click', () => openModificaPrenotazioneAdmin(p));
        tbody.appendChild(tr);
    }
}

// ─── Statistiche (Corretto controllo di sicurezza) ──────────
window.loadStats = async () => {
    try {
        const ora = new Date();
        const meseStart = new Date(ora.getFullYear(), ora.getMonth(), 1).toISOString().split('T')[0];
        const meseEnd = new Date(ora.getFullYear(), ora.getMonth() + 1, 0).toISOString().split('T')[0];
        const oggi = ora.toISOString().split('T')[0];

        // Controllo granulare: usiamo la funzione db.js solo se effettivamente mappata e valida
        const queryUtenti = (typeof window.ldrDb?.getAllUtenti === 'function')
            ? window.ldrDb.getAllUtenti()
            : supabase.from('Utente').select('*');

        const queryMese = (typeof window.ldrDb?.getPrenotazioniByDateRange === 'function')
            ? window.ldrDb.getPrenotazioniByDateRange(meseStart, meseEnd)
            : supabase.from('Prenotazione').select('*').gte('data_prenotazione', meseStart).lte('data_prenotazione', meseEnd);

        const queryOggi = (typeof window.ldrDb?.getPrenotazioniByDateRange === 'function')
            ? window.ldrDb.getPrenotazioniByDateRange(oggi, oggi)
            : supabase.from('Prenotazione').select('*').eq('data_prenotazione', oggi);

        const [resUtenti, resMese, resOggi] = await Promise.all([queryUtenti, queryMese, queryOggi]);

        const tutti = resUtenti?.data ?? [];
        const reg = tutti.filter(u => u.registrato);
        const pMese = resMese?.data ?? [];
        const pOggi = resOggi?.data ?? [];
        const confermate = pMese.filter(p => p.stato === 'confermata' || p.data_conferma);
        const tasso = pMese.length ? Math.round(confermate.length / pMese.length * 100) : 0;

        document.getElementById('stat-registrati').textContent = reg.length;
        document.getElementById('stat-totali').textContent = tutti.length;
        document.getElementById('stat-prenot-mese').textContent = pMese.length;
        document.getElementById('stat-prenot-oggi').textContent = pOggi.length;
        document.getElementById('stat-tasso').textContent = `${tasso}%`;
        document.getElementById('stat-limite').textContent = limiteSettimanale;

        const label = ora.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const labelEl = document.getElementById('stat-prenot-mese-label');
        if (labelEl) labelEl.textContent = label;

        // Caricamento prenotazioni future
        const dataOggi = new Date().toISOString().split('T')[0];
        const nowMinuti = ora.getHours() * 60 + ora.getMinutes();

        const { data: future, error: errFuture } = await supabase
            .from('Prenotazione')
            .select('*, Utente(nome,cognome), Turno(indice,orario_inizio,orario_fine)')
            .gte('data_prenotazione', dataOggi)
            .order('data_prenotazione', { ascending: true });

        if (errFuture) throw errFuture;

        const { data: passate, error: errPassate } = await supabase
            .from('Prenotazione')
            .select('*, Utente(nome,cognome), Turno(indice, orario_inizio, orario_fine)')
            .lt('data_prenotazione', dataOggi)
            .order('data_prenotazione', { ascending: false });

        if (errPassate) throw errPassate;

        // Le prenotazioni di oggi il cui turno è già terminato vanno considerate
        // "passate" anche se la data è quella odierna: le sposto dall'elenco future.
        const futureEffettive = [];
        const oggiConclusePassateAlTurno = [];
        for (const p of (future ?? [])) {
            const isOggi = p.data_prenotazione?.split('T')[0] === dataOggi;
            if (isOggi && turnoGiaConcluso(p.Turno, nowMinuti)) {
                oggiConclusePassateAlTurno.push(p);
            } else {
                futureEffettive.push(p);
            }
        }
        const passateEffettive = [...(passate ?? []), ...oggiConclusePassateAlTurno];

        // Ordino lato client per garantire l'ordinamento richiesto anche se il DB
        // non supporta/applica l'order sulla tabella collegata (Turno):
        // data crescente/decrescente, e a parità di data indice di turno crescente.
        const perIndiceTurnoCrescente = (a, b) => (a.Turno?.indice ?? 0) - (b.Turno?.indice ?? 0);

        const futureOrdinate = [...futureEffettive].sort((a, b) =>
            a.data_prenotazione.localeCompare(b.data_prenotazione) || perIndiceTurnoCrescente(a, b)
        );
        const passateOrdinate = [...passateEffettive].sort((a, b) =>
            b.data_prenotazione.localeCompare(a.data_prenotazione) || perIndiceTurnoCrescente(a, b)
        );

        // Aggiorno lo stato locale e le tabelle una sola volta, tramite l'helper condiviso
        prenotazioniFuture = futureOrdinate;
        prenotazioniPassate = passateOrdinate;
        allPrenotazioni = [...prenotazioniFuture, ...prenotazioniPassate];

        renderTabellaPrenotazioni('table-prenotazioni-future', prenotazioniFuture);
        renderTabellaPrenotazioni('table-prenotazioni-passate', prenotazioniPassate);
    } catch (e) {
        console.error("loadStats:", e);
    }

    if (window.lucide?.createIcons) window.lucide.createIcons();

};

// ─── Utenti ─────────────────────────────────────────────────
window.loadUtenti = async () => {
    try {
        const { data } =
            typeof window.ldrDb?.getAllUtenti === "function"
                ? await window.ldrDb.getAllUtenti()
                : await supabase.from("Utente").select("*").order("cognome");
        allUtenti = data ?? [];
        window.renderUtenti();
    } catch (e) {
        console.error("loadUtenti:", e);
    }
};

window.renderUtenti = (filter = '') => {
    const q = filter.toLowerCase();
    const filtered = allUtenti.filter(u =>
        !q || `${u.nome} ${u.cognome} ${u.email} ${u.numero_tessera}`.toLowerCase().includes(q)
    );
    const reg = filtered.filter(u => u.registrato);
    const nonReg = filtered.filter(u => !u.registrato);
    fillTable('table-registrati', reg, true);
    fillTable('table-non-registrati', nonReg, false);
};

// ─── Prenotazioni (ricerca su future + passate) ──────────────
window.renderPrenotazioni = (filter = '') => {
    const q = filter.toLowerCase();
    const match = (p) => {
        if (!q) return true;
        const testo = `${p.Utente?.nome ?? ''} ${p.Utente?.cognome ?? ''} ${p.data_prenotazione ?? ''} ${p.stato ?? ''}`.toLowerCase();
        return testo.includes(q);
    };
    renderTabellaPrenotazioni('table-prenotazioni-future', prenotazioniFuture.filter(match));
    renderTabellaPrenotazioni('table-prenotazioni-passate', prenotazioniPassate.filter(match));
};

function fillTable(tbodyId, utenti, isReg) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.replaceChildren();
    if (!utenti.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nessun utente trovato</td></tr>`;
        return;
    }
    for (const u of utenti) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${u.numero_tessera}</td>
            <td class="semibold">${u.cognome} ${u.nome}</td>
            <td>${u.email}</td>
            <td>${u.telefono ?? "—"}</td>
            <td>${u.facolta_universitaria ?? "—"}</td>
            <td>${u.cauzione ? '<span class="badge badge-green">Sì</span>' : '<span class="badge badge-gray">No</span>'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon" title="Modifica" onclick="apriModificaUtente('${u.id_utente}')">
                        <i data-lucide="pencil" class="lucide"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    }
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

window.filterUtenti = () => {
    window.renderUtenti(document.getElementById("search-utenti").value);
};

window.filterPrenotazioni = () => {
    window.renderPrenotazioni(document.getElementById("search-prenotazioni").value);
};

// ─── Gestione tab (generalizzata per gruppo) ─────────────────
const TAB_GROUPS = {
    'registrati': { group: ['registrati', 'non-registrati'], panel: 'tab-registrati' },
    'non-registrati': { group: ['registrati', 'non-registrati'], panel: 'tab-non-registrati' },
    'prenotazioni-future': { group: ['prenotazioni-future', 'prenotazioni-passate'], panel: 'panel-prenotazioni-future' },
    'prenotazioni-passate': { group: ['prenotazioni-future', 'prenotazioni-passate'], panel: 'panel-prenotazioni-passate' },
};

const TAB_PANEL_IDS = {
    'registrati': 'tab-registrati',
    'non-registrati': 'tab-non-registrati',
    'prenotazioni-future': 'panel-prenotazioni-future',
    'prenotazioni-passate': 'panel-prenotazioni-passate',
};

window.switchTab = (tab, btnEl) => {
    const info = TAB_GROUPS[tab];
    if (!info) return;

    // Aggiorna i pannelli del gruppo corretto (utenti oppure prenotazioni)
    info.group.forEach((t) => {
        const panelId = TAB_PANEL_IDS[t];
        document.getElementById(panelId)?.classList.toggle('active', t === tab);
    });

    // Aggiorna solo i bottoni della stessa .tab-bar del bottone cliccato
    // (fallback: se non passato, aggiorna in base al testo/onclick corrispondente)
    const bar = btnEl?.closest('.tab-bar');
    if (bar) {
        bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    } else {
        // Fallback retrocompatibile se switchTab viene chiamato senza l'elemento bottone
        document.querySelectorAll('.tab-btn').forEach((b) => {
            const onclickAttr = b.getAttribute('onclick') || '';
            b.classList.toggle('active', onclickAttr.includes(`'${tab}'`));
        });
    }
};

// ─── Nuovo utente ───────────────────────────────────────────
window.salvaNuovoUtente = async () => {
    showError('nuovo-utente-error', '');
    const nome = document.getElementById('nu-nome').value.trim();
    const cognome = document.getElementById('nu-cognome').value.trim();
    const email = document.getElementById('nu-email').value.trim();
    const tessera = parseInt(document.getElementById('nu-tessera').value);
    const telefono = document.getElementById('nu-telefono').value.trim() || null;
    const facolta = document.getElementById('nu-facolta').value.trim() || null;
    const cauzione = document.getElementById('nu-cauzione').checked;
    const tratt = document.getElementById('nu-trattamento').checked;

    if (!nome || !cognome || !email || !tessera) {
        showError('nuovo-utente-error', 'Compila tutti i campi obbligatori (*).');
        return;
    }

    const btn = document.getElementById('btn-salva-nuovo-utente');
    if (btn) btn.disabled = true;

    try {
        const { error } = await supabase.from('Utente').insert({
            nome, cognome, email, numero_tessera: tessera,
            telefono: telefono ? parseInt(telefono) : null,
            facolta_universitaria: facolta,
            cauzione, trattamento_dati: tratt, registrato: false,
        });
        if (error) throw error;
        window.closeModal('nuovo-utente');
        document.getElementById('nu-nome').value = '';
        document.getElementById('nu-cognome').value = '';
        document.getElementById('nu-email').value = '';
        document.getElementById('nu-tessera').value = '';
        document.getElementById('nu-telefono').value = '';
        document.getElementById('nu-facolta').value = '';
        document.getElementById('nu-cauzione').checked = false;
        document.getElementById('nu-trattamento').checked = false;
        await window.loadUtenti();
    } catch (e) {
        showError('nuovo-utente-error', e.message ?? 'Errore durante la creazione.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ─── Modifica utente ────────────────────────────────────────
window.apriModificaUtente = (id) => {
    const u = allUtenti.find(x => x.id_utente === id);
    if (!u) return;
    document.getElementById('mu-id').value = u.id_utente;
    document.getElementById('mu-email').value = u.email ?? '';
    document.getElementById('mu-telefono').value = u.telefono ?? '';
    document.getElementById('mu-facolta').value = u.facolta_universitaria ?? '';
    document.getElementById('mu-cauzione').checked = !!u.cauzione;
    document.getElementById('mu-registrato').checked = !!u.registrato;
    document.getElementById('modifica-utente-subtitle').textContent = `${u.cognome} ${u.nome} — tessera n.${u.numero_tessera}`;
    showError('modifica-utente-error', '');
    window.openModal('modifica-utente');
};

window.salvaModificaUtente = async () => {
    showError('modifica-utente-error', '');
    const id = document.getElementById('mu-id').value;
    const email = document.getElementById('mu-email').value.trim();
    const telefono = document.getElementById('mu-telefono').value.trim();
    const facolta = document.getElementById('mu-facolta').value.trim();
    const cauzione = document.getElementById('mu-cauzione').checked;
    const registrato = document.getElementById('mu-registrato').checked;

    if (!email) { showError('modifica-utente-error', 'L\'email è obbligatoria.'); return; }

    try {
        const { error } = await supabase.from('Utente').update({
            email, cauzione, registrato,
            telefono: telefono ? parseInt(telefono) : null,
            facolta_universitaria: facolta || null,
        }).eq('id_utente', id);
        if (error) throw error;
        window.closeModal('modifica-utente');
        await window.loadUtenti();
    } catch (e) {
        showError('modifica-utente-error', e.message ?? 'Errore durante il salvataggio.');
    }
};

window.eliminaUtente = () => {
    const id = document.getElementById('mu-id').value;
    const info = document.getElementById('modifica-utente-subtitle').textContent;
    document.getElementById('conferma-elimina-text').textContent =
        `Sei sicuro di voler eliminare l'utente "${info}"? L'operazione non può essere annullata.`;
    pendingDeleteFn = async () => {
        await supabase.from('Utente').delete().eq('id_utente', id);
        window.closeModal('modifica-utente');
        window.closeModal('conferma-elimina');
        await window.loadUtenti();
    };
    window.openModal('conferma-elimina');
};

const btnEliminaOk = document.getElementById("btn-conferma-elimina-ok");
if (btnEliminaOk) {
    btnEliminaOk.onclick = () => {
        pendingDeleteFn?.();
        pendingDeleteFn = null;
    };
}

// ─── Turni ──────────────────────────────────────────────────
window.loadTurni = async () => {
    try {
        turniCache = await getAllTurni(false);
    } catch (e) {
        console.error('loadTurni:', e);
        turniCache = [];
    }
    renderTurni();
    window.populatePaTurni();
};

window.cambiaStatoTurnoAdmin = async (id_turno, rendiAttivo) => {
    //se si sta riattivando un turno, controlla che non si sovrapponga a un turno già attivo prima di procedere
    if (rendiAttivo) {
        const t = turniCache.find(x => x.id_turno === id_turno);
        if (t) {
            const conflittoSovrapposizione = trovaTurnoSovrapposto(t.orario_inizio, t.orario_fine, id_turno);
            if (conflittoSovrapposizione) {
                const msg = `Impossibile riattivare: si sovrappone al turno ${conflittoSovrapposizione.indice}°(${fmtTime(conflittoSovrapposizione.orario_inizio)} – ${fmtTime(conflittoSovrapposizione.orario_fine)}), che è attivo`;
                showToast('error', msg);
                return;
            }
        }
    }
    const azioneTestoTitolo = rendiAttivo ? "riattivazione" : "disattivazione";
    const azioneTesto = rendiAttivo ? "riattivare" : "disattivare";
    const azioneTestoBottone = rendiAttivo ? "Attiva" : "Disattiva";
    const conferma = await confirmAction({
        title: `Conferma ${azioneTestoTitolo} turno`,
        message: `Sei sicuro di voler ${azioneTesto} questo turno?`,
        confirmText: `${azioneTestoBottone}`,
    });
    if (!conferma) return;

    try {
        const { error } = await supabase
            .from('Turno')
            .update({ attivo: rendiAttivo })
            .eq('id_turno', id_turno);

        if (error) throw error;

        const msg = "Turno " + (rendiAttivo ? 'riattivato' : 'disattivato') + " con successo!";
        showToast('success', msg);
        //alert(`Turno ${rendiAttivo ? 'riattivato' : 'disattivato'} con successo!`);

        // Ricarica la tabella dei turni nella dashboard (indici già ricalcolati dal DB)
        await window.loadTurni();

        // Se hai una funzione per ripopolare le select dei moduli admin, eseguila qui
        if (window.populatePaUtenti) window.populatePaUtenti();

    } catch (err) {
        alert("Errore durante l'operazione: " + (err.message ?? err));
    }
};

function renderTurni() {
    const list = document.getElementById('turni-list');
    if (!list) return;
    list.replaceChildren();
    if (!turniCache.length) {
        list.innerHTML = '<span style="font-size:12px;opacity:.4;font-style:italic">Nessun turno configurato</span>';
        return;
    }
    for (const t of turniCache) {
        const isAttivo = t.attivo !== false;
        const row = document.createElement('div');
        row.className = 'turno-row';
        const badgeStato = isAttivo
            ? '<span class="badge badge-green">Attivo</span>'
            : '<span class="badge badge-gray">Inattivo</span>';
        const bottoneToggle = isAttivo
            ? `<button class="btn-icon" title="Disattiva" onclick="window.cambiaStatoTurnoAdmin('${t.id_turno}', false)"><i data-lucide="power-off" class="lucide"></i></button>`
            : `<button class="btn-icon" title="Riattiva" onclick="window.cambiaStatoTurnoAdmin('${t.id_turno}', true)"><i data-lucide="power" class="lucide"></i></button>`;
        row.innerHTML = `
            <span class="turno-index">${t.indice ?? '-'}</span>
            <span class="turno-label">${(t.indice === null) ? 'Turno disattivato' : t.indice + '° Turno'}</span>
            <span class="turno-time">${fmtTime(t.orario_inizio)} – ${fmtTime(t.orario_fine)}</span>
            ${badgeStato}
            <div class="table-actions">
                <button class="btn-icon" title="Modifica" onclick="apriModificaTurno('${t.id_turno}')">
                    <i data-lucide="pencil" class="lucide"></i>
                </button>
                ${bottoneToggle}
            </div>
        `;
        list.appendChild(row);
    }
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

window.openNuovoTurno = () => {
    document.getElementById('nt-inizio').value = '';
    document.getElementById('nt-fine').value = '';
    document.getElementById('modal-nuovo-turno-title').textContent = 'Nuovo turno';
    const subtitleEl = document.getElementById('modal-nuovo-turno-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'Aggiungi una nuova fascia oraria';
    showError('nuovo-turno-error', '');
    window.openModal('nuovo-turno');
};

window.apriModificaTurno = (id) => {
    const t = turniCache.find(x => x.id_turno === id);
    if (!t) return;
    turnoInModificaId = t.id_turno;
    // l'indice non è più modificabile manualmente: viene ricalcolato dal DB.
    // Se in pagina è rimasto un campo mt-indice, lo mostro solo a scopo informativo (readonly).
    const mtIndiceEl = document.getElementById('mt-indice');
    if (mtIndiceEl) mtIndiceEl.value = t.indice ?? '';
    document.getElementById('mt-inizio').value = t.orario_inizio?.slice(0, 5) ?? '';
    document.getElementById('mt-fine').value = t.orario_fine?.slice(0, 5) ?? '';
    document.getElementById('modal-turno-title').textContent = `Turno ${t.indice}°`;
    const subtitleEl2 = document.getElementById('modal-turno-subtitle');
    if (subtitleEl2) subtitleEl2.textContent = `${fmtTime(t.orario_inizio)} – ${fmtTime(t.orario_fine)}`;

    showError('modifica-turno-error', '');
    window.openModal('modifica-turno');
};

//funzione per convertire turno in minuti dalla mezzanotte
function turnoToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

//verifica se un turno (per una prenotazione di OGGI) è già terminato rispetto all'ora corrente.
//stessa convenzione usata altrove: se manca l'orario di fine, è "00:00" o è <= all'inizio,
//il turno si considera valido fino a fine giornata (mezzanotte), quindi mai "concluso" prima della mezzanotte.
function turnoGiaConcluso(turno, nowMinuti) {
    if (!turno) return false;
    const inizioMin = turnoToMinutes(turno.orario_inizio);
    const fineMinRaw = turnoToMinutes(turno.orario_fine);
    const fineEffettiva = (!turno.orario_fine || fineMinRaw === 0 || fineMinRaw <= inizioMin) ? 24 * 60 : fineMinRaw;
    return nowMinuti >= fineEffettiva;
}

//calcola l'intervallo [inizio, fine) in minuti di un turno, se manca orario di fine, è 00:00 o è <= all'inizio,
//il turno si considera valido fino a fine giornata (mezzanotte)
function getIntervalloTurno(inizio, fine) {
    const start = turnoToMinutes(inizio);
    const fineMin = turnoToMinutes(fine);
    const end = (!fine || fineMin === 0 || fineMin <= start) ? 24 * 60 : fineMin;

    return { start, end };
}

//controlla se due intervalli [start, end) si sovrappongono
function intervalliSiSovrappongono(a, b) {
    return a.start < b.end && b.start < a.end;
}

//verifica che il turno non si sovrapponga a nessun turno ATTIVO esistente (escluso se stesso)
function trovaTurnoSovrapposto(inizio, fine, idEscluso) {
    const nuovo = getIntervalloTurno(inizio, fine);
    for (const t of turniCache) {

        if (t.id_turno === idEscluso) continue;

        if (t.attivo === false) continue;

        const esistente = getIntervalloTurno(t.orario_inizio, t.orario_fine);

        if (intervalliSiSovrappongono(nuovo, esistente)) return t;
    }

    return null;
}

function trovaNuovoTurnoUguale(inizio, fine) {
    const nuovoInizio = turnoToMinutes(inizio);
    const nuovoFine = turnoToMinutes(fine);
    for (const t of turniCache) {
        const tInizio = turnoToMinutes(t.orario_inizio);
        const tFine = turnoToMinutes(t.orario_fine);

        if ((tInizio === nuovoInizio) && (tFine === nuovoFine)) return t;
    }

    return null;
}

window.salvaModificaTurno = async () => {
    showError('modifica-turno-error', '');
    const id = turnoInModificaId;
    const inizio = document.getElementById('mt-inizio').value;
    const fine = document.getElementById('mt-fine').value;

    if (!id) { showError('modifica-turno-error', 'Nessun turno selezionato.'); return; }
    if (!inizio || !fine) { showError('modifica-turno-error', 'Orario inizio e fine obbligatori.'); return; }

    if (turnoToMinutes(fine) !== 0 && turnoToMinutes(fine) <= turnoToMinutes(inizio)) {
        const msg = 'L\'orario di fine deve essere successivo a quello di inizio';
        showToast("error", msg);

        return;
    }

    const conflittoSovrapposizione = trovaTurnoSovrapposto(inizio, fine, id);
    if (conflittoSovrapposizione) {
        const msg = `Sovrapposizione con il turno ${conflittoSovrapposizione.indice}°(${fmtTime(conflittoSovrapposizione.orario_inizio)} – ${fmtTime(conflittoSovrapposizione.orario_fine)}). Disattivalo prima se vuoi usare questa fascia oraria.`;
        showToast("error", msg);
        return;
    }

    // l'indice viene ricalcolato automaticamente dal DB (trigger) in base
    // all'ordine di orario_inizio tra i turni attivi: non va più inviato dal client
    try {
        const { error } = await supabase.from('Turno').update({ orario_inizio: inizio, orario_fine: fine }).eq('id_turno', id);
        if (error) throw error;
        turnoInModificaId = null;
        window.closeModal('modifica-turno');
        await window.loadTurni();
    } catch (e) {
        showError('modifica-turno-error', e.message ?? 'Errore.');
    }
};

window.salvaNuovoTurno = async () => {
    showError('nuovo-turno-error', '');
    const inizio = document.getElementById('nt-inizio').value;
    const fine = document.getElementById('nt-fine').value;

    if (!inizio || !fine) { showError('nuovo-turno-error', 'Orario inizio e fine obbligatori.'); return; }

    if (turnoToMinutes(fine) !== 0 && turnoToMinutes(fine) <= turnoToMinutes(inizio)) {
        const msg = 'L\'orario di fine deve essere successivo a quello di inizio';
        showToast("error", msg);

        return;
    }

    const conflittoDuplicato = trovaNuovoTurnoUguale(inizio, fine);
    if (conflittoDuplicato) {
        //const statoTurno = conflittoDuplicato.attivo !== false ? 'attivo' : 'disattivato';
        const msg = `Esiste già un turno con la stessa fascia oraria (${fmtTime(conflittoDuplicato.orario_inizio)} - ${fmtTime(conflittoDuplicato.orario_fine)}). Non è possibile creare duplicati.`;
        showToast("error", msg);
        return;
    }

    const conflittoSovrapposizione = trovaTurnoSovrapposto(inizio, fine);
    if (conflittoSovrapposizione) {
        const msgSovrapposizione = `La fascia oraria selezionata è in sovrapposizione con la seguente (${fmtTime(conflittoSovrapposizione.orario_inizio)} - ${fmtTime(conflittoSovrapposizione.orario_fine)}).`;
        showToast("error", msgSovrapposizione);
        return;
    }

    // l'indice viene assegnato automaticamente dal DB (trigger) in base
    // all'ordine di orario_inizio tra i turni attivi: non va più inviato dal client
    try {
        const { error } = await supabase.from('Turno').insert({ orario_inizio: inizio, orario_fine: fine });
        if (error) throw error;
        window.closeModal('nuovo-turno');
        await window.loadTurni();
    } catch (e) {
        showError('nuovo-turno-error', e.message ?? 'Errore.');
    }
};

window.eliminaTurno = async () => {
    const conferma = await confirmAction({
        title: `Eliminazione turno`,
        message:"ATTENZIONE: Eliminando definitivamente questo turno cancellerai anche TUTTE le prenotazioni passate e future collegate ad esso. Vuoi procedere?",
        confirmText: "Elimina",
    });
    if (!conferma) return;

    const id_turno = turnoInModificaId;
    if (!id_turno) {
        showToast("error", "Nessun turno selezionato per l'eliminazione.");
        return;
    }

    try {
        const { error } = await supabase
            .from('Turno')
            .delete()
            .eq('id_turno', id_turno);

        if (error) throw error;

        window.closeModal('modifica-turno');

        await window.loadTurni();
        // L'eliminazione del turno cancella (in cascata) anche le sue prenotazioni:
        // ricarico le statistiche per aggiornare le tabelle prenotazioni future/passate,
        // e invalido la cache del calendario così anche quella vista resta coerente.
        await window.loadStats();
        window.calendarRender?.invalidateBookingsCache?.();
        window.calendarRender?.render?.();

        const msg = "Turno e prenotazioni collegate eliminati definitivamente."
        showToast("success", msg);

    } catch (err) {
        console.error("Errore durante l'eliminazione del turno:", err);
        showToast("error", "Impossibile eliminare il turno: " + (err.message ?? err));
    }
};

// ─── Prenotazione privilegiata ───────────────────────────────
window.apriNuovaPrenotazioneAdmin = () => {
    // 1. Svuota e resetta tutti i campi di input del form
    const utenteEl = document.getElementById('pa-utente');
    const dataEl = document.getElementById('pa-data');
    const turnoEl = document.getElementById('pa-turno');
    const statoEl = document.getElementById('pa-stato');
    const forzaEl = document.getElementById('pa-forza');

    if (utenteEl) utenteEl.value = ''; // Torna a "Seleziona utente..."
    if (dataEl) dataEl.value = '';   // Svuota la data
    if (turnoEl) {
        turnoEl.value = '';            // Svuota il turno
        turnoEl.replaceChildren();     // Pulisce le opzioni vecchie
        turnoEl.appendChild(Object.assign(document.createElement('option'), {
            value: '',
            textContent: 'Seleziona prima una data',
            disabled: true,
            selected: true
        }));
    }
    if (statoEl) statoEl.value = ''; // Ripristina lo stato di default
    if (forzaEl) forzaEl.checked = false;      // Disattiva la checkbox "Forza"

    // 2. Nascondi eventuali messaggi di errore rimasti appesi
    showError("prenota-admin-error", "");

    // 3. Disabilita nuovamente il bottone di conferma (perché il form ora è vuoto)
    const btn = document.getElementById("btn-conferma-prenota-admin");
    if (btn) btn.disabled = true;

    // 4. Infine, apri il modal in sicurezza
    window.openModal("prenota-admin");
};

window.populatePaUtenti = () => {
    const sel = document.getElementById("pa-utente");
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(
        Object.assign(document.createElement("option"), {
            value: "",
            textContent: "Seleziona utente…",
            disabled: true,
            selected: true,
        }),
    );
    for (const u of allUtenti) {
        sel.appendChild(
            Object.assign(document.createElement("option"), {
                value: u.id_utente,
                textContent: `${u.cognome} ${u.nome} — n.${u.numero_tessera}`,
            }),
        );
    }
};

window.populatePaTurni = () => {
    const sel = document.getElementById("pa-turno");
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(
        Object.assign(document.createElement("option"), {
            value: "",
            textContent: "Seleziona prima una data",
            disabled: true,
            selected: true,
        }),
    );
};

['pa-data', 'pa-forza'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async () => {
        const data = document.getElementById('pa-data').value;
        if (!data) return;
        const sel = document.getElementById('pa-turno');
        if (!sel) return;
        sel.disabled = true;
        sel.innerHTML = '<option disabled selected>Caricamento…</option>';

        const { data: prenOcc } = await supabase.from('Prenotazione').select('id_turno').eq('data_prenotazione', data);
        const occIds = new Set((prenOcc ?? []).map(p => p.id_turno));

        sel.replaceChildren();
        sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: 'Seleziona turno', disabled: true, selected: true }));
        for (const t of turniCache) {
            const occ = occIds.has(t.id_turno);
            const opt = Object.assign(document.createElement('option'), {
                value: t.id_turno,
                textContent: `${t.indice}° — ${fmtTime(t.orario_inizio)} - ${fmtTime(t.orario_fine)}${occ ? ' (Occupato)' : ''}`,
            });
            if (occ && !document.getElementById('pa-forza').checked) {
                opt.disabled = true;
            }
            sel.appendChild(opt);
        }
        sel.disabled = false;
        window.validatePrenotaAdmin();
    });
});

["pa-utente", "pa-turno", "pa-data"].forEach((id) => {
    document
        .getElementById(id)
        ?.addEventListener("change", () => window.validatePrenotaAdmin());
});

window.validatePrenotaAdmin = () => {
    const ok =
        document.getElementById("pa-utente")?.value &&
        document.getElementById("pa-data")?.value &&
        document.getElementById("pa-turno")?.value;
    const btn = document.getElementById("btn-conferma-prenota-admin");
    if (btn) btn.disabled = !ok;
};

window.confermaPrenotaAdmin = async () => {
    showError('prenota-admin-error', '');
    const id_utente = document.getElementById('pa-utente').value;
    const data_prenotazione = document.getElementById('pa-data').value;
    const id_turno = document.getElementById('pa-turno').value;
    const stato = document.getElementById('pa-stato').value;
    const btn = document.getElementById('btn-conferma-prenota-admin');
    if (btn) btn.disabled = true;
    try {
        if (!document.getElementById('pa-forza').checked) {
            const { error } = await supabase.from('Prenotazione').insert({
                id_utente, id_turno, data_prenotazione, stato,
            });
            if (error) throw error;
        }
        else {
            const { data, error } = await supabase
                .from('Prenotazione')
                .select('id_prenotazione')
                .eq('data_prenotazione', data_prenotazione)
                .eq('id_turno', id_turno)
                .maybeSingle();

            if (error) {
                console.error("Errore:", error);
            } else if (data) {
                const { error: errorDelete } = await supabase
                    .from('Prenotazione')
                    .delete()
                    .eq('id_prenotazione', data.id_prenotazione)
                    .eq('id_turno', id_turno)
                    .eq('data_prenotazione', data_prenotazione);

                if (errorDelete) throw errorDelete;

                const { error: errorInsert } = await supabase.from('Prenotazione').insert({
                    id_utente, id_turno, data_prenotazione, stato,
                });
                if (errorInsert) throw errorInsert;
            } else {
                const { error: errorInsert } = await supabase.from('Prenotazione').insert({
                    id_utente, id_turno, data_prenotazione, stato,
                });
                if (errorInsert) throw errorInsert;
            }

        }

        window.closeModal('prenota-admin');
        window.calendarRender?.invalidateBookingsCache?.();
        window.calendarRender?.render?.();
        await window.loadStats();
    } catch (e) {
        showError('prenota-admin-error', e.message ?? 'Errore.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ─── Feedback ───────────────────────────────────────────────
let feedbackCache = [];

// peso di ordinamento: non gestiti prima, gestiti in fondo
const STATO_PESO = {
  non_gestito: 0,
  in_lavorazione: 1,
  gestito: 2,
};

window.loadFeedback = async () => {
  try {
    const { data, error } =
      typeof window.ldrDb?.getAllFeedback === "function"
        ? await window.ldrDb.getAllFeedback()
        : await supabase
            .from("Feedback")
            .select(
              "id_feedback, categoria, contenuto, created_at, stato, Utente:id_utente (nome, cognome, numero_tessera)",
            )
            .order("created_at", { ascending: false });

    if (error) throw error;

    feedbackCache = (data ?? []).slice().sort((a, b) => {
      const pesoA = STATO_PESO[a.stato] ?? 1;
      const pesoB = STATO_PESO[b.stato] ?? 1;
      if (pesoA !== pesoB) return pesoA - pesoB;
      // a parità di stato, i più recenti prima
      return new Date(b.created_at) - new Date(a.created_at);
    });

    renderFeedbackTable();
  } catch (e) {
    console.error("loadFeedback:", e);
  }
};

function renderFeedbackTable() {
  const tbody = document.getElementById("table-feedback");
  if (!tbody) return;

  tbody.replaceChildren();

  if (!feedbackCache.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Nessun feedback ricevuto</td></tr>';
    return;
  }

  for (const f of feedbackCache) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${f.Utente ? `${escapeHtml(f.Utente.cognome)} ${escapeHtml(f.Utente.nome)}` : "—"}</td>
        <td>${fmtCategoriaBadge(f.categoria)}</td>
        <td class="feedback-content">${escapeHtml(troncaTesto(f.contenuto))}</td>
        <td>${fmtDate(f.created_at)}</td>
        <td>${fmtStatoBadge(f.stato)}</td>
        `;

    // apertura più comoda con click sulla tupla
    tr.style.cursor = "pointer";
    tr.addEventListener("click", function (e) {
      if (e.target.closest("button")) return;
      window.apriGestisciFeedback(f.id_feedback);
    });
    tbody.appendChild(tr);
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

// tronca il testo del feedback per la vista tabellare
function troncaTesto(testo, max = 80) {
  if (!testo) return "—";
  return testo.length > max ? testo.slice(0, max) + "…" : testo;
}

// previene injection html dai campi testuali inseriti dagli utenti
function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// restituisce data e ora formattate (usato nel dettaglio feedback)
function fmtDateTime(str) {
  if (!str) return "—";
  const d = new Date(str);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// apre il modal di dettaglio con tutte le informazioni del feedback selezionato
window.apriGestisciFeedback = (id) => {
  const f = feedbackCache.find((x) => x.id_feedback === id);
  if (!f) return;

  document.getElementById("gf-utente").textContent = f.Utente
    ? `${f.Utente.cognome} ${f.Utente.nome} — n.${f.Utente.numero_tessera}`
    : "Utente non disponibile";
  document.getElementById("gf-categoria").innerHTML = fmtCategoriaBadge(f.categoria);
  document.getElementById("gf-contenuto").value = f.contenuto ?? "";
  document.getElementById("gf-subtitle").textContent = `${fmtDateTime(f.created_at)}`;

  const statoSelect = document.getElementById("gf-stato");
  if (statoSelect) statoSelect.value = f.stato ?? "non_gestito";

  showError("gestisci-feedback-error", "");

  const btnElimina = document.getElementById("btn-elimina-feedback");
  if (btnElimina) {
    btnElimina.onclick = () => confermaEliminaFeedback(f.id_feedback);
  }

  const btnSalvaStato = document.getElementById("btn-salva-stato-feedback");
  if (btnSalvaStato) {
    btnSalvaStato.onclick = () => salvaStatoFeedback(f.id_feedback);
  }

  window.openModal("gestisci-feedback");
};

// salva il nuovo stato scelto per il feedback
async function salvaStatoFeedback(id_feedback) {
  const statoSelect = document.getElementById("gf-stato");
  const nuovoStato = statoSelect?.value;
  if (!nuovoStato) return;

  const btn = document.getElementById("btn-salva-stato-feedback");
  if (btn) btn.disabled = true;

  try {
    const { error } =
      typeof window.ldrDb?.updateStatoFeedback === "function"
        ? await window.ldrDb.updateStatoFeedback(id_feedback, nuovoStato)
        : await supabase
            .from("Feedback")
            .update({ stato: nuovoStato })
            .eq("id_feedback", id_feedback);
    if (error) throw error;

    showToast("success", "Stato aggiornato", "check");
    window.closeModal("gestisci-feedback");
    await window.loadFeedback();
  } catch (e) {
    console.error("salvaStatoFeedback:", e);
    showToast("error", "Impossibile aggiornare lo stato", "x");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// chiede conferma ed elimina il feedback
async function confermaEliminaFeedback(id_feedback) {
  const confirmed = await confirmAction({
    title: "Conferma eliminazione",
    message: "Confermi di voler eliminare questo feedback? L'operazione non può essere annullata.",
    confirmText: "Elimina",
    danger: true,
  });
  if (!confirmed) return;

  try {
    const { error } =
      typeof window.ldrDb?.deleteFeedback === "function"
        ? await window.ldrDb.deleteFeedback(id_feedback)
        : await supabase.from("Feedback").delete().eq("id_feedback", id_feedback);
    if (error) throw error;

    window.closeModal("gestisci-feedback");
    showToast("success", "Feedback eliminato", "check");
    await window.loadFeedback();
  } catch (e) {
    console.error("eliminaFeedback:", e);
    showToast("error", "Impossibile eliminare il feedback", "x");
  }
}

// restituisce il badge colorato in base alla categoria del feedback
function fmtCategoriaBadge(categoria) {
  const map = {
    bug: '<span class="badge badge-red">Bug</span>',
    suggerimento: '<span class="badge badge-green">Suggerimento</span>',
    altro: '<span class="badge badge-gray">Altro</span>',
  };
  return map[categoria] ?? `<span class="badge badge-gray">${categoria}</span>`;
}

// restituisce il badge colorato in base allo stato del feedback
function fmtStatoBadge(stato) {
  const map = {
    non_gestito: '<span class="badge badge-red">Non gestito</span>',
    in_lavorazione: '<span class="badge badge-blue">In lavorazione</span>',
    gestito: '<span class="badge badge-gray">Gestito</span>',
  };
  return map[stato] ?? '<span class="badge badge-red">Non gestito</span>';
}

// ─── Impostazioni ───────────────────────────────────────────
async function loadImpostazioni() {
    await syncLimiteSettimanale();
    const limEl = document.getElementById("input-limite-settimanale");
    console.log("DEBUG limEl trovato:", limEl, "valore da impostare:", limiteSettimanale); // temporaneo
    if (limEl) limEl.value = limiteSettimanale;
  
    const antEl = document.getElementById("input-settimane-anticipo");
    if (antEl) {
      try {
        const { data, error } =
          typeof window.ldrDb?.getSettimaneAnticipo === "function"
            ? await window.ldrDb.getSettimaneAnticipo()
            : { data: null, error: null };
        antEl.value = !error && data != null
          ? data
          : (window.calendarRender?.weeksBeforeNextMonthView ?? 1);
      } catch (e) {
        console.error("loadImpostazioni (anticipo):", e);
        antEl.value = window.calendarRender?.weeksBeforeNextMonthView ?? 1;
      }
    }
  }

  async function syncLimiteSettimanale() {
    try {
      const { data, error } =
        typeof window.ldrDb?.getLimiteSettimanale === "function"
          ? await window.ldrDb.getLimiteSettimanale()
          : { data: null, error: null };
      console.log("DEBUG manage-dashboard syncLimiteSettimanale:", { data, error }); // temporaneo
      if (!error && data != null) limiteSettimanale = data;
      console.log("DEBUG limiteSettimanale dopo sync:", limiteSettimanale); // temporaneo
    } catch (e) {
      console.error("syncLimiteSettimanale:", e);
    }
  }

  window.salvaLimite = async () => {
    const v = parseInt(document.getElementById("input-limite-settimanale").value);
    if (!v || v < 1) return;
  
    try {
      const { error } =
        typeof window.ldrDb?.updateLimiteSettimanale === "function"
          ? await window.ldrDb.updateLimiteSettimanale(v)
          : await supabase
              .from("Impostazioni")
              .update({ valore: String(v) })
              .eq("nome", "limite_settimanale");
      if (error) throw error;
  
      limiteSettimanale = v;
      window.ldrBookingConfig?.setMaxWeeklyBookings?.(v); // viene letto correttamente dal db
      document.getElementById("stat-limite").textContent = v;
      showToast("success", `Limite aggiornato a ${v} prenotazioni/settimana.`, "check");
    } catch (e) {
      console.error("salvaLimite:", e);
      showToast("error", "Impossibile salvare l'impostazione.", "x");
    }
  };

window.salvaAnticipo = async () => {
    const v = parseInt(document.getElementById("input-settimane-anticipo").value);
    if (isNaN(v) || v < 0) return;
  
    try {
      const { error } =
        typeof window.ldrDb?.updateSettimaneAnticipo === "function"
          ? await window.ldrDb.updateSettimaneAnticipo(v)
          : await supabase
              .from("Impostazioni")
              .update({ valore: String(v) })
              .eq("nome", "settimane_anticipo");
      if (error) throw error;
  
      if (window.calendarRender) {
        window.calendarRender.weeksBeforeNextMonthView = v;
        window.calendarRender.render?.();
      }
      showToast("success", `Anticipo aggiornato a ${v} settimane.`, "check");
    } catch (e) {
      console.error("salvaAnticipo:", e);
      showToast("error", "Impossibile salvare l'impostazione.", "x");
    }
  };

// ─── Inizializzazione ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    const isAllowed = await guardAdminAccess();
    if (!isAllowed) return;

    document.body.classList.add("admin-access-checked");

    document.getElementById('btn-nav-utenti')?.classList.add('active');

    await syncLimiteSettimanale();
    await window.loadStats();
    await window.loadUtenti();
    await window.loadTurni();

    window.populatePaUtenti();

    if (window.calendarRender) {
        window.calendarRender.getNavigableMonthOffsets = function () {
            return { min: -12, max: 12 };
        };
        window.calendarRender.canViewNextMonth = () => true;
    }

    const user = window.ldrProfilo;
    if (user) {
        const infoEl = document.getElementById("dash-admin-info");
        if (infoEl)
            infoEl.textContent = `Connesso come ${user.nome} ${user.cognome}`;
    }
});

document
    .querySelector("[onclick=\"openModal('nuovo-turno')\"]")
    ?.addEventListener("click", (e) => {
        e.preventDefault();
        window.openNuovoTurno?.();
    });
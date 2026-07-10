import {
    getAllUtenti,
    getAllUtentiAdmin,
    getAllUtentiCediTurno,
    getAllTurni,
    getProfiloUtente,
    isAmministratore,
    annullaPrenotazioneAdmin,
    getAllFeedback,
    deleteFeedback,
    updateStatoFeedback,
    getSettimaneAnticipo,
    updateSettimaneAnticipo,
    updateLimiteSettimanale,
    getLimiteSettimanale,
    getPrenotazioniByDateRange,
} from './db.js';
import { supabase } from "./supabase-client.js";
import { setMainView } from "./main-view.js";
import { showToast } from './toast.js';
import { confirmAction } from "./confirm.js";
import { modal } from './modal.js';
import { calendarRender } from './calendar-render.js';
import { setMaxWeeklyBookings } from './bookings-view.js';
import {
    parseDbDate,
    formatDayTitle,
    formatTurnLabel,
} from './bookings-view.js';
import { profiloUtente } from './user-state.js';

// ─── Controllo accesso amministratore ────────────────────────────────────
// blocca l'accesso diretto via url a chi non è amministratore
async function guardAdminAccess() {
    const { data: profilo, error: profiloError } = await getProfiloUtente();

    if (profiloError || !profilo?.id_utente) {
        window.location.href = '/login.html';
        return false;
    }

    const { data: isAdmin, error } = await isAmministratore(profilo.id_utente);

    if (error || !isAdmin) {
        window.location.href = '/index.html';
        return false;
    }

    return true;
}

// ─── Stato locale ─────────────────────────────────────────────────────────
let allUtenti = [];
let allPrenotazioni = [];
let prenotazioniFuture = [];
let prenotazioniPassate = [];
let turniCache = [];
let limiteSettimanale = null;
let settimaneAnticipo = null;
let pendingDeleteFn = null;
let turnoInModificaId = null;
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

// previene injection html dai campi testuali inseriti dagli utenti
function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
}

// ─── Gestione Viste (sezioni dashboard) ──────────────────────────────────




function showSection(id) {

    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${id}`)?.classList.add('active');

    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-nav-${id}`)?.classList.add('active');

    if (id === 'stats') loadStats();
    if (id === 'utenti') loadUtentiAdmin();
    if (id === 'turni') loadTurni();
    if (id === 'prenotazioni') {
        resetSearchPrenotazioni();
    }
    if (id === 'feedback') loadFeedback();
    if (id === 'impostazioni') loadImpostazioni();
}

// apre il modal per modificare una prenotazione (usata anche dalla tabella prenotazioni)
export async function openModificaPrenotazioneAdmin(prenotazione) {
    const modalEl = document.getElementById("modal-modifica-prenotazione");
    if (!modalEl) return;

    const inputData = document.getElementById("modifica-turno-data");
    const inputTurno = document.getElementById("modifica-turno-orario");
    const selectCedi = document.getElementById("modifica-turno-cedi");
    const btnCedi = document.getElementById("btn-cedi-turno");
    const btnRinuncia = document.getElementById("btn-rinuncia-turno");

    if (btnCedi) {
        btnCedi.disabled = true;
        btnCedi.onclick = null;
    }
    if (btnRinuncia) {
        btnRinuncia.disabled = false;
        btnRinuncia.onclick = null;
    }

    if (inputData) {
        const date = parseDbDate(prenotazione.data_prenotazione);
        inputData.value = formatDayTitle(date);
    }

    if (inputTurno) {
        const turn = prenotazione.Turno;
        inputTurno.value = turn
            ? `${turn.indice}° Turno — ${formatTurnLabel(turn)}`
            : "";
    }

    const statoSection = document.getElementById("admin-stato-section");
    const selectStato = document.getElementById("modifica-turno-stato");
    const btnSalvaStato = document.getElementById("btn-salva-stato-prenotazione");

    if (statoSection) statoSection.classList.remove("hidden");

    if (selectStato) {
        const statoAttuale =
            prenotazione.stato === "confermata" || prenotazione.data_conferma
                ? "confermata"
                : ["confermata", "non_confermata", "riservata"].includes(prenotazione.stato)
                    ? prenotazione.stato
                    : "non_confermata";
        selectStato.value = statoAttuale;
    }

    if (btnSalvaStato) {
        btnSalvaStato.disabled = false;
        btnSalvaStato.onclick = () =>
            handleSalvaStatoPrenotazioneAdmin(prenotazione.id_prenotazione, selectStato);
    }

    if (selectCedi) {
        selectCedi.innerHTML = '<option value="">Seleziona utente</option>';
        const { data: utenti, error } = await getAllUtentiCediTurno(prenotazione.id_utente);
        if (error) {
            console.error("impossibile caricare gli utenti: ", error);
        } else {
            (utenti ?? []).forEach((u) => {
                const opt = document.createElement("option");
                opt.value = u.id_utente;
                opt.textContent = `${u.cognome} ${u.nome}`;
                selectCedi.appendChild(opt);
            });
        }

        selectCedi.value = "";
        selectCedi.onchange = () => {
            if (btnCedi) {
                btnCedi.disabled = !selectCedi.value;
                btnCedi.classList.toggle("active", !!selectCedi.value);
            }
        };
    }

    if (btnCedi) {
        btnCedi.onclick = () =>
            handleCediTurnoAdmin(prenotazione.id_prenotazione, selectCedi);
    }

    if (btnRinuncia) {
        btnRinuncia.onclick = () =>
            handleRinunciaTurnoAdmin(prenotazione.id_prenotazione);
    }

    modal.open("modifica-prenotazione");
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
    if (btnCedi) btnCedi.disabled = true;

    try {
        const { error } = await supabase
            .from("Prenotazione")
            .update({ id_utente: id_destinatario })
            .eq("id_prenotazione", id_prenotazione);

        if (error) throw error;
        modal?.closeAll();
        showToast("success", "Turno riassegnato", "check");
        await loadStats();
        calendarRender?.invalidateBookingsCache?.();
        calendarRender?.render?.();
    } catch (e) {
        console.error("Errore riassegnazione turno: ", e);
        showToast("error", "Impossibile riassegnare il turno", "x");
        if (btnCedi) btnCedi.disabled = false;
    }

    window.lucide.createIcons();
}

// aggiorna lo stato di una prenotazione (solo admin)
async function handleSalvaStatoPrenotazioneAdmin(id_prenotazione, selectStato) {
    const nuovoStato = selectStato?.value;
    if (!nuovoStato) return;

    const btn = document.getElementById("btn-salva-stato-prenotazione");
    if (btn) btn.disabled = true;

    try {
        const updateFields = {
            stato: nuovoStato,
            data_conferma: nuovoStato === "confermata" ? new Date().toISOString() : null,
        };

        const { error } = await supabase
            .from("Prenotazione")
            .update(updateFields)
            .eq("id_prenotazione", id_prenotazione);

        if (error) throw error;

        modal?.closeAll();
        showToast("success", "Stato prenotazione aggiornato", "check");

        await loadStats();
        calendarRender?.invalidateBookingsCache?.();
        calendarRender?.render?.();
    } catch (e) {
        console.error("Errore aggiornamento stato prenotazione:", e);
        showToast("error", "Impossibile aggiornare lo stato della prenotazione", "x");
    } finally {
        if (btn) btn.disabled = false;
    }

    window.lucide.createIcons();
}

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

        modal?.closeAll();
        showToast("success", "Prenotazione eliminata", "check");

        await loadStats();
        calendarRender?.invalidateBookingsCache?.();
        calendarRender?.render?.();
    } catch (e) {
        console.error("Errore eliminazione prenotazione:", e);
        showToast("error", "Impossibile eliminare la prenotazione", "x");
        if (btnRinuncia) btnRinuncia.disabled = false;
    }

    window.lucide.createIcons();
}

// ─── Rendering tabelle prenotazioni (future / passate) ───────────────────
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
            <td>${escapeHtml(p.Utente?.cognome ?? '')} ${escapeHtml(p.Utente?.nome ?? '')}</td>
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

// ─── Statistiche ──────────────────────────────────────────────────────────
async function loadStats() {
    try {
        const ora = new Date();
        const meseStart = new Date(ora.getFullYear(), ora.getMonth(), 1).toISOString().split('T')[0];
        const meseEnd = new Date(ora.getFullYear(), ora.getMonth() + 1, 0).toISOString().split('T')[0];
        const oggi = ora.toISOString().split('T')[0];

        const [resUtenti, resMese, resOggi] = await Promise.all([
            getAllUtentiAdmin(),
            getPrenotazioniByDateRange(meseStart, meseEnd),
            getPrenotazioniByDateRange(oggi, oggi),
        ]);

        const tutti = resUtenti?.data ?? [];
        const reg = tutti.filter(u => u.registrato);
        const pMese = resMese?.data ?? [];
        const pOggi = resOggi?.data ?? [];
        const confermate = pMese.filter(p => p.stato === 'confermata' || p.data_conferma);
        const tasso = pMese.length ? Math.round(confermate.length / pMese.length * 100) : 0;

        //document.getElementById('stat-registrati').textContent = reg.length;
        document.getElementById('stat-totali').textContent = tutti.length;
        document.getElementById('stat-prenot-mese').textContent = pMese.length;
        document.getElementById('stat-prenot-oggi').textContent = pOggi.length;
        document.getElementById('stat-tasso').textContent = `${tasso}%`;
        document.getElementById('stat-limite').textContent = limiteSettimanale;

        const label = ora.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const labelEl = document.getElementById('stat-prenot-mese-label');
        if (labelEl) labelEl.textContent = label;

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

        const perIndiceTurnoCrescente = (a, b) => (a.Turno?.indice ?? 0) - (b.Turno?.indice ?? 0);

        const futureOrdinate = [...futureEffettive].sort((a, b) =>
            a.data_prenotazione.localeCompare(b.data_prenotazione) || perIndiceTurnoCrescente(a, b)
        );
        const passateOrdinate = [...passateEffettive].sort((a, b) =>
            b.data_prenotazione.localeCompare(a.data_prenotazione) || perIndiceTurnoCrescente(a, b)
        );

        prenotazioniFuture = futureOrdinate;
        prenotazioniPassate = passateOrdinate;
        allPrenotazioni = [...prenotazioniFuture, ...prenotazioniPassate];

        resetSearchPrenotazioni();
    } catch (e) {
        console.error("loadStats:", e);
    }

    window.lucide.createIcons();
}

// ─── Utenti ───────────────────────────────────────────────────────────────
async function loadUtentiAdmin() {
    try {
        const { data } = await getAllUtentiAdmin();
        allUtenti = data ?? [];
        resetSearchUtenti();
    } catch (e) {
        console.error("loadUtenti:", e);
    }
}

function renderUtenti(filter = '') {
    const q = filter.toLowerCase();
    const filtered = allUtenti.filter(u =>
        !q || `${u.nome} ${u.cognome} ${u.email} ${u.numero_tessera}`.toLowerCase().includes(q)
    );
    const reg = filtered.filter(u => u.registrato);
    const nonReg = filtered.filter(u => !u.registrato);
    fillTable('table-registrati', reg);
    fillTable('table-non-registrati', nonReg);
}

// Funzioni reset campi search
export function resetSearchUtenti() {
    const input = document.getElementById('search-utenti');
    if (input) input.value = '';
    renderUtenti('');
}

export function resetSearchPrenotazioni() {
    const input = document.getElementById('search-prenotazioni');
    if (input) input.value = '';
    renderPrenotazioni('');
}

// ─── Prenotazioni (ricerca su future + passate) ───────────────────────────
function renderPrenotazioni(filter = '') {
    const q = filter.toLowerCase();
    const match = (p) => {
        if (!q) return true;
        const testo = `${p.Utente?.nome ?? ''} ${p.Utente?.cognome ?? ''} ${p.data_prenotazione ?? ''} ${p.stato ?? ''}`.toLowerCase();
        return testo.includes(q);
    };
    renderTabellaPrenotazioni('table-prenotazioni-future', prenotazioniFuture.filter(match));
    renderTabellaPrenotazioni('table-prenotazioni-passate', prenotazioniPassate.filter(match));
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

function fillTable(tbodyId, utenti) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.replaceChildren();
    if (!utenti.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nessun utente trovato</td></tr>`;
        return;
    }

    let utentiOrdinati = null;

    for (const u of utenti) {
        utentiOrdinati = u.registrato ? utenti : [...utenti].sort((a, b) => Number(b.numero_tessera) - Number(a.numero_tessera));
    }

    for (const u of utentiOrdinati) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(u.numero_tessera)}</td>
            <td class="semibold">${escapeHtml(u.cognome)} ${escapeHtml(u.nome)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(u.telefono ?? "—")}</td>
            <td>${escapeHtml(u.facolta_universitaria ?? "—")}</td>
            <td>${u.cauzione ? '<span class="badge badge-green">Sì</span>' : '<span class="badge badge-gray">No</span>'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-modifica-utente" title="Modifica">
                        <i data-lucide="pencil" class="lucide"></i>
                    </button>
                </div>
            </td>
        `;
        tr.querySelector('.btn-modifica-utente')
            ?.addEventListener('click', () => apriModificaUtente(u.id_utente));
        tbody.appendChild(tr);
    }
    window.lucide.createIcons();
}

// ─── Gestione tab (generalizzata per gruppo) ──────────────────────────────
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

function switchTab(tab, btnEl) {
    const info = TAB_GROUPS[tab];
    if (!info) return;

    info.group.forEach((t) => {
        const panelId = TAB_PANEL_IDS[t];
        document.getElementById(panelId)?.classList.toggle('active', t === tab);
    });

    const bar = btnEl?.closest('.tab-bar');
    if (bar) {
        bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
}

// ─── Nuovo utente ──────────────────────────────────────────────────────────
async function salvaNuovoUtente() {
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
        const msg = 'Compila tutti i campi obbligatori (*).';
        showToast('error', msg);
        return;
    }

    const nomeRegex = /^[a-zA-ZàèéìòùÀÈÉÌÒÙáéíóúÁÉÍÓÚ\s'-]+$/;
    if (!nomeRegex.test(nome)) { showToast('error', 'Il nome non può contenere numeri o caratteri speciali.'); return; }
    if (!nomeRegex.test(cognome)) { showToast('error', 'Il cognome non può contenere numeri o caratteri speciali.'); return; }
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        showToast('error', "Inserisci un email valida.");
        return;
    }

    const tesseraDuplicata = allUtenti.find(u => u.numero_tessera === tessera);
    if (tesseraDuplicata) {
        showToast('error', `Il numero tessera ${tessera} è già assegnato a ${tesseraDuplicata.cognome} ${tesseraDuplicata.nome}. `);
        return;
    }

    const emailDuplicata = allUtenti.find(u => u.email === email);
    if (emailDuplicata) {
        showToast('error', 'Email già assegnata a un altro utente');
        return;
    }

    const telefonoDuplicato = telefono && allUtenti.find(u => u.telefono === Number(telefono));
    if (telefonoDuplicato) {
        showToast('error', 'Telefono già assegnato a un altro utente');
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
        if (error) {
            showError("error", "errore nel salvataggio del nuovo utente");
            return;
        };
        // modal.closeEl(document.getElementById('nuovo-utente'));
        modal.closeAll();
        document.getElementById('nu-nome').value = '';
        document.getElementById('nu-cognome').value = '';
        document.getElementById('nu-email').value = '';
        document.getElementById('nu-tessera').value = '';
        document.getElementById('nu-telefono').value = '';
        document.getElementById('nu-facolta').value = '';
        document.getElementById('nu-cauzione').checked = false;
        document.getElementById('nu-trattamento').checked = false;
        await loadUtentiAdmin();
    } catch (e) {
        showError('nuovo-utente-error', e.message ?? 'Errore durante la creazione.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Modifica utente ───────────────────────────────────────────────────────
async function apriModificaUtente(id) {
    await loadUtentiAdmin();
    const u = allUtenti.find(x => x.id_utente === id);
    if (!u) return;
    document.getElementById('mu-id').value = u.id_utente;
    document.getElementById('mu-nome').value = u.nome;
    document.getElementById('mu-cognome').value = u.cognome;
    document.getElementById('mu-email').value = u.email ?? '';
    document.getElementById('mu-tessera').value = u.numero_tessera;
    document.getElementById('mu-telefono').value = u.telefono ?? '';
    document.getElementById('mu-facolta').value = u.facolta_universitaria ?? '';
    document.getElementById('mu-cauzione').checked = u.cauzione;
    document.getElementById('mu-trattamento').checked = u.trattamento_dati;
    document.getElementById('modifica-utente-subtitle').textContent = `${u.cognome} ${u.nome} — tessera n.${u.numero_tessera}`;
    showError('modifica-utente-error', '');
    modal.open('modifica-utente');
}

async function salvaModificaUtente() {
    showError('modifica-utente-error', '');
    const id = document.getElementById('mu-id').value;
    const email = document.getElementById('mu-email').value.trim();
    const tessera = parseInt(document.getElementById('mu-tessera').value);
    const telefono = document.getElementById('mu-telefono').value.trim();
    const facolta = document.getElementById('mu-facolta').value.trim();
    const cauzione = document.getElementById('mu-cauzione').checked;
    const trattamento = document.getElementById('mu-trattamento').checked;

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        showToast('error', "Inserisci un indirizzo mail valido");
        return;
    }
    if (!email) { showError('modifica-utente-error', 'L\'email è obbligatoria.'); return; }

    const tesseraDuplicata = allUtenti.find(u => u.numero_tessera === tessera && u.id_utente !== id);
    if (tesseraDuplicata) {
        showToast('error', `Il numero tessera ${tessera} è già assegnato a ${tesseraDuplicata.cognome} ${tesseraDuplicata.nome}. `);
        return;
    }

    const emailDuplicata = allUtenti.find(u => u.email === email && u.id_utente !== id);
    if (emailDuplicata) {
        showToast('error', 'Email già assegnata a un altro utente');
        return;
    }

    try {
        const { error } = await supabase.from('Utente').update({
            email: email,
            cauzione: cauzione,
            trattamento_dati: trattamento,
            numero_tessera: tessera,
            telefono: telefono ? parseInt(telefono) : null,
            facolta_universitaria: facolta || null,
        }).eq('id_utente', id);
        if (error) throw error;
        modal.closeEl(modal.getEl('modifica-utente'));
        showToast('success', 'Modifiche salvate con successo!');
        document.getElementById("search-utenti").value = '';
        await loadUtentiAdmin();
    } catch (e) {
        showError('modifica-utente-error', e.message ?? 'Errore durante il salvataggio.');
    }
}

function eliminaUtente() {
    const id = document.getElementById('mu-id').value;
    const info = document.getElementById('modifica-utente-subtitle').textContent;
    document.getElementById('conferma-elimina-text').textContent =
        `Sei sicuro di voler eliminare l'utente "${info}"? L'operazione non può essere annullata.`;
    pendingDeleteFn = async () => {
        await supabase.from('Utente').delete().eq('id_utente', id);
        modal.closeEl(modal.getEl('modifica-utente'));
        modal.closeEl(modal.getEl('conferma-elimina'));
        document.getElementById("search-utenti").value = '';
        await loadUtentiAdmin();
    };
    modal.open('conferma-elimina');
}

// ─── Turni ─────────────────────────────────────────────────────────────────
async function loadTurni() {
    try {
        turniCache = await getAllTurni(false);
    } catch (e) {
        console.error('loadTurni:', e);
        turniCache = [];
    }
    renderTurni();
    populatePaTurni();
}

async function cambiaStatoTurnoAdmin(id_turno, rendiAttivo) {
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

        await loadTurni();
        populatePaUtenti();
    } catch (err) {
        showToast('error', "Errore durante l'operazione: " + (err.message ?? err));
    }
}

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
        row.innerHTML = `
            <span class="turno-index">${t.indice ?? '-'}</span>
            <span class="turno-label">${(t.indice === null) ? 'Turno disattivato' : t.indice + '° Turno'}</span>
            <span class="turno-time">${fmtTime(t.orario_inizio)} – ${fmtTime(t.orario_fine)}</span>
            ${badgeStato}
            <div class="table-actions">
                <button class="btn-icon btn-modifica-turno" title="Modifica">
                    <i data-lucide="pencil" class="lucide"></i>
                </button>
                <button class="btn-icon btn-toggle-turno" title="${isAttivo ? 'Disattiva' : 'Riattiva'}">
                    <i data-lucide="${isAttivo ? 'power-off' : 'power'}" class="lucide"></i>
                </button>
            </div>
        `;
        row.querySelector('.btn-modifica-turno')
            ?.addEventListener('click', () => apriModificaTurno(t.id_turno));
        row.querySelector('.btn-toggle-turno')
            ?.addEventListener('click', () => cambiaStatoTurnoAdmin(t.id_turno, !isAttivo));
        list.appendChild(row);
    }
    window.lucide.createIcons();
}

function openNuovoTurno() {
    document.getElementById('nt-inizio').value = '';
    document.getElementById('nt-fine').value = '';
    document.getElementById('modal-nuovo-turno-title').textContent = 'Nuovo turno';
    modal.open('nuovo-turno');
}

function openNuovoUtente() {
    document.getElementById('nu-nome').value = '';
    document.getElementById('nu-cognome').value = '';
    document.getElementById('nu-email').value = '';
    document.getElementById('nu-tessera').value = '';
    document.getElementById('nu-telefono').value = '';
    document.getElementById('nu-facolta').value = '';
    document.getElementById('nu-cauzione').checked = false;
    document.getElementById('nu-trattamento').checked = false;
    modal.open('nuovo-utente');

}

function apriModificaTurno(id) {
    const t = turniCache.find(x => x.id_turno === id);
    if (!t) return;
    turnoInModificaId = t.id_turno;
    const mtIndiceEl = document.getElementById('mt-indice');
    if (mtIndiceEl) mtIndiceEl.value = t.indice ?? '';
    document.getElementById('mt-inizio').value = t.orario_inizio?.slice(0, 5) ?? '';
    document.getElementById('mt-fine').value = t.orario_fine?.slice(0, 5) ?? '';
    document.getElementById('modal-turno-title').textContent = `Turno ${t.indice}°`;
    const subtitleEl2 = document.getElementById('modal-turno-subtitle');
    if (subtitleEl2) subtitleEl2.textContent = `${fmtTime(t.orario_inizio)} – ${fmtTime(t.orario_fine)}`;

    showError('modifica-turno-error', '');
    modal.open('modifica-turno');
}

function turnoToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function turnoGiaConcluso(turno, nowMinuti) {
    if (!turno) return false;
    const inizioMin = turnoToMinutes(turno.orario_inizio);
    const fineMinRaw = turnoToMinutes(turno.orario_fine);
    const fineEffettiva = (!turno.orario_fine || fineMinRaw === 0 || fineMinRaw <= inizioMin) ? 24 * 60 : fineMinRaw;
    return nowMinuti >= fineEffettiva;
}

function getIntervalloTurno(inizio, fine) {
    const start = turnoToMinutes(inizio);
    const fineMin = turnoToMinutes(fine);
    const end = (!fine || fineMin === 0 || fineMin <= start) ? 24 * 60 : fineMin;
    return { start, end };
}

function intervalliSiSovrappongono(a, b) {
    return a.start < b.end && b.start < a.end;
}

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

async function salvaModificaTurno() {
    showError('modifica-turno-error', '');
    const id = turnoInModificaId;
    const inizio = document.getElementById('mt-inizio').value;
    const fine = document.getElementById('mt-fine').value;

    if (!id) { showError('modifica-turno-error', 'Nessun turno selezionato.'); return; }
    if (!inizio || !fine) { showError('modifica-turno-error', 'Orario inizio e fine obbligatori.'); return; }

    if (turnoToMinutes(fine) !== 0 && turnoToMinutes(fine) <= turnoToMinutes(inizio)) {
        showToast("error", 'L\'orario di fine deve essere successivo a quello di inizio');
        return;
    }

    const conflittoSovrapposizione = trovaTurnoSovrapposto(inizio, fine, id);
    if (conflittoSovrapposizione) {
        const msg = `Sovrapposizione con il turno ${conflittoSovrapposizione.indice}°(${fmtTime(conflittoSovrapposizione.orario_inizio)} – ${fmtTime(conflittoSovrapposizione.orario_fine)}). Disattivalo prima se vuoi usare questa fascia oraria.`;
        showToast("error", msg);
        return;
    }

    try {
        const { error } = await supabase.from('Turno').update({ orario_inizio: inizio, orario_fine: fine }).eq('id_turno', id);
        if (error) throw error;
        turnoInModificaId = null;
        modal.closeEl(modal.getEl('modifica-turno'));
        await loadTurni();
    } catch (e) {
        showError('modifica-turno-error', e.message ?? 'Errore.');
    }
}

async function salvaNuovoTurno() {
    showError('nuovo-turno-error', '');
    const inizio = document.getElementById('nt-inizio').value;
    const fine = document.getElementById('nt-fine').value;

    if (!inizio || !fine) { showError('nuovo-turno-error', 'Orario inizio e fine obbligatori.'); return; }

    if (turnoToMinutes(fine) !== 0 && turnoToMinutes(fine) <= turnoToMinutes(inizio)) {
        showToast("error", 'L\'orario di fine deve essere successivo a quello di inizio');
        return;
    }

    const conflittoDuplicato = trovaNuovoTurnoUguale(inizio, fine);
    if (conflittoDuplicato) {
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

    try {
        const { error } = await supabase.from('Turno').insert({ orario_inizio: inizio, orario_fine: fine });
        if (error) throw error;
        modal.closeEl(modal.getEl('nuovo-turno'));
        await loadTurni();
    } catch (e) {
        showError('nuovo-turno-error', e.message ?? 'Errore.');
    }
}

async function eliminaTurno() {
    const conferma = await confirmAction({
        title: `Eliminazione turno`,
        message: "ATTENZIONE: Eliminando definitivamente questo turno cancellerai anche TUTTE le prenotazioni passate e future collegate ad esso. Vuoi procedere?",
        confirmText: "Elimina",
    });
    if (!conferma) return;

    const id_turno = turnoInModificaId;
    if (!id_turno) {
        showToast("error", "Nessun turno selezionato per l'eliminazione.");
        return;
    }

    try {
        const { error } = await supabase.from('Turno').delete().eq('id_turno', id_turno);
        if (error) throw error;

        modal.closeEl(modal.getEl('modifica-turno'));
        await loadTurni();
        await loadStats();
        calendarRender?.invalidateBookingsCache?.();
        calendarRender?.render?.();

        showToast("success", "Turno e prenotazioni collegate eliminati definitivamente.");
    } catch (err) {
        console.error("Errore durante l'eliminazione del turno:", err);
        showToast("error", "Impossibile eliminare il turno: " + (err.message ?? err));
    }
}

// ─── Prenotazione privilegiata ─────────────────────────────────────────────
function apriNuovaPrenotazioneAdmin() {
    const utenteEl = document.getElementById('pa-utente');
    const dataEl = document.getElementById('pa-data');
    const turnoEl = document.getElementById('pa-turno');
    const statoEl = document.getElementById('pa-stato');
    const forzaEl = document.getElementById('pa-forza');

    if (utenteEl) utenteEl.value = '';
    if (dataEl) dataEl.value = '';
    if (turnoEl) {
        turnoEl.value = '';
        turnoEl.replaceChildren();
        turnoEl.appendChild(Object.assign(document.createElement('option'), {
            value: '', textContent: 'Seleziona prima una data', disabled: true, selected: true,
        }));
    }
    if (statoEl) statoEl.value = '';
    if (forzaEl) forzaEl.checked = false;

    showError("prenota-admin-error", "");

    const btn = document.getElementById("btn-conferma-prenota-admin");
    if (btn) btn.disabled = true;

    modal.open("prenota-admin");
}

function populatePaUtenti() {
    const sel = document.getElementById("pa-utente");
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(Object.assign(document.createElement("option"), {
        value: "", textContent: "Seleziona utente…", disabled: true, selected: true,
    }));
    for (const u of allUtenti) {
        sel.appendChild(Object.assign(document.createElement("option"), {
            value: u.id_utente, textContent: `${u.cognome} ${u.nome} — n.${u.numero_tessera}`,
        }));
    }
}

function populatePaTurni() {
    const sel = document.getElementById("pa-turno");
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(Object.assign(document.createElement("option"), {
        value: "", textContent: "Seleziona prima una data", disabled: true, selected: true,
    }));
}

function validatePrenotaAdmin() {
    const ok =
        document.getElementById("pa-utente")?.value &&
        document.getElementById("pa-data")?.value &&
        document.getElementById("pa-turno")?.value;
    const btn = document.getElementById("btn-conferma-prenota-admin");
    if (btn) btn.disabled = !ok;
}

async function confermaPrenotaAdmin() {
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
        } else {
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

        modal.closeEl(modal.getEl('prenota-admin'));
        calendarRender?.invalidateBookingsCache?.();
        calendarRender?.render?.();
        await loadStats();
    } catch (e) {
        //showError('prenota-admin-error', e.message ?? 'Errore.');
        showToast('error', e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Feedback ───────────────────────────────────────────────────────────────
let feedbackCache = [];

const STATO_PESO = {
    non_gestito: 0,
    in_lavorazione: 1,
    gestito: 2,
};

async function loadFeedback() {
    try {
        const { data, error } = await getAllFeedback();
        if (error) throw error;

        feedbackCache = (data ?? []).slice().sort((a, b) => {
            const pesoA = STATO_PESO[a.stato] ?? 1;
            const pesoB = STATO_PESO[b.stato] ?? 1;
            if (pesoA !== pesoB) return pesoA - pesoB;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        renderFeedbackTable();
    } catch (e) {
        console.error("loadFeedback:", e);
    }
}

function renderFeedbackTable() {
    const tbody = document.getElementById("table-feedback");
    if (!tbody) return;

    tbody.replaceChildren();

    if (!feedbackCache.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nessun feedback ricevuto</td></tr>';
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

        tr.style.cursor = "pointer";
        tr.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            apriGestisciFeedback(f.id_feedback);
        });
        tbody.appendChild(tr);
    }
    window.lucide.createIcons();
}

function troncaTesto(testo, max = 80) {
    if (!testo) return "—";
    return testo.length > max ? testo.slice(0, max) + "…" : testo;
}

function fmtDateTime(str) {
    if (!str) return "—";
    const d = new Date(str);
    return d.toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

function apriGestisciFeedback(id) {
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
    if (btnElimina) btnElimina.onclick = () => confermaEliminaFeedback(f.id_feedback);

    const btnSalvaStato = document.getElementById("btn-salva-stato-feedback");
    if (btnSalvaStato) btnSalvaStato.onclick = () => salvaStatoFeedback(f.id_feedback);

    modal.open("gestisci-feedback");
}

async function salvaStatoFeedback(id_feedback) {
    const statoSelect = document.getElementById("gf-stato");
    const nuovoStato = statoSelect?.value;
    if (!nuovoStato) return;

    const btn = document.getElementById("btn-salva-stato-feedback");
    if (btn) btn.disabled = true;

    try {
        const { error } = await updateStatoFeedback(id_feedback, nuovoStato);
        if (error) throw error;

        showToast("success", "Stato aggiornato", "check");
        modal.closeEl(modal.getEl("gestisci-feedback"));
        await loadFeedback();
    } catch (e) {
        console.error("salvaStatoFeedback:", e);
        showToast("error", "Impossibile aggiornare lo stato", "x");
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function confermaEliminaFeedback(id_feedback) {
    const confirmed = await confirmAction({
        title: "Conferma eliminazione",
        message: "Confermi di voler eliminare questo feedback? L'operazione non può essere annullata.",
        confirmText: "Elimina",
        danger: true,
    });
    if (!confirmed) return;

    try {
        const { error } = await deleteFeedback(id_feedback);
        if (error) throw error;

        modal.closeEl(modal.getEl("gestisci-feedback"));
        showToast("success", "Feedback eliminato", "check");
        await loadFeedback();
    } catch (e) {
        console.error("eliminaFeedback:", e);
        showToast("error", "Impossibile eliminare il feedback", "x");
    }
}

function fmtCategoriaBadge(categoria) {
    const map = {
        bug: '<span class="badge badge-red">Bug</span>',
        suggerimento: '<span class="badge badge-green">Suggerimento</span>',
        altro: '<span class="badge badge-gray">Altro</span>',
    };
    return map[categoria] ?? `<span class="badge badge-gray">${escapeHtml(categoria)}</span>`;
}

function fmtStatoBadge(stato) {
    const map = {
        non_gestito: '<span class="badge badge-red">Non gestito</span>',
        in_lavorazione: '<span class="badge badge-blue">In lavorazione</span>',
        gestito: '<span class="badge badge-gray">Gestito</span>',
    };
    return map[stato] ?? '<span class="badge badge-red">Non gestito</span>';
}

// ─── Impostazioni ───────────────────────────────────────────────────────────
async function loadImpostazioni() {
    await syncLimiteSettimanale();
    const limEl = document.getElementById("input-limite-settimanale");
    const btnSalvaLimite = document.getElementById("btn-salva-limite");
    if (limEl) {
        limEl.value = limiteSettimanale;
        limEl.dataset.initialValue = limiteSettimanale;
    }
    if (limEl && btnSalvaLimite && !limEl.dataset.listenersAttached) {
        limEl.addEventListener("input", () => {
            if (limEl.value !== limEl.dataset.initialValue) {
                btnSalvaLimite.classList.add("active");
                btnSalvaLimite.disabled = false;
            } else {
                btnSalvaLimite.classList.remove("active");
                btnSalvaLimite.disabled = true;
            }
        });
        limEl.addEventListener("blur", () => {
            if (limEl.value == "") {
                limEl.value = limEl.dataset.initialValue;
                btnSalvaLimite.classList.remove("active");
                btnSalvaLimite.disabled = true;
            }
        });

        limEl.dataset.listenersAttached = "true";
    }

    const antEl = document.getElementById("input-settimane-anticipo");
    const btnSalvaAnticipo = document.getElementById("btn-salva-anticipo");
    if (antEl) {
        let valoreAnticipo;
        try {
            const { data, error } = await getSettimaneAnticipo();
            valoreAnticipo = !error && data != null
                ? data
                : (calendarRender?.weeksBeforeNextMonthView ?? 1);
        } catch (e) {
            console.error("loadImpostazioni (anticipo):", e);
            valoreAnticipo = calendarRender?.weeksBeforeNextMonthView ?? 1;
        }
        antEl.value = valoreAnticipo;
        antEl.dataset.initialValue = valoreAnticipo;

        if (btnSalvaAnticipo && !antEl.dataset.listenersAttached) {
            antEl.addEventListener("input", () => {
                if (antEl.value !== antEl.dataset.initialValue) {
                    btnSalvaAnticipo.classList.add("active");
                    btnSalvaAnticipo.disabled = false;
                } else {
                    btnSalvaAnticipo.classList.remove("active");
                    btnSalvaAnticipo.disabled = true;
                }
            });
            antEl.addEventListener("blur", () => {
                if (antEl.value == "") {
                    antEl.value = antEl.dataset.initialValue;
                    btnSalvaAnticipo.classList.remove("active");
                    btnSalvaAnticipo.disabled = true;
                }
            });

            antEl.dataset.listenersAttached = "true";
        }
    }
}

async function syncLimiteSettimanale() {
    try {
        const { data, error } = await getLimiteSettimanale();
        if (!error && data != null) limiteSettimanale = data;
    } catch (e) {
        console.error("syncLimiteSettimanale:", e);
    }
}

async function salvaLimite() {
    const limEl = document.getElementById("input-limite-settimanale");
    const btnSalvaLimite = document.getElementById("btn-salva-limite");
    const v = parseInt(limEl.value);
    if (!v || v < 1) return;

    try {
        const { error } = await updateLimiteSettimanale(v);
        if (error) throw error;

        limiteSettimanale = v;
        setMaxWeeklyBookings?.(v);
        document.getElementById("stat-limite").textContent = v;
        showToast("success", `Limite aggiornato a ${v} prenotazioni/settimana.`, "check");

        limEl.value = v;
        limEl.dataset.initialValue = v;
    } catch (e) {
        console.error("salvaLimite:", e);
        showToast("error", "Impossibile salvare l'impostazione.", "x");
    }

    btnSalvaLimite.disabled = true;
    btnSalvaLimite.classList.remove("active");
}

async function salvaAnticipo() {
    const antEl = document.getElementById("input-settimane-anticipo");
    const btnSalvaAnticipo = document.getElementById("btn-salva-anticipo");
    let v = parseInt(antEl.value);
    if (!Number.isInteger(v)) {
        v = Math.trunc(v);
    }
    if (isNaN(v) || v < 0) {
        const msg = "Il numero di settimane prima di visualizzare il mese successivo non può essere negativo";
        showToast("error", msg);
        return;
    }

    try {
        const { error } = await updateSettimaneAnticipo(v);
        if (error) throw error;

        if (calendarRender) {
            calendarRender.weeksBeforeNextMonthView = v;
            calendarRender.render?.();
        }
        showToast("success", `Anticipo aggiornato a ${v} settimane.`, "check");

        antEl.value = v;
        antEl.dataset.initialValue = v;
    } catch (e) {
        console.error("salvaAnticipo:", e);
        showToast("error", "Impossibile salvare l'impostazione.", "x");
    }

    if (btnSalvaAnticipo) {
        btnSalvaAnticipo.disabled = true;
        btnSalvaAnticipo.classList.remove("active");
    }
}

// ─── Collegamento eventi (sostituisce gli onclick/oninput inline) ─────────
function initEventListeners() {
    // Nav principale (i bottoni hanno già id btn-nav-<sezione> nell'HTML)
    ['utenti', 'turni', 'prenotazioni', 'stats', 'feedback', 'impostazioni'].forEach((id) => {
        document.getElementById(`btn-nav-${id}`)?.addEventListener('click', () => showSection(id));
    });

    document.getElementById('btn-refresh-stats')?.addEventListener('click', () => loadStats());
    document.getElementById('search-utenti')?.addEventListener('input', (e) => renderUtenti(e.target.value));
    document.getElementById('btn-nuovo-utente')?.addEventListener('click', () => openNuovoUtente());

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchTab(tab, btn);
        });
    });

    document.getElementById('btn-prenota-admin')?.addEventListener('click', () => apriNuovaPrenotazioneAdmin());
    document.getElementById('search-prenotazioni')?.addEventListener('input', (e) => renderPrenotazioni(e.target.value));
    document.getElementById('btn-refresh-feedback')?.addEventListener('click', () => loadFeedback());

    document.getElementById('btn-salva-limite')?.addEventListener('click', () => salvaLimite());
    document.getElementById('btn-salva-anticipo')?.addEventListener('click', () => salvaAnticipo());

    // Bottoni "Annulla/Chiudi" generici: <button data-close-modal="nuovo-utente">
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const el = modal.getEl(btn.dataset.closeModal);
            if (el) modal.closeEl(el);
        });
    });

    document.getElementById('btn-salva-nuovo-utente')?.addEventListener('click', () => salvaNuovoUtente());
    document.getElementById('btn-elimina-utente')?.addEventListener('click', () => eliminaUtente());
    document.getElementById('btn-salva-modifica-utente')?.addEventListener('click', () => salvaModificaUtente());

    document.getElementById('btn-nuovo-turno')?.addEventListener('click', () => openNuovoTurno());
    document.getElementById('btn-salva-modifica-turno')?.addEventListener('click', () => salvaModificaTurno());
    document.getElementById('btn-elimina-turno-modal')?.addEventListener('click', () => eliminaTurno());
    document.getElementById('btn-salva-nuovo-turno-modal')?.addEventListener('click', () => salvaNuovoTurno());

    document.getElementById('btn-conferma-prenota-admin')?.addEventListener('click', () => confermaPrenotaAdmin());

    const btnEliminaOk = document.getElementById("btn-conferma-elimina-ok");
    if (btnEliminaOk) {
        btnEliminaOk.onclick = () => {
            pendingDeleteFn?.();
            pendingDeleteFn = null;
        };
    }

    ['pa-data', 'pa-forza'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', async () => {
            const data = document.getElementById('pa-data').value;
            const sel = document.getElementById('pa-turno');
            if (!sel) return;

            if (!data) {
                populatePaTurni();
                sel.disabled = false;
                validatePrenotaAdmin();
                return;
            }

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
                if (occ && !document.getElementById('pa-forza').checked) opt.disabled = true;
                sel.appendChild(opt);
            }
            sel.disabled = false;
            validatePrenotaAdmin();
        });
    });

    ["pa-utente", "pa-turno", "pa-data"].forEach((id) => {
        document.getElementById(id)?.addEventListener("change", () => validatePrenotaAdmin());
    });
}

// ─── Inizializzazione ────────────────────────────────────────────────────
initEventListeners();

document.addEventListener("DOMContentLoaded", async () => {
    const isAllowed = await guardAdminAccess();
    if (!isAllowed) return;

    document.body.classList.add("admin-access-checked");
    document.getElementById('btn-nav-utenti')?.classList.add('active');

    await syncLimiteSettimanale();
    await loadStats();
    await loadUtentiAdmin();
    await loadTurni();

    populatePaUtenti();

    if (calendarRender) {
        calendarRender.getNavigableMonthOffsets = () => ({ min: -12, max: 12 });
        calendarRender.canViewNextMonth = () => true;
    }

    const user = profiloUtente;
    if (user) {
        const infoEl = document.getElementById("dash-admin-info");
        if (infoEl) infoEl.textContent = `Connesso come ${user.nome} ${user.cognome}`;
    }
});
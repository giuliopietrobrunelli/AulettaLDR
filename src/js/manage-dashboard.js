import {
    getAllUtenti,
    getAllUtentiRegistrati,
    getAllTurni,
    getPrenotazioniByDateRange,
    createPrenotazione,
    getProfiloUtente,
    isAmministratore,
} from './db.js';

import {
    supabase
} from './supabase-client.js';

import { setMainView } from './main-view.js';

// ─── 1. ESPOSIZIONE DI SICUREZZA ──────────────────────────────
window.ldrDb = {
    getAllUtenti,
    getAllUtentiRegistrati,
    getAllTurni,
    getPrenotazioniByDateRange,
    createPrenotazione
};

// ─── Controllo accesso amministratore ───────────────────────────────────────────
// blocca l'accesso diretto via url a chi non è amministratore
async function guardAdminAccess() {
    
    const { data: profilo, error: profiloError} = await getProfiloUtente();

    // se il profilo non è disponibile, lascio che auth.js gestisca il redirect al login
    if(profiloError || !profilo?.id_utente){
        window.location.href = '/login.html';
        return false;
    } 

    const { data: isAdmin, error} = await isAmministratore(profilo.id_utente);

    if (error || !isAdmin){
        window.location.href = '/index.html'
        return false;
    }

    return true;
    
}

// ─── Stato locale ───────────────────────────────────────────
let allUtenti    = [];
let turniCache   = [];
let limiteSettimanale = 7;
let pendingDeleteFn = null;

// ─── Helpers UI ─────────────────────────────────────────────
window.openModal  = (id) => {
    if (window.modal?.open) { window.modal.open(id); return; }
    document.getElementById(`modal-${id}`)?.classList.add('showing');
};

window.closeModal = (id) => {
    if (window.modal?.close) { window.modal.close(id); return; }
    document.getElementById(`modal-${id}`)?.classList.remove('showing');
};

function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str.split('T')[0]);
    return d.toLocaleDateString('it-IT');
}

function fmtTime(t) { return t?.slice(0, 5) ?? '—'; }

// ─── Gestione Viste Estesa con main-view.js ──────────────────
window.showSection = (id) => {
    if (id === 'calendario')   setMainView('calendar');
    if (id === 'prenotazioni') setMainView('bookings');
    if (id === 'account')      setMainView('account');

    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${id}`)?.classList.add('active');
    
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-nav-${id}`)?.classList.add('active');

    if (id === 'stats')        window.loadStats();
    if (id === 'utenti')       window.loadUtenti();
    if (id === 'turni')        window.loadTurni();
    if (id === 'calendario')   window.calendarRender?.render?.();
    if (id === 'impostazioni') loadImpostazioni();
};

// ─── Statistiche (Corretto controllo di sicurezza) ──────────
window.loadStats = async () => {
    try {
        const ora = new Date();
        const meseStart = new Date(ora.getFullYear(), ora.getMonth(), 1).toISOString().split('T')[0];
        const meseEnd   = new Date(ora.getFullYear(), ora.getMonth() + 1, 0).toISOString().split('T')[0];
        const oggi      = ora.toISOString().split('T')[0];

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

        const tutti      = resUtenti?.data ?? [];
        const reg        = tutti.filter(u => u.registrato);
        const pMese      = resMese?.data ?? [];
        const pOggi      = resOggi?.data ?? [];
        const confermate = pMese.filter(p => p.stato === 'confermata' || p.data_conferma);
        const tasso      = pMese.length ? Math.round(confermate.length / pMese.length * 100) : 0;

        document.getElementById('stat-registrati').textContent   = reg.length;
        document.getElementById('stat-totali').textContent       = tutti.length;
        document.getElementById('stat-prenot-mese').textContent  = pMese.length;
        document.getElementById('stat-prenot-oggi').textContent  = pOggi.length;
        document.getElementById('stat-tasso').textContent        = `${tasso}%`;
        document.getElementById('stat-limite').textContent       = limiteSettimanale;

        const label = ora.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const labelEl = document.getElementById('stat-prenot-mese-label');
        if (labelEl) labelEl.textContent = label;

        // Caricamento Ultime 10 prenotazioni
        const { data: ultime, error: errUltime } = await supabase
            .from('Prenotazione')
            .select('*, Utente(nome,cognome), Turno(indice,orario_inizio,orario_fine)')
            .order('data_creazione_prenotazione', { ascending: false })
            .limit(10);

        if (errUltime) throw errUltime;

        const tbody = document.getElementById('table-ultime-prenot');
        if (tbody) {
            tbody.replaceChildren();
            if (!ultime?.length) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nessuna prenotazione recente</td></tr>';
            } else {
                for (const p of ultime) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${p.Utente?.cognome ?? ''} ${p.Utente?.nome ?? ''}</td>
                        <td>${fmtDate(p.data_prenotazione)}</td>
                        <td>${p.Turno?.indice ?? '?'}°</td>
                        <td>${p.stato === 'confermata' || p.data_conferma ? '<span class="badge badge-green">Confermata</span>' : '<span class="badge badge-gray">Non confermata</span>'}</td>
                        <td>${fmtDate(p.data_creazione_prenotazione)}</td>
                    `;
                    tbody.appendChild(tr);
                }
            }
        }
    } catch (e) {
        console.error('loadStats:', e);
    }
};

// ─── Utenti ─────────────────────────────────────────────────
window.loadUtenti = async () => {
    try {
        const { data } = (typeof window.ldrDb?.getAllUtenti === 'function')
            ? await window.ldrDb.getAllUtenti()
            : await supabase.from('Utente').select('*').order('cognome');
        allUtenti = data ?? [];
        window.renderUtenti();
    } catch (e) { console.error('loadUtenti:', e); }
};

window.renderUtenti = (filter = '') => {
    const q = filter.toLowerCase();
    const filtered = allUtenti.filter(u =>
        !q || `${u.nome} ${u.cognome} ${u.email} ${u.numero_tessera}`.toLowerCase().includes(q)
    );
    const reg    = filtered.filter(u => u.registrato);
    const nonReg = filtered.filter(u => !u.registrato);
    fillTable('table-registrati',     reg,    true);
    fillTable('table-non-registrati', nonReg, false);
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.numero_tessera}</td>
            <td class="semibold">${u.cognome} ${u.nome}</td>
            <td>${u.email}</td>
            <td>${u.telefono ?? '—'}</td>
            <td>${u.facolta_universitaria ?? '—'}</td>
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
    window.renderUtenti(document.getElementById('search-utenti').value);
};

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', (i === 0 && tab === 'registrati') || (i === 1 && tab === 'non-registrati'));
    });
    document.getElementById('tab-registrati')?.classList.toggle('active', tab === 'registrati');
    document.getElementById('tab-non-registrati')?.classList.toggle('active', tab === 'non-registrati');
};

// ─── Nuovo utente ───────────────────────────────────────────
window.salvaNuovoUtente = async () => {
    showError('nuovo-utente-error', '');
    const nome      = document.getElementById('nu-nome').value.trim();
    const cognome   = document.getElementById('nu-cognome').value.trim();
    const email     = document.getElementById('nu-email').value.trim();
    const tessera   = parseInt(document.getElementById('nu-tessera').value);
    const telefono  = document.getElementById('nu-telefono').value.trim() || null;
    const facolta   = document.getElementById('nu-facolta').value.trim() || null;
    const cauzione  = document.getElementById('nu-cauzione').checked;
    const tratt     = document.getElementById('nu-trattamento').checked;

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
    document.getElementById('mu-id').value          = u.id_utente;
    document.getElementById('mu-email').value       = u.email ?? '';
    document.getElementById('mu-telefono').value    = u.telefono ?? '';
    document.getElementById('mu-facolta').value     = u.facolta_universitaria ?? '';
    document.getElementById('mu-cauzione').checked  = !!u.cauzione;
    document.getElementById('mu-registrato').checked = !!u.registrato;
    document.getElementById('modifica-utente-subtitle').textContent = `${u.cognome} ${u.nome} — tessera n.${u.numero_tessera}`;
    showError('modifica-utente-error', '');
    window.openModal('modifica-utente');
};

window.salvaModificaUtente = async () => {
    showError('modifica-utente-error', '');
    const id        = document.getElementById('mu-id').value;
    const email     = document.getElementById('mu-email').value.trim();
    const telefono  = document.getElementById('mu-telefono').value.trim();
    const facolta   = document.getElementById('mu-facolta').value.trim();
    const cauzione  = document.getElementById('mu-cauzione').checked;
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
    const id   = document.getElementById('mu-id').value;
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

const btnEliminaOk = document.getElementById('btn-conferma-elimina-ok');
if (btnEliminaOk) {
    btnEliminaOk.onclick = () => {
        pendingDeleteFn?.();
        pendingDeleteFn = null;
    };
}

// ─── Turni ──────────────────────────────────────────────────
window.loadTurni = async () => {
    try {
        const { data } = (typeof window.ldrDb?.getAllTurni === 'function')
            ? await window.ldrDb.getAllTurni()
            : await supabase.from('Turno').select('*').order('indice');
        turniCache = data ?? [];
        renderTurni();
        window.populatePaTurni();
    } catch (e) { console.error('loadTurni:', e); }
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
        const row = document.createElement('div');
        row.className = 'turno-row';
        row.innerHTML = `
            <span class="turno-index">${t.indice ?? '?'}</span>
            <span class="turno-label">${t.indice}° Turno</span>
            <span class="turno-time">${fmtTime(t.orario_inizio)} – ${t.indice === 7 ? 'in poi' : fmtTime(t.orario_fine)}</span>
            <div class="table-actions">
                <button class="btn-icon" title="Modifica" onclick="apriModificaTurno('${t.id_turno}')">
                    <i data-lucide="pencil" class="lucide"></i>
                </button>
            </div>
        `;
        list.appendChild(row);
    }
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

window.openNuovoTurno = () => {
    document.getElementById('mt-id').value      = '';
    document.getElementById('mt-indice').value  = '';
    document.getElementById('mt-inizio').value  = '';
    document.getElementById('mt-fine').value    = '';
    document.getElementById('modal-turno-title').textContent    = 'Nuovo turno';
    document.getElementById('modal-turno-subtitle').textContent = 'Aggiungi una nuova fascia oraria';
    document.getElementById('btn-elimina-turno').style.display  = 'none';
    showError('modifica-turno-error', '');
    window.openModal('modifica-turno');
};

window.apriModificaTurno = (id) => {
    const t = turniCache.find(x => x.id_turno === id);
    if (!t) return;
    document.getElementById('mt-id').value      = t.id_turno;
    document.getElementById('mt-indice').value  = t.indice ?? '';
    document.getElementById('mt-inizio').value  = t.orario_inizio?.slice(0,5) ?? '';
    document.getElementById('mt-fine').value    = t.orario_fine?.slice(0,5) ?? '';
    document.getElementById('modal-turno-title').textContent    = `Turno ${t.indice}°`;
    document.getElementById('modal-turno-subtitle').textContent = `${fmtTime(t.orario_inizio)} – ${fmtTime(t.orario_fine)}`;
    document.getElementById('btn-elimina-turno').style.display  = '';
    showError('modifica-turno-error', '');
    window.openModal('modifica-turno');
};

window.salvaModificaTurno = async () => {
    showError('modifica-turno-error', '');
    const id     = document.getElementById('mt-id').value;
    const indice = parseInt(document.getElementById('mt-indice').value);
    const inizio = document.getElementById('mt-inizio').value;
    const fine   = document.getElementById('mt-fine').value;

    if (!inizio || !fine) { showError('modifica-turno-error', 'Orario inizio e fine obbligatori.'); return; }

    try {
        if (id) {
            const { error } = await supabase.from('Turno').update({ indice, orario_inizio: inizio, orario_fine: fine }).eq('id_turno', id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('Turno').insert({ indice, orario_inizio: inizio, orario_fine: fine });
            if (error) throw error;
        }
        window.closeModal('modifica-turno');
        await window.loadTurni();
    } catch (e) {
        showError('modifica-turno-error', e.message ?? 'Errore.');
    }
};

window.eliminaTurno = () => {
    const id = document.getElementById('mt-id').value;
    const label = document.getElementById('modal-turno-title').textContent;
    document.getElementById('conferma-elimina-text').textContent =
        `Sei sicuro di voler eliminare "${label}"? Le prenotazioni esistenti non verranno cancellate.`;
    pendingDeleteFn = async () => {
        await supabase.from('Turno').delete().eq('id_turno', id);
        window.closeModal('modifica-turno');
        window.closeModal('conferma-elimina');
        await window.loadTurni();
    };
    window.openModal('conferma-elimina');
};

// ─── Prenotazione privilegiata ───────────────────────────────
window.apriNuovaPrenotazioneAdmin = () => {
    // 1. Svuota e resetta tutti i campi di input del form
    const utenteEl = document.getElementById('pa-utente');
    const dataEl   = document.getElementById('pa-data');
    const turnoEl  = document.getElementById('pa-turno');
    const statoEl  = document.getElementById('pa-stato');
    const forzaEl  = document.getElementById('pa-forza');

    if (utenteEl) utenteEl.value = ''; // Torna a "Seleziona utente..."
    if (dataEl)   dataEl.value = '';   // Svuota la data
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
    if (statoEl)  statoEl.value = 'confermata'; // Ripristina lo stato di default
    if (forzaEl)  forzaEl.checked = false;      // Disattiva la checkbox "Forza"

    // 2. Nascondi eventuali messaggi di errore rimasti appesi
    showError('prenota-admin-error', '');

    // 3. Disabilita nuovamente il bottone di conferma (perché il form ora è vuoto)
    const btn = document.getElementById('btn-conferma-prenota-admin');
    if (btn) btn.disabled = true;

    // 4. Infine, apri il modal in sicurezza
    window.openModal('prenota-admin');
};

window.populatePaUtenti = () => {
    const sel = document.getElementById('pa-utente');
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: 'Seleziona utente…', disabled: true, selected: true }));
    for (const u of allUtenti.filter(u => u.registrato)) {
        sel.appendChild(Object.assign(document.createElement('option'), {
            value: u.id_utente,
            textContent: `${u.cognome} ${u.nome} — n.${u.numero_tessera}`,
        }));
    }
};

window.populatePaTurni = () => {
    const sel = document.getElementById('pa-turno');
    if (!sel) return;
    sel.replaceChildren();
    sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: 'Seleziona prima una data', disabled: true, selected: true }));
};

document.getElementById('pa-data')?.addEventListener('change', async () => {
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
        if (occ && !document.getElementById('pa-forza').checked) opt.disabled = true;
        sel.appendChild(opt);
    }
    sel.disabled = false;
    window.validatePrenotaAdmin();
});

['pa-utente', 'pa-turno', 'pa-data'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => window.validatePrenotaAdmin());
});

window.validatePrenotaAdmin = () => {
    const ok = document.getElementById('pa-utente')?.value
        && document.getElementById('pa-data')?.value
        && document.getElementById('pa-turno')?.value;
    const btn = document.getElementById('btn-conferma-prenota-admin');
    if (btn) btn.disabled = !ok;
};

window.confermaPrenotaAdmin = async () => {
    showError('prenota-admin-error', '');
    const id_utente         = document.getElementById('pa-utente').value;
    const data_prenotazione = document.getElementById('pa-data').value;
    const id_turno          = document.getElementById('pa-turno').value;
    const stato             = document.getElementById('pa-stato').value;
    const btn               = document.getElementById('btn-conferma-prenota-admin');
    if (btn) btn.disabled = true;
    try {
        const { error } = await supabase.from('Prenotazione').insert({
            id_utente, id_turno, data_prenotazione, stato,
        });
        if (error) throw error;
        window.closeModal('prenota-admin');
        window.calendarRender?.invalidateBookingsCache?.();
        window.calendarRender?.render?.();
    } catch (e) {
        showError('prenota-admin-error', e.message ?? 'Errore.');
    } finally {
        if (btn) btn.disabled = false;
    }
};



// ─── Impostazioni ───────────────────────────────────────────
function loadImpostazioni() {
    const limEl = document.getElementById('input-limite-settimanale');
    if (limEl) limEl.value = limiteSettimanale;
    const antEl = document.getElementById('input-settimane-anticipo');
    if (antEl) antEl.value = window.calendarRender?.weeksBeforeNextMonthView ?? 1;
}

window.salvaLimite = () => {
    const v = parseInt(document.getElementById('input-limite-settimanale').value);
    if (!v || v < 1) return;
    limiteSettimanale = v;
    if (window.ldrBookingConfig) window.ldrBookingConfig.MAX_WEEKLY_BOOKINGS = v;
    document.getElementById('stat-limite').textContent = v;
    alert(`Limite aggiornato a ${v} prenotazioni/settimana.`);
};

window.salvaAnticipo = () => {
    const v = parseInt(document.getElementById('input-settimane-anticipo').value);
    if (v === undefined || v < 0) return;
    if (window.calendarRender) {
        window.calendarRender.weeksBeforeNextMonthView = v;
        window.calendarRender.render?.();
    }
};

// ─── Inizializzazione ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const isAllowed = await guardAdminAccess();
    if (!isAllowed) return;

    document.body.classList.add('admin-access-checked');

    document.getElementById('btn-nav-utenti')?.classList.add('active');
    
    await window.loadStats();
    await window.loadUtenti();
    await window.loadTurni();

    window.populatePaUtenti();

    if (window.calendarRender) {
        window.calendarRender.getNavigableMonthOffsets = function() {
            return { min: -12, max: 12 };
        };
        window.calendarRender.canViewNextMonth = () => true;
    }

    const user = window.ldrProfilo;
    if (user) {
        const infoEl = document.getElementById('dash-admin-info');
        if (infoEl) infoEl.textContent = `Connesso come ${user.nome} ${user.cognome}`;
    }
});

document.querySelector('[onclick="openModal(\'nuovo-turno\')"]')
    ?.addEventListener('click', (e) => {
        e.preventDefault();
        window.openNuovoTurno?.();
    });
import { openModificaModal } from "./bookings-view.js"

// array dei nomi dei mesi in italiano
const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

// array dei giorni abbreviati in italiano
const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

// array dei giorni per esteso in italiano
const WEEKDAYS_FULL = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
];

// oggetto principale che gestisce il calendario
const calendarRender = {
  // modalità di visualizzazione del calendario: 'month', 'week', 'day'
  viewMode: "month",
  // modalità precedente (utile per tornare indietro dalla vista giorno)
  previousViewMode: null,
  // offset dei mesi rispetto a quello corrente (0 = mese attuale)
  monthViewOffset: 0,
  // data di inizio della settimana selezionata
  weekViewStart: null,
  // data attiva nella vista giorno
  dayViewDate: null,
  // settimane che devono passare prima di poter vedere il mese successivo
  weeksBeforeNextMonthView: 1,
  // array degli slot selezionati
  selectedSlots: [],
  // mappa delle prenotazioni per slot (key = giorno.turno)
  bookingsBySlot: new Map(),
  // cache delle prenotazioni per range
  bookingsRangeCache: new Map(),
  // generazione di rendering, per gestire eventuale asincronia
  renderGeneration: 0,
  // immagine di profilo di default usata quando non ci sono altre foto
  stockProfilePic: "/src/img/default-profile-picture.webp",
  // array dei turni disponibili, caricati dal db
  turns: [],

  // inizializza gli elementi e gli eventi del calendario
  init() {
    // imposta la data di oggi alle 00:00
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);
    // calcola la settimana corrente e il giorno attivo
    this.weekViewStart = this.clampWeekStart(this.getWeekStart(this.today));
    this.dayViewDate = new Date(this.today);

    // riferimenti agli elementi principali del dom
    // Wrapper per animare il cambio del titolo
    this.titleEl = document.getElementById("current-date");
    this.monthContainer = document.getElementById("calendar-container");
    this.weekContainer = document.getElementById("week-calendar-container");
    this.dayContainer = document.getElementById("day-calendar-container");
    this.monthToolbar = document.querySelector('[data-view="month"]');
    this.weekToolbar = document.querySelector('[data-view="week"]');
    this.dayToolbar = document.querySelector('[data-view="day"]');
    this.backToBar = document.getElementById("back-to-bar");

    // bottoni di navigazione e conferma/cancellazione prenotazione
    this.btnMonthPrev = document.getElementById("calendar-prev");
    this.btnMonthNext = document.getElementById("calendar-next");
    this.btnMonthToday = document.getElementById("month-today");
    this.btnWeekPrev = document.getElementById("week-prev");
    this.btnWeekNext = document.getElementById("week-next");
    this.btnWeekToday = document.getElementById("week-today");
    this.btnDayBack = document.getElementById("day-back");
    this.btnDayPrev = document.getElementById("day-prev");
    this.btnDayNext = document.getElementById("day-next");
    this.btnDayToday = document.getElementById("day-today");
    this.bookingBar = document.getElementById("booking-bar");
    this.btnBookingConfirm = document.getElementById("booking-confirm");
    this.btnBookingCancel = document.getElementById("booking-cancel");

    // eventi per i bottoni di navigazione
    this.btnMonthPrev?.addEventListener("click", () => this.goMonthPrev());
    this.btnMonthNext?.addEventListener("click", () => this.goMonthNext());
    this.btnMonthToday?.addEventListener("click", () => this.goMonthToday());
    this.btnWeekPrev?.addEventListener("click", () => this.goWeekPrev());
    this.btnWeekNext?.addEventListener("click", () => this.goWeekNext());
    this.btnWeekToday?.addEventListener("click", () => this.goWeekToday());
    this.btnDayBack?.addEventListener("click", () => this.goDayBack());
    this.btnDayPrev?.addEventListener("click", () => this.goDayPrev());
    this.btnDayNext?.addEventListener("click", () => this.goDayNext());
    this.btnDayToday?.addEventListener("click", () => this.goDayToday());
    this.btnBookingCancel?.addEventListener("click", () => this.clearSelection());
    this.btnBookingConfirm?.addEventListener("click", () => this.confirmBooking());

    // cambio modalità tra mese e settimana
    document.querySelectorAll("[data-calendar-switch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.calendarSwitch;
        if (mode === "month" || mode === "week") this.setViewMode(mode);
      });
    });

    // click su giorno nel calendario mese
    this.monthContainer?.addEventListener("click", (e) => {
      const day = e.target.closest(".calendar-day:not(.inactive)");
      if (!day?.dataset.date) return;
      this.openDayView(this.parseDateISO(day.dataset.date));
    });

    // click su turno nella vista settimana
    this.weekContainer?.addEventListener("click", (e) => {
      const header = e.target.closest("#week-calendar-columns h3[data-date]");
      if (header?.dataset.date) {
        this.openDayView(this.parseDateISO(header.dataset.date));
        return;
      }
      const turn = e.target.closest('.turn[data-status="available"], .turn[data-status="auto-confirm"]');
      if (turn) this.selectSlot(turn);
    });

    // click su turno nella vista giorno
    this.dayContainer?.addEventListener("click", (e) => {
      const header = e.target.closest("#day-calendar-columns h3[data-date]");
      if (header?.dataset.date) {
        this.setDayViewDate(this.parseDateISO(header.dataset.date));
        return;
      }

      const ownTurn = e.target.closest('.day-turn[data-status="own"]');
      if (ownTurn) {
        const day    = ownTurn.dataset.day;
        const turnId = ownTurn.dataset.turn;
        const booking = this.getSlotBooking(day, turnId);
        openModificaModal(booking);
        return;
      }

      const turn = e.target.closest('.day-turn[data-status="available"], .day-turn[data-status="auto-confirm"]');
      if (turn) this.selectSlot(turn);
    });

    // carica i turni dal db prima del primo render
    this.loadTurni().then(() => this.setViewMode(this.viewMode));
  },

  // carica tutti i turni disponibili dal database
  async loadTurni() {
    const { getAllTurni } = window.ldrDb ?? {};
    if (!getAllTurni) {
      console.error("calendarRender: window.ldrDb.getAllTurni non disponibile");
      return;
    }
    const { data, error } = await getAllTurni();
    if (error || !data?.length) {
      console.error("calendarRender: impossibile caricare i turni dal db", error);
      return;
    }
    // trasforma i turni dal db in array di oggetti con id e label
    this.turns = data.map((t) => ({
      id: String(t.indice),
      label: this.formatTurnLabel(t),
      orario_inizio: t.orario_inizio,
      orario_fine: t.orario_fine,
    }));
  },

  // restituisce l'orario in formato hh:mm
  formatClock(timeStr) {
    return timeStr?.slice(0, 5) ?? '';
  },

  // formatta l'etichetta del turno (es: '08:30 - 10:30' o '19:30 in poi')
  formatTurnLabel(turn) {
    if (!turn) return '';
    if (turn.indice === 7) return `${this.formatClock(turn.orario_inizio)} in poi`;
    return `${this.formatClock(turn.orario_inizio)} - ${this.formatClock(turn.orario_fine)}`;
  },

  // cambia la modalità di visualizzazione (mese, settimana, giorno)
  setViewMode(mode) {
    if (mode !== this.viewMode) this.clearSelection();
    this.viewMode = mode;
    const isMonth = mode === "month";
    const isWeek = mode === "week";
    const isDay = mode === "day";

    this.monthContainer?.classList.toggle("hidden", !isMonth);
    this.weekContainer?.classList.toggle("hidden", !isWeek);
    this.dayContainer?.classList.toggle("hidden", !isDay);
    this.monthToolbar?.classList.toggle("hidden", !isMonth);
    this.weekToolbar?.classList.toggle("hidden", !isWeek);
    this.dayToolbar?.classList.toggle("hidden", !isDay);
    this.btnDayBack?.classList.toggle("hidden", !isDay);
    this.backToBar?.classList.toggle("is-visible", isDay);

    // imposta la settimana di partenza in modalità settimana
    if (isWeek) {
      const anchor =
        this.monthViewOffset === 0 ? this.today : this.getMonthViewDate();
      this.weekViewStart = this.clampWeekStart(this.getWeekStart(anchor));
    }
    // imposta la data attiva in modalità giorno
    if (isDay && !this.dayViewDate) {
      this.dayViewDate = new Date(this.today);
    }

    this.render();
  },

  // decide quale vista rendere in base alla modalità corrente
  render() {
    if (this.viewMode === "month") return this.renderMonth();
    if (this.viewMode === "week") return this.renderWeek();
    return this.renderDay();
  },

  // apre la vista giorno per una certa data
  openDayView(date) {
    if (this.viewMode !== "day") {
      this.previousViewMode = this.viewMode;
    }
    this.dayViewDate = this.clampDayDate(date);
    this.setViewMode("day");
  },

  // cambia il giorno attivo nella vista giorno
  setDayViewDate(date) {
    this.dayViewDate = this.clampDayDate(date);
    this.renderDay();
  },

  // torna alla modalità precedente dalla vista giorno
  goDayBack() {
    const target = this.previousViewMode || "month";
    this.previousViewMode = null;
    this.setViewMode(target);
  },

  // limita una data (giorno) all’intervallo navigabile
  clampDayDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const { rangeStart, rangeEnd } = this.getNavigableRange();
    const t = d.getTime();
    if (t < rangeStart.getTime()) return new Date(rangeStart);
    if (t > rangeEnd.getTime()) return new Date(rangeEnd);
    return d;
  },

  // sposta di N giorni la data attiva (vista giorno)
  shiftDay(days) {
    const next = new Date(this.dayViewDate);
    next.setDate(next.getDate() + days);
    this.setDayViewDate(next);
  },

  // va al giorno precedente nella vista giorno
  goDayPrev() {
    this.shiftDay(-1);
  },

  // va al giorno successivo nella vista giorno
  goDayNext() {
    this.shiftDay(1);
  },

  // torna al giorno di oggi nella vista giorno
  goDayToday() {
    this.setDayViewDate(this.today);
  },

  // aggiorna stato dei bottoni (disabilita se fuori range)
  syncDayNavButtons() {
    const cur = this.dayViewDate.getTime();
    const { rangeStart, rangeEnd } = this.getNavigableRange();

    if (this.btnDayPrev) {
      this.btnDayPrev.disabled = cur <= rangeStart.getTime();
    }
    if (this.btnDayNext) {
      this.btnDayNext.disabled = cur >= rangeEnd.getTime();
    }
  },

  // ─── navigazione mensile ────────────────────────────────────────────

  // restituisce la data del primo giorno del mese visualizzato
  getMonthViewDate() {
    return new Date(
      this.today.getFullYear(),
      this.today.getMonth() + this.monthViewOffset,
      1,
    );
  },

  // determina se è possibile vedere il mese prossimo
  canViewNextMonth() {
    const nextMonthStart = new Date(
      this.today.getFullYear(),
      this.today.getMonth() + 1,
      1,
    );
    const threshold = new Date(nextMonthStart);
    threshold.setDate(threshold.getDate() - this.weeksBeforeNextMonthView * 7);
    return this.today >= threshold;
  },

  // ritorna i valori min e max di offset mese navigabili
  getNavigableMonthOffsets() {
    return { min: -1, max: this.canViewNextMonth() ? 1 : 0 };
  },

  // restituisce il range di date navigabili (primo e ultimo giorno)
  getNavigableRange() {
    const { min, max } = this.getNavigableMonthOffsets();
    const rangeStart = new Date(
      this.today.getFullYear(),
      this.today.getMonth() + min,
      1,
    );
    const rangeEnd = new Date(
      this.today.getFullYear(),
      this.today.getMonth() + max + 1,
      0,
    );
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(0, 0, 0, 0);
    return { rangeStart, rangeEnd };
  },

  // restituisce data di inizio settimana minima
  getMinWeekStart() {
    return this.getWeekStart(this.getNavigableRange().rangeStart);
  },

  // restituisce data di inizio settimana massima
  getMaxWeekStart() {
    return this.getWeekStart(this.getNavigableRange().rangeEnd);
  },

  // limita l’inizio settimana dentro il range navigabile
  clampWeekStart(date) {
    const week = this.getWeekStart(date);
    const t = week.getTime();
    const min = this.getMinWeekStart().getTime();
    const max = this.getMaxWeekStart().getTime();
    if (t < min) return new Date(min);
    if (t > max) return new Date(max);
    return week;
  },

  // controlla se una data è prenotabile o meno
  isBookableDate(date) {
    if (this.isBeforeDate(date, this.today)) return false;
    const { rangeEnd } = this.getNavigableRange();
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() <= rangeEnd.getTime();
  },

  // restituisce stato del turno per una data
  getTurnStatus(date) {
    if (this.isBeforeDate(date, this.today)) return "past";
    if (!this.isBookableDate(date)) return "locked";
    return "available";
  },

  // restituisce la prenotazione per uno slot (giorno.turno) oppure null
  getSlotBooking(day, turnId) {
    return this.bookingsBySlot.get(`${day}.${turnId}`) ?? null;
  },

  // restituisce tutte le prenotazioni per un giorno
  getDayBookings(day) {
    const bookings = [];
    for (const [key, booking] of this.bookingsBySlot) {
      if (key.startsWith(`${day}.`)) bookings.push(booking);
    }
    return bookings;
  },

  // restituisce stato di uno slot (disponibile, occupato, passato, bloccato)
  getSlotStatus(date, turnId) {
    const slotBooking = this.getSlotBooking(this.formatDateISO(date), turnId);
    if (slotBooking) {
      if (window.ldrProfilo && slotBooking.id_utente === window.ldrProfilo.id_utente) {
        return "own";
      }
      return "occupied";
    }
    if (this.isBeforeDate(date, this.today)) return "past";
    if (!this.isBookableDate(date)) return "locked";
  
    // controllo orario solo per oggi
    if (this.isSameDate(date, this.today)) {
      const turn = this.turns.find(t => t.id === turnId);
      if (turn?.orario_inizio && turn?.orario_fine) {
        const timeStatus = this.getTurnTimeStatus(turn);
        if (timeStatus === 'past') return 'past';
        if (timeStatus === 'auto-confirm') return 'auto-confirm';
      }
    }
  
    return "available";
  },

  // converte una data db (iso) in formato locale
  formatDateISOFromDb(isoDate) {
    const [y, m, d] = isoDate.split("T")[0].split("-");
    return `${d}.${m}.${y}`;
  },

  // genera una chiave per la cache delle prenotazioni (range)
  getBookingsCacheKey(rangeStart, rangeEnd) {
    return `${this.formatDateForDb(this.formatDateISO(rangeStart))}_${this.formatDateForDb(this.formatDateISO(rangeEnd))}`;
  },

  // costruisce una mappa prenotazioni a partire dai dati db
  parseBookingsToMap(data) {
    const map = new Map();
    for (const prenotazione of data ?? []) {
      const indice = prenotazione.Turno?.indice;
      if (!indice || !prenotazione.data_prenotazione) continue;
  
      const day = this.formatDateISOFromDb(prenotazione.data_prenotazione);
      const turnId = String(indice);
  
      map.set(`${day}.${turnId}`, {
        id_utente:         prenotazione.id_utente,
        nome:              prenotazione.Utente?.nome ?? '',
        cognome:           prenotazione.Utente?.cognome ?? '',
        foto_profilo:      prenotazione.Utente?.foto_profilo ?? null,
        id_prenotazione:   prenotazione.id_prenotazione,
        data_prenotazione: prenotazione.data_prenotazione,
        stato:             prenotazione.stato,
        data_conferma:     prenotazione.data_conferma ?? null,
        Turno:             prenotazione.Turno ?? null,
        Utente:            prenotazione.Utente ?? null,
      });
    }
    return map;
  },

  // applica la cache delle prenotazioni su un certo range di date
  applyBookingsCache(rangeStart, rangeEnd) {
    const exactKey = this.getBookingsCacheKey(rangeStart, rangeEnd);

    if (this.bookingsRangeCache.has(exactKey)) {
      this.bookingsBySlot = new Map(this.bookingsRangeCache.get(exactKey));
      return true;
    }

    const start = this.formatDateForDb(this.formatDateISO(rangeStart));
    const end = this.formatDateForDb(this.formatDateISO(rangeEnd));

    for (const [key, map] of this.bookingsRangeCache) {
      const [cacheStart, cacheEnd] = key.split("_");
      if (cacheStart > start || cacheEnd < end) continue;

      const filtered = new Map();
      for (const [slotKey, booking] of map) {
        const dayParts = slotKey.split(".");
        const dayStr = dayParts.slice(0, 3).join(".");
        const dbDay = this.formatDateForDb(dayStr);
        if (dbDay >= start && dbDay <= end) {
          filtered.set(slotKey, booking);
        }
      }

      this.bookingsBySlot = filtered;
      return true;
    }

    return false;
  },

  // recupera le prenotazioni dal database e aggiorna la cache
  async fetchAndCacheBookings(rangeStart, rangeEnd, cacheKey) {
    const { getPrenotazioniByDateRange } = window.ldrDb ?? {};
    if (!getPrenotazioniByDateRange) return;

    const start = this.formatDateForDb(this.formatDateISO(rangeStart));
    const end = this.formatDateForDb(this.formatDateISO(rangeEnd));
    const { data, error } = await getPrenotazioniByDateRange(start, end);

    if (error) {
      console.error("Impossibile caricare le prenotazioni:", error);
      return;
    }

    const map = this.parseBookingsToMap(data);
    this.bookingsRangeCache.set(cacheKey, map);
    this.bookingsBySlot = new Map(map);
  },

  // svuota la cache delle prenotazioni
  invalidateBookingsCache() {
    this.bookingsRangeCache.clear();
    this.bookingsBySlot.clear();
  },

  // assicura che il db sia pronto prima di fare richieste
  async ensureDbReady() {
    if (window.ldrDb?.getPrenotazioniByDateRange) return;

    await new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        if (window.ldrDb?.getPrenotazioniByDateRange) {
          resolve();
          return;
        }
        if (performance.now() - started > 5000) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  },

  // attiva/disattiva il loader sulla vista
  setViewLoading(container, loading) {
    container?.classList.toggle("calendar-view-loading", loading);
  },

  // gestisce l'animazione di entrata della vista
  finishViewTransition(container) {
    if (!container) return;
    container.classList.remove("calendar-view-enter");
    void container.offsetWidth;
    container.classList.add("calendar-view-enter");
  },

  // crea l’elemento visuale con le faccine giorno per gli utenti prenotati
  createBookedDayRecap(bookings) {
    const recap = document.createElement("div");
    recap.className = "booked-day-recap";
    bookings.forEach((booking) => {
      const img = document.createElement("img");
      img.src = booking?.foto_profilo || this.stockProfilePic;
      img.alt = "";
      recap.appendChild(img);
    });
    return recap;
  },

  // crea il placeholder (scheletro) di un turno settimana durante caricamento
  createTurnSkeleton(date, turn) {
    const el = document.createElement("div");
    el.className = "turn turn-skeleton";
    el.dataset.day = this.formatDateISO(date);
    el.dataset.turn = turn.id;
    el.dataset.status = "loading";
    const bar = document.createElement("span");
    bar.className = "skeleton skeleton-turn";
    el.appendChild(bar);
    return el;
  },

  // crea il placeholder di un turno nella vista giorno
  createDayTurnSkeleton(date, turn, index) {
    const el = document.createElement("div");
    el.className = "day-turn day-turn-skeleton";
    el.dataset.day = this.formatDateISO(date);
    el.dataset.turn = turn.id;
    el.dataset.status = "loading";

    const checkDiv = document.createElement("div");
    checkDiv.className = "check-day-turn";
    checkDiv.appendChild(Object.assign(document.createElement("span"), {
      className: "skeleton skeleton-checkbox",
    }));
    checkDiv.appendChild(Object.assign(document.createElement("span"), {
      className: "skeleton skeleton-label",
      textContent: `${index + 1}°`,
    }));

    const timeDiv = document.createElement("div");
    timeDiv.className = "time-day-turn";
    timeDiv.appendChild(Object.assign(document.createElement("span"), {
      className: "skeleton skeleton-label",
      textContent: turn.label,
    }));

    const userDiv = document.createElement("div");
    userDiv.className = "user-day-turn";
    userDiv.appendChild(Object.assign(document.createElement("span"), {
      className: "skeleton skeleton-user",
    }));

    el.append(checkDiv, timeDiv, userDiv);
    return el;
  },

  // compila un elemento turno nella vista settimana con stato aggiornato
  fillTurnElement(el, date, turn) {
    const day = this.formatDateISO(date);
    const booking = this.getSlotBooking(day, turn.id);
    const status = this.getSlotStatus(date, turn.id);

    el.className = "turn calendar-content-enter";
    el.dataset.day = day;
    el.dataset.turn = turn.id;
    el.dataset.userId = booking?.id_utente ?? "";
    el.dataset.status = status;
    el.replaceChildren();

    if (status === "available" || status === "auto-confirm") {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      el.appendChild(icon);
    } else if (status === "occupied") {
      el.appendChild(this.createUserPreviewEl(booking));
    } else if (status == "own") {
      el.appendChild(this.createUserPreviewEl(booking));
      el.addEventListener('click', () => {
        console.log('click su turno own, booking:', booking);
        openModificaModal(booking);
      });
    }
  },

  // compila un elemento turno nella vista giorno
  fillDayTurnElement(el, date, turn, index) {
    const day = this.formatDateISO(date);
    const booking = this.getSlotBooking(day, turn.id);
    const status = this.getSlotStatus(date, turn.id);

    el.className = "day-turn calendar-content-enter";
    el.dataset.day = day;
    el.dataset.turn = turn.id;
    el.dataset.userId = booking?.id_utente ?? "";
    el.dataset.status = status;
    el.replaceChildren();

    const checkDiv = document.createElement("div");
    checkDiv.className = "check-day-turn";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = status === "occupied" || status === "own";
    checkbox.tabIndex = -1;

    const orderSpan = document.createElement("span");
    orderSpan.textContent = `${index + 1}°`;
    checkDiv.append(checkbox, orderSpan);

    const timeDiv = document.createElement("div");
    timeDiv.className = "time-day-turn";
    const timeSpan = document.createElement("span");
    timeSpan.textContent = turn.label;
    timeDiv.appendChild(timeSpan);

    const userDiv = document.createElement("div");
    userDiv.className = "user-day-turn";

    if (status === "available" || status === "auto-confirm") {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      userDiv.appendChild(icon);
    } else if (status === "occupied" || status === "own") {
      userDiv.appendChild(this.createUserPreviewEl(booking));
    }

    el.append(checkDiv, timeDiv, userDiv);
  },

  // aggiorna la visualizzazione delle prenotazioni nel mese dopo caricamento dal db
  updateMonthBookings(rowsEl) {
    rowsEl?.querySelectorAll(".calendar-day").forEach((el) => {
      el.querySelector(".booked-day-recap")?.remove();
      const bookings = this.getDayBookings(el.dataset.date);
      if (bookings.length) {
        el.appendChild(this.createBookedDayRecap(bookings));
      }
    });
  },

  // ripopola i turni settimana col dato aggiornato delle prenotazioni
  hydrateWeekTurns(days) {
    days.forEach((date) => {
      const day = this.formatDateISO(date);
      this.turns.forEach((turn) => {
        const el = document.querySelector(
          `.turn[data-day="${day}"][data-turn="${turn.id}"]`,
        );
        if (el) this.fillTurnElement(el, date, turn);
      });
    });
  },

  // ripopola i turni giorno col dato aggiornato delle prenotazioni
  hydrateDayTurns(date) {
    const day = this.formatDateISO(date);
    this.turns.forEach((turn, i) => {
      const el = document.querySelector(
        `.day-turn[data-day="${day}"][data-turn="${turn.id}"]`,
      );
      if (el) this.fillDayTurnElement(el, date, turn, i);
    });
  },

  // controlla se un offset mese è valido
  isValidMonthOffset(offset) {
    if (offset === -1 || offset === 0) return true;
    if (offset === 1) return this.canViewNextMonth();
    return false;
  },

  // cambia il mese visualizzato
  setMonthViewOffset(offset) {
    if (!this.isValidMonthOffset(offset)) return;
    this.monthViewOffset = offset;
    this.renderMonth();
  },

  // passa al mese precedente
  goMonthPrev() {
    this.setMonthViewOffset(this.monthViewOffset - 1);
  },

  // passa al mese successivo
  goMonthNext() {
    this.setMonthViewOffset(this.monthViewOffset + 1);
  },

  // torna al mese corrente
  goMonthToday() {
    this.setMonthViewOffset(0);
  },

  // aggiorna lo stato dei bottoni di navigazione mese
  syncMonthNavButtons() {
    const canSeeNext = this.canViewNextMonth();
    if (this.btnMonthPrev) {
      this.btnMonthPrev.disabled = this.monthViewOffset === -1;
    }
    if (this.btnMonthNext) {
      this.btnMonthNext.disabled =
        this.monthViewOffset === 1 ||
        (this.monthViewOffset === 0 && !canSeeNext);
    }
  },

  // renderizza la vista mese, comprese le prenotazioni
  async renderMonth() {
    const gen = ++this.renderGeneration;

    if (this.monthViewOffset === 1 && !this.canViewNextMonth()) {
      this.monthViewOffset = 0;
    }

    const viewDate = this.getMonthViewDate();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = this.today;

    if (this.titleEl) {
      this.titleEl.textContent = `${MONTHS[month]} ${year}`;
    }

    const rowsEl = document.getElementById("calendar-rows");
    if (!rowsEl) return;

    // crea la griglia dei giorni visualizzati (anche giorni extra mese)
    const cells = this.buildMonthGrid(year, month);
    const cacheKey = this.getBookingsCacheKey(cells[0], cells[cells.length - 1]);
    const hasCache = this.applyBookingsCache(cells[0], cells[cells.length - 1]);

    rowsEl.replaceChildren();

    for (let i = 0; i < cells.length; i += 7) {
      const row = document.createElement("div");
      row.className = "calendar-row";
      cells.slice(i, i + 7).forEach((cell) => {
        row.appendChild(this.createDayElement(cell, month, today));
      });
      rowsEl.appendChild(row);
    }

    this.syncMonthNavButtons();
    this.finishViewTransition(rowsEl);

    if (hasCache) {
      window.ldrBookings?.refreshBookingsModal?.();
      return;
    }

    await this.ensureDbReady();
    await this.fetchAndCacheBookings(cells[0], cells[cells.length - 1], cacheKey);
    if (gen !== this.renderGeneration) return;

    this.updateMonthBookings(rowsEl);
    window.ldrBookings?.refreshBookingsModal?.();
  },

  // costruisce la lista dei giorni da mostrare nella griglia mese
  buildMonthGrid(year, month) {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells = [];

    for (let i = firstWeekday - 1; i >= 0; i--) {
      cells.push(new Date(year, month - 1, daysInPrevMonth - i));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day));
    }

    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push(new Date(year, month + 1, nextDay++));
    }

    return cells;
  },

  // crea un elemento giorno del calendario per la vista mese
  createDayElement(date, viewMonth, today) {
    const el = document.createElement("div");
    const isCurrentMonth = date.getMonth() === viewMonth;

    el.className = "calendar-day";

    if (!isCurrentMonth && !this.isBookableDate(date)) {
      el.classList.add("inactive");
    }

    if (this.isBeforeDate(date, today)) {
      el.classList.add("past");
    } else if (!this.isBookableDate(date)) {
      el.classList.add("locked");
    }

    if (this.isSameDate(date, today)) el.classList.add("current-day");
    el.dataset.date = this.formatDateISO(date);

    const span = document.createElement("span");
    span.textContent = String(date.getDate());
    el.appendChild(span);

    const bookings = this.getDayBookings(this.formatDateISO(date));
    if (bookings.length) {
      el.appendChild(this.createBookedDayRecap(bookings));
    }

    return el;
  },

  // ─── navigazione settimanle ────────────────────────────────────────────

  // restituisce il primo giorno della settimana di una data
  getWeekStart(date) {
    const d = new Date(date);
    const weekday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - weekday);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // sposta la settimana visualizzata avanti o indietro di N giorni
  shiftWeekStart(days) {
    const next = new Date(this.weekViewStart);
    next.setDate(next.getDate() + days);
    this.weekViewStart = this.clampWeekStart(next);
    this.renderWeek();
  },

  // vai alla settimana precedente
  goWeekPrev() {
    this.shiftWeekStart(-7);
  },

  // vai alla settimana successiva
  goWeekNext() {
    this.shiftWeekStart(7);
  },

  // torna alla settimana corrente
  goWeekToday() {
    this.weekViewStart = this.clampWeekStart(this.getWeekStart(this.today));
    this.renderWeek();
  },

  // aggiorna lo stato dei bottoni settimana
  syncWeekNavButtons() {
    const cur = this.weekViewStart.getTime();
    const min = this.getMinWeekStart().getTime();
    const max = this.getMaxWeekStart().getTime();

    if (this.btnWeekPrev) {
      this.btnWeekPrev.disabled = cur <= min;
    }
    if (this.btnWeekNext) {
      this.btnWeekNext.disabled = cur >= max;
    }
  },

  // renderizza la vista settimana, prenotazioni comprese
  async renderWeek() {
    const gen = ++this.renderGeneration;
    this.weekViewStart = this.clampWeekStart(this.weekViewStart);

    const weekStart = this.weekViewStart;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const cacheKey = this.getBookingsCacheKey(days[0], days[6]);
    const hasCache = this.applyBookingsCache(days[0], days[6]);

    if (this.titleEl) {
      this.titleEl.textContent = this.formatWeekTitle(days[0], days[6]);
    }

    this.renderWeekColumns(days);
    this.renderWeekTurns(days, { loading: !hasCache });
    this.syncWeekNavButtons();
    this.setViewLoading(this.weekContainer, !hasCache);

    if (hasCache) {
      this.restoreSelection();
      this.finishViewTransition(this.weekContainer);
      if (typeof lucide !== "undefined") lucide.createIcons();
      window.ldrBookings?.refreshBookingsModal?.(days[0]);
      return;
    }

    await this.fetchAndCacheBookings(days[0], days[6], cacheKey);
    if (gen !== this.renderGeneration) return;

    this.hydrateWeekTurns(days);
    this.setViewLoading(this.weekContainer, false);
    this.finishViewTransition(this.weekContainer);
    this.restoreSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
    window.ldrBookings?.refreshBookingsModal?.(days[0]);
  },

  // costruisce le intestazioni dei giorni nella vista settimana
  renderWeekColumns(days) {
    const columnsEl = document.getElementById("week-calendar-columns");
    if (!columnsEl) return;

    columnsEl.replaceChildren();

    const corner = document.createElement("h3");
    columnsEl.appendChild(corner);

    days.forEach((date, i) => {
      const h3 = document.createElement("h3");
      h3.dataset.date = this.formatDateISO(date);
      const label = `${WEEKDAYS[i]} ${date.getDate()}`;
      if (this.isBeforeDate(date, this.today)) {
        h3.classList.add("past");
      } else if (!this.isBookableDate(date)) {
        h3.classList.add("locked");
      }

      const span = document.createElement("span");
      span.textContent = label;

      if (this.isSameDate(date, this.today)) {
        span.className = "active";
      }

      h3.appendChild(span);

      columnsEl.appendChild(h3);
    });
  },

  // crea e popola le colonne dei turni settimanali
  renderWeekTurns(days, { loading = false } = {}) {
    const turnsEl = document.getElementById("week-calendar-turns");
    if (!turnsEl) return;
    turnsEl.replaceChildren();

    const schedulesEl = document.createElement("div");
    schedulesEl.id = "week-schedules";
    schedulesEl.className = "week-calendar-day";

    this.turns.forEach((turn) => {
      const schedDiv = document.createElement("div");
      schedDiv.className = "schedule";
      const span = document.createElement("span");
      span.textContent = turn.label;
      schedDiv.appendChild(span);
      schedulesEl.appendChild(schedDiv);
    });

    turnsEl.appendChild(schedulesEl);

    days.forEach((date) => {
      const col = document.createElement("div");
      col.className = "week-calendar-day";
      col.dataset.date = this.formatDateISO(date);

      const dayStatus = this.getTurnStatus(date);
      if (dayStatus === "past") col.classList.add("past");
      if (dayStatus === "locked") col.classList.add("locked");

      this.turns.forEach((turn) => {
        col.appendChild(
          loading
            ? this.createTurnSkeleton(date, turn)
            : this.createTurnElement(date, turn),
        );
      });

      turnsEl.appendChild(col);
    });
  },

  // crea un nuovo elemento turno per la settimana
  createTurnElement(date, turn) {
    const el = document.createElement("div");
    this.fillTurnElement(el, date, turn);
    return el;
  },

  // ─── navigazione giornaliera ────────────────────────────────────────────

  // renderizza la vista giorno, completa di turni e stato prenotazioni
  async renderDay() {
    const gen = ++this.renderGeneration;
    this.dayViewDate = this.clampDayDate(this.dayViewDate);

    const date = this.dayViewDate;
    const cacheKey = this.getBookingsCacheKey(date, date);
    const hasCache = this.applyBookingsCache(date, date);

    if (this.titleEl) {
      this.titleEl.textContent = this.formatDayTitle(date);
    }

    this.renderDayTurns(date, { loading: !hasCache });
    this.syncDayNavButtons();
    this.setViewLoading(this.dayContainer, !hasCache);

    if (hasCache) {
      this.restoreSelection();
      this.finishViewTransition(this.dayContainer);
      if (typeof lucide !== "undefined") lucide.createIcons();
      window.ldrBookings?.refreshBookingsModal?.(date);
      return;
    }

    await this.fetchAndCacheBookings(date, date, cacheKey);
    if (gen !== this.renderGeneration) return;

    this.hydrateDayTurns(date);
    this.setViewLoading(this.dayContainer, false);
    this.finishViewTransition(this.dayContainer);
    this.restoreSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
    window.ldrBookings?.refreshBookingsModal?.(date);
  },

  // crea le intestazioni dei giorni nella vista giorno
  renderDayColumns(days) {
    const columnsEl = document.getElementById("day-calendar-columns");
    if (!columnsEl) return;

    columnsEl.replaceChildren();

    days.forEach((dayDate, i) => {
      const h3 = document.createElement("h3");
      h3.dataset.date = this.formatDateISO(dayDate);
      const label = `${WEEKDAYS[i]} ${dayDate.getDate()}`;

      if (this.isBeforeDate(dayDate, this.today)) {
        h3.classList.add("past");
      } else if (!this.isBookableDate(dayDate)) {
        h3.classList.add("locked");
      }

      const span = document.createElement("span");
      if (this.isSameDate(dayDate, this.today)) span.classList.add("today");
      if (this.isSameDate(dayDate, this.dayViewDate))
        span.classList.add("selected");
      span.textContent = label;
      h3.appendChild(span);

      columnsEl.appendChild(h3);
    });
  },

  // crea e popola la lista dei turni nella vista giorno
  renderDayTurns(date, { loading = false } = {}) {
    const turnsEl = document.getElementById("day-schedules");
    if (!turnsEl) return;

    turnsEl.replaceChildren();

    this.turns.forEach((turn, i) => {
      turnsEl.appendChild(
        loading
          ? this.createDayTurnSkeleton(date, turn, i)
          : this.createDayTurnElement(date, turn, i),
      );
    });
  },

  // crea un nuovo elemento turno per la vista giorno
  createDayTurnElement(date, turn, index) {
    const el = document.createElement("div");
    this.fillDayTurnElement(el, date, turn, index);
    return el;
  },

  // formatta il titolo della vista giorno (es. 'Lunedì 3 Giugno 2024')
  formatDayTitle(date) {
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    // const base = `${weekdayLabel} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

    // if (this.isSameDate(date, this.today)) return `Oggi, ${base}`;
    // if (this.isTomorrow(date)) return `Domani, ${base}`;
    // return base;

    const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;

    if (this.isSameDate(date, this.today)) {return `Oggi, ${base}`;}
    else if (this.isTomorrow(date)) {return `Domani, ${base}`;}
    else {
      return `${weekdayLabel}, ${base}`;
    }

    // return base;

  },

  // controlla se la data è domani
  isTomorrow(date) {
    const tomorrow = new Date(this.today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.isSameDate(date, tomorrow);
  },

  // formatta il titolo della vista settimana (adatta a mesi diversi)
  formatWeekTitle(start, end) {
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    }

    return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  },

  // ─── gestione delle prenotazione ────────────────────────────────────────────

  // controlla se uno slot è selezionato nella selezione attuale
  isSlotSelected(day, turnId) {
    return this.selectedSlots.some(
      (s) => s.day === day && s.turnId === turnId,
    );
  },

  // restituisce il nome breve utente (es. 'L. Rossi')
  formatUserShortName(profilo) {
    if (!profilo?.nome || !profilo?.cognome) return "";
    const initial = profilo.nome.charAt(0).toUpperCase();
    return `${initial}. ${profilo.cognome}`;
  },

  // converte la data da formato locale (gg.mm.aaaa) a db (aaaa-mm-gg)
  formatDateForDb(dayStr) {
    const [d, m, y] = dayStr.split(".");
    return `${y}-${m}-${d}`;
  },

  // crea il preview utente con immagine e nome breve
  createUserPreviewEl(profilo, { animate = false } = {}) {
    const user = profilo ?? window.ldrProfilo;
    const container = document.createElement("div");
    container.className = animate
      ? "horizontal-container user-preview-enter"
      : "horizontal-container";

    const img = document.createElement("img");
    img.className = "profile-pic";
    // usa la foto del profilo specifico o lo stock di default
    img.src = user?.foto_profilo || this.stockProfilePic;
    img.alt = "";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = this.formatUserShortName(user);

    container.append(img, nameSpan);
    return container;
  },

  // marcare uno slot come selezionato nella ui
  markSlotSelected(turnEl, { animate = true } = {}) {
    turnEl.classList.add("selected");

    const input = turnEl.querySelector('input[type="checkbox"]');
    if (input) input.checked = true;

    const userDiv = turnEl.querySelector(".user-day-turn");
    if (userDiv) {
      userDiv.replaceChildren(this.createUserPreviewEl(null, { animate }));
      return;
    }

    if (turnEl.classList.contains("turn")) {
      turnEl.replaceChildren(this.createUserPreviewEl(null, { animate }));
    }
  },

  // deselezionare uno slot (rimuovere stato e icona/nome)
  markSlotDeselected(turnEl) {
    turnEl.classList.remove("selected");
  
    const isSelectable = turnEl.dataset.status === "available" || turnEl.dataset.status === "auto-confirm";
  
    const input = turnEl.querySelector('input[type="checkbox"]');
    if (input && isSelectable) input.checked = false;
  
    const userDiv = turnEl.querySelector(".user-day-turn");
    if (userDiv && isSelectable) {
      userDiv.replaceChildren();
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      userDiv.appendChild(icon);
      if (typeof lucide !== "undefined") lucide.createIcons();
      return;
    }
  
    if (turnEl.classList.contains("turn") && isSelectable) {
      turnEl.replaceChildren();
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      turnEl.appendChild(icon);
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  },

  // gestisce il click su uno slot e aggiorna la selezione
  selectSlot(turnEl) {
    const day = turnEl.dataset.day;
    const turnId = turnEl.dataset.turn;
    if (!day || !turnId || (turnEl.dataset.status !== "available" && turnEl.dataset.status !== "auto-confirm")) return;
    
    if (this.isSlotSelected(day, turnId)) {
      this.selectedSlots = this.selectedSlots.filter(
        (s) => !(s.day === day && s.turnId === turnId),
      );
      this.markSlotDeselected(turnEl);
    } else {
      this.selectedSlots.push({ day, turnId });
      this.markSlotSelected(turnEl);
    }

    if (this.selectedSlots.length) {
      this.showBookingBar();
    } else {
      this.hideBookingBar();
    }
  },

  // deseleziona visivamente tutti gli slot selezionati
  clearSelectionVisual() {
    document
      .querySelectorAll(".day-turn.selected, .turn.selected")
      .forEach((el) => this.markSlotDeselected(el));
  },

  // svuota la selezione corrente e la barra
  clearSelection() {
    this.clearSelectionVisual();
    this.selectedSlots = [];
    this.hideBookingBar();
  },

  // mostra la barra di conferma prenotazione
  showBookingBar() {
    if (!this.bookingBar) return;

    const alreadyVisible = this.bookingBar.classList.contains("is-visible");

    this.bookingBar.classList.remove("hidden");
    this.bookingBar.setAttribute("aria-hidden", "false");
    document.body.classList.add("booking-active");

    if (!alreadyVisible) {
      requestAnimationFrame(() => {
        this.bookingBar?.classList.add("is-visible");
      });
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  },

  // nasconde la barra di conferma prenotazione
  hideBookingBar() {
    if (!this.bookingBar) return;

    this.bookingBar.classList.remove("is-visible");
    this.bookingBar.setAttribute("aria-hidden", "true");
    document.body.classList.remove("booking-active");

    const bar = this.bookingBar;
    const onEnd = (e) => {
      if (e.target !== bar || e.propertyName !== "transform") return;
      bar.removeEventListener("transitionend", onEnd);
      if (!bar.classList.contains("is-visible")) {
        bar.classList.add("hidden");
      }
    };

    bar.addEventListener("transitionend", onEnd);
    setTimeout(() => {
      if (!bar.classList.contains("is-visible")) {
        bar.classList.add("hidden");
      }
    }, 400);
  },

  // ripristina la selezione dopo un cambiamento di vista/render
  restoreSelection() {
    if (!this.selectedSlots.length) return;

    const remaining = [];

    this.selectedSlots.forEach(({ day, turnId }) => {
      const selector =
        this.viewMode === "day"
          ? `.day-turn[data-day="${day}"][data-turn="${turnId}"]`
          : `.turn[data-day="${day}"][data-turn="${turnId}"]`;
      const el = document.querySelector(selector);

      if (el?.dataset.status === "available" || el?.dataset.status === "auto-confirm") {
        this.markSlotSelected(el, { animate: false });
        remaining.push({ day, turnId });
      }
    });

    this.selectedSlots = remaining;

    if (this.selectedSlots.length) this.showBookingBar();
    else this.hideBookingBar();
  },

  // effettua la conferma delle prenotazioni sugli slot selezionati
  async confirmBooking() {
    if (!this.selectedSlots.length || this.btnBookingConfirm?.disabled) return;

    const profilo = window.ldrProfilo;
    const { getTurniByIndici, createPrenotazioni } = window.ldrDb ?? {};

    if (!profilo?.id_utente) {
      alert("Impossibile prenotare: profilo non caricato.");
      return;
    }
    if (!getTurniByIndici || !createPrenotazioni) {
      alert("Impossibile prenotare: servizio non disponibile.");
      return;
    }

    const { getPrenotazioniUtente } = window.ldrDb ?? {};
    const { MAX_WEEKLY_BOOKINGS, countWeeklyBookings } = window.ldrBookingConfig ?? {};

    if (getPrenotazioniUtente && countWeeklyBookings) {
      const weekStart = this.formatDateForDb(this.formatDateISO(this.getWeekStart(this.today)));
      const { data: miePrenotazioni } = await getPrenotazioniUtente(profilo.id_utente, weekStart);

      // raggruppa i nuovi slot per settimana (inizio settimana come chiave)
      const nuovePerSettimana = new Map();
      for (const slot of this.selectedSlots) {
        const date = this.parseDateISO(slot.day);
        const ws = this.formatDateISO(this.getWeekStart(date));
        nuovePerSettimana.set(ws, (nuovePerSettimana.get(ws) ?? 0) + 1);
      }

      for (const [ws, nuove] of nuovePerSettimana) {
        const wsDate = this.parseDateISO(ws);
        const wsStart = new Date(wsDate);
        const wsEnd = new Date(wsDate);
        wsEnd.setDate(wsEnd.getDate() + 6);

        // conta solo le prenotazioni già esistenti in quella specifica settimana
        const esistenti = (miePrenotazioni ?? []).filter(p => {
          const d = new Date(p.data_prenotazione.split('T')[0]);
          return d >= wsStart && d <= wsEnd;
        }).length;

        if (esistenti + nuove > MAX_WEEKLY_BOOKINGS) {
          const modal = document.getElementById('modal-booking-denied');
          if (modal) {
            if (window.modal && typeof window.modal.open === "function") {
              window.modal.open('booking-denied');
            } else {
              modal.classList.add('showing');
              modal.style.display = 'block';
              modal.setAttribute('aria-hidden', 'false');
            }
          }
          return;
        }
      }
    }

    this.btnBookingConfirm.disabled = true;

    // prende gli indici dei turni selezionati, senza duplicati
    const indici = [
      ...new Set(this.selectedSlots.map((s) => parseInt(s.turnId, 10))),
    ];
    const { data: turni, error: turnoError } = await getTurniByIndici(indici);

    if (turnoError || !turni?.length) {
      console.error("Turni non trovati:", turnoError);
      alert("Turni non trovati. Riprova più tardi.");
      this.btnBookingConfirm.disabled = false;
      return;
    }

    const turnoByIndice = new Map(turni.map((t) => [t.indice, t.id_turno]));
    const prenotazioni = [];

    // prepara le prenotazioni e raccogli dati per la modal riepilogo
    const datiModal = [];
    for (const slot of this.selectedSlots) {
      const indice = parseInt(slot.turnId, 10);
      const id_turno = turnoByIndice.get(indice);
      if (!id_turno) {
        alert(`Turno ${indice} non trovato. Riprova più tardi.`);
        this.btnBookingConfirm.disabled = false;
        return;
      }

      const slotEl = document.querySelector(
        `[data-day="${slot.day}"][data-turn="${slot.turnId}"]`
      );
      const autoConfirm = slotEl?.dataset.status === 'auto-confirm';

      prenotazioni.push({
        id_utente: profilo.id_utente,
        id_turno,
        data_prenotazione: this.formatDateForDb(slot.day),
        stato: autoConfirm ? "confermata" : "non_confermata",
      });

      // Prepara dati dettagliati (incluse date, orari, indici) per la modal
      const dateObj = this.parseDateISO(slot.day);
      const weekdayFull = WEEKDAYS_FULL[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1];
      const day = dateObj.getDate();
      const month = MONTHS[dateObj.getMonth()].toLowerCase();
      const year = dateObj.getFullYear();
      // Trova il turno associato
      const turno = turni.find(t => t.id_turno === id_turno);
      console.log('turno trovato:', turno, '| id_turno cercato:', id_turno);
      let fasciaOraria = "";

      const formatTime = (time) => time?.slice(0, 5) ?? '';
      if (turno && turno.orario_inizio && turno.orario_fine) {
        fasciaOraria = `${formatTime(turno.orario_inizio)} - ${formatTime(turno.orario_fine)}`;
      } else if (slot.timeLabel) {
        fasciaOraria = slot.timeLabel;
      }

      datiModal.push({
        weekday: weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1),
        day,
        month,
        year,
        fasciaOraria,
        indice,
        autoConfirm,
      });
    }

    // crea le prenotazioni nel db
    const { error } = await createPrenotazioni(prenotazioni);

    this.btnBookingConfirm.disabled = false;

    if (error) {
      console.error("Errore prenotazione:", error);
      alert("Errore durante la prenotazione. Riprova più tardi.");
      return;
    }

    // aggiorna tutto dopo la prenotazione
    this.clearSelection();
    this.invalidateBookingsCache();
    window.ldrBookings?.refresh();
    this.render();

    // mostra la modal di conferma prenotazione con i dati giusti
    const modal = document.getElementById('modal-booking-success');
    if (modal) {
      const summaryList = modal.querySelector('#booking-summary-list');
      if (summaryList) {
        summaryList.innerHTML = '';
        for (const dati of datiModal) {
          const row = document.createElement('div');
          row.className = 'booking-summary-row';

          const dateSpan = document.createElement('span');
          dateSpan.className = 'summary-date';
          dateSpan.textContent = `${dati.weekday} ${dati.day} ${dati.month} ${dati.year} — ${dati.indice}° Turno`;

          const timeSpan = document.createElement('span');
          timeSpan.className = 'summary-time';
          timeSpan.textContent = dati.fasciaOraria;

          if (dati.autoConfirm) {
            const badge = document.createElement('span');
            badge.className = 'summary-badge-autoconfirm';
            badge.textContent = 'confermato ora';
            row.appendChild(badge);
          }

          row.appendChild(dateSpan);
          row.appendChild(timeSpan);
          summaryList.appendChild(row);
        }
      }

      if (window.modal && typeof window.modal.open === "function") {
        window.modal.open('booking-success');
      } else {
        modal.classList.add('showing');
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
      }
    }
},

  // funzioni utili ------------------

  // controlla se due date sono lo stesso giorno
  isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  },

  // controlla se una data è prima di un riferimento (solo data, no ora)
  isBeforeDate(date, ref) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < ref;
  },

  // formatta data oggetto in stringa 'gg.mm.aaaa'
  formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${d}.${m}.${y}`;
  },

  // trasforma 'gg.mm.aaaa' in oggetto Date
  parseDateISO(iso) {
    const [d, m, y] = iso.split(".").map(Number);
    return new Date(y, m - 1, d);
  },

  // controlla se un turno oggi è passato, a metà (auto-confirm) o futuro
  getTurnTimeStatus(turn) {
    console.log('getTurnTimeStatus:', turn.id, turn.orario_inizio, turn.orario_fine);
    const now = new Date();
    const toMinutes = (t) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = toMinutes(turn.orario_inizio);
  
    const fine = turn.orario_fine;
    const fineMin = toMinutes(fine);
    // se manca l'orario di fine, è zero, o è mezzanotte → dura fino a fine giornata
    const endMin = (!fine || fineMin === 0 || fineMin <= startMin)
      ? 24 * 60
      : fineMin;
  
    const midMin = Math.floor((startMin + endMin) / 2);
  
    if (nowMin >= endMin) return 'past';
    if (nowMin >= midMin) return 'auto-confirm';
    return 'future';
  },

};

// avvia il calendario al caricamento della pagina
document.addEventListener("DOMContentLoaded", () => calendarRender.init());
window.calendarRender = calendarRender;
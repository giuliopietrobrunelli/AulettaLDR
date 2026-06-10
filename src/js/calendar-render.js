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

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const WEEKDAYS_FULL = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
];

// monentanei da acquisire poi da db
const WEEK_TURNS = [
  { id: "1", label: "08:00 - 10:00" },
  { id: "2", label: "10:00 - 12:00" },
  { id: "3", label: "13:30 - 15:30" },
  { id: "4", label: "15:30 - 17:30" },
  { id: "5", label: "17:30 - 19:30" },
  { id: "6", label: "19:30 - 21:00" },
  { id: "7", label: "21:00 in poi" },
];

const calendarRender = {
  viewMode: "month",
  previousViewMode: null,
  monthViewOffset: 0,
  weekViewStart: null,
  dayViewDate: null,
  weeksBeforeNextMonthView: 1,
  selectedSlots: [],
  bookingsBySlot: new Map(),
  stockProfilePic: "/src/img/yellow-profile-picture.webp",

  init() {
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);
    this.weekViewStart = this.clampWeekStart(this.getWeekStart(this.today));
    this.dayViewDate = new Date(this.today);

    this.titleEl = document.getElementById("current-date");
    this.monthContainer = document.getElementById("calendar-container");
    this.weekContainer = document.getElementById("week-calendar-container");
    this.dayContainer = document.getElementById("day-calendar-container");
    this.monthToolbar = document.querySelector('[data-view="month"]');
    this.weekToolbar = document.querySelector('[data-view="week"]');
    this.dayToolbar = document.querySelector('[data-view="day"]');

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

    document.querySelectorAll("[data-calendar-switch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.calendarSwitch;
        if (mode === "month" || mode === "week") this.setViewMode(mode);
      });
    });

    this.monthContainer?.addEventListener("click", (e) => {
      const day = e.target.closest(".calendar-day:not(.inactive)");
      if (!day?.dataset.date) return;
      this.openDayView(this.parseDateISO(day.dataset.date));
    });

    this.weekContainer?.addEventListener("click", (e) => {
      const header = e.target.closest("#week-calendar-columns h3[data-date]");
      if (header?.dataset.date) {
        this.openDayView(this.parseDateISO(header.dataset.date));
        return;
      }
      const turn = e.target.closest('.turn[data-status="available"]');
      if (turn) this.selectSlot(turn);
    });

    this.dayContainer?.addEventListener("click", (e) => {
      const header = e.target.closest("#day-calendar-columns h3[data-date]");
      if (header?.dataset.date) {
        this.setDayViewDate(this.parseDateISO(header.dataset.date));
        return;
      }
      const turn = e.target.closest('.day-turn[data-status="available"]');
      if (turn) this.selectSlot(turn);
    });

    this.setViewMode(this.viewMode);
  },

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

    if (isWeek) {
      const anchor =
        this.monthViewOffset === 0 ? this.today : this.getMonthViewDate();
      this.weekViewStart = this.clampWeekStart(this.getWeekStart(anchor));
    }

    if (isDay && !this.dayViewDate) {
      this.dayViewDate = new Date(this.today);
    }

    this.render();
  },

  render() {
    if (this.viewMode === "month") return this.renderMonth();
    if (this.viewMode === "week") return this.renderWeek();
    return this.renderDay();
  },

  openDayView(date) {
    if (this.viewMode !== "day") {
      this.previousViewMode = this.viewMode;
    }
    this.dayViewDate = this.clampDayDate(date);
    this.setViewMode("day");
  },

  setDayViewDate(date) {
    this.dayViewDate = this.clampDayDate(date);
    this.renderDay();
  },

  goDayBack() {
    const target = this.previousViewMode || "month";
    this.previousViewMode = null;
    this.setViewMode(target);
  },

  clampDayDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const { rangeStart, rangeEnd } = this.getNavigableRange();
    const t = d.getTime();
    if (t < rangeStart.getTime()) return new Date(rangeStart);
    if (t > rangeEnd.getTime()) return new Date(rangeEnd);
    return d;
  },

  shiftDay(days) {
    const next = new Date(this.dayViewDate);
    next.setDate(next.getDate() + days);
    this.setDayViewDate(next);
  },

  goDayPrev() {
    this.shiftDay(-1);
  },

  goDayNext() {
    this.shiftDay(1);
  },

  goDayToday() {
    this.setDayViewDate(this.today);
  },

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

  // navigazione mensile ------------------------------------------------------------------------------------------------

  getMonthViewDate() {
    return new Date(
      this.today.getFullYear(),
      this.today.getMonth() + this.monthViewOffset,
      1,
    );
  },

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

  getNavigableMonthOffsets() {
    return { min: -1, max: this.canViewNextMonth() ? 1 : 0 };
  },

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

  getMinWeekStart() {
    return this.getWeekStart(this.getNavigableRange().rangeStart);
  },

  getMaxWeekStart() {
    return this.getWeekStart(this.getNavigableRange().rangeEnd);
  },

  clampWeekStart(date) {
    const week = this.getWeekStart(date);
    const t = week.getTime();
    const min = this.getMinWeekStart().getTime();
    const max = this.getMaxWeekStart().getTime();
    if (t < min) return new Date(min);
    if (t > max) return new Date(max);
    return week;
  },

  isBookableDate(date) {
    if (this.isBeforeDate(date, this.today)) return false;
    const { rangeEnd } = this.getNavigableRange();
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() <= rangeEnd.getTime();
  },

  getTurnStatus(date) {
    if (this.isBeforeDate(date, this.today)) return "past";
    if (!this.isBookableDate(date)) return "locked";
    return "available";
  },

  getSlotBooking(day, turnId) {
    return this.bookingsBySlot.get(`${day}.${turnId}`) ?? null;
  },

  getDayBookings(day) {
    const bookings = [];
    for (const [key, booking] of this.bookingsBySlot) {
      if (key.startsWith(`${day}.`)) bookings.push(booking);
    }
    return bookings;
  },

  getSlotStatus(date, turnId) {
    const baseStatus = this.getTurnStatus(date);
    if (baseStatus !== "available") return baseStatus;
    if (this.getSlotBooking(this.formatDateISO(date), turnId)) return "occupied";
    return "available";
  },

  formatDateISOFromDb(isoDate) {
    const [y, m, d] = isoDate.split("-");
    return `${d}.${m}.${y}`;
  },

  async loadBookings(rangeStart, rangeEnd) {
    const { getPrenotazioniByDateRange } = window.ldrDb ?? {};
    this.bookingsBySlot.clear();

    if (!getPrenotazioniByDateRange) return;

    const start = this.formatDateForDb(this.formatDateISO(rangeStart));
    const end = this.formatDateForDb(this.formatDateISO(rangeEnd));
    const { data, error } = await getPrenotazioniByDateRange(start, end);

    if (error) {
      console.error("Impossibile caricare le prenotazioni:", error);
      return;
    }

    for (const prenotazione of data ?? []) {
      const indice = prenotazione.Turno?.indice;
      if (!indice || !prenotazione.data_prenotazione) continue;

      const day = this.formatDateISOFromDb(prenotazione.data_prenotazione);
      const turnId = String(indice);

      this.bookingsBySlot.set(`${day}.${turnId}`, {
        id_utente: prenotazione.id_utente,
        nome: prenotazione.Utente?.nome ?? "",
        cognome: prenotazione.Utente?.cognome ?? "",
      });
    }
  },

  isValidMonthOffset(offset) {
    if (offset === -1 || offset === 0) return true;
    if (offset === 1) return this.canViewNextMonth();
    return false;
  },

  setMonthViewOffset(offset) {
    if (!this.isValidMonthOffset(offset)) return;
    this.monthViewOffset = offset;
    this.renderMonth();
  },

  goMonthPrev() {
    this.setMonthViewOffset(this.monthViewOffset - 1);
  },

  goMonthNext() {
    this.setMonthViewOffset(this.monthViewOffset + 1);
  },

  goMonthToday() {
    this.setMonthViewOffset(0);
  },

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

  async renderMonth() {
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

    const cells = this.buildMonthGrid(year, month);
    await this.loadBookings(cells[0], cells[cells.length - 1]);
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
  },

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

    const dayStr = this.formatDateISO(date);
    const bookings = this.getDayBookings(dayStr);
    if (bookings.length) {
      const recap = document.createElement("div");
      recap.className = "booked-day-recap";
      bookings.forEach(() => {
        const img = document.createElement("img");
        img.src = this.stockProfilePic;
        img.alt = "";
        recap.appendChild(img);
      });
      el.appendChild(recap);
    }

    return el;
  },

  // navigazione settimanale ----------------------------------------------------------------------------------------

  getWeekStart(date) {
    const d = new Date(date);
    const weekday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - weekday);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  shiftWeekStart(days) {
    const next = new Date(this.weekViewStart);
    next.setDate(next.getDate() + days);
    this.weekViewStart = this.clampWeekStart(next);
    this.renderWeek();
  },

  goWeekPrev() {
    this.shiftWeekStart(-7);
  },

  goWeekNext() {
    this.shiftWeekStart(7);
  },

  goWeekToday() {
    this.weekViewStart = this.clampWeekStart(this.getWeekStart(this.today));
    this.renderWeek();
  },

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

  async renderWeek() {
    this.weekViewStart = this.clampWeekStart(this.weekViewStart);

    const weekStart = this.weekViewStart;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    await this.loadBookings(days[0], days[6]);

    if (this.titleEl) {
      this.titleEl.textContent = this.formatWeekTitle(days[0], days[6]);
    }

    this.renderWeekColumns(days);
    this.renderWeekTurns(days);
    this.syncWeekNavButtons();
    this.restoreSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
  },

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

  renderWeekTurns(days) {
    const turnsEl = document.getElementById("week-calendar-turns");
    if (!turnsEl) return;
    turnsEl.replaceChildren();

    const schedulesEl = document.createElement("div");
    schedulesEl.id = "week-schedules";
    schedulesEl.className = "week-calendar-day";

    WEEK_TURNS.forEach((turn) => {
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

      WEEK_TURNS.forEach((turn) => {
        col.appendChild(this.createTurnElement(date, turn));
      });

      turnsEl.appendChild(col);
    });
  },

  createTurnElement(date, turn) {
    const day = this.formatDateISO(date);
    const booking = this.getSlotBooking(day, turn.id);
    const status = this.getSlotStatus(date, turn.id);

    const el = document.createElement("div");
    el.className = "turn";
    el.dataset.day = day;
    el.dataset.turn = turn.id;
    el.dataset.userId = booking?.id_utente ?? "";
    el.dataset.status = status;

    if (status === "available") {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      el.appendChild(icon);
    } else if (status === "occupied") {
      el.appendChild(this.createUserPreviewEl(booking));
    }

    return el;
  },

  // navigazione giornaliera ----------------------------------------------------------------------------------------

  async renderDay() {
    this.dayViewDate = this.clampDayDate(this.dayViewDate);

    const date = this.dayViewDate;
    await this.loadBookings(date, date);

    const weekStart = this.getWeekStart(date);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    if (this.titleEl) {
      this.titleEl.textContent = this.formatDayTitle(date);
    }

    // this.renderDayColumns(days);
    this.renderDayTurns(date);
    this.syncDayNavButtons();

    this.restoreSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
  },

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

  renderDayTurns(date) {
    const turnsEl = document.getElementById("day-schedules");
    if (!turnsEl) return;

    turnsEl.replaceChildren();

    WEEK_TURNS.forEach((turn, i) => {
      turnsEl.appendChild(this.createDayTurnElement(date, turn, i));
    });
  },

  createDayTurnElement(date, turn, index) {
    const day = this.formatDateISO(date);
    const booking = this.getSlotBooking(day, turn.id);
    const status = this.getSlotStatus(date, turn.id);

    const el = document.createElement("div");
    el.className = "day-turn";
    el.dataset.day = day;
    el.dataset.turn = turn.id;
    el.dataset.userId = booking?.id_utente ?? "";
    el.dataset.status = status;

    const checkDiv = document.createElement("div");
    checkDiv.className = "check-day-turn";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = status === "occupied";
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

    if (status === "available") {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      userDiv.appendChild(icon);
    } else if (status === "occupied") {
      userDiv.appendChild(this.createUserPreviewEl(booking));
    }

    el.append(checkDiv, timeDiv, userDiv);
    return el;
  },

  formatDayTitle(date) {
    const weekday = WEEKDAYS_FULL[(date.getDay() + 6) % 7];
    const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const base = `${weekdayLabel} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

    if (this.isSameDate(date, this.today)) return `Oggi, ${base}`;
    if (this.isTomorrow(date)) return `Domani, ${base}`;
    return base;
  },

  isTomorrow(date) {
    const tomorrow = new Date(this.today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.isSameDate(date, tomorrow);
  },

  formatWeekTitle(start, end) {
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    }

    return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  },

  // prenotazioni ------------------------------------------------------------------------------------

  isSlotSelected(day, turnId) {
    return this.selectedSlots.some(
      (s) => s.day === day && s.turnId === turnId,
    );
  },

  formatUserShortName(profilo) {
    if (!profilo?.nome || !profilo?.cognome) return "";
    const initial = profilo.nome.charAt(0).toUpperCase();
    return `${initial}. ${profilo.cognome}`;
  },

  formatDateForDb(dayStr) {
    const [d, m, y] = dayStr.split(".");
    return `${y}-${m}-${d}`;
  },

  createUserPreviewEl(profilo) {
    const user = profilo ?? window.ldrProfilo;
    const container = document.createElement("div");
    container.className = "horizontal-container";

    const img = document.createElement("img");
    img.className = "profile-pic";
    img.src = this.stockProfilePic;
    img.alt = "";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = this.formatUserShortName(user);

    container.append(img, nameSpan);
    return container;
  },

  markSlotSelected(turnEl) {
    turnEl.classList.add("selected");

    const input = turnEl.querySelector('input[type="checkbox"]');
    if (input) input.checked = true;

    const userDiv = turnEl.querySelector(".user-day-turn");
    if (userDiv) {
      userDiv.replaceChildren(this.createUserPreviewEl());
      return;
    }

    if (turnEl.classList.contains("turn")) {
      turnEl.replaceChildren(this.createUserPreviewEl());
    }
  },

  markSlotDeselected(turnEl) {
    turnEl.classList.remove("selected");

    const input = turnEl.querySelector('input[type="checkbox"]');
    if (input && turnEl.dataset.status === "available") input.checked = false;

    const userDiv = turnEl.querySelector(".user-day-turn");
    if (userDiv && turnEl.dataset.status === "available") {
      userDiv.replaceChildren();
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      userDiv.appendChild(icon);
      if (typeof lucide !== "undefined") lucide.createIcons();
      return;
    }

    if (turnEl.classList.contains("turn") && turnEl.dataset.status === "available") {
      turnEl.replaceChildren();
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "plus");
      turnEl.appendChild(icon);
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  },

  selectSlot(turnEl) {
    const day = turnEl.dataset.day;
    const turnId = turnEl.dataset.turn;
    if (!day || !turnId || turnEl.dataset.status !== "available") return;

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

  clearSelectionVisual() {
    document
      .querySelectorAll(".day-turn.selected, .turn.selected")
      .forEach((el) => this.markSlotDeselected(el));
  },

  clearSelection() {
    this.clearSelectionVisual();
    this.selectedSlots = [];
    this.hideBookingBar();
  },

  showBookingBar() {
    this.bookingBar?.classList.remove("hidden");
    this.bookingBar?.setAttribute("aria-hidden", "false");
    document.body.classList.add("booking-active");
    if (typeof lucide !== "undefined") lucide.createIcons();
  },

  hideBookingBar() {
    this.bookingBar?.classList.add("hidden");
    this.bookingBar?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("booking-active");
  },

  restoreSelection() {
    if (!this.selectedSlots.length) return;

    const remaining = [];

    this.selectedSlots.forEach(({ day, turnId }) => {
      const selector =
        this.viewMode === "day"
          ? `.day-turn[data-day="${day}"][data-turn="${turnId}"]`
          : `.turn[data-day="${day}"][data-turn="${turnId}"]`;
      const el = document.querySelector(selector);

      if (el?.dataset.status === "available") {
        this.markSlotSelected(el);
        remaining.push({ day, turnId });
      }
    });

    this.selectedSlots = remaining;

    if (this.selectedSlots.length) this.showBookingBar();
    else this.hideBookingBar();
  },

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

    this.btnBookingConfirm.disabled = true;

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

    for (const slot of this.selectedSlots) {
      const indice = parseInt(slot.turnId, 10);
      const id_turno = turnoByIndice.get(indice);
      if (!id_turno) {
        alert(`Turno ${indice} non trovato. Riprova più tardi.`);
        this.btnBookingConfirm.disabled = false;
        return;
      }
      prenotazioni.push({
        id_utente: profilo.id_utente,
        id_turno,
        data_prenotazione: this.formatDateForDb(slot.day),
      });
    }

    const { error } = await createPrenotazioni(prenotazioni);

    this.btnBookingConfirm.disabled = false;

    if (error) {
      console.error("Errore prenotazione:", error);
      alert("Errore durante la prenotazione. Riprova più tardi.");
      return;
    }

    this.clearSelection();
    this.render();
  },

  // funzioni utili ----------------------------------------------------------------------------------------

  isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  },

  isBeforeDate(date, ref) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < ref;
  },

  formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${d}.${m}.${y}`;
  },

  parseDateISO(iso) {
    const [d, m, y] = iso.split(".").map(Number);
    return new Date(y, m - 1, d);
  },
};

document.addEventListener("DOMContentLoaded", () => calendarRender.init());

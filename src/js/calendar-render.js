const MONTH_NAMES_IT = [
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

const calendarRender = {
  // 0 mese corrente, 1 mese successivo
  viewOffset: 0,

  // n di settimane prima del primo giorno del mese successivo in cuidiventa possibile visualizzare il mese successivo
  weeksBeforeNextMonthView: 1,

  init() {
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);

    this.btnPrev = document.getElementById("calendar-prev");
    this.btnNext = document.getElementById("calendar-next");

    this.btnPrev?.addEventListener("click", () => this.goPrev());
    this.btnNext?.addEventListener("click", () => this.goNext());

    this.render();
  },

  getViewDate() {
    return new Date(
      this.today.getFullYear(),
      this.today.getMonth() + this.viewOffset,
      1,
    );
  },

  canViewNextMonth() {
    const weeks = this.weeksBeforeNextMonthView;
    const nextMonthStart = new Date(
      this.today.getFullYear(),
      this.today.getMonth() + 1,
      1,
    );
    const threshold = new Date(nextMonthStart);
    threshold.setDate(threshold.getDate() - weeks * 7);
    return this.today >= threshold;
  },

  isValidOffset(offset) {
    if (offset === -1 || offset === 0) return true;
    if (offset === 1) return this.canViewNextMonth();
    return false;
  },

  setViewOffset(offset) {
    if (!this.isValidOffset(offset)) return;
    this.viewOffset = offset;
    this.render();
  },

  goPrev() {
    this.setViewOffset(this.viewOffset - 1);
  },

  goNext() {
    this.setViewOffset(this.viewOffset + 1);
  },

  syncNavButtons() {
    const canSeeNext = this.canViewNextMonth();

    if (this.btnPrev) {
      this.btnPrev.disabled = this.viewOffset === -1;
    }
    if (this.btnNext) {
      this.btnNext.disabled =
        this.viewOffset === 1 || (this.viewOffset === 0 && !canSeeNext);
    }
  },

  render() {
    if (this.viewOffset === 1 && !this.canViewNextMonth()) {
      this.viewOffset = 0;
    }

    const viewDate = this.getViewDate();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = this.today;

    const titleEl = document.getElementById("current-date");
    if (titleEl) {
      titleEl.textContent = `${MONTH_NAMES_IT[month]} ${year}`;
    }

    const rowsEl = document.getElementById("calendar-rows");
    if (!rowsEl) return;

    const cells = this.buildMonthGrid(year, month);
    rowsEl.replaceChildren();

    for (let i = 0; i < cells.length; i += 7) {
      const row = document.createElement("div");
      row.className = "calendar-row";
      cells.slice(i, i + 7).forEach((cell) => {
        row.appendChild(this.createDayElement(cell, month, today));
      });
      rowsEl.appendChild(row);
    }

    this.syncNavButtons();
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
    const dateYear = date.getFullYear();
    const dateMonth = date.getMonth();
    const dateDay = date.getDate();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    const isToday =
      dateYear === todayYear &&
      dateMonth === todayMonth &&
      dateDay === todayDay;

    el.className = "calendar-day";

    if (!isCurrentMonth) {
      el.classList.add("inactive");
    } else if (
      dateYear < todayYear ||
      (dateYear === todayYear && dateMonth < todayMonth) ||
      (dateYear === todayYear && dateMonth === todayMonth && dateDay < todayDay)
    ) {
      el.classList.add("past");
    }

    if (isToday) el.classList.add("current-day");
    el.dataset.date = this.formatDateISO(date);

    const span = document.createElement("span");
    span.textContent = String(date.getDate());
    el.appendChild(span);

    return el;
  },

  formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
};

document.addEventListener("DOMContentLoaded", () => calendarRender.init());

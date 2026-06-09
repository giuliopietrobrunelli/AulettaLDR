const MODAL_TRANSITION_MS = 230;

const modal = {
  smallIds: new Set(),
  fullIds: new Set(),

  init() {
    this.discover();
    document.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  },

  /** Registra modali da elementi #modal-{id} con classe .modal o .full-modal */
  discover() {
    document.querySelectorAll('[id^="modal-"]').forEach((el) => {
      const id = el.id.slice(6);
      if (!id) return;
      if (el.classList.contains('full-modal')) this.fullIds.add(id);
      else if (el.classList.contains('modal')) this.smallIds.add(id);
    });
  },

  isKnown(id) {
    return this.smallIds.has(id) || this.fullIds.has(id);
  },

  getEl(id) {
    return document.getElementById('modal-' + id);
  },

  getShowing() {
    return document.querySelectorAll('.modal.showing, .full-modal.showing');
  },

  onClick(e) {
    const target = e.target;
    const activator = target.closest('[data-modal]');

    if (activator) {
      const id = activator.dataset.modal;

      if (id === 'close-modal') {
        e.preventDefault();
        const parent = activator.closest('.modal.showing, .full-modal.showing');
        if (parent) this.closeEl(parent);
        else this.closeAll();
        return;
      }

      if (this.isKnown(id)) {
        e.preventDefault();
        this.toggle(id);
      }
      return;
    }

    if (this._openedAt && Date.now() - this._openedAt < 220) return;

    this.getShowing().forEach((m) => {
      if (this.shouldKeepOpen(m, target)) return;
      this.closeEl(m);
    });
  },

  shouldKeepOpen(modalEl, target) {
    if (modalEl.classList.contains('full-modal')) {
      const body = modalEl.querySelector('.full-modal-body');
      return body?.contains(target) ?? false;
    }
    return modalEl.contains(target);
  },

  toggle(id) {
    const el = this.getEl(id);
    if (!el) return;
    if (el.classList.contains('showing')) {
      this.closeEl(el);
      return;
    }
    this.open(id);
  },

  syncActivatorActive(id) {
    const known = new Set([...this.smallIds, ...this.fullIds]);
    document.querySelectorAll('[data-modal]').forEach((btn) => {
      const btnId = btn.dataset.modal;
      if (!known.has(btnId)) return;
      btn.classList.toggle('active', btnId === id);
    });
  },

  open(id) {
    const el = this.getEl(id);
    if (!el) return;
    this.closeAll();
    if (el._hideT) {
      clearTimeout(el._hideT);
      el._hideT = null;
    }
    el.style.display = 'flex';
    void el.offsetHeight;
    el.classList.add('showing');
    this.syncActivatorActive(id);
    this._openedAt = Date.now();
  },

  closeEl(el) {
    if (!el) return;
    el.classList.remove('showing');
    if (el.id.startsWith('modal-')) {
      this.syncActivatorActive(null);
    }
    if (el._hideT) clearTimeout(el._hideT);
    const token = (el._closeToken || 0) + 1;
    el._closeToken = token;
    el._hideT = setTimeout(() => {
      if (el._closeToken !== token) return;
      el.style.display = 'none';
      el._hideT = null;
    }, MODAL_TRANSITION_MS);
  },

  closeAll() {
    this.getShowing().forEach((el) => this.closeEl(el));
  },
};

document.addEventListener('DOMContentLoaded', () => modal.init());

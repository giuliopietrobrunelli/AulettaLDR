  // mostra una notifica toast con messaggio, icona e opzioni
  export function showToast(type, message, icon, options) {
    // non fare nulla se non in browser
    if (typeof document === 'undefined') return;

    // configura le opzioni di default e quelle passate dall'utente
    const cfg = Object.assign({
      duration: 4000,
      position: 'bottom-center',
      closable: true,
    }, options || {});

    // tipi di toast con classi, icone e etichette di default
    const types = {
      success: { class: 'toast--success', icon: 'circle-check', label: 'successo' },
      error:   { class: 'toast--error',   icon: 'circle-x',     label: 'errore' },
      warning: { class: 'toast--warning', icon: 'triangle-alert', label: 'avviso' },
      info:    { class: 'toast--info',    icon: 'info',         label: 'info' },
    };

    // ottieni le info relative al tipo o fallback generico
    const info = types[type] || { class: 'toast--info', icon: 'info', label: type };
    const iconName = icon != null ? icon : info.icon;

    // crea l'elemento principale del toast
    const el = document.createElement('div');
    el.className = `toast ${info.class}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', `${info.label}: ${message}`);
    el.style.position = 'relative';

    // aggiungi l'icona al toast
    const spanIcon = document.createElement('span');
    spanIcon.className = 'toast__icon';
    spanIcon.setAttribute('aria-hidden', 'true');
    const svgIcon = document.createElement('i');
    svgIcon.setAttribute('data-lucide', iconName);
    spanIcon.appendChild(svgIcon);
    el.appendChild(spanIcon);

    // aggiungi il testo del messaggio
    const spanText = document.createElement('span');
    spanText.className = 'toast__text';
    spanText.textContent = message;
    el.appendChild(spanText);

    // se closable, aggiungi bottone per chiudere
    if (cfg.closable) {
      const btn = document.createElement('button');
      btn.className = 'toast__close';
      btn.setAttribute('aria-label', 'chiudi notifica');
      const svgX = document.createElement('i');
      svgX.setAttribute('data-lucide', 'x');
      btn.appendChild(svgX);
      btn.onclick = () => removeToast(el);
      el.appendChild(btn);
    }

    // aggiungi barra di progresso animata se durata > 0
    if (cfg.duration > 0) {
      const bar = document.createElement('div');
      bar.className = 'toast__progress';
      bar.style.animationDuration = cfg.duration + 'ms';
      el.appendChild(bar);
    }

    // inserisci il toast nel container corretto
    const container = obtainContainer(cfg.position);
    container.appendChild(el);

    // aggiorna le icone lucide se disponibili
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ nameAttr: 'data-lucide', nodes: [el] });
    }

    // avvia timer per chiusura automatica
    let timer;
    if (cfg.duration > 0) {
      timer = setTimeout(() => removeToast(el), cfg.duration);
    }

    // pausa timer quando il mouse è sopra il toast
    el.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); });
    el.addEventListener('mouseleave', () => {
      if (cfg.duration > 0) timer = setTimeout(() => removeToast(el), 1200);
    });

    // ritorna il toast creato
    return el;
  }

  // oggetto che contiene i container per ogni posizione dei toast
  const containers = {};

  // ritorna il container per la posizione data, lo crea se non esiste
  function obtainContainer(position) {
    if (containers[position]) return containers[position];

    const div = document.createElement('div');
    div.className = `toast-container pos-${position}`;
    div.setAttribute('role', 'region');
    div.setAttribute('aria-label', 'notifiche');
    document.body.appendChild(div);
    containers[position] = div;
    return div;
  }

  // rimuove un toast applicando la classe di uscita e aspettando la fine dell'animazione
  function removeToast(el) {
    el.classList.add('toast--exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
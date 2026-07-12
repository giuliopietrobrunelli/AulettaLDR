import { supabase } from "./supabase-client.js";

// oggetto principale per la gestione dell'autenticazione
export const auth = {
  async init() {
    const hash = window.location.hash;

    // gestisce errori espliciti nell'URL (link scaduto ecc.)
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.slice(1));
      const errorDesc = params.get("error_description")?.replace(/\+/g, " ");

      if (window.location.pathname.includes("set-password")) {
        const form = document.getElementById("set-password-form");
        if (form)
          this.showError(
            form,
            `link non valido: ${errorDesc ?? "riprova a registrarti."}`,
          );
        return;
      }
      if (window.location.pathname.includes("reset-password")) {
        const form = document.getElementById("reset-password-form");
        if (form)
          this.showError(
            form,
            `link non valido: ${errorDesc ?? "richiedine uno nuovo dalla pagina di login."}`,
          );
        return;
      }
    }

    // se c'è un token nell'URL aspetta che supabase lo processi
    if (hash.includes("access_token")) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) console.error("errore sessione:", error.message);

    if (window.location.pathname.includes("reset-password")) {
      this.initResetPasswordPage(session);
      return;
    }
    if (window.location.pathname.includes("set-password")) {
      this.initSetPassword(session);
      return;
    }
    if (window.location.pathname.includes("register-alternative")) {
      this.initRegisterByNamePage(session);
      return;
    }
    if (window.location.pathname.includes("register")) {
      this.initRegisterPage(session);
      return;
    }
    if (window.location.pathname.includes("login")) {
      this.initLoginPage(session);
      return;
    }

    this.requireAuth(session);
  },

  initRegisterByNamePage(session) {
    if (session) {
      window.location.href = "/";
      return;
    }
    this.setupRegisterByNameForm();
  },

  // se non c'è sessione reindirizza al login
  requireAuth(session) {
    if (!session) {
      window.location.href = "/login.html";
    }
  },

  // se utente già loggato, manda alla home, altrimenti mostra form login
  initLoginPage(session) {
    if (session) {
      window.location.href = "/";
      return;
    }

    this.setupLoginForm();
  },

  // se utente già loggato, manda alla home, altrimenti mostra form registrazione
  initRegisterPage(session) {
    if (session) {
      window.location.href = "/";
      return;
    }

    this.setupRegisterForm();
  },

  initResetPasswordPage(session) {
    if (!session) {
      // se non c'è sessione il link è scaduto
      const form = document.getElementById("reset-password-form");
      if (form)
        this.showError(
          form,
          "Ops! Link è scaduto o già usato, richiedine uno nuovo dalla pagina di login",
        );
      return;
    }
    this.setupNewPasswordForm();
  },

  // login con email o numero tessera più password
  setupLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputIdentifier = form.querySelector('input[name="n-tessera"]');
    const inputPassword = form.querySelector('input[name="password"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const identifier = inputIdentifier?.value.trim();
      const password = inputPassword?.value;

      // controlla che tutti i campi siano compilati
      if (!identifier || !password) {
        this.showError(form, "Compila tutti i campi richiesti");
        this.setLoading(btnSubmit, false);
        return;
      }

      // se l'identificatore non è una email assume che sia un numero tessera
      let email = identifier;

      if (!identifier.includes("@")) {
        // valida che sia un numero tessera
        const numeroTessera = parseInt(identifier, 10);
        if (isNaN(numeroTessera)) {
          this.showError(form, "Inserisci un numero tessera valido");
          this.setLoading(btnSubmit, false);
          return;
        }

        // risolve tessera -> email tramite RPC (non espone l'intera riga Utente)
        const { data, error: dbError } = await supabase.rpc(
          "resolve_login_identifier",
          { p_identifier: identifier },
        );
        const utente = data?.[0];

        // la tessera non è attiva o non è collegata ad un account registrato
        if (dbError || !utente) {
          this.showError(
            form,
            "Nessun account collegato alla tessera trovato, riprova o contatta il direttivo",
          );
          this.setLoading(btnSubmit, false);
          return;
        }

        // la tessera corrisponde ad un utente associato ma che non ha creato l'account
        if (!utente.registrato) {
          this.showError(
            form,
            "La tua tessera è valida, ma devi prima registrarti. Clicca il pulsante -Crea account-",
          );
          this.setLoading(btnSubmit, false);
          return;
        }

        // all'ora l'utente ha inserito una mail
        email = utente.email;
      } else {
        // l'utente ha inserito direttamente una mail: verifica esistenza e stato registrazione
        const { data, error: dbError } = await supabase.rpc(
          "resolve_login_identifier",
          { p_identifier: identifier },
        );
        const utente = data?.[0];

        // la mail non è attiva o non è collegata ad un account registrato
        if (dbError || !utente) {
          this.showError(
            form,
            "Nessun account collegato all'indirizzo mail inserito è stato trovato, riprova o contatta il direttivo",
          );
          this.setLoading(btnSubmit, false);
          return;
        }

        // la mail corrisponde ad un utente associato ma che non ha creato l'account
        if (!utente.registrato) {
          this.showError(
            form,
            "Il tuo indirizzo mail risulta associato ad una tessera LDR, ma devi prima registrarti. Clicca il pulsante -Crea account-",
          );
          this.setLoading(btnSubmit, false);
          return;
        }

        email = utente.email;
      }

      // usa email e password per provare ad effettuare il fare login
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // segnala nel form che o la mail o la password sono errati
      if (error) {
        this.showError(form, "Credenziali errate, riprova");
        this.setLoading(btnSubmit, false);
        return;
      }

      // reindirizza alla home se login ok
      window.location.href = "/";
    });

    // toggle tra login e reset
    document.getElementById("btn-show-reset")?.addEventListener("click", () => {
      document.getElementById("login-form").classList.toggle("hidden");
      document.getElementById("reset-password-form").classList.toggle("hidden");
    });

    document.getElementById("btn-back-login")?.addEventListener("click", () => {
      document.getElementById("reset-password-form").classList.toggle("hidden");
      document.getElementById("login-form").classList.toggle("hidden");
    });

    // inizializza il form per il reset della password
    this.setupResetPasswordForm();
  },

  // registrazione tramite numero tessera, invia magic link via email
  setupRegisterForm() {
    const form = document.getElementById("register-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputTessera = form.querySelector('input[name="n-tessera"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      // cerca il numero tessera nel db
      const numeroTessera = parseInt(inputTessera?.value?.trim(), 10);

      // è stata inserita una stringa non esclusivamente numerica
      if (isNaN(numeroTessera)) {
        this.showError(form, "Inserisci un numero tessera valido");
        this.setLoading(btnSubmit, false);
        return;
      }

      // cerca l'utente col numero tessera indicato tramite RPC
      const { data, error: dbError } = await supabase.rpc(
        "resolve_register_by_tessera",
        { p_tessera: numeroTessera },
      );
      const utente = data?.[0];

      if (dbError || !utente) {
        this.showError(
          form,
          "Tessera non trovata, riprova o contatta il direttivo.",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      if (utente.registrato) {
        this.showError(
          form,
          "Hai già un account attivo, accedi dalla pagina di login, se pensi si possa trattare di un'errore contatta il direttivo",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      // invia il magic link per impostare la password via email
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: utente.email,
        options: {
          emailRedirectTo:
            "https://prenotaulettaldr.illumedellaragione6.workers.dev/set-password",
          shouldCreateUser: true,
          data: {
            id_utente: utente.id_utente, // serve per associazione successiva
          },
        },
      });

      if (otpError) {
        this.showError(
          form,
          "Errore nell'invio della mail, riprova tra qualche minuto.",
        );
        console.error("otp error:", otpError.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      // avvisa che il link è stato inviato
      this.showSuccess(
        form,
        `Abbiamo inviato un link di attivazione a ${this.maskEmail(utente.email)}, controlla la posta (anche nello spam).`,
      );
      this.setLoading(btnSubmit, false);
    });
  },

  // registrazione tramite nome e cognome, invia magic link via email
  setupRegisterByNameForm() {
    const form = document.getElementById("register-by-name-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputNome = form.querySelector('input[name="nome"]');
    const inputCognome = form.querySelector('input[name="cognome"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const nome = inputNome?.value.trim();
      const cognome = inputCognome?.value.trim();

      if (!nome || !cognome) {
        this.showError(form, "Compila tutti i campi richiesti");
        this.setLoading(btnSubmit, false);
        return;
      }

      // cerca l'utente per nome e cognome (case non sensitive) tramite RPC
      const { data: utenti, error: dbError } = await supabase.rpc(
        "resolve_register_by_name",
        { p_nome: nome, p_cognome: cognome },
      );

      if (dbError || !utenti?.length) {
        this.showError(
          form,
          "Nessun utente trovato con questi dati, riprova o contatta il direttivo",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      // se ci sono più utenti con lo stesso nome e cognome, chiedi di usare la tessera
      if (utenti.length > 1) {
        this.showError(
          form,
          "Abbiamo trovato più utenti con questi dati, utilizza il numero tessera per registrarti. Se non hai più accesso alla tua tessera LDR contatta il direttivo",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      const utente = utenti[0];

      if (utente.registrato) {
        this.showError(
          form,
          "Hai già un account attivo, accedi dalla pagina di login, se pensi si possa trattare di un'errore contatta il direttivo",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      // invia il magic link
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: utente.email,
        options: {
          emailRedirectTo:
            "https://prenotaulettaldr.illumedellaragione6.workers.dev/set-password",
          shouldCreateUser: true,
          data: {
            id_utente: utente.id_utente,
          },
        },
      });

      if (otpError) {
        this.showError(
          form,
          "Errore nell'invio della mail, riprova tra qualche minuto.",
        );
        console.error("otp error:", otpError.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      this.showSuccess(
        form,
        `Abbiamo inviato un link di attivazione a ${this.maskEmail(utente.email)}, controlla la posta (anche nello spam).`,
      );
      this.setLoading(btnSubmit, false);
    });
  },

  // invio magic link per reset password via mail
  setupResetPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.clearError(form);
      this.setLoading(btnSubmit, true);

      const identifier = form
        .querySelector('input[name="reset-identifier"]')
        ?.value.trim();
      if (!identifier) {
        this.showError(form, "Compila tutti i campi richiesti");
        this.setLoading(btnSubmit, false);
        return;
      }

      // valida formato se è un numero tessera
      if (!identifier.includes("@")) {
        const numeroTessera = parseInt(identifier, 10);
        if (isNaN(numeroTessera)) {
          this.showError(form, "Inserimento non valido");
          this.setLoading(btnSubmit, false);
          return;
        }
      }

      // risolve tessera o email -> email + stato registrazione tramite RPC
      const { data, error: dbError } = await supabase.rpc(
        "resolve_login_identifier",
        { p_identifier: identifier },
      );
      const utente = data?.[0];

      if (dbError || !utente) {
        this.showError(
          form,
          identifier.includes("@")
            ? "Nessun account è collegato a questo indirizzo mail."
            : "Nessun account collegato alla tessera trovato, riprova o contatta il direttivo",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      if (!utente.registrato) {
        this.showError(
          form,
          "Devi prima creare un account per poter aggiornare la password.",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      const email = utente.email;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          "https://prenotaulettaldr.illumedellaragione6.workers.dev/reset-password",
      });

      if (error) {
        this.showError(
          form,
          "errore nell'invio della mail. riprova tra qualche minuto.",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      this.showSuccess(
        form,
        `abbiamo inviato un link a ${this.maskEmail(email)}. controlla la posta (anche nello spam).`,
      );
      this.setLoading(btnSubmit, false);
    });
  },

  setupNewPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputPwd = form.querySelector('input[name="password"]');
    const inputConf = form.querySelector('input[name="conferma-password"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.clearError(form);

      const pwd = inputPwd?.value;
      const conf = inputConf?.value;

      if (!pwd || pwd.length < 8) {
        this.showError(form, "la password deve essere di almeno 8 caratteri.");
        return;
      }

      if (pwd !== conf) {
        this.showError(form, "le password non coincidono.");
        return;
      }

      this.setLoading(btnSubmit, true);

      const { error } = await supabase.auth.updateUser({ password: pwd });

      if (error) {
        this.showError(
          form,
          "errore nell'impostazione della password. riprova.",
        );
        console.error("updateuser error:", error.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      window.location.href = "/";
    });
  },

  // gestione impostazione password dopo magic link via email
  async initSetPassword(session) {
    const form = document.getElementById("set-password-form");
    if (!form) return;

    if (!session) {
      this.showError(
        form,
        "il link è scaduto o già usato. richiedine uno nuovo.",
      );
      return;
    }

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputPwd = form.querySelector('input[name="password"]');
    const inputConf = form.querySelector('input[name="conferma-password"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.clearError(form);

      const pwd = inputPwd?.value;
      const conf = inputConf?.value;

      if (!pwd || pwd.length < 8) {
        this.showError(form, "la password deve essere di almeno 8 caratteri.");
        return;
      }

      if (pwd !== conf) {
        this.showError(form, "le password non coincidono.");
        return;
      }

      this.setLoading(btnSubmit, true);

      const { error } = await supabase.auth.updateUser({ password: pwd });

      if (error) {
        this.showError(
          form,
          "errore nell'impostazione della password. riprova.",
        );
        console.error("updateuser error:", error.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      window.location.href = "/";
    });
  },

  // funzione di logout: esce e manda a login
  async logout() {
    await supabase.auth.signOut();
    if (this.realtimeChannel) {
      // chiudi il canale realtime per evitare leak di informazioni di altri account
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    window.location.href = "/login.html";
  },

  // mette il bottone in loading durante submit
  setLoading(btn, isLoading) {
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = isLoading;
    btn.textContent = isLoading
      ? "attendere..."
      : btn.dataset.label || btn.textContent;
  },

  // mostra un errore nel form
  showError(container, msg) {
    this.clearError(container);
    const el = document.createElement("span");
    el.className = "form-error";
    el.textContent = msg;
    container.querySelector("section:last-of-type")?.prepend(el);
  },

  // mostra un messaggio di successo nel form
  showSuccess(container, msg) {
    this.clearError(container);
    const el = document.createElement("span");
    el.className = "form-success";
    el.textContent = msg;
    container.querySelector("section:last-of-type")?.prepend(el);
  },

  // pulisce errori e successi nel form
  clearError(container) {
    container.querySelector(".form-error")?.remove();
    container.querySelector(".form-success")?.remove();
  },

  // maschera la mail per privacy (es: lu***@gmail.com)
  maskEmail(email) {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  },
};

// avvia tutto quando il dom è pronto
document.addEventListener("DOMContentLoaded", () => auth.init());

// rende il logout globale per il bottone nella home
window.ldrLogout = () => auth.logout();
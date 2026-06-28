import { supabase } from "./supabase-client.js";

// oggetto principale per la gestione dell'autenticazione
const auth = {
  async init() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) console.error('errore sessione:', error.message);
  
    if (window.location.pathname.includes('set-password')) {
      this.initSetPassword(session);
      return;
    }
    if (window.location.pathname.includes('register-alternative')) {
      this.initRegisterByNamePage(session);
      return;
    }
    if (window.location.pathname.includes('register')) {
      this.initRegisterPage(session);
      return;
    }
    if (window.location.pathname.includes('login')) {
      this.initLoginPage(session);
      return;
    }
  
    this.requireAuth(session);
  },

  initRegisterByNamePage(session) {
    if (session) {
      window.location.href = "/index.html";
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
      window.location.href = "/index.html";
      return;
    }

    this.setupLoginForm();
  },

  // se utente già loggato, manda alla home, altrimenti mostra form registrazione
  initRegisterPage(session) {
    if (session) {
      window.location.href = "/index.html";
      return;
    }

    this.setupRegisterForm();
  },

  // login con email o numero tessera più password
  setupLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputIdentifier = form.querySelector('input[name="n-tessera"]');
    const inputPassword = form.querySelector('input[name="password"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const identifier = inputIdentifier?.value.trim();
      const password = inputPassword?.value;

      // controlla che tutti i campi siano compilati
      if (!identifier || !password) {
        this.showError(form, "compila tutti i campi.");
        this.setLoading(btnSubmit, false);
        return;
      }

      // se l'identificatore non è una email assume che sia un numero tessera
      let email = identifier;

      if (!identifier.includes("@")) {
        // cerca la mail associata nella tabella utenti
        const numeroTessera = parseInt(identifier, 10);
        if (isNaN(numeroTessera)) {
          this.showError(form, "numero tessera non valido.");
          this.setLoading(btnSubmit, false);
          return;
        }

        const { data: utente, error: dbError } = await supabase
          .from("Utente")
          .select("email, registrato")
          .eq("numero_tessera", numeroTessera)
          .single();

        if (dbError || !utente) {
          this.showError(
            form,
            "numero di tessera inserito non esistente o non attivo.",
          );
          this.setLoading(btnSubmit, false);
          return;
        }

        if (!utente.registrato) {
          this.showError(
            form,
            "la tua tessera è valida, ma devi prima registrarti.",
          );
          this.setLoading(btnSubmit, false);
          return;
        }
        email = utente.email;
      }

      // usa email e password per fare login
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        this.showError(form, "email o password errati.");
        this.setLoading(btnSubmit, false);
        return;
      }

      // reindirizza alla home se login ok
      window.location.href = "/index.html";
    });
  },

  // registrazione tramite numero tessera, invia magic link via email
  setupRegisterForm() {
    const form = document.getElementById("register-form");
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputTessera = form.querySelector('input[name="n-tessera"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      // cerca il numero tessera nel db
      const numeroTessera = parseInt(inputTessera?.value?.trim(), 10);

      if (isNaN(numeroTessera)) {
        this.showError(form, "inserisci un numero tessera valido.");
        this.setLoading(btnSubmit, false);
        return;
      }

      // cerca l'utente col numero tessera indicato
      const { data: utente, error: dbError } = await supabase
        .from('Utente')
        .select('id_utente, email, nome, registrato') // ← aggiunto registrato
        .eq('numero_tessera', numeroTessera)
        .single();

      if (dbError || !utente) {
        this.showError(form, 'numero tessera non trovato. riprova o scrivi a un amministratore.');
        this.setLoading(btnSubmit, false);
        return;
      }

      if (utente.registrato) {
        this.showError(form, 'hai già un account attivo. accedi dalla pagina di login. se pensi si possa trattare di un\'errore contatta il direttivo.');
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
          "errore nell'invio della mail. riprova tra qualche minuto.",
        );
        console.error("otp error:", otpError.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      // avvisa che il link è stato inviato
      this.showSuccess(
        form,
        `abbiamo inviato un link di attivazione a ${this.maskEmail(utente.email)}. controlla la posta (anche nello spam).`,
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const nome = inputNome?.value.trim();
      const cognome = inputCognome?.value.trim();

      if (!nome || !cognome) {
        this.showError(form, "inserisci nome e cognome.");
        this.setLoading(btnSubmit, false);
        return;
      }

      // cerca l'utente per nome e cognome (case non sensitive per comodità)
      const { data: utenti, error: dbError } = await supabase
        .from("Utente")
        .select("id_utente, email, nome, cognome, registrato")
        .ilike("nome", nome)
        .ilike("cognome", cognome);

      if (dbError || !utenti?.length) {
        this.showError(
          form,
          "nessun utente trovato con questi dati. riprova o contatta un amministratore.",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      // se ci sono più utenti con lo stesso nome e cognome, chiedi di usare la tessera
      if (utenti.length > 1) {
        this.showError(
          form,
          "trovati più utenti con questi dati. usa il numero tessera per registrarti.",
        );
        this.setLoading(btnSubmit, false);
        return;
      }

      const utente = utenti[0];

      if (utente.registrato) {
        this.showError(form, 'hai già un account attivo. accedi dalla pagina di login. se pensi si possa trattare di un\'errore contatta il direttivo.');
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
          "errore nell'invio della mail. riprova tra qualche minuto.",
        );
        console.error("otp error:", otpError.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      this.showSuccess(
        form,
        `abbiamo inviato un link di attivazione a ${this.maskEmail(utente.email)}. controlla la posta (anche nello spam).`,
      );
      this.setLoading(btnSubmit, false);
    });
  },

  // gestione impostazione password dopo magic link via email
  async initSetPassword(session) {
    const form = document.getElementById('set-password-form');
    if (!form) return;
  
    if (!session) {
      this.showError(form, 'il link è scaduto o già usato. richiedine uno nuovo.');
      return;
    }
  
    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputPwd  = form.querySelector('input[name="password"]');
    const inputConf = form.querySelector('input[name="conferma-password"]');
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearError(form);
  
      const pwd  = inputPwd?.value;
      const conf = inputConf?.value;
  
      if (!pwd || pwd.length < 8) {
        this.showError(form, 'la password deve essere di almeno 8 caratteri.');
        return;
      }
  
      if (pwd !== conf) {
        this.showError(form, 'le password non coincidono.');
        return;
      }
  
      this.setLoading(btnSubmit, true);
  
      const { error } = await supabase.auth.updateUser({ password: pwd });
  
      if (error) {
        this.showError(form, 'errore nell\'impostazione della password. riprova.');
        console.error('updateuser error:', error.message);
        this.setLoading(btnSubmit, false);
        return;
      }
  
      window.location.href = '/index.html';
    });
  },

  // funzione di logout: esce e manda a login
  async logout() {
    await supabase.auth.signOut();
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

// esporta auth per usarlo altrove
export { auth };

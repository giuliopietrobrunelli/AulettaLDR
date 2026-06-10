import { supabase } from './supabase-client.js';

const auth = {

  async init() {
    // intercetta il magic link se l'utente torna dal link email
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) console.error('Errore sessione:', error.message);

    // se siamo sulla pagina di set-password, aspettiamo solo che la sessione sia pronta (il magic link l'ha già creata)
    if (window.location.pathname.includes('set-password')) {
      this.initSetPassword(session);
      return;
    }

    // se siamo sulla pagina di registrazione, inizializza il form
    if (window.location.pathname.includes('register')) {
      this.initRegisterPage(session);
      return;
    }

    // se siamo sulla pagina di login, inizializza il form
    if (window.location.pathname.includes('login')) {
      this.initLoginPage(session);
      return;
    }

    // su tutte le altre pagine impedisci l'accesso
    this.requireAuth(session);
  },

  // manda al login se non autenticato (provvisorio per testat)

  requireAuth(session) {
    if (!session) {
      window.location.href = '/login.html';
    }
  },

  initLoginPage(session) {
    if (session) {
      window.location.href = '/index.html';
      return;
    }

    this.setupLoginForm();
  },

  initRegisterPage(session) {
    if (session) {
      window.location.href = '/index.html';
      return;
    }

    this.setupRegisterForm();
  },

  // email o numero tessera + password

  setupLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputIdentifier = form.querySelector('input[name="n-tessera"]');
    const inputPassword   = form.querySelector('input[name="password"]');

    btnSubmit?.addEventListener('click', async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const identifier = inputIdentifier?.value.trim();
      const password   = inputPassword?.value;

      if (!identifier || !password) {
        this.showError(form, 'Compila tutti i campi.');
        this.setLoading(btnSubmit, false);
        return;
      }

      // determina se l'utente ha inserito email o numero tessera
      let email = identifier;

      if (!identifier.includes('@')) {
        // è un numero tessera: cerchiamo l'email corrispondente
        const numeroTessera = parseInt(identifier, 10);
        if (isNaN(numeroTessera)) {
          this.showError(form, 'Numero tessera non valido.');
          this.setLoading(btnSubmit, false);
          return;
        }

        const { data: utente, error: dbError } = 
        await supabase
          .from('Utente')
          .select('email, registrato')
          .eq('numero_tessera', numeroTessera)
          .single();

        if (dbError || !utente) {
          this.showError(form, 'Numero di tessera inserito non esisteste o non attivo.');
          this.setLoading(btnSubmit, false);
          return;
        }

        if (!utente.registrato) {
          this.showError(form, 'La tua tessera è valida, ma per accedere devi prima registrarti.');
          this.setLoading(btnSubmit, false);
          return;
        }
        email = utente.email;
      }

      // login con email + password
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        this.showError(form, 'Email o password errati.');
        this.setLoading(btnSubmit, false);
        return;
      }

      // login andato a buon fine
      window.location.href = '/index.html';
    });
  },


  // registrazione - numero tessera → magic link via email

  setupRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form) return;

    const btnSubmit  = form.querySelector('button[type="submit"]');
    const inputTessera = form.querySelector('input[name="n-tessera"]');

    btnSubmit?.addEventListener('click', async (e) => {
      e.preventDefault();
      this.setLoading(btnSubmit, true);
      this.clearError(form);

      const numeroTessera = parseInt(inputTessera?.value?.trim(), 10); // converti la stringa in un intero

      if (isNaN(numeroTessera)) {
        this.showError(form, 'Inserisci un numero tessera valido.');
        this.setLoading(btnSubmit, false);
        return;
      }

      // verifica che il numero tessera esista nella tabella Utente
      const { data: utente, error: dbError } = await supabase
        .from('Utente')
        .select('id_utente, email, nome')
        .eq('numero_tessera', numeroTessera)
        .single();

      if (dbError || !utente) {
        this.showError(form, 'Numero tessera non trovato. Riprova o contatta un amministratore.');
        this.setLoading(btnSubmit, false);
        return;
      }

      // invia il magic link all'email associata alla tessera nel db
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: utente.email,
        options: {
          // il magic link manda a set-password.html
          emailRedirectTo: `${window.location.origin}/set-password.html`,
          shouldCreateUser: true,
          data: {
            id_utente: utente.id_utente, // passiamo l'id per collegarlo dopo
          },
        },
      });

      if (otpError) {
        this.showError(form, 'Errore nell\'invio della mail. Riprova tra qualche minuto.');
        console.error('OTP error:', otpError.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      // mostra feedback
      this.showSuccess(
        form,
        `Abbiamo inviato un link di attivazione a ${this.maskEmail(utente.email)}. 
         Controlla la posta (anche lo spam).`
      );
      this.setLoading(btnSubmit, false);
    });
  },


  // pagina di impostazione passowrd dopo il magic link

  async initSetPassword(session) {
    const form = document.getElementById('set-password-form');
    if (!form) return;

    // se non c'è sessione, il link è scaduto o già usato
    if (!session) {
      this.showError(form, 'Il link è scaduto o già utilizzato. Richiedine uno nuovo.');
      return;
    }

    const btnSubmit = form.querySelector('button[type="submit"]');
    const inputPwd  = form.querySelector('input[name="password"]');
    const inputConf = form.querySelector('input[name="conferma-password"]');

    btnSubmit?.addEventListener('click', async (e) => {
      e.preventDefault();
      this.clearError(form);

      const pwd  = inputPwd?.value;
      const conf = inputConf?.value;

      if (!pwd || pwd.length < 8) {
        this.showError(form, 'La password deve essere di almeno 8 caratteri.');
        return;
      }

      if (pwd !== conf) {
        this.showError(form, 'Le password non coincidono.');
        return;
      }

      this.setLoading(btnSubmit, true);

      // imposta la nuova password sull'utente già autenticato via magic link
      const { error } = await supabase.auth.updateUser({ password: pwd });

      if (error) {
        this.showError(form, 'Errore nell\'impostazione della password. Riprova.');
        console.error('updateUser error:', error.message);
        this.setLoading(btnSubmit, false);
        return;
      }

      // vai alla home se tutto ok
      window.location.href = '/index.html';
    });
  },

  // logout

  async logout() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  },


  // funzioni utili

  setLoading(btn, isLoading) {
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent; // salva il testo originale
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Attendere...' : btn.dataset.label || btn.textContent;
  },

  showError(container, msg) {
    this.clearError(container);
    const el = document.createElement('span');
    el.className = 'form-error';
    el.textContent = msg;
    container.querySelector('section:last-of-type')?.prepend(el);
  },

  showSuccess(container, msg) {
    this.clearError(container);
    const el = document.createElement('span');
    el.className = 'form-success';
    el.textContent = msg;
    container.querySelector('section:last-of-type')?.prepend(el);
  },

  clearError(container) {
    container.querySelector('.form-error')?.remove();
    container.querySelector('.form-success')?.remove();
  },

  // maschera l'email per privacy
  maskEmail(email) {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  },
};

// avvia al caricamento del DOM in automatico
document.addEventListener('DOMContentLoaded', () => auth.init());

// rendi logout disponibile sempre (per il pulsante in index.html)
window.ldrLogout = () => auth.logout();

export { auth }; // rendi il file auth riconoscibile a livello di altri file
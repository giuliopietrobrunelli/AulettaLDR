-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Registrazione (
  id_utente uuid NOT NULL,
  id_amministratore uuid NOT NULL,
  data_registrazione date NOT NULL DEFAULT now(),
  CONSTRAINT Registrazione_pkey PRIMARY KEY (id_utente, id_amministratore),
  CONSTRAINT Registrazione_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.Utente (
  id_utente uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_tessera bigint NOT NULL UNIQUE,
  nome character varying NOT NULL,
  cognome character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  telefono bigint,
  facolta_universitaria character varying,
  cauzione boolean NOT NULL DEFAULT false,
  trattamento_dati boolean NOT NULL DEFAULT false,
  registrato boolean NOT NULL DEFAULT false,
  foto_profilo character varying,
  vista_predefinita character varying NOT NULL DEFAULT 'month'::character varying,
  mostra_foto_prenotazioni boolean NOT NULL DEFAULT false,
  CONSTRAINT Utente_pkey PRIMARY KEY (id_utente)
);
CREATE TABLE public.Amministratore (
  id_amministratore uuid NOT NULL DEFAULT gen_random_uuid(),
  ruolo USER-DEFINED NOT NULL,
  id_utente uuid NOT NULL,
  CONSTRAINT Amministratore_pkey PRIMARY KEY (id_amministratore),
  CONSTRAINT Amministratore_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.Prenotazione (
  id_prenotazione uuid NOT NULL DEFAULT gen_random_uuid(),
  data_creazione_prenotazione timestamp with time zone NOT NULL DEFAULT now(),
  data_conferma timestamp without time zone,
  id_turno uuid NOT NULL,
  id_utente uuid NOT NULL,
  stato USER-DEFINED NOT NULL DEFAULT 'non_confermata'::stati_prenotazione,
  data_prenotazione date NOT NULL,
  CONSTRAINT Prenotazione_pkey PRIMARY KEY (id_prenotazione),
  CONSTRAINT Prenotazione_id_turno_fkey FOREIGN KEY (id_turno) REFERENCES public.Turno(id_turno),
  CONSTRAINT Prenotazione_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.Turno (
  id_turno uuid NOT NULL DEFAULT gen_random_uuid(),
  orario_inizio time without time zone NOT NULL,
  orario_fine time without time zone NOT NULL,
  indice smallint UNIQUE,
  attivo boolean NOT NULL DEFAULT true,
  CONSTRAINT Turno_pkey PRIMARY KEY (id_turno)
);
CREATE TABLE public.Notifica (
  id_notifica uuid NOT NULL DEFAULT gen_random_uuid(),
  id_utente uuid NOT NULL,
  tipologia text NOT NULL,
  titolo text NOT NULL,
  contenuto text,
  dati jsonb,
  data_creazione timestamp without time zone DEFAULT now(),
  CONSTRAINT Notifica_pkey PRIMARY KEY (id_notifica),
  CONSTRAINT Notifica_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.PushSubscription (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_utente uuid NOT NULL,
  subscription jsonb NOT NULL,
  user_agent text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  endpoint text UNIQUE,
  CONSTRAINT PushSubscription_pkey PRIMARY KEY (id),
  CONSTRAINT PushSubscription_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.RichiestaCessione (
  id_richiesta uuid NOT NULL DEFAULT gen_random_uuid(),
  id_prenotazione uuid NOT NULL,
  id_mittente uuid NOT NULL,
  id_destinatario uuid NOT NULL,
  stato text NOT NULL DEFAULT 'in_attesa'::text CHECK (stato = ANY (ARRAY['in_attesa'::text, 'accettata'::text, 'rifiutata'::text, 'scaduta'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT RichiestaCessione_pkey PRIMARY KEY (id_richiesta),
  CONSTRAINT RichiestaCessione_id_prenotazione_fkey FOREIGN KEY (id_prenotazione) REFERENCES public.Prenotazione(id_prenotazione),
  CONSTRAINT RichiestaCessione_id_mittente_fkey FOREIGN KEY (id_mittente) REFERENCES public.Utente(id_utente),
  CONSTRAINT RichiestaCessione_id_destinatario_fkey FOREIGN KEY (id_destinatario) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.Feedback (
  id_feedback uuid NOT NULL DEFAULT gen_random_uuid(),
  id_utente uuid NOT NULL,
  categoria text NOT NULL CHECK (categoria = ANY (ARRAY['bug'::text, 'suggerimento'::text, 'domanda'::text, 'altro'::text])),
  contenuto text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  stato text DEFAULT 'non_gestito'::text,
  CONSTRAINT Feedback_pkey PRIMARY KEY (id_feedback),
  CONSTRAINT Feedback_id_utente_fkey FOREIGN KEY (id_utente) REFERENCES public.Utente(id_utente)
);
CREATE TABLE public.Impostazioni (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  valore text,
  CONSTRAINT Impostazioni_pkey PRIMARY KEY (id)
);
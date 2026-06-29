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
  indice smallint,
  CONSTRAINT Turno_pkey PRIMARY KEY (id_turno)
);
CREATE TABLE public.Blocco (
  id_blocco uuid NOT NULL DEFAULT gen_random_uuid(),
  id_prenotazione uuid NOT NULL,
  motivo character varying NOT NULL,
  CONSTRAINT Blocco_pkey PRIMARY KEY (id_blocco),
  CONSTRAINT Riservazione_id_prenotazione_fkey FOREIGN KEY (id_prenotazione) REFERENCES public.Prenotazione(id_prenotazione)
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
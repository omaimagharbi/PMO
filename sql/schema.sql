-- ============================================================
-- NEXUS — Schéma de production (Neon Postgres + pgvector)
-- À exécuter une seule fois sur votre base Neon :
--   psql "$DATABASE_URL" -f sql/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Fonctionnalité 1 — Anti-dérive : Scope Baseline
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  daily_rate_eur NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_filename TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  page_count INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_scope_baselines_project_active
  ON scope_baselines (project_id, is_active);

CREATE TABLE IF NOT EXISTS chat_scope_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_id UUID REFERENCES scope_baselines(id),
  client_message TEXT NOT NULL,
  is_scope_creep BOOLEAN NOT NULL,
  estimated_extra_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  estimated_extra_cost_eur NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rationale TEXT NOT NULL,
  raw_model_response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_scope_analyses_project
  ON chat_scope_analyses (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES chat_scope_analyses(id),
  reference_code TEXT NOT NULL,
  extra_days NUMERIC(6, 2) NOT NULL,
  extra_cost_eur NUMERIC(10, 2) NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_project
  ON change_requests (project_id, signed_at DESC);

-- ------------------------------------------------------------
-- Fonctionnalité 2 — Arbitrage des ressources
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  jira_account_id TEXT,
  github_username TEXT,
  weekly_capacity_hours NUMERIC(6, 2) NOT NULL DEFAULT 35,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  allocation_pct NUMERIC(5, 2) NOT NULL DEFAULT 100,
  UNIQUE (resource_id, project_id)
);

-- Journal brut des événements de charge réelle, alimenté par les webhooks
-- Jira (temps loggé) et GitHub (activité de code).
CREATE TABLE IF NOT EXISTS resource_load_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('jira', 'github')),
  external_event_id TEXT NOT NULL,
  hours_logged NUMERIC(6, 2) NOT NULL DEFAULT 0,
  event_date DATE NOT NULL,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_load_events_resource_date
  ON resource_load_events (resource_id, event_date DESC);

CREATE TABLE IF NOT EXISTS arbitration_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overloaded_resource_id UUID NOT NULL REFERENCES resources(id),
  proposed_source_resource_id UUID NOT NULL REFERENCES resources(id),
  transfer_pct NUMERIC(5, 2) NOT NULL,
  recommendation_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Fonctionnalité 3 — Copilote OPA (RAG avec pgvector)
-- ------------------------------------------------------------

-- Dimension 1024 = dimension native des embeddings voyage-3.
-- Si vous changez de modèle d'embedding, adaptez cette dimension.
CREATE TABLE IF NOT EXISTS opa_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_reference TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  solution TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index approximatif ivfflat pour la recherche par similarité cosinus.
-- "lists" est à recalibrer selon le volume (règle usuelle : sqrt(nb_lignes)).
CREATE INDEX IF NOT EXISTS idx_opa_lessons_embedding
  ON opa_lessons USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ------------------------------------------------------------
-- Données de démarrage (facultatif, pour retrouver l'état de la démo)
-- ------------------------------------------------------------

INSERT INTO projects (name, daily_rate_eur)
VALUES ('AtlasApp', 500.00), ('Projet B', 450.00)
ON CONFLICT DO NOTHING;

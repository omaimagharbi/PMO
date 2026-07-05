-- ============================================================
-- NEXUS — Migration 002 : Briques d'innovation
-- À exécuter après sql/schema.sql :
--   psql "$DATABASE_URL" -f sql/migrations/002_innovation_features.sql
-- ============================================================

-- ------------------------------------------------------------
-- Résolution du projet à partir des webhooks externes
-- ------------------------------------------------------------

ALTER TABLE projects ADD COLUMN IF NOT EXISTS jira_project_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_full_name TEXT;

-- ------------------------------------------------------------
-- Piste 1 — EVM prédictif (CPI / SPI + projection Claude)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planned_start_day INTEGER NOT NULL,
  planned_duration_days NUMERIC(6, 2) NOT NULL,
  planned_cost_eur NUMERIC(10, 2) NOT NULL,
  pct_complete NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (pct_complete BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks (project_id);

-- Permet de relier les heures réellement loggées (Jira/GitHub) à un projet,
-- ce qui n'était pas obligatoire jusqu'ici (project_id nullable dans
-- resource_load_events). Nécessaire pour calculer le Coût Réel (AC).
CREATE TABLE IF NOT EXISTS project_start_dates (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  started_on DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS evm_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  planned_value_eur NUMERIC(10, 2) NOT NULL,
  earned_value_eur NUMERIC(10, 2) NOT NULL,
  actual_cost_eur NUMERIC(10, 2) NOT NULL,
  cpi NUMERIC(6, 3) NOT NULL,
  spi NUMERIC(6, 3) NOT NULL,
  projected_overrun_date DATE,
  projection_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evm_snapshots_project ON evm_snapshots (project_id, created_at DESC);

-- ------------------------------------------------------------
-- Piste 2 — Mémoire auto-alimentée (brouillons OPA à valider)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS opa_lesson_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('change_request', 'manual')),
  source_reference_id UUID,
  project_reference TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  solution TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opa_lesson_drafts_status ON opa_lesson_drafts (status, created_at DESC);

-- ------------------------------------------------------------
-- Piste 3 — Score de confiance humain sur chaque recommandation
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('scope_creep', 'arbitration', 'opa_alert')),
  reference_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON ai_recommendation_feedback (recommendation_type, created_at DESC);

-- ------------------------------------------------------------
-- Piste 4 — Simulateur "et si" (aucune table nécessaire : le
-- simulateur lit resource_assignments et resources déjà existants
-- en lecture seule, sans jamais écrire de résultat simulé en base).
-- ------------------------------------------------------------

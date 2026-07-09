-- ============================================================
-- NEXUS — Migration 003 : Fondations multi-clients (Phase 1)
-- À exécuter après sql/schema.sql et sql/migrations/002_innovation_features.sql :
--   psql "$DATABASE_URL" -f sql/migrations/003_multi_tenant_foundations.sql
-- ============================================================

-- ------------------------------------------------------------
-- Comptes utilisateurs (remplace le mot de passe unique ADMIN_PASSWORD)
-- ------------------------------------------------------------
-- role = 'admin'  : toi (Catalyste) — accès à tous les projets, à l'onglet
--                   05 Gestion, et à la création de comptes clients.
-- role = 'client' : un client — accès restreint aux projets listés dans
--                   user_projects (le cloisonnement réel arrive en Phase 2 ;
--                   cette table existe déjà pour ne pas avoir à re-migrer).

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Association utilisateur ↔ projet(s) visibles
-- ------------------------------------------------------------
-- Un compte 'admin' n'a pas besoin de ligne ici (il voit tout par rôle).
-- Un compte 'client' doit avoir au moins une ligne pour voir un projet
-- une fois le cloisonnement de la Phase 2 activé.

CREATE TABLE IF NOT EXISTS user_projects (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_projects_project ON user_projects (project_id);

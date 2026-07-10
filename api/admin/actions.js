const bcrypt = require('bcryptjs');
const { query } = require('../_lib/db');
const { requireAuth, requireAdmin } = require('../_lib/auth');

/* ============================================================
   COMPTES CLIENTS (Phase 4)
============================================================ */

async function handleCreateClientAccount(req, res) {
  const { email, password, projectId, fullName } = req.body || {};

  if (!email || !email.trim() || !password || !projectId) {
    res.status(400).json({ error: 'Les champs "email", "password" et "projectId" sont requis.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, 'client', $3)
       RETURNING id, email, role, full_name`,
      [email.trim().toLowerCase(), passwordHash, fullName || null]
    );
    const user = userResult.rows[0];

    await query(
      `INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, projectId]
    );

    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name } });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: `Un compte existe déjà avec l'email "${email}".` });
      return;
    }
    res.status(500).json({ error: 'Erreur de création du compte client : ' + err.message });
  }
}

async function handleListClientAccounts(req, res) {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.created_at,
              COALESCE(json_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS project_names
       FROM users u
       LEFT JOIN user_projects up ON up.user_id = u.id
       LEFT JOIN projects p ON p.id = up.project_id
       WHERE u.role = 'client'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.status(200).json({ clients: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des comptes clients : ' + err.message });
  }
}

/* ============================================================
   PROJETS
============================================================ */

async function handleListProjects(req, res, user) {
  try {
    // Un admin voit tout le portefeuille. Un client ne voit que les projets
    // qui lui ont été explicitement accordés dans user_projects — utilisé
    // par le sélecteur de projet en haut de page, accessible à tout compte
    // authentifié (contrairement aux autres actions de cet onglet, réservées
    // aux admins).
    const result = user.role === 'admin'
      ? await query(
          `SELECT id, name, daily_rate_eur, jira_project_key, github_repo_full_name, created_at
           FROM projects
           ORDER BY created_at DESC`
        )
      : await query(
          `SELECT p.id, p.name, p.daily_rate_eur, p.jira_project_key, p.github_repo_full_name, p.created_at
           FROM projects p
           JOIN user_projects up ON up.project_id = p.id
           WHERE up.user_id = $1
           ORDER BY p.created_at DESC`,
          [user.sub]
        );
    res.status(200).json({ projects: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des projets : ' + err.message });
  }
}

async function handleCreateProject(req, res) {
  const { name, dailyRateEur } = req.body || {};

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Le champ "name" est requis.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO projects (name, daily_rate_eur)
       VALUES ($1, $2)
       RETURNING id, name, daily_rate_eur, created_at`,
      [name.trim(), dailyRateEur ? Number(dailyRateEur) : 500.0]
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de création du projet : ' + err.message });
  }
}

async function handleUpdateIntegrations(req, res) {
  const { projectId, jiraProjectKey, githubRepoFullName } = req.body || {};

  if (!projectId) {
    res.status(400).json({ error: 'Le champ "projectId" est requis.' });
    return;
  }

  try {
    const result = await query(
      `UPDATE projects
       SET jira_project_key = $2, github_repo_full_name = $3
       WHERE id = $1
       RETURNING id, name, jira_project_key, github_repo_full_name`,
      [projectId, jiraProjectKey || null, githubRepoFullName || null]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Projet introuvable.' });
      return;
    }

    res.status(200).json({ project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de mise à jour du projet : ' + err.message });
  }
}

/* ============================================================
   RESSOURCES (équipe)
============================================================ */

async function handleListResources(req, res) {
  try {
    const result = await query(
      `SELECT r.id, r.full_name, r.role, r.weekly_capacity_hours, r.jira_account_id, r.github_username,
              COALESCE(
                json_agg(
                  json_build_object('projectId', ra.project_id, 'projectName', p.name, 'allocationPct', ra.allocation_pct)
                ) FILTER (WHERE ra.project_id IS NOT NULL), '[]'
              ) AS assignments
       FROM resources r
       LEFT JOIN resource_assignments ra ON ra.resource_id = r.id
       LEFT JOIN projects p ON p.id = ra.project_id
       GROUP BY r.id
       ORDER BY r.full_name`
    );
    res.status(200).json({ resources: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des ressources : ' + err.message });
  }
}

async function handleCreateResource(req, res) {
  const { fullName, role, weeklyCapacityHours, jiraAccountId, githubUsername } = req.body || {};

  if (!fullName || !fullName.trim() || !role || !role.trim()) {
    res.status(400).json({ error: 'Les champs "fullName" et "role" sont requis.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO resources (full_name, role, weekly_capacity_hours, jira_account_id, github_username)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, role, weekly_capacity_hours`,
      [fullName.trim(), role.trim(), weeklyCapacityHours ? Number(weeklyCapacityHours) : 35, jiraAccountId || null, githubUsername || null]
    );
    res.status(201).json({ resource: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de création de la ressource : ' + err.message });
  }
}

async function handleAssignResource(req, res) {
  const { resourceId, projectId, allocationPct } = req.body || {};

  if (!resourceId || !projectId) {
    res.status(400).json({ error: 'Les champs "resourceId" et "projectId" sont requis.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO resource_assignments (resource_id, project_id, allocation_pct)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_id, project_id)
       DO UPDATE SET allocation_pct = EXCLUDED.allocation_pct
       RETURNING id, resource_id, project_id, allocation_pct`,
      [resourceId, projectId, allocationPct ? Number(allocationPct) : 100]
    );
    res.status(200).json({ assignment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Erreur d'assignation de la ressource : " + err.message });
  }
}

/* ============================================================
   BASELINE EVM (tâches + date de démarrage)
============================================================ */

async function handleCreateTask(req, res) {
  const { projectId, name, plannedStartDay, plannedDurationDays, plannedCostEur, pctComplete } = req.body || {};

  if (!projectId || !name || !name.trim() || plannedStartDay === undefined || plannedDurationDays === undefined || plannedCostEur === undefined) {
    res.status(400).json({
      error: 'Les champs "projectId", "name", "plannedStartDay", "plannedDurationDays" et "plannedCostEur" sont requis.'
    });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO project_tasks (project_id, name, planned_start_day, planned_duration_days, planned_cost_eur, pct_complete)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, name, planned_start_day, planned_duration_days, planned_cost_eur, pct_complete`,
      [projectId, name.trim(), Number(plannedStartDay), Number(plannedDurationDays), Number(plannedCostEur), pctComplete ? Number(pctComplete) : 0]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de création de la tâche : ' + err.message });
  }
}

async function handleSetStartDate(req, res) {
  const { projectId, startedOn } = req.body || {};

  if (!projectId || !startedOn) {
    res.status(400).json({ error: 'Les champs "projectId" et "startedOn" (format AAAA-MM-JJ) sont requis.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO project_start_dates (project_id, started_on)
       VALUES ($1, $2)
       ON CONFLICT (project_id)
       DO UPDATE SET started_on = EXCLUDED.started_on
       RETURNING project_id, started_on`,
      [projectId, startedOn]
    );
    res.status(200).json({ startDate: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur d\'enregistrement de la date de démarrage : ' + err.message });
  }
}

/* ============================================================
   ROUTAGE
============================================================ */

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const action = req.query.action || (req.body || {}).action;

  // list-projects reste accessible à tout compte connecté (alimente le
  // sélecteur de projet en haut de page). Toutes les autres actions de cet
  // onglet créent/modifient des données et restent réservées aux admins.
  if (req.method === 'GET' && action === 'list-projects') return handleListProjects(req, res, user);

  if (!requireAdmin(res, user)) return;
  if (req.method === 'POST' && action === 'create-project') return handleCreateProject(req, res);
  if (req.method === 'POST' && action === 'update-integrations') return handleUpdateIntegrations(req, res);

  if (req.method === 'GET' && action === 'list-resources') return handleListResources(req, res);
  if (req.method === 'POST' && action === 'create-resource') return handleCreateResource(req, res);
  if (req.method === 'POST' && action === 'assign-resource') return handleAssignResource(req, res);

  if (req.method === 'POST' && action === 'create-task') return handleCreateTask(req, res);
  if (req.method === 'POST' && action === 'set-start-date') return handleSetStartDate(req, res);
  if (req.method === 'GET' && action === 'list-client-accounts') return handleListClientAccounts(req, res);
  if (req.method === 'POST' && action === 'create-client-account') return handleCreateClientAccount(req, res);

  res.status(400).json({
    error: 'Combinaison méthode/action invalide. Actions disponibles : list-projects (GET), create-project (POST), ' +
      'update-integrations (POST), list-resources (GET), create-resource (POST), assign-resource (POST), ' +
      'create-task (POST), set-start-date (POST), list-client-accounts (GET), create-client-account (POST).'
  });
};

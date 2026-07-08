const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

/* ============================================================
   PROJETS
============================================================ */

async function handleListProjects(req, res) {
  try {
    const result = await query(
      `SELECT id, name, daily_rate_eur, jira_project_key, github_repo_full_name, created_at
       FROM projects
       ORDER BY created_at DESC`
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
  if (!requireAuth(req, res)) return;

  const action = req.query.action || (req.body || {}).action;

  if (req.method === 'GET' && action === 'list-projects') return handleListProjects(req, res);
  if (req.method === 'POST' && action === 'create-project') return handleCreateProject(req, res);
  if (req.method === 'POST' && action === 'update-integrations') return handleUpdateIntegrations(req, res);

  if (req.method === 'GET' && action === 'list-resources') return handleListResources(req, res);
  if (req.method === 'POST' && action === 'create-resource') return handleCreateResource(req, res);
  if (req.method === 'POST' && action === 'assign-resource') return handleAssignResource(req, res);

  if (req.method === 'POST' && action === 'create-task') return handleCreateTask(req, res);
  if (req.method === 'POST' && action === 'set-start-date') return handleSetStartDate(req, res);

  res.status(400).json({
    error: 'Combinaison méthode/action invalide. Actions disponibles : list-projects (GET), create-project (POST), ' +
      'update-integrations (POST), list-resources (GET), create-resource (POST), assign-resource (POST), ' +
      'create-task (POST), set-start-date (POST).'
  });
};

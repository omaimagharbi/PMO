const { query } = require('../_lib/db');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth } = require('../_lib/auth');

const SYSTEM_PROMPT = `Tu es un contrôleur de gestion de projet certifié PMP, spécialiste de l'Earned Value Management (EVM).
On te fournit les indices CPI (Cost Performance Index) et SPI (Schedule Performance Index) actuels d'un projet,
son budget total, sa durée planifiée, et sa date de début. Ta mission : projeter, si la tendance actuelle se maintient,
une date probable de dépassement budgétaire (si CPI < 1) et une explication claire en français.

Réponds STRICTEMENT en JSON, sans texte autour, avec ces clés :
{
  "projected_overrun_date": string au format YYYY-MM-DD, ou null si CPI >= 1 (pas de dépassement prévu),
  "rationale": string (2-3 phrases en français, expliquant le raisonnement à un chef de projet)
}`;

async function computeEvm(projectId) {
  const projectResult = await query(
    `SELECT p.daily_rate_eur, s.started_on
     FROM projects p
     LEFT JOIN project_start_dates s ON s.project_id = p.id
     WHERE p.id = $1`,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    throw new Error('Projet introuvable.');
  }

  const dailyRate = Number(projectResult.rows[0].daily_rate_eur);
  const startedOn = projectResult.rows[0].started_on || new Date();
  const today = new Date();
  const elapsedDays = Math.max(0, Math.floor((today - new Date(startedOn)) / (1000 * 60 * 60 * 24)));

  const tasksResult = await query(
    `SELECT planned_start_day, planned_duration_days, planned_cost_eur, pct_complete
     FROM project_tasks WHERE project_id = $1`,
    [projectId]
  );

  if (tasksResult.rows.length === 0) {
    throw new Error('Aucune tâche de baseline définie pour ce projet (table project_tasks vide).');
  }

  let plannedValue = 0;
  let earnedValue = 0;
  let totalPlannedCost = 0;
  let totalPlannedDays = 0;

  tasksResult.rows.forEach((task) => {
    const start = Number(task.planned_start_day);
    const duration = Number(task.planned_duration_days);
    const cost = Number(task.planned_cost_eur);
    const pctComplete = Number(task.pct_complete) / 100;

    totalPlannedCost += cost;
    totalPlannedDays = Math.max(totalPlannedDays, start + duration);

    const taskEnd = start + duration;
    let elapsedFraction = 0;
    if (elapsedDays >= taskEnd) {
      elapsedFraction = 1;
    } else if (elapsedDays > start) {
      elapsedFraction = (elapsedDays - start) / duration;
    }
    plannedValue += cost * elapsedFraction;
    earnedValue += cost * pctComplete;
  });

  const actualCostResult = await query(
    `SELECT COALESCE(SUM(hours_logged), 0) AS total_hours FROM resource_load_events WHERE project_id = $1`,
    [projectId]
  );
  const totalHours = Number(actualCostResult.rows[0].total_hours);
  const actualCost = Math.round(totalHours * (dailyRate / 8) * 100) / 100;

  const cpi = actualCost > 0 ? Math.round((earnedValue / actualCost) * 1000) / 1000 : 1;
  const spi = plannedValue > 0 ? Math.round((earnedValue / plannedValue) * 1000) / 1000 : 1;

  return {
    plannedValueEur: Math.round(plannedValue * 100) / 100,
    earnedValueEur: Math.round(earnedValue * 100) / 100,
    actualCostEur: actualCost,
    cpi, spi, totalPlannedCost, totalPlannedDays, startedOn, dailyRate
  };
}

async function handleSnapshotGet(req, res) {
  const projectId = req.query.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Le paramètre "projectId" est requis.' });
    return;
  }

  try {
    const evm = await computeEvm(projectId);
    res.status(200).json({
      plannedValueEur: evm.plannedValueEur,
      earnedValueEur: evm.earnedValueEur,
      actualCostEur: evm.actualCostEur,
      cpi: evm.cpi,
      spi: evm.spi
    });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
}

async function handleSnapshotPost(req, res) {
  const projectId = req.query.projectId || (req.body || {}).projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Le paramètre "projectId" est requis.' });
    return;
  }

  let evm;
  try {
    evm = await computeEvm(projectId);
  } catch (err) {
    res.status(422).json({ error: err.message });
    return;
  }

  let projection;
  try {
    projection = await askForStructuredJSON(
      SYSTEM_PROMPT,
      `CPI actuel : ${evm.cpi}
SPI actuel : ${evm.spi}
Budget total planifié : ${evm.totalPlannedCost} €
Durée totale planifiée : ${evm.totalPlannedDays} jours
Date de démarrage du projet : ${evm.startedOn}
Date du jour : ${new Date().toISOString().slice(0, 10)}`,
      400
    );
  } catch (err) {
    res.status(502).json({ error: "Échec de la projection Claude : " + err.message });
    return;
  }

  try {
    const insertResult = await query(
      `INSERT INTO evm_snapshots
         (project_id, planned_value_eur, earned_value_eur, actual_cost_eur, cpi, spi, projected_overrun_date, projection_rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [projectId, evm.plannedValueEur, evm.earnedValueEur, evm.actualCostEur, evm.cpi, evm.spi, projection.projected_overrun_date, projection.rationale]
    );

    res.status(200).json({
      snapshotId: insertResult.rows[0].id,
      plannedValueEur: evm.plannedValueEur,
      earnedValueEur: evm.earnedValueEur,
      actualCostEur: evm.actualCostEur,
      cpi: evm.cpi,
      spi: evm.spi,
      projectedOverrunDate: projection.projected_overrun_date,
      rationale: projection.rationale
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement du snapshot EVM : " + err.message });
  }
}

async function handleUpdateTask(req, res) {
  const { taskId, pctComplete } = req.body || {};

  if (!taskId || pctComplete === undefined) {
    res.status(400).json({ error: 'Les champs "taskId" et "pctComplete" sont requis.' });
    return;
  }

  const pct = Number(pctComplete);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    res.status(400).json({ error: 'Le champ "pctComplete" doit être un nombre entre 0 et 100.' });
    return;
  }

  try {
    const result = await query(
      `UPDATE project_tasks SET pct_complete = $1, updated_at = now() WHERE id = $2 RETURNING id, name, pct_complete`,
      [pct, taskId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Tâche introuvable.' });
      return;
    }

    res.status(200).json({ taskId: result.rows[0].id, name: result.rows[0].name, pctComplete: Number(result.rows[0].pct_complete) });
  } catch (err) {
    res.status(500).json({ error: "Échec de la mise à jour de l'avancement : " + err.message });
  }
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const action = req.query.action || (req.body || {}).action;

  if (req.method === 'GET' && action === 'snapshot') return handleSnapshotGet(req, res);
  if (req.method === 'POST' && action === 'snapshot') return handleSnapshotPost(req, res);
  if (req.method === 'POST' && action === 'update-task') return handleUpdateTask(req, res);

  res.status(400).json({ error: 'Combinaison méthode/action invalide. Utilisez ?action=snapshot (GET/POST) ou update-task (POST).' });
};

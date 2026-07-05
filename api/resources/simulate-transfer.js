const { query } = require('../_lib/db');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth } = require('../_lib/auth');

const LOAD_WINDOW_DAYS = 7;

const SYSTEM_PROMPT = `Tu es un contrôleur de portefeuille de projets PMP. On te donne une simulation hypothétique
de transfert de charge d'une ressource, et la liste de TOUS les projets sur lesquels cette ressource est actuellement
allouée. Ta mission : rédiger un avertissement d'impact concis sur les projets qui ne sont PAS directement concernés
par ce transfert, si leur allocation risque d'être affectée.

Réponds STRICTEMENT en JSON avec ces clés :
{
  "has_side_effect": boolean,
  "impact_narrative": string (2-3 phrases en français, citant les projets concernés par leur nom)
}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { resourceId, hypotheticalTransferPct } = req.body || {};

  if (!resourceId || hypotheticalTransferPct === undefined) {
    res.status(400).json({ error: 'Les champs "resourceId" et "hypotheticalTransferPct" sont requis.' });
    return;
  }

  const transferPct = Number(hypotheticalTransferPct);
  if (Number.isNaN(transferPct) || transferPct < 0 || transferPct > 100) {
    res.status(400).json({ error: 'Le champ "hypotheticalTransferPct" doit être un nombre entre 0 et 100.' });
    return;
  }

  let currentLoad;
  let assignments;
  try {
    const loadResult = await query(
      `SELECT
         r.id, r.full_name, r.role, r.weekly_capacity_hours,
         COALESCE(SUM(e.hours_logged), 0) AS actual_hours
       FROM resources r
       LEFT JOIN resource_load_events e
         ON e.resource_id = r.id AND e.event_date >= (CURRENT_DATE - $2::int)
       WHERE r.id = $1
       GROUP BY r.id, r.full_name, r.role, r.weekly_capacity_hours`,
      [resourceId, LOAD_WINDOW_DAYS]
    );

    if (loadResult.rows.length === 0) {
      res.status(404).json({ error: 'Ressource introuvable.' });
      return;
    }

    const row = loadResult.rows[0];
    const capacity = Number(row.weekly_capacity_hours);
    const actual = Number(row.actual_hours);
    currentLoad = {
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      capacityHours: capacity,
      actualHours: actual,
      currentLoadPct: capacity > 0 ? Math.round((actual / capacity) * 10000) / 100 : 0
    };

    const assignmentsResult = await query(
      `SELECT ra.project_id, p.name AS project_name, ra.allocation_pct
       FROM resource_assignments ra
       JOIN projects p ON p.id = ra.project_id
       WHERE ra.resource_id = $1`,
      [resourceId]
    );
    assignments = assignmentsResult.rows;
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture en base : ' + err.message });
    return;
  }

  // Simulation purement arithmétique — aucune écriture en base.
  const simulatedLoadPct = Math.max(0, Math.round((currentLoad.currentLoadPct - transferPct) * 100) / 100);

  let impact = { has_side_effect: false, impact_narrative: "Aucun autre projet du portefeuille n'est actuellement associé à cette ressource." };

  if (assignments.length > 1) {
    try {
      impact = await askForStructuredJSON(
        SYSTEM_PROMPT,
        `Ressource : ${currentLoad.fullName} (${currentLoad.role})
Charge actuelle : ${currentLoad.currentLoadPct}%
Transfert hypothétique simulé : -${transferPct}%
Charge simulée après transfert : ${simulatedLoadPct}%

Projets sur lesquels cette ressource est actuellement allouée :
${assignments.map((a) => `- ${a.project_name} : ${a.allocation_pct}% d'allocation`).join('\n')}`,
        400
      );
    } catch (err) {
      res.status(502).json({ error: "Échec de l'analyse d'impact Claude : " + err.message });
      return;
    }
  }

  res.status(200).json({
    resource: currentLoad,
    simulatedLoadPct,
    transferPct,
    otherProjectAssignments: assignments,
    hasSideEffect: impact.has_side_effect,
    impactNarrative: impact.impact_narrative,
    simulationOnly: true
  });
};

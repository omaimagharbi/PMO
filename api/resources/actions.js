const { query } = require('../_lib/db');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { recordFeedback } = require('../_lib/feedback');

const LOAD_WINDOW_DAYS = 7;
const OVERLOAD_THRESHOLD_PCT = 100;

const ARBITRATE_SYSTEM_PROMPT = `Tu es un assistant d'arbitrage de charge pour un chef de projet PMP.
On te fournit la liste des ressources en surcharge et la liste des ressources disponibles sur d'autres projets du portefeuille.
Propose UN SEUL transfert de charge, réaliste et justifié par les compétences (role).

Réponds STRICTEMENT en JSON, sans texte autour, avec ces clés :
{
  "overloaded_resource_id": string,
  "source_resource_id": string,
  "transfer_pct": number (entre 5 et 50),
  "recommendation_text": string (2-3 phrases en français, professionnelles, citant les deux personnes et les deux projets)
}`;

const SIMULATE_SYSTEM_PROMPT = `Tu es un contrôleur de portefeuille de projets PMP. On te donne une simulation hypothétique
de transfert de charge d'une ressource, et la liste de TOUS les projets sur lesquels cette ressource est actuellement
allouée. Ta mission : rédiger un avertissement d'impact concis sur les projets qui ne sont PAS directement concernés
par ce transfert, si leur allocation risque d'être affectée.

Réponds STRICTEMENT en JSON avec ces clés :
{
  "has_side_effect": boolean,
  "impact_narrative": string (2-3 phrases en français, citant les projets concernés par leur nom)
}`;

async function computeLoadPercentages() {
  const result = await query(
    `SELECT
       r.id, r.full_name, r.role, r.weekly_capacity_hours,
       COALESCE(SUM(e.hours_logged), 0) AS actual_hours
     FROM resources r
     LEFT JOIN resource_load_events e
       ON e.resource_id = r.id AND e.event_date >= (CURRENT_DATE - $1::int)
     GROUP BY r.id, r.full_name, r.role, r.weekly_capacity_hours
     ORDER BY r.full_name`,
    [LOAD_WINDOW_DAYS]
  );

  return result.rows.map((row) => {
    const capacity = Number(row.weekly_capacity_hours);
    const actual = Number(row.actual_hours);
    const loadPct = capacity > 0 ? Math.round((actual / capacity) * 10000) / 100 : 0;
    return { id: row.id, fullName: row.full_name, role: row.role, capacityHours: capacity, actualHours: actual, loadPct };
  });
}

async function handleArbitrateGet(req, res) {
  let loads;
  try {
    loads = await computeLoadPercentages();
  } catch (err) {
    res.status(500).json({ error: 'Erreur de calcul de charge : ' + err.message });
    return;
  }
  res.status(200).json({ windowDays: LOAD_WINDOW_DAYS, resources: loads });
}

async function handleArbitratePost(req, res) {
  let loads;
  try {
    loads = await computeLoadPercentages();
  } catch (err) {
    res.status(500).json({ error: 'Erreur de calcul de charge : ' + err.message });
    return;
  }

  const overloaded = loads.filter((r) => r.loadPct > OVERLOAD_THRESHOLD_PCT);
  const available = loads.filter((r) => r.loadPct <= 70);

  if (overloaded.length === 0) {
    res.status(200).json({ arbitrationNeeded: false, resources: loads });
    return;
  }

  if (available.length === 0) {
    res.status(200).json({
      arbitrationNeeded: true,
      resources: loads,
      warning: 'Aucune ressource disponible avec suffisamment de marge dans le portefeuille actuel.'
    });
    return;
  }

  let recommendation;
  try {
    recommendation = await askForStructuredJSON(
      ARBITRATE_SYSTEM_PROMPT,
      `RESSOURCES EN SURCHARGE :
${JSON.stringify(overloaded, null, 2)}

RESSOURCES DISPONIBLES SUR LE PORTEFEUILLE :
${JSON.stringify(available, null, 2)}`,
      500
    );
  } catch (err) {
    res.status(502).json({ error: "Échec de l'appel au modèle Claude pour l'arbitrage : " + err.message });
    return;
  }

  try {
    const insertResult = await query(
      `INSERT INTO arbitration_recommendations
         (overloaded_resource_id, proposed_source_resource_id, transfer_pct, recommendation_text, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, created_at`,
      [recommendation.overloaded_resource_id, recommendation.source_resource_id, recommendation.transfer_pct, recommendation.recommendation_text]
    );

    res.status(200).json({
      arbitrationNeeded: true,
      resources: loads,
      recommendationId: insertResult.rows[0].id,
      recommendation
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de la recommandation : " + err.message });
  }
}

async function handleResolveArbitration(req, res) {
  const { recommendationId, decision } = req.body || {};

  if (!recommendationId || !['validated', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Les champs "recommendationId" et "decision" (validated|rejected) sont requis.' });
    return;
  }

  try {
    const result = await query(
      `UPDATE arbitration_recommendations
       SET status = $1, resolved_at = now()
       WHERE id = $2 AND status = 'pending'
       RETURNING id, overloaded_resource_id, proposed_source_resource_id, transfer_pct, status`,
      [decision, recommendationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Recommandation introuvable ou déjà résolue.' });
      return;
    }

    try {
      await recordFeedback('arbitration', recommendationId, decision === 'validated' ? 'accepted' : 'rejected');
    } catch (feedbackErr) {
      console.error('Échec de l\'enregistrement du feedback : ' + feedbackErr.message);
    }

    res.status(200).json({
      recommendationId: result.rows[0].id,
      status: result.rows[0].status,
      note: decision === 'validated'
        ? "Décision enregistrée. La charge affichée se recalculera automatiquement dès que les prochains événements Jira/GitHub refléteront le transfert — elle n'est pas falsifiée rétroactivement."
        : 'Décision de refus enregistrée.'
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de la mise à jour de la recommandation : " + err.message });
  }
}

async function handleSimulateTransfer(req, res) {
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

  const simulatedLoadPct = Math.max(0, Math.round((currentLoad.currentLoadPct - transferPct) * 100) / 100);

  let impact = { has_side_effect: false, impact_narrative: "Aucun autre projet du portefeuille n'est actuellement associé à cette ressource." };

  if (assignments.length > 1) {
    try {
      impact = await askForStructuredJSON(
        SIMULATE_SYSTEM_PROMPT,
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
}

module.exports = async function handler(req, res) {
  // Cet endpoint expose volontairement une vue CROISÉE de tout le portefeuille
  // (charge de toutes les ressources, tous projets confondus) pour permettre
  // l'arbitrage. Un compte 'client' ne doit jamais voir la charge d'un autre
  // client : on réserve donc tout le Scénario 02 aux comptes admin pour
  // l'instant. Une vue "ma charge sur mon projet uniquement" pour les clients
  // pourra être ajoutée séparément si besoin (Phase 3+).
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireAdmin(res, user)) return;

  const action = req.query.action || (req.body || {}).action;

  if (req.method === 'GET' && action === 'arbitrate') return handleArbitrateGet(req, res);
  if (req.method === 'POST' && action === 'arbitrate') return handleArbitratePost(req, res);
  if (req.method === 'POST' && action === 'resolve-arbitration') return handleResolveArbitration(req, res);
  if (req.method === 'POST' && action === 'simulate-transfer') return handleSimulateTransfer(req, res);

  res.status(400).json({ error: 'Combinaison méthode/action invalide. Utilisez ?action=arbitrate (GET/POST), resolve-arbitration (POST) ou simulate-transfer (POST).' });
};

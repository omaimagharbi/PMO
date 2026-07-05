const { query } = require('../_lib/db');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth } = require('../_lib/auth');

const LOAD_WINDOW_DAYS = 7;
const OVERLOAD_THRESHOLD_PCT = 100;

const SYSTEM_PROMPT = `Tu es un assistant d'arbitrage de charge pour un chef de projet PMP.
On te fournit la liste des ressources en surcharge et la liste des ressources disponibles sur d'autres projets du portefeuille.
Propose UN SEUL transfert de charge, réaliste et justifié par les compétences (role).

Réponds STRICTEMENT en JSON, sans texte autour, avec ces clés :
{
  "overloaded_resource_id": string,
  "source_resource_id": string,
  "transfer_pct": number (entre 5 et 50),
  "recommendation_text": string (2-3 phrases en français, professionnelles, citant les deux personnes et les deux projets)
}`;

/**
 * Calcule la charge réelle (Actual load) de chaque ressource sur les
 * LOAD_WINDOW_DAYS derniers jours, à partir des événements Jira/GitHub,
 * rapportée à sa capacité hebdomadaire déclarée (Capacity).
 */
async function computeLoadPercentages() {
  const result = await query(
    `SELECT
       r.id,
       r.full_name,
       r.role,
       r.weekly_capacity_hours,
       COALESCE(SUM(e.hours_logged), 0) AS actual_hours
     FROM resources r
     LEFT JOIN resource_load_events e
       ON e.resource_id = r.id
       AND e.event_date >= (CURRENT_DATE - $1::int)
     GROUP BY r.id, r.full_name, r.role, r.weekly_capacity_hours
     ORDER BY r.full_name`,
    [LOAD_WINDOW_DAYS]
  );

  return result.rows.map((row) => {
    const capacity = Number(row.weekly_capacity_hours);
    const actual = Number(row.actual_hours);
    const loadPct = capacity > 0 ? Math.round((actual / capacity) * 10000) / 100 : 0;
    return {
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      capacityHours: capacity,
      actualHours: actual,
      loadPct
    };
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez GET ou POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  let loads;
  try {
    loads = await computeLoadPercentages();
  } catch (err) {
    res.status(500).json({ error: 'Erreur de calcul de charge : ' + err.message });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ windowDays: LOAD_WINDOW_DAYS, resources: loads });
    return;
  }

  // POST : déclenche la génération d'une recommandation d'arbitrage.
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
      SYSTEM_PROMPT,
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
      [
        recommendation.overloaded_resource_id,
        recommendation.source_resource_id,
        recommendation.transfer_pct,
        recommendation.recommendation_text
      ]
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
};

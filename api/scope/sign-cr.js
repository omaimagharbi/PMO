const { query } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const { analysisId } = req.body || {};

  if (!analysisId) {
    res.status(400).json({ error: 'Le champ "analysisId" est requis (identifiant retourné par /api/scope/analyze-message).' });
    return;
  }

  let analysis;
  try {
    const result = await query(
      `SELECT id, project_id, estimated_extra_days, estimated_extra_cost_eur, is_scope_creep
       FROM chat_scope_analyses WHERE id = $1`,
      [analysisId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Analyse introuvable.' });
      return;
    }
    analysis = result.rows[0];
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture en base : ' + err.message });
    return;
  }

  if (!analysis.is_scope_creep) {
    res.status(422).json({ error: "Cette analyse n'a pas été qualifiée de dérive de périmètre, aucune CR à signer." });
    return;
  }

  const referenceCode = 'CR-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

  try {
    const insertResult = await query(
      `INSERT INTO change_requests (project_id, analysis_id, reference_code, extra_days, extra_cost_eur)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, reference_code, signed_at`,
      [analysis.project_id, analysis.id, referenceCode, analysis.estimated_extra_days, analysis.estimated_extra_cost_eur]
    );

    res.status(201).json({
      changeRequestId: insertResult.rows[0].id,
      referenceCode: insertResult.rows[0].reference_code,
      signedAt: insertResult.rows[0].signed_at,
      extraDays: Number(analysis.estimated_extra_days),
      extraCostEur: Number(analysis.estimated_extra_cost_eur)
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de la CR : " + err.message });
  }
};

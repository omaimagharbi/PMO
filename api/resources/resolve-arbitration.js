const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { recordFeedback } = require('../_lib/feedback');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { recommendationId, decision } = req.body || {};

  if (!recommendationId || !['validated', 'rejected'].includes(decision)) {
    res.status(400).json({
      error: 'Les champs "recommendationId" et "decision" (validated|rejected) sont requis.'
    });
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
};

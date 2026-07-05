const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { recordFeedback } = require('../_lib/feedback');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { analysisId } = req.body || {};

  if (!analysisId) {
    res.status(400).json({ error: 'Le champ "analysisId" est requis.' });
    return;
  }

  try {
    const result = await query(`SELECT id FROM chat_scope_analyses WHERE id = $1`, [analysisId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Analyse introuvable.' });
      return;
    }

    await recordFeedback('scope_creep', analysisId, 'rejected');
    res.status(200).json({ analysisId, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement du refus : " + err.message });
  }
};

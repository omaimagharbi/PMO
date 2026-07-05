const { requireAuth } = require('../_lib/auth');
const { recordFeedback } = require('../_lib/feedback');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { lessonId, decision } = req.body || {};

  if (!lessonId || !['accepted', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Les champs "lessonId" et "decision" (accepted|rejected) sont requis.' });
    return;
  }

  try {
    await recordFeedback('opa_alert', lessonId, decision);
    res.status(200).json({ lessonId, decision });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement du feedback : " + err.message });
  }
};

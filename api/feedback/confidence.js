const { requireAuth } = require('../_lib/auth');
const { getConfidenceScore } = require('../_lib/feedback');

const VALID_TYPES = ['scope_creep', 'arbitration', 'opa_alert'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez GET.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const type = req.query.type;

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: 'Le paramètre "type" doit être l\'un de : ' + VALID_TYPES.join(', ') });
    return;
  }

  try {
    const score = await getConfidenceScore(type);
    res.status(200).json({ type, accepted: score.accepted, total: score.total, ratePct: score.ratePct });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de calcul du score de confiance : ' + err.message });
  }
};

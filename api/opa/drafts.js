const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez GET.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  try {
    const result = await query(
      `SELECT id, source_type, project_reference, title, summary, solution, created_at
       FROM opa_lesson_drafts
       WHERE status = 'pending_review'
       ORDER BY created_at DESC`
    );

    res.status(200).json({ drafts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des brouillons : ' + err.message });
  }
};

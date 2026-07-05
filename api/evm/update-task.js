const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

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
};

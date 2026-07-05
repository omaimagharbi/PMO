const { query } = require('../_lib/db');
const { embedText, toPgVectorLiteral } = require('../_lib/embeddings');
const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { draftId, decision } = req.body || {};

  if (!draftId || !['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Les champs "draftId" et "decision" (approved|rejected) sont requis.' });
    return;
  }

  let draft;
  try {
    const result = await query(
      `SELECT id, project_reference, title, summary, solution, status
       FROM opa_lesson_drafts WHERE id = $1`,
      [draftId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Brouillon introuvable.' });
      return;
    }
    draft = result.rows[0];
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture : ' + err.message });
    return;
  }

  if (draft.status !== 'pending_review') {
    res.status(422).json({ error: 'Ce brouillon a déjà été traité.' });
    return;
  }

  if (decision === 'rejected') {
    await query(`UPDATE opa_lesson_drafts SET status = 'rejected', resolved_at = now() WHERE id = $1`, [draftId]);
    res.status(200).json({ draftId, status: 'rejected' });
    return;
  }

  // Approbation : on génère le vrai embedding et on publie dans la base RAG vivante.
  let embedding;
  try {
    embedding = await embedText(`${draft.title}\n${draft.summary}\n${draft.solution}`);
  } catch (err) {
    res.status(502).json({ error: "Échec de la génération de l'embedding : " + err.message });
    return;
  }

  try {
    const insertResult = await query(
      `INSERT INTO opa_lessons (project_reference, title, summary, solution, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id`,
      [draft.project_reference, draft.title, draft.summary, draft.solution, toPgVectorLiteral(embedding)]
    );

    await query(`UPDATE opa_lesson_drafts SET status = 'approved', resolved_at = now() WHERE id = $1`, [draftId]);

    res.status(200).json({ draftId, status: 'approved', publishedLessonId: insertResult.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: "Échec de la publication de la leçon : " + err.message });
  }
};

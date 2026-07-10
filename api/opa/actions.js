const { query } = require('../_lib/db');
const { embedText, toPgVectorLiteral } = require('../_lib/embeddings');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { recordFeedback } = require('../_lib/feedback');

const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.75;

const SEARCH_SYSTEM_PROMPT = `Tu es le copilote IA d'un PM. On te fournit une tâche en cours de saisie et les leçons apprises
historiques les plus proches sémantiquement (retrouvées par recherche vectorielle). Rédige une alerte courte et actionnable.

Réponds STRICTEMENT en JSON avec ces clés :
{
  "should_alert": boolean,
  "alert_title": string,
  "alert_body": string (2-3 phrases, en français, citant le projet historique concerné),
  "recommended_action": string (1-2 phrases actionnables)
}`;

async function handleIngest(req, res) {
  const { projectReference, title, summary, solution } = req.body || {};

  if (!projectReference || !title || !summary || !solution) {
    res.status(400).json({ error: 'Les champs "projectReference", "title", "summary" et "solution" sont requis.' });
    return;
  }

  const textToEmbed = `${title}\n${summary}\n${solution}`;

  let embedding;
  try {
    embedding = await embedText(textToEmbed);
  } catch (err) {
    res.status(502).json({ error: "Échec de la génération de l'embedding : " + err.message });
    return;
  }

  try {
    const insertResult = await query(
      `INSERT INTO opa_lessons (project_reference, title, summary, solution, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id, created_at`,
      [projectReference, title, summary, solution, toPgVectorLiteral(embedding)]
    );

    res.status(201).json({
      lessonId: insertResult.rows[0].id,
      createdAt: insertResult.rows[0].created_at,
      embeddingDimensions: embedding.length
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de la leçon apprise : " + err.message });
  }
}

async function handleSearch(req, res) {
  const { taskText } = req.body || {};

  if (!taskText || taskText.trim().length < 3) {
    res.status(400).json({ error: 'Le champ "taskText" est requis et doit contenir au moins 3 caractères.' });
    return;
  }

  let queryEmbedding;
  try {
    queryEmbedding = await embedText(taskText);
  } catch (err) {
    res.status(502).json({ error: "Échec de la génération de l'embedding de la requête : " + err.message });
    return;
  }

  const vectorLiteral = toPgVectorLiteral(queryEmbedding);

  let matches;
  try {
    const result = await query(
      `SELECT id, project_reference, title, summary, solution, 1 - (embedding <=> $1::vector) AS similarity
       FROM opa_lessons
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, TOP_K]
    );
    matches = result.rows;
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la recherche vectorielle pgvector : ' + err.message });
    return;
  }

  const relevantMatches = matches.filter((m) => Number(m.similarity) >= SIMILARITY_THRESHOLD);

  if (relevantMatches.length === 0) {
    res.status(200).json({ shouldAlert: false, matches, reason: 'Aucune leçon apprise suffisamment proche sémantiquement.' });
    return;
  }

  let synthesis;
  try {
    synthesis = await askForStructuredJSON(
      SEARCH_SYSTEM_PROMPT,
      `TÂCHE SAISIE PAR LE PM :
"""
${taskText}
"""

LEÇONS APPRISES LES PLUS PROCHES (recherche pgvector) :
${JSON.stringify(relevantMatches, null, 2)}`,
      500
    );
  } catch (err) {
    res.status(502).json({ error: "Échec de la synthèse Claude : " + err.message });
    return;
  }

  res.status(200).json({
    shouldAlert: synthesis.should_alert,
    alertTitle: synthesis.alert_title,
    alertBody: synthesis.alert_body,
    recommendedAction: synthesis.recommended_action,
    matches: relevantMatches.map((m) => ({ id: m.id, projectReference: m.project_reference, title: m.title, similarity: Number(m.similarity) }))
  });
}

async function handleDrafts(req, res) {
  try {
    const result = await query(
      `SELECT id, source_type, project_reference, title, summary, solution, created_at
       FROM opa_lesson_drafts WHERE status = 'pending_review' ORDER BY created_at DESC`
    );
    res.status(200).json({ drafts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des brouillons : ' + err.message });
  }
}

async function handleApproveDraft(req, res) {
  const { draftId, decision } = req.body || {};

  if (!draftId || !['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Les champs "draftId" et "decision" (approved|rejected) sont requis.' });
    return;
  }

  let draft;
  try {
    const result = await query(`SELECT id, project_reference, title, summary, solution, status FROM opa_lesson_drafts WHERE id = $1`, [draftId]);
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
       VALUES ($1, $2, $3, $4, $5::vector) RETURNING id`,
      [draft.project_reference, draft.title, draft.summary, draft.solution, toPgVectorLiteral(embedding)]
    );

    await query(`UPDATE opa_lesson_drafts SET status = 'approved', resolved_at = now() WHERE id = $1`, [draftId]);

    res.status(200).json({ draftId, status: 'approved', publishedLessonId: insertResult.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: "Échec de la publication de la leçon : " + err.message });
  }
}

async function handleFeedback(req, res) {
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
}

module.exports = async function handler(req, res) {
  // Les leçons apprises (OPA) sont volontairement partagées à travers TOUT
  // le portefeuille (mémoire organisationnelle de Catalyste), y compris des
  // références à d'autres projets/clients dans project_reference. Un compte
  // client ne doit donc pas y avoir accès : réservé aux admins (Phase 3).
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireAdmin(res, user)) return;

  const action = req.query.action || (req.body || {}).action;

  if (req.method === 'POST' && action === 'ingest') return handleIngest(req, res);
  if (req.method === 'POST' && action === 'search') return handleSearch(req, res);
  if (req.method === 'GET' && action === 'drafts') return handleDrafts(req, res);
  if (req.method === 'POST' && action === 'approve-draft') return handleApproveDraft(req, res);
  if (req.method === 'POST' && action === 'feedback') return handleFeedback(req, res);

  res.status(400).json({ error: 'Combinaison méthode/action invalide. Actions valides : ingest, search, approve-draft, feedback (POST), drafts (GET).' });
};

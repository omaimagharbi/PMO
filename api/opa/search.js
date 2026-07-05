const { query } = require('../_lib/db');
const { embedText, toPgVectorLiteral } = require('../_lib/embeddings');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { requireAuth } = require('../_lib/auth');

const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.75;

const SYSTEM_PROMPT = `Tu es le copilote IA d'un PM. On te fournit une tâche en cours de saisie et les leçons apprises
historiques les plus proches sémantiquement (retrouvées par recherche vectorielle). Rédige une alerte courte et actionnable.

Réponds STRICTEMENT en JSON avec ces clés :
{
  "should_alert": boolean,
  "alert_title": string,
  "alert_body": string (2-3 phrases, en français, citant le projet historique concerné),
  "recommended_action": string (1-2 phrases actionnables)
}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

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
    // L'opérateur <=> de pgvector calcule la distance cosinus ; on la
    // convertit en similarité (1 - distance) pour un seuil plus lisible.
    const result = await query(
      `SELECT
         id,
         project_reference,
         title,
         summary,
         solution,
         1 - (embedding <=> $1::vector) AS similarity
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
      SYSTEM_PROMPT,
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
    matches: relevantMatches.map((m) => ({
      id: m.id,
      projectReference: m.project_reference,
      title: m.title,
      similarity: Number(m.similarity)
    }))
  });
};

const { query } = require('../_lib/db');
const { askForStructuredJSON } = require('../_lib/anthropic');

const SYSTEM_PROMPT = `Tu es un assistant d'analyse de périmètre projet pour des chefs de projet certifiés PMP.
On te fournit le texte intégral d'une charte de projet (Scope Baseline) et un message envoyé par un client dans un chat.
Ta mission : déterminer si ce message constitue une demande hors périmètre ("scope creep") par rapport à la charte.

Réponds STRICTEMENT en JSON, sans aucun texte avant ou après, avec exactement ces clés :
{
  "is_scope_creep": boolean,
  "confidence": number (entre 0 et 1),
  "matched_scope_clause": string ou null (la clause de la charte la plus pertinente, ou null si hors périmètre),
  "estimated_extra_days": number (0 si dans le périmètre, sinon une estimation réaliste en jours-homme),
  "rationale": string (2 phrases maximum, en français, expliquant la décision)
}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const { projectId, clientMessage } = req.body || {};

  if (!projectId || !clientMessage) {
    res.status(400).json({ error: 'Les champs "projectId" et "clientMessage" sont requis.' });
    return;
  }

  let baselineRow;
  let projectRow;
  try {
    const baselineResult = await query(
      `SELECT id, extracted_text FROM scope_baselines WHERE project_id = $1 AND is_active = true LIMIT 1`,
      [projectId]
    );
    if (baselineResult.rows.length === 0) {
      res.status(404).json({
        error: "Aucune Scope Baseline active pour ce projet. Téléversez d'abord la charte via /api/scope/upload-charter."
      });
      return;
    }
    baselineRow = baselineResult.rows[0];

    const projectResult = await query(
      `SELECT daily_rate_eur FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      res.status(404).json({ error: 'Projet introuvable.' });
      return;
    }
    projectRow = projectResult.rows[0];
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture en base de données : ' + err.message });
    return;
  }

  const userPrompt = `CHARTE DE PROJET (Scope Baseline) :
"""
${baselineRow.extracted_text.slice(0, 12000)}
"""

MESSAGE CLIENT REÇU DANS LE CHAT :
"""
${clientMessage}
"""

Analyse ce message et réponds au format JSON demandé.`;

  let analysis;
  try {
    analysis = await askForStructuredJSON(SYSTEM_PROMPT, userPrompt, 600);
  } catch (err) {
    res.status(502).json({ error: "Échec de l'appel au modèle Claude : " + err.message });
    return;
  }

  const dailyRate = Number(projectRow.daily_rate_eur);
  const extraDays = Number(analysis.estimated_extra_days) || 0;
  const estimatedExtraCostEur = Math.round(extraDays * dailyRate * 100) / 100;

  try {
    const insertResult = await query(
      `INSERT INTO chat_scope_analyses
         (project_id, baseline_id, client_message, is_scope_creep, estimated_extra_days, estimated_extra_cost_eur, rationale, raw_model_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        projectId,
        baselineRow.id,
        clientMessage,
        analysis.is_scope_creep,
        extraDays,
        estimatedExtraCostEur,
        analysis.rationale,
        JSON.stringify(analysis)
      ]
    );

    res.status(200).json({
      analysisId: insertResult.rows[0].id,
      isScopeCreep: analysis.is_scope_creep,
      confidence: analysis.confidence,
      matchedScopeClause: analysis.matched_scope_clause,
      estimatedExtraDays: extraDays,
      estimatedExtraCostEur,
      rationale: analysis.rationale
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de l'analyse : " + err.message });
  }
};

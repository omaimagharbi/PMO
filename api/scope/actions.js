const { query } = require('../_lib/db');
const { requireAuth, requireProjectAccess } = require('../_lib/auth');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { recordFeedback } = require('../_lib/feedback');

const ANALYZE_SYSTEM_PROMPT = `Tu es un assistant d'analyse de périmètre projet pour des chefs de projet certifiés PMP.
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

const DRAFT_SYSTEM_PROMPT = `Tu es un rédacteur de leçons apprises (OPA) pour un chef de projet PMP.
On te donne le contexte d'une dérive de périmètre qui vient d'être officialisée par une demande de changement.
Rédige un brouillon de fiche de leçon apprise, réutilisable pour de futurs projets similaires.

Réponds STRICTEMENT en JSON avec ces clés :
{
  "title": string (court, 5-8 mots),
  "summary": string (2-3 phrases décrivant l'incident, en français),
  "solution": string (1-2 phrases de mesure préventive actionnable, en français)
}`;

async function generateDraftFromCR(analysis, changeRequest) {
  const draft = await askForStructuredJSON(
    DRAFT_SYSTEM_PROMPT,
    `Message client à l'origine de la dérive : "${analysis.client_message}"
Justification de la dérive : "${analysis.rationale}"
Impact : +${changeRequest.extra_days} jours, +${changeRequest.extra_cost_eur} €`,
    400
  );

  await query(
    `INSERT INTO opa_lesson_drafts (source_type, source_reference_id, project_reference, title, summary, solution)
     VALUES ('change_request', $1, $2, $3, $4, $5)`,
    [changeRequest.id, analysis.project_name + ' (' + changeRequest.reference_code + ')', draft.title, draft.summary, draft.solution]
  );
}

async function handleAnalyzeMessage(req, res, user) {
  const { projectId, clientMessage } = req.body || {};

  if (!projectId || !clientMessage) {
    res.status(400).json({ error: 'Les champs "projectId" et "clientMessage" sont requis.' });
    return;
  }

  if (!(await requireProjectAccess(req, res, user, projectId))) return;

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

    const projectResult = await query(`SELECT daily_rate_eur FROM projects WHERE id = $1`, [projectId]);
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
    analysis = await askForStructuredJSON(ANALYZE_SYSTEM_PROMPT, userPrompt, 600);
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
      [projectId, baselineRow.id, clientMessage, analysis.is_scope_creep, extraDays, estimatedExtraCostEur, analysis.rationale, JSON.stringify(analysis)]
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
}

async function handleSignCr(req, res, user) {
  const { analysisId } = req.body || {};

  if (!analysisId) {
    res.status(400).json({ error: 'Le champ "analysisId" est requis (identifiant retourné par action=analyze-message).' });
    return;
  }

  let analysis;
  try {
    const result = await query(
      `SELECT csa.id, csa.project_id, csa.estimated_extra_days, csa.estimated_extra_cost_eur,
              csa.is_scope_creep, csa.client_message, csa.rationale, p.name AS project_name
       FROM chat_scope_analyses csa
       JOIN projects p ON p.id = csa.project_id
       WHERE csa.id = $1`,
      [analysisId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Analyse introuvable.' });
      return;
    }
    analysis = result.rows[0];
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture en base : ' + err.message });
    return;
  }

  if (!(await requireProjectAccess(req, res, user, analysis.project_id))) return;

  if (!analysis.is_scope_creep) {
    res.status(422).json({ error: "Cette analyse n'a pas été qualifiée de dérive de périmètre, aucune CR à signer." });
    return;
  }

  const referenceCode = 'CR-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

  try {
    const insertResult = await query(
      `INSERT INTO change_requests (project_id, analysis_id, reference_code, extra_days, extra_cost_eur)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, reference_code, signed_at`,
      [analysis.project_id, analysis.id, referenceCode, analysis.estimated_extra_days, analysis.estimated_extra_cost_eur]
    );

    const changeRequest = {
      id: insertResult.rows[0].id,
      reference_code: insertResult.rows[0].reference_code,
      extra_days: analysis.estimated_extra_days,
      extra_cost_eur: analysis.estimated_extra_cost_eur
    };

    try {
      await recordFeedback('scope_creep', analysis.id, 'accepted');
    } catch (feedbackErr) {
      console.error('Échec de l\'enregistrement du feedback : ' + feedbackErr.message);
    }

    let draftGenerated = false;
    try {
      await generateDraftFromCR(
        { client_message: analysis.client_message, rationale: analysis.rationale, project_name: analysis.project_name },
        changeRequest
      );
      draftGenerated = true;
    } catch (draftErr) {
      console.error('Échec de la génération du brouillon OPA : ' + draftErr.message);
    }

    res.status(201).json({
      changeRequestId: insertResult.rows[0].id,
      referenceCode: insertResult.rows[0].reference_code,
      signedAt: insertResult.rows[0].signed_at,
      extraDays: Number(analysis.estimated_extra_days),
      extraCostEur: Number(analysis.estimated_extra_cost_eur),
      opaDraftGenerated: draftGenerated
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de la CR : " + err.message });
  }
}

async function handleRejectAnalysis(req, res, user) {
  const { analysisId } = req.body || {};

  if (!analysisId) {
    res.status(400).json({ error: 'Le champ "analysisId" est requis.' });
    return;
  }

  try {
    const result = await query(`SELECT id, project_id FROM chat_scope_analyses WHERE id = $1`, [analysisId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Analyse introuvable.' });
      return;
    }

    if (!(await requireProjectAccess(req, res, user, result.rows[0].project_id))) return;

    await recordFeedback('scope_creep', analysisId, 'rejected');
    res.status(200).json({ analysisId, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement du refus : " + err.message });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const action = (req.body || {}).action;

  if (action === 'analyze-message') return handleAnalyzeMessage(req, res, user);
  if (action === 'sign-cr') return handleSignCr(req, res, user);
  if (action === 'reject-analysis') return handleRejectAnalysis(req, res, user);

  res.status(400).json({ error: 'Le champ "action" doit être l\'un de : analyze-message, sign-cr, reject-analysis.' });
};

const { query } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { askForStructuredJSON } = require('../_lib/anthropic');
const { recordFeedback } = require('../_lib/feedback');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { analysisId } = req.body || {};

  if (!analysisId) {
    res.status(400).json({ error: 'Le champ "analysisId" est requis (identifiant retourné par /api/scope/analyze-message).' });
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
      // La signature de la CR reste valide même si la rédaction automatique
      // du brouillon de leçon apprise échoue (ex: quota Claude atteint).
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
};

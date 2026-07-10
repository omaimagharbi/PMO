const { query } = require('./db');

async function recordFeedback(recommendationType, referenceId, outcome) {
  await query(
    `INSERT INTO ai_recommendation_feedback (recommendation_type, reference_id, outcome)
     VALUES ($1, $2, $3)`,
    [recommendationType, referenceId, outcome]
  );
}

async function getConfidenceScore(recommendationType) {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE outcome = 'accepted') AS accepted,
       COUNT(*) AS total
     FROM ai_recommendation_feedback
     WHERE recommendation_type = $1`,
    [recommendationType]
  );

  const accepted = Number(result.rows[0].accepted);
  const total = Number(result.rows[0].total);
  const rate = total > 0 ? Math.round((accepted / total) * 1000) / 10 : null;

  return { accepted, total, ratePct: rate };
}

module.exports = { recordFeedback, getConfidenceScore };

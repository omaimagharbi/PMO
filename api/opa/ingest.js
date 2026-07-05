const { query } = require('../_lib/db');
const { embedText, toPgVectorLiteral } = require('../_lib/embeddings');
const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const { projectReference, title, summary, solution } = req.body || {};

  if (!projectReference || !title || !summary || !solution) {
    res.status(400).json({
      error: 'Les champs "projectReference", "title", "summary" et "solution" sont requis.'
    });
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
};

if (!process.env.VOYAGE_API_KEY) {
  throw new Error(
    "Variable d'environnement VOYAGE_API_KEY manquante. L'API Anthropic ne fournit pas d'endpoint d'embeddings natif : Voyage AI est le partenaire officiellement recommandé par Anthropic pour générer les vecteurs utilisés par pgvector. Créez une clé sur https://www.voyageai.com puis renseignez-la dans vos variables d'environnement."
  );
}

const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3';
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

/**
 * Retourne le vecteur d'embedding (1024 dimensions pour voyage-3) d'un texte donné.
 * Utilisé à la fois pour indexer les leçons apprises (ingest) et pour
 * transformer la requête du PM au moment de la recherche (search).
 */
async function embedText(text) {
  const response = await fetch(VOYAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
      input_type: 'document'
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Échec de l'appel Voyage AI (${response.status}) : ${errorBody}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * pgvector attend une chaîne au format '[0.123,0.456,...]' pour les requêtes
 * paramétrées. Cette fonction sérialise un tableau JS dans ce format exact.
 */
function toPgVectorLiteral(embeddingArray) {
  return '[' + embeddingArray.join(',') + ']';
}

module.exports = { embedText, toPgVectorLiteral, VOYAGE_MODEL };

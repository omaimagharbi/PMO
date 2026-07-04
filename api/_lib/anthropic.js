const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "Variable d'environnement ANTHROPIC_API_KEY manquante. Configurez-la dans les paramètres d'environnement de votre déploiement (jamais en dur dans le code)."
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

/**
 * Envoie un prompt à Claude en exigeant une réponse JSON stricte, sans préambule.
 * Utilisé pour l'analyse de dérive de périmètre (Fonctionnalité 1) et pour la
 * synthèse des recommandations d'arbitrage (Fonctionnalité 2).
 */
async function askForStructuredJSON(systemPrompt, userPrompt, maxTokens = 1024) {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error("Réponse Claude sans bloc texte exploitable.");
  }

  const cleaned = textBlock.text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Impossible de parser la réponse JSON de Claude : ' + cleaned.slice(0, 300));
  }
}

module.exports = { anthropic, askForStructuredJSON, DEFAULT_MODEL };

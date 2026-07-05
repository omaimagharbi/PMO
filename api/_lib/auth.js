const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error(
    "Variable d'environnement JWT_SECRET manquante. Elle est nécessaire pour signer et vérifier les jetons d'accès à l'API NEXUS."
  );
}

/**
 * Vérifie l'en-tête Authorization: Bearer <token> d'une requête entrante.
 * Retourne le payload décodé si le jeton est valide, sinon écrit une
 * réponse 401 et retourne null (l'appelant doit alors faire `return`).
 */
function requireAuth(req, res) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: "Authentification requise. En-tête 'Authorization: Bearer <token>' manquant." });
    return null;
  }

  const token = header.slice('Bearer '.length);

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ error: 'Jeton invalide ou expiré : ' + err.message });
    return null;
  }
}

module.exports = { requireAuth };
